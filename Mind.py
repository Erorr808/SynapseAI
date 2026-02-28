

"""
SynapseAI Mind Runtime

This module bridges Python to SynapseAI's JavaScript mastermind engine.
It allows Python services to use Mastermind2.js (dual) or Mastermind.js
as the "master mind" while
Mind.py acts as the execution/runtime "mind".

Primary class:
    - SynapseMind
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import uuid
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional


def _now_iso() -> str:
    return datetime.utcnow().isoformat() + "Z"


def _normalize_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _normalize_token(token: str) -> str:
    value = _normalize_text(token).lower()
    if len(value) > 5 and value.endswith("ing"):
        return value[:-3]
    if len(value) > 4 and value.endswith("ed"):
        return value[:-2]
    if len(value) > 4 and value.endswith("es"):
        return value[:-2]
    if len(value) > 3 and value.endswith("s"):
        return value[:-1]
    return value


def _tokenize(value: str) -> List[str]:
    text = _normalize_text(value).lower()
    clean = []
    token = []
    for ch in text:
        if ch.isalnum() or ch == "_":
            token.append(ch)
        else:
            if token:
                clean.append(_normalize_token("".join(token)))
                token = []
    if token:
        clean.append(_normalize_token("".join(token)))
    return [t for t in clean if t]


class MindError(RuntimeError):
    """Base error for the Synapse mind runtime."""


class MastermindUnavailableError(MindError):
    """Raised when Mastermind.js cannot be used from Python."""


class BridgeExecutionError(MindError):
    """Raised when the Node bridge returns an execution error."""


@dataclass
class MindConfig:
    """Configuration for SynapseMind."""

    request_timeout: int = 45
    fallback_to_python: bool = True
    auto_load_state: bool = True


class _PythonFallbackMind:
    """
    Minimal Python fallback runtime.

    Used only when Node.js is unavailable or bridge execution fails.
    """

    def __init__(self, model_name: str = "SynapseAI"):
        self.model_name = model_name
        self.session_id = f"fallback-{uuid.uuid4().hex[:12]}"
        self.started_at = _now_iso()
        self.cycle_count = 0
        self.feedback_score = 0.5
        self.memory: List[Dict[str, Any]] = []
        self.goals: List[Dict[str, Any]] = []
        self.knowledge: Dict[str, Dict[str, Any]] = {}
        self._goal_counter = 0
        self._stopwords = {
            "the", "a", "an", "and", "or", "to", "of", "for", "in", "on", "at", "is", "are", "be", "it",
            "this", "that", "with", "as", "by", "from", "you", "i", "we", "they", "he", "she", "them", "our",
            "your", "my", "me", "us", "can", "could", "should", "would", "will", "please", "make", "build",
        }

    def _detect_intent(self, text: str) -> Dict[str, Any]:
        tokens = _tokenize(text)
        keyword_table = {
            "coding": {
                "code": 1.0,
                "debug": 1.3,
                "bug": 1.2,
                "refactor": 1.1,
                "test": 1.1,
                "python": 1.0,
                "javascript": 1.0,
                "implement": 0.9,
                "fix": 1.1,
            },
            "planning": {
                "plan": 1.2,
                "roadmap": 1.3,
                "strategy": 1.1,
                "schedule": 1.1,
                "step": 0.9,
                "priorit": 0.9,
                "milestone": 1.0,
            },
            "creative": {
                "story": 1.2,
                "design": 1.0,
                "brainstorm": 1.2,
                "idea": 1.0,
                "creative": 1.0,
            },
            "research": {
                "analyze": 1.2,
                "compare": 1.0,
                "explain": 1.0,
                "summary": 0.9,
                "evaluate": 1.1,
                "improv": 0.8,
                "smart": 0.8,
            },
        }

        scores = {name: 0.0 for name in keyword_table}
        for token in tokens:
            for name, words in keyword_table.items():
                for keyword, weight in words.items():
                    if token == keyword or token.startswith(keyword):
                        scores[name] += weight

        primary = "conversation"
        if scores:
            top_name = max(scores, key=lambda name: scores[name])
            if scores[top_name] > 0:
                primary = top_name

        urgency_words = {"urgent", "asap", "now", "critical", "immediately", "today"}
        urgency = min(1.0, 0.24 * sum(1 for token in tokens if token in urgency_words))
        complexity = min(1.0, len(tokens) / 20.0)
        confidence = 0.8 if primary != "conversation" else 0.5

        return {
            "primary": primary,
            "scores": scores,
            "urgency": urgency,
            "complexity": complexity,
            "confidence": confidence,
            "tokens": tokens,
        }

    def _extract_focus_terms(self, tokens: List[str], limit: int = 6) -> List[str]:
        ranked: List[str] = []
        seen = set()
        for token in tokens:
            if len(token) < 3 or token in self._stopwords or token in seen:
                continue
            seen.add(token)
            ranked.append(token)
            if len(ranked) >= limit:
                break
        return ranked

    def _find_relevant_memories(self, tokens: List[str], limit: int = 3) -> List[Dict[str, Any]]:
        if not tokens:
            return []

        token_set = set(tokens)
        scored = []
        for entry in self.memory[-120:]:
            blob_tokens = set(_tokenize(json.dumps(entry, ensure_ascii=False)))
            overlap = len(token_set & blob_tokens)
            if overlap > 0:
                scored.append((overlap, entry))

        scored.sort(key=lambda pair: pair[0], reverse=True)
        return [entry for _, entry in scored[: max(1, limit)]]

    def _recommend_next_actions(self, intent: Dict[str, Any]) -> List[str]:
        steps = self._build_steps(intent["primary"])
        actions = list(steps)

        active_goals = self.list_goals({"status": "active", "limit": 1})
        if active_goals:
            actions.append(f"Align output to active goal: {active_goals[0]['title']}")

        if intent["complexity"] >= 0.55:
            actions.append("Deliver a phased answer with assumptions, execution, and verification.")

        if intent["urgency"] >= 0.6:
            actions.append("Prioritize immediate next step and defer optional improvements.")

        return actions[:5]

    def _build_steps(self, intent: str) -> List[str]:
        if intent == "coding":
            return [
                "Inspect the technical context and constraints.",
                "Propose the safest minimal implementation.",
                "Validate behavior and list verification checks.",
            ]
        if intent == "planning":
            return [
                "Define objective and constraints.",
                "Create phased plan with priorities.",
                "Attach checkpoints and expected outcomes.",
            ]
        if intent == "creative":
            return [
                "Generate multiple concepts.",
                "Select strongest concept based on constraints.",
                "Refine and format final output.",
            ]
        return [
            "Identify objective and constraints.",
            "Build direct response strategy.",
            "Deliver concise practical answer.",
        ]

    def add_goal(self, goal_input: Any) -> Dict[str, Any]:
        payload = goal_input if isinstance(goal_input, dict) else {"title": _normalize_text(goal_input)}
        title = _normalize_text(payload.get("title") or payload.get("description"))
        if not title:
            raise MindError("Goal title is required.")

        self._goal_counter += 1
        goal = {
            "id": payload.get("id") or f"goal-{self._goal_counter}",
            "title": title,
            "status": payload.get("status") or "active",
            "priority": float(payload.get("priority") or 0.5),
            "createdAt": _now_iso(),
            "updatedAt": _now_iso(),
            "notes": _normalize_text(payload.get("notes")),
            "tags": payload.get("tags") or [],
        }
        self.goals.append(goal)
        return goal

    def list_goals(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        options = filters or {}
        goals = list(self.goals)
        if options.get("status"):
            goals = [g for g in goals if g.get("status") == options["status"]]
        goals.sort(key=lambda g: float(g.get("priority", 0.0)), reverse=True)
        limit = options.get("limit")
        if isinstance(limit, int) and limit > 0:
            goals = goals[:limit]
        return goals

    def add_knowledge(
        self, key: str, value: Any, confidence: Optional[float] = None, metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        safe_key = _normalize_text(key)
        if not safe_key:
            raise MindError("Knowledge key is required.")
        item = {
            "key": safe_key,
            "value": value,
            "confidence": float(confidence if confidence is not None else 0.5),
            "metadata": metadata or {},
            "updatedAt": _now_iso(),
        }
        self.knowledge[safe_key] = item
        return item

    def query_knowledge(self, query: str, limit: int = 8) -> List[Dict[str, Any]]:
        query_tokens = set(_tokenize(query))
        values = list(self.knowledge.values())
        if not query_tokens:
            return values[: max(1, limit)]

        ranked = []
        for item in values:
            blob_tokens = set(_tokenize(f"{item.get('key', '')} {item.get('value', '')}"))
            overlap = len(query_tokens & blob_tokens)
            if overlap <= 0:
                continue
            confidence = float(item.get("confidence") or 0.5)
            score = overlap + (confidence * 0.5)
            ranked.append((score, item))

        ranked.sort(key=lambda pair: pair[0], reverse=True)
        return [item for _, item in ranked[: max(1, limit)]]

    def remember(self, kind: str, content: Any, options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        payload = options or {}
        entry = {
            "id": f"mem-{uuid.uuid4().hex[:10]}",
            "kind": _normalize_text(kind) or "note",
            "summary": _normalize_text(payload.get("summary")) or _normalize_text(content)[:180],
            "content": content,
            "tags": payload.get("tags") or [],
            "source": payload.get("source") or "system",
            "timestamp": _now_iso(),
        }
        self.memory.append(entry)
        if len(self.memory) > 500:
            self.memory = self.memory[-500:]
        return entry

    def register_feedback(self, feedback: Any) -> Dict[str, Any]:
        payload = feedback if isinstance(feedback, dict) else {"value": feedback}
        value = float(payload.get("value", 0))
        value = max(-1.0, min(1.0, value))
        normalized = (value + 1.0) / 2.0
        self.feedback_score = (self.feedback_score * 0.8) + (normalized * 0.2)
        return {
            "value": value,
            "globalScore": self.feedback_score,
            "updatedAt": _now_iso(),
        }

    def think(self, text: str, options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        config = options or {}
        safe_text = _normalize_text(text)
        if not safe_text:
            raise MindError("Input is required.")

        self.cycle_count += 1
        intent = self._detect_intent(safe_text)
        steps = self._recommend_next_actions(intent)
        focus_terms = self._extract_focus_terms(intent["tokens"])
        relevant_memories = self._find_relevant_memories(intent["tokens"])
        matched_knowledge = self.query_knowledge(" ".join(focus_terms), limit=3)
        uncertainty = max(0.0, min(1.0, 1.0 - intent["confidence"] + (intent["complexity"] * 0.2)))
        uncertainty = max(0.0, min(1.0, uncertainty * (1.1 - self.feedback_score * 0.2)))

        if config.get("autoGoal", True):
            self.add_goal({
                "title": f"Handle request: {safe_text[:120]}",
                "priority": max(0.3, min(1.0, 0.55 + intent["urgency"] * 0.25)),
                "status": "active",
                "tags": ["auto", intent["primary"]],
                "notes": f"Fallback goal created in cycle {self.cycle_count}",
            })

        needs_clarification = uncertainty >= 0.62
        clarification = ""
        if needs_clarification:
            if intent["primary"] == "coding":
                clarification = "Please share the exact error and target file/function."
            else:
                clarification = "What output format and top constraint should I optimize for?"

        if needs_clarification:
            response = (
                f"Objective received: {safe_text}\n"
                f"I need one clarification before finalizing: {clarification}\n"
                "I can still provide a first-pass draft if you want."
            )
        else:
            knowledge_hint = ""
            if matched_knowledge:
                top_keys = [str(item.get("key")) for item in matched_knowledge[:2] if item.get("key")]
                if top_keys:
                    knowledge_hint = f"\nUseful prior knowledge: {', '.join(top_keys)}."

            memory_hint = ""
            if relevant_memories:
                latest_summary = _normalize_text(relevant_memories[0].get("summary"))
                if latest_summary:
                    memory_hint = f"\nContext recalled: {latest_summary[:120]}."

            response = (
                f"Objective received: {safe_text}\n"
                f"Mode: {intent['primary']}.\n"
                f"Focus terms: {', '.join(focus_terms) if focus_terms else 'general request'}.\n"
                "Planned approach:\n"
                + "\n".join(f"{idx + 1}. {step}" for idx, step in enumerate(steps))
                + knowledge_hint
                + memory_hint
            )

        self.remember("user-input", {"text": safe_text, "intent": intent}, {"source": "user"})
        self.remember("assistant-output", {"text": response}, {"source": "assistant"})

        return {
            "id": f"fallback-cycle-{self.cycle_count}-{uuid.uuid4().hex[:8]}",
            "cycle": self.cycle_count,
            "sessionId": self.session_id,
            "receivedAt": _now_iso(),
            "completedAt": _now_iso(),
            "input": safe_text,
            "intent": intent,
            "plan": {
                "mode": intent["primary"],
                "steps": steps,
                "uncertainty": uncertainty,
                "needsClarification": needs_clarification,
                "clarifyingQuestion": clarification,
                "strategy": {"name": "Python Fallback", "style": "fallback", "score": self.feedback_score},
            },
            "response": response,
            "responseMeta": {"source": "python-fallback", "raw": None},
            "analysis": {
                "quality": {"score": self.feedback_score, "needsRevision": False},
                "uncertainty": uncertainty,
                "strategy": {"name": "Python Fallback", "style": "fallback", "score": self.feedback_score},
                "contextStrength": min(1.0, 0.35 + (0.12 * len(relevant_memories)) + (0.08 * len(matched_knowledge))),
                "focusTerms": focus_terms,
                "knowledgeMatches": matched_knowledge,
            },
            "status": self.get_status(),
        }

    def get_status(self) -> Dict[str, Any]:
        return {
            "modelName": self.model_name,
            "mode": "python-fallback",
            "sessionId": self.session_id,
            "startedAt": self.started_at,
            "cycleCount": self.cycle_count,
            "memorySize": len(self.memory),
            "activeGoals": len([g for g in self.goals if g.get("status") in {"active", "queued"}]),
            "knowledgeItems": len(self.knowledge),
            "learning": {"globalScore": self.feedback_score},
        }

    def reset(self) -> Dict[str, Any]:
        self.cycle_count = 0
        self.memory = []
        self.goals = []
        self.knowledge = {}
        self.feedback_score = 0.5
        return self.get_status()

    def export_state(self) -> Dict[str, Any]:
        return {
            "sessionId": self.session_id,
            "startedAt": self.started_at,
            "cycleCount": self.cycle_count,
            "feedbackScore": self.feedback_score,
            "memory": self.memory,
            "goals": self.goals,
            "knowledge": self.knowledge,
            "exportedAt": _now_iso(),
        }

    def import_state(self, state: Dict[str, Any]) -> Dict[str, Any]:
        snapshot = state or {}
        self.session_id = snapshot.get("sessionId") or self.session_id
        self.started_at = snapshot.get("startedAt") or self.started_at
        self.cycle_count = int(snapshot.get("cycleCount") or 0)
        self.feedback_score = float(snapshot.get("feedbackScore") or 0.5)
        self.memory = list(snapshot.get("memory") or [])
        self.goals = list(snapshot.get("goals") or [])
        self.knowledge = dict(snapshot.get("knowledge") or {})
        return self.get_status()


class SynapseMind:
    """
    Python runtime wrapper for SynapseAI Mastermind.

    - Primary mode: calls `SynapseAI/Mastermind3.js` (preferred), `SynapseAI/Mastermind2.js`, or `SynapseAI/Mastermind.js`
      through `mastermind_bridge.js`.
    - Fallback mode: internal Python implementation when Node.js is unavailable.
    """

    def __init__(
        self,
        mastermind_js_path: Optional[str] = None,
        bridge_script_path: Optional[str] = None,
        node_binary: Optional[str] = None,
        mastermind_config: Optional[Dict[str, Any]] = None,
        mind_config: Optional[MindConfig] = None,
        state_path: Optional[str] = None,
        prefer_dual_mastermind: bool = True,
        prefer_triple_mastermind: bool = True,
    ) -> None:
        self.base_dir = Path(__file__).resolve().parent
        if mastermind_js_path:
            self.mastermind_js_path = Path(mastermind_js_path)
        else:
            self.mastermind_js_path = self._resolve_default_mastermind_path(prefer_dual_mastermind, prefer_triple_mastermind)
        self.bridge_script_path = Path(bridge_script_path) if bridge_script_path else self.base_dir / "mastermind_bridge.js"
        self.state_path = Path(state_path) if state_path else self.base_dir / "mind_state.json"

        self.mastermind_config = dict(mastermind_config or {})
        self.mind_config = mind_config or MindConfig()

        self.node_binary = self._resolve_node_binary(node_binary)
        self._mastermind_state: Dict[str, Any] = {}
        self._last_error: Optional[str] = None

        model_name = _normalize_text(self.mastermind_config.get("modelName")) or "SynapseAI"
        self._fallback = _PythonFallbackMind(model_name=model_name)

        if self.mind_config.auto_load_state and self.state_path.exists():
            try:
                self.load_state(str(self.state_path))
            except Exception:
                # Do not fail construction if persisted state is invalid.
                pass

    @property
    def mode(self) -> str:
        if not self._can_use_mastermind_js():
            return "python-fallback"
        name = self.mastermind_js_path.name.lower()
        if name == "mastermind3.js":
            return "mastermind-js-triad"
        if name == "mastermind2.js":
            return "mastermind-js-dual"
        return "mastermind-js"

    @property
    def last_error(self) -> Optional[str]:
        return self._last_error

    def _resolve_node_binary(self, explicit_binary: Optional[str]) -> Optional[str]:
        if explicit_binary:
            return explicit_binary
        env_override = _normalize_text(os.environ.get("SYNAPSE_NODE_BIN"))
        if env_override:
            return env_override
        return shutil.which("node") or shutil.which("nodejs")

    def _resolve_default_mastermind_path(self, prefer_dual_mastermind: bool, prefer_triple_mastermind: bool = True) -> Path:
        triad_path = self.base_dir / "Mastermind3.js"
        dual_path = self.base_dir / "Mastermind2.js"
        single_path = self.base_dir / "Mastermind.js"

        if prefer_triple_mastermind and triad_path.exists() and triad_path.stat().st_size > 0:
            return triad_path
        if prefer_dual_mastermind and dual_path.exists() and dual_path.stat().st_size > 0:
            return dual_path
        if single_path.exists() and single_path.stat().st_size > 0:
            return single_path
        if dual_path.exists():
            return dual_path
        if triad_path.exists():
            return triad_path
        return single_path

    def _can_use_mastermind_js(self) -> bool:
        return bool(self.node_binary and self.mastermind_js_path.exists() and self.bridge_script_path.exists())

    def _invoke_js(self, command: str, payload: Optional[Dict[str, Any]] = None) -> Any:
        if not self._can_use_mastermind_js():
            raise MastermindUnavailableError(
                "Mastermind bridge is unavailable (missing Node.js, bridge script, or mastermind file)."
            )

        request = {
            "command": command,
            "payload": payload or {},
            "config": self.mastermind_config,
            "state": self._mastermind_state,
        }

        proc = subprocess.run(
            [self.node_binary, str(self.bridge_script_path), str(self.mastermind_js_path)],
            input=json.dumps(request),
            text=True,
            capture_output=True,
            timeout=self.mind_config.request_timeout,
            cwd=str(self.base_dir.parent),
            check=False,
        )

        stdout_lines = [line.strip() for line in proc.stdout.splitlines() if line.strip()]
        stderr_text = _normalize_text(proc.stderr)

        if not stdout_lines:
            raise BridgeExecutionError(
                f"Bridge returned no output (exit={proc.returncode}). stderr={stderr_text}"
            )

        try:
            bridge_response = json.loads(stdout_lines[-1])
        except json.JSONDecodeError as exc:
            raise BridgeExecutionError(
                f"Bridge returned non-JSON output: {stdout_lines[-1]}"
            ) from exc

        if not bridge_response.get("ok"):
            raise BridgeExecutionError(_normalize_text(bridge_response.get("error")) or "Unknown bridge error.")

        if isinstance(bridge_response.get("state"), dict):
            self._mastermind_state = bridge_response["state"]

        return bridge_response.get("data")

    def _invoke_fallback(self, command: str, payload: Optional[Dict[str, Any]] = None) -> Any:
        data = payload or {}
        if command in {"think", "run_cycle"}:
            return self._fallback.think(_normalize_text(data.get("input")), data.get("options") or {})
        if command == "status":
            return self._fallback.get_status()
        if command == "feedback":
            return self._fallback.register_feedback(data.get("feedback") or data)
        if command == "add_goal":
            return self._fallback.add_goal(data.get("goal") or data)
        if command == "list_goals":
            return self._fallback.list_goals(data.get("filters") or {})
        if command == "add_knowledge":
            return self._fallback.add_knowledge(
                data.get("key"),
                data.get("value"),
                data.get("confidence"),
                data.get("metadata") or {},
            )
        if command == "query_knowledge":
            return self._fallback.query_knowledge(_normalize_text(data.get("query")), int(data.get("limit") or 8))
        if command == "remember":
            return self._fallback.remember(
                _normalize_text(data.get("kind")) or "note",
                data.get("content"),
                data.get("options") or {},
            )
        if command == "export_state":
            return self._fallback.export_state()
        if command == "import_state":
            return self._fallback.import_state(data.get("state") or {})
        if command == "reset":
            return self._fallback.reset()
        raise MindError(f"Unsupported fallback command: {command}")

    def _dispatch(self, command: str, payload: Optional[Dict[str, Any]] = None) -> Any:
        if self._can_use_mastermind_js():
            try:
                self._last_error = None
                return self._invoke_js(command, payload)
            except Exception as exc:
                self._last_error = str(exc)
                if not self.mind_config.fallback_to_python:
                    raise
        return self._invoke_fallback(command, payload)

    def think(
        self,
        text: str,
        *,
        source: str = "user",
        context: Optional[Dict[str, Any]] = None,
        model: Optional[Dict[str, Any]] = None,
        execute_tools: bool = False,
        auto_goal: bool = True,
        persist: bool = True,
        self_critique: bool = True,
        response_timeout_ms: Optional[int] = None,
    ) -> Dict[str, Any]:
        options: Dict[str, Any] = {
            "source": source,
            "context": context or {},
            "model": model or {},
            "executeTools": execute_tools,
            "autoGoal": auto_goal,
            "persist": persist,
            "selfCritique": self_critique,
        }
        if isinstance(response_timeout_ms, int) and response_timeout_ms > 0:
            options["responseTimeoutMs"] = response_timeout_ms

        result = self._dispatch("think", {"input": text, "options": options})

        if isinstance(result, dict):
            analysis = result.get("analysis") if isinstance(result.get("analysis"), dict) else {}
            if "focusTerms" not in analysis:
                analysis["focusTerms"] = _tokenize(text)[:6]
            if "knowledgeMatches" not in analysis:
                analysis["knowledgeMatches"] = []
            if "contextStrength" not in analysis:
                plan = result.get("plan") if isinstance(result.get("plan"), dict) else {}
                uncertainty = float(plan.get("uncertainty") or 0.6)
                analysis["contextStrength"] = max(0.2, min(1.0, 1.0 - (uncertainty * 0.6)))
            result["analysis"] = analysis

        return result

    def run_cycle(self, text: str, source: str = "user") -> Dict[str, Any]:
        return self._dispatch("run_cycle", {"input": text, "source": source})

    def status(self) -> Dict[str, Any]:
        status = self._dispatch("status", {})
        status["engineMode"] = self.mode
        status["mastermindPath"] = str(self.mastermind_js_path)
        status["mastermindFile"] = self.mastermind_js_path.name
        if self._last_error:
            status["lastBridgeError"] = self._last_error
        return status

    def add_goal(self, goal: Dict[str, Any]) -> Dict[str, Any]:
        return self._dispatch("add_goal", {"goal": goal})

    def list_goals(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        return self._dispatch("list_goals", {"filters": filters or {}})

    def add_knowledge(
        self,
        key: str,
        value: Any,
        confidence: Optional[float] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        return self._dispatch(
            "add_knowledge",
            {
                "key": key,
                "value": value,
                "confidence": confidence,
                "metadata": metadata or {},
            },
        )

    def query_knowledge(self, query: str, limit: int = 8) -> List[Dict[str, Any]]:
        return self._dispatch("query_knowledge", {"query": query, "limit": limit})

    def remember(self, kind: str, content: Any, options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        return self._dispatch(
            "remember",
            {"kind": kind, "content": content, "options": options or {}},
        )

    def register_feedback(self, value: float, intent: Optional[str] = None, note: str = "") -> Dict[str, Any]:
        payload = {"value": value, "intent": intent, "note": note}
        return self._dispatch("feedback", {"feedback": payload})

    def reset(self, clear_persistent_state: bool = True) -> Dict[str, Any]:
        result = self._dispatch("reset", {"options": {"clearPersistentState": clear_persistent_state}})
        if clear_persistent_state:
            self._mastermind_state = {}
        return result

    def export_state(self) -> Dict[str, Any]:
        if self._can_use_mastermind_js():
            mastermind_state = self._dispatch("export_state", {})
        else:
            mastermind_state = self._fallback.export_state()
        return {
            "meta": {
                "savedAt": _now_iso(),
                "mode": self.mode,
                "nodeBinary": self.node_binary,
                "mastermindPath": str(self.mastermind_js_path),
            },
            "mastermindState": mastermind_state,
            "pythonFallbackState": self._fallback.export_state(),
        }

    def import_state(self, state: Dict[str, Any]) -> Dict[str, Any]:
        snapshot = state or {}
        mastermind_state = snapshot.get("mastermindState") or snapshot
        fallback_state = snapshot.get("pythonFallbackState") or {}

        if isinstance(fallback_state, dict):
            self._fallback.import_state(fallback_state)

        if self._can_use_mastermind_js():
            result = self._dispatch("import_state", {"state": mastermind_state})
            if isinstance(mastermind_state, dict):
                self._mastermind_state = mastermind_state
            return result

        self._fallback.import_state(mastermind_state if isinstance(mastermind_state, dict) else {})
        return self._fallback.get_status()

    def save_state(self, file_path: Optional[str] = None) -> Path:
        target = Path(file_path) if file_path else self.state_path
        snapshot = self.export_state()
        target.write_text(json.dumps(snapshot, indent=2, ensure_ascii=True), encoding="utf-8")
        return target

    def load_state(self, file_path: Optional[str] = None) -> Dict[str, Any]:
        target = Path(file_path) if file_path else self.state_path
        if not target.exists():
            raise MindError(f"State file not found: {target}")
        snapshot = json.loads(target.read_text(encoding="utf-8"))
        return self.import_state(snapshot)


def create_synapse_mind(
    mastermind_config: Optional[Dict[str, Any]] = None,
    mind_config: Optional[MindConfig] = None,
    prefer_dual_mastermind: bool = True,
    prefer_triple_mastermind: bool = True,
) -> SynapseMind:
    """Factory helper for building a SynapseMind instance."""
    return SynapseMind(
        mastermind_config=mastermind_config or {},
        mind_config=mind_config,
        prefer_dual_mastermind=prefer_dual_mastermind,
        prefer_triple_mastermind=prefer_triple_mastermind,
    )


def _interactive_shell() -> None:
    mind = SynapseMind()
    print(f"SynapseMind started in mode: {mind.mode}")
    print(f"Mastermind file: {mind.mastermind_js_path}")
    print("Commands: /status, /save, /load, /reset, /exit")
    while True:
        try:
            text = input("You> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not text:
            continue
        if text == "/exit":
            break
        if text == "/status":
            print(json.dumps(mind.status(), indent=2, ensure_ascii=True))
            continue
        if text == "/save":
            path = mind.save_state()
            print(f"Saved state to: {path}")
            continue
        if text == "/load":
            status = mind.load_state()
            print(json.dumps(status, indent=2, ensure_ascii=True))
            continue
        if text == "/reset":
            print(json.dumps(mind.reset(clear_persistent_state=True), indent=2, ensure_ascii=True))
            continue

        result = mind.think(text)
        print(f"SynapseAI> {result.get('response', '')}\n")


if __name__ == "__main__":
    _interactive_shell()
