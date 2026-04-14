#!/usr/bin/env python3
"""
SynapseAI Chat Interface

A command-line chat interface for SynapseAI that can load knowledge from markdown files.
Incorporates 2-gram (bigram) analysis for improved contextual understanding.
"""

import os
import sys
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple
from collections import Counter
import random

# Add current directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

try:
    from transformers import pipeline
    HAS_TRANSFORMERS = True
except ImportError:
    HAS_TRANSFORMERS = False
    print("Warning: transformers not installed. Install with: pip install transformers torch")


class BigramAnalyzer:
    """Analyze text using bigrams (2-grams) for better understanding."""

    @staticmethod
    def extract_bigrams(text: str) -> Set[Tuple[str, str]]:
        """Extract bigrams from text."""
        words = text.lower().split()
        bigrams = set()
        for i in range(len(words) - 1):
            bigrams.add((words[i], words[i + 1]))
        return bigrams

    @staticmethod
    def calculate_bigram_overlap(query_bigrams: Set[Tuple[str, str]], 
                                 content_bigrams: Set[Tuple[str, str]]) -> int:
        """Calculate how many bigrams overlap between query and content."""
        return len(query_bigrams.intersection(content_bigrams))

    @staticmethod
    def tokenize_to_bigrams(text: str) -> List[Tuple[str, str]]:
        """Convert text to bigram list."""
        words = text.lower().split()
        return [(words[i], words[i + 1]) for i in range(len(words) - 1)]

class KnowledgeBase:
    """Simple knowledge base that loads markdown files."""

    def __init__(self, knowledge_dir: str = "knowledge"):
        self.knowledge_dir = Path(knowledge_dir)
        self.documents: Dict[str, str] = {}
        self.document_bigrams: Dict[str, Set[Tuple[str, str]]] = {}
        self.bigram_analyzer = BigramAnalyzer()
        self.load_documents()

    def load_documents(self):
        """Load all markdown files from knowledge directory."""
        if not self.knowledge_dir.exists():
            self.knowledge_dir.mkdir(exist_ok=True)
            print(f"Created knowledge directory: {self.knowledge_dir}")
            return

        self.documents.clear()
        self.document_bigrams.clear()

        for md_file in self.knowledge_dir.glob("*.md"):
            try:
                with open(md_file, 'r', encoding='utf-8') as f:
                    content = f.read()
                    self.documents[md_file.stem] = content
                    # Pre-compute bigrams for faster search
                    self.document_bigrams[md_file.stem] = self.bigram_analyzer.extract_bigrams(content)
                print(f"Loaded knowledge: {md_file.name}")
            except Exception as e:
                print(f"Error loading {md_file}: {e}")

    def search(self, query: str, max_results: int = 4) -> List[tuple]:
        """Search knowledge base using bigram analysis for better contextual matching.
        Returns tuples of (score, title, snippet) for smarter response generation."""
        query_lower = query.lower()
        query_words = set(word for word in query_lower.split() if len(word) > 2)  # Filter short words
        query_bigrams = self.bigram_analyzer.extract_bigrams(query_lower)
        
        scored_results = []

        for title, content in self.documents.items():
            content_lower = content.lower()
            title_lower = title.lower()
            content_bigrams = self.document_bigrams.get(title, set())

            score = 0
            snippet = ""

            # Exact phrase match - highest priority
            if query_lower in content_lower:
                score = 100
                lines = content.split('\n')
                for line in lines:
                    if query_lower in line.lower():
                        snippet = line.strip()
                        break
                if not snippet:
                    relevant_lines = [l.strip() for l in lines if l.strip() and len(l) > 20]
                    snippet = relevant_lines[0] if relevant_lines else lines[0].strip()
                scored_results.append((score, title, snippet[:200]))
                continue

            # Title match - second highest priority
            if query_lower in title_lower:
                score = 90
            elif any(word in title_lower for word in query_words):
                score = 85

            # Bigram overlap - contextual understanding
            if query_bigrams:
                bigram_overlap = self.bigram_analyzer.calculate_bigram_overlap(query_bigrams, content_bigrams)
                score += bigram_overlap * 5

            # Word matches
            if query_words:
                matching_words = query_words.intersection(set(content_lower.split()))
                if matching_words:
                    score += len(matching_words) * 4
                    
                    # Find most relevant section
                    lines = content.split('\n')
                    best_snippet = ""
                    max_matches = 0
                    for i in range(len(lines)):
                        section = ' '.join(lines[max(0, i-2):min(len(lines), i+3)]).lower()
                        section_matches = sum(1 for word in query_words if word in section)
                        if section_matches > max_matches:
                            max_matches = section_matches
                            best_snippet = ' '.join(lines[max(0, i-2):min(len(lines), i+3)]).strip()

                    snippet = best_snippet or content.split('\n')[2].strip()

            if score > 0 and snippet:
                scored_results.append((score, title, snippet[:250]))

        # Sort by score (descending) and return top results
        scored_results.sort(reverse=True, key=lambda x: x[0])
        return scored_results[:max_results]

class SynapseChat:
    """Chat interface for SynapseAI with human-like conversational abilities."""

    def __init__(self):
        self.knowledge = KnowledgeBase()
        self.generator = None
        self.conversation_history = []

        if HAS_TRANSFORMERS:
            try:
                # Use a small model for chat
                self.generator = pipeline('text-generation', model='microsoft/DialoGPT-small')
                print("Loaded DialoGPT model for chat")
            except Exception as e:
                print(f"Could not load model: {e}")
                print("Falling back to knowledge-based responses")

    def extract_question_intent(self, user_input: str) -> str:
        """Extract the main intent/topic from user input."""
        # Remove common question words
        question_words = ['what', 'why', 'how', 'when', 'where', 'who', 'which', 'can', 'is', 'are', 'do', 'does', 'did', 'will', 'would', 'could', 'should']
        words = user_input.lower().split()
        intent_words = [w for w in words if w not in question_words and len(w) > 2]
        return ' '.join(intent_words)

    def generate_response(self, user_input: str) -> str:
        """Generate smart, friendly response with automatic knowledge base search."""
        # Handle empty input
        if not user_input.strip():
            return "I'm listening! Go ahead and ask me anything."

        self.conversation_history.append(user_input)
        user_lower = user_input.lower().strip('?!.')

        # Enhanced greeting detection
        greeting_patterns = {
            'hello': "Hey there! I'm SynapseAI, and I'm really glad you're here. I've got tons of knowledge on everything from ancient history to cutting-edge AI. What would you like to know?",
            'hi': "Hey! What's up? I'm always ready to chat and help you learn awesome stuff.",
            'hey': "What's going on? I'm here to help with whatever you want to know.",
            'good morning': "Good morning! Hope you're having a fantastic day. What can I help you with?",
            'good afternoon': "Good afternoon! Hope your day is going great. What's on your mind?",
            'good evening': "Good evening! Perfect time for a good conversation. What would you like to explore?",
            'how are you': "I'm doing amazing, thanks for asking! I'm always energized when I get to share knowledge. How can I help you today?"
        }

        for greeting, response in greeting_patterns.items():
            if greeting in user_lower:
                return response

        # Quick thanks response
        if any(word in user_lower for word in ['thank', 'thanks', 'appreciate', 'grateful', 'awesome']):
            thanks_responses = [
                "You're very welcome! I love helping out. What else can I tell you about?",
                "Anytime! That's what I'm here for. Any other questions?",
                "Happy to help! I've got tons more knowledge to share. What else?",
                "My pleasure! Feel free to ask me anything else you're curious about.",
                "You got it! That's what makes conversations fun. What else can I help with?"
            ]
            return random.choice(thanks_responses)

        # Search the knowledge base - automatic for any question or topic
        knowledge_results = self.knowledge.search(user_input, max_results=5)
        
        # If we found strong matches, use them
        if knowledge_results and knowledge_results[0][0] > 20:  # Score > 20 means relevant
            intro_phrases = [
                "Great question! Let me share what I found:",
                "I love this topic! Here's what I know:",
                "Perfect! I've got some solid info on this:",
                "Absolutely! This is really interesting. Check this out:",
                "Oh, I've got great info on that:",
                "This is one of my favorite topics to discuss:",
                "Excellent question! Here's what I learned:",
                "I'm glad you asked! Here's the breakdown:",
                "That's a fantastic question. Here's what I have:"
            ]
            
            response = random.choice(intro_phrases) + "\n\n"
            
            # Format each result with context
            for i, (score, title, snippet) in enumerate(knowledge_results, 1):
                # Clean snippet - remove markdown formatting
                clean_snippet = snippet.replace('##', '').replace('**', '').replace('- ', '').strip()
                response += f"From my {title} knowledge: {clean_snippet}\n"
                if i < min(3, len(knowledge_results)):  # Limit to 3 sources in response
                    response += "\n"
            
            # Add smart follow-up based on what was asked
            follow_ups = [
                f"\nWould you like me to explain any part of that in more detail?",
                f"\nIs there anything specific about this you'd like to know more about?",
                f"\nDoes that answer your question, or should I go deeper?",
                f"\nMake sense? Feel free to ask for clarification on anything!",
                f"\nLet me know if you want more details on any part of that.",
                f"\nGot any follow-up questions? I'm here to help!",
                f"\nAnything else you're curious about on this topic?"
            ]
            
            response += random.choice(follow_ups)
            return response
        
        # If no strong matches found, try to engage meaningfully
        else:
            # Extract what they're asking about
            keywords = self.extract_question_intent(user_input)
            
            if any(char in user_input for char in ['?', '!']):  # It's clearly a question
                uncertain_responses = [
                    f"That's a really interesting question about {keywords}! I don't have that specific info in my knowledge base right now, but I think it's fascinating. Can you tell me more about what you're wondering?",
                    f"Good question! I don't have detailed knowledge about {keywords} loaded yet, but I'd love to learn more. What specifically would you like to know?",
                    f"That's intriguing! While I don't have complete info on {keywords}, I'm very interested. Want to help me learn more about it?",
                    f"You know what, {keywords} is really interesting but I don't have enough details on it yet. But I think it deserves a good discussion! What's your take on it?"
                ]
            else:
                # Regular statement
                uncertain_responses = [
                    f"Interesting! You're talking about {keywords}, which is a cool topic. I don't have loads of info on it yet, but I'd like to learn. What would you like to know about it?",
                    f"That's neat! {keywords} is something I'm still learning about. What's your question about it?",
                    f"Cool observation! I'm always excited to learn about {keywords}. Want to ask me something specific about it?"
                ]
            
            return random.choice(uncertain_responses) if keywords else "Hmm, tell me more! What are you curious about?"

    def chat_loop(self):
        """Main chat loop with improved conversational flow."""
        welcome_messages = [
            "Welcome to SynapseAI! I'm here and ready to answer your questions on basically anything - history, science, technology, you name it! Ask me anything!",
            "Hey, welcome aboard! I'm SynapseAI, your smart AI companion. I've got knowledge on 100+ topics ready to help you learn. What do you want to know?",
            "Great to see you! I'm SynapseAI. Ask me questions about pretty much anything - I'll search my knowledge base and give you solid answers. What's on your mind?"
        ]
        
        print(random.choice(welcome_messages))
        print(f"Knowledge base ready: {len(self.knowledge.documents)} topics loaded and searchable")
        print("-" * 70)
        print("Commands: 'help', 'list' (show all topics), 'reload', or just ask away!\n")
        
        while True:
            try:
                user_input = input("You: ").strip()

                if not user_input:
                    continue

                if user_input.lower() in ['quit', 'exit', 'q', 'bye', 'goodbye']:
                    farewell = random.choice([
                        "Thanks so much for chatting with me! It's been a pleasure. Talk to you soon!",
                        "It was great talking with you! Come back anytime you want to learn something new.",
                        "See you later! I enjoyed our conversation. Keep on learning!",
                        "Goodbye! Thanks for exploring all this knowledge with me. Until next time!",
                        "Take care! I'm always here if you want to chat again."
                    ])
                    print(f"\nSynapseAI: {farewell}")
                    break
                    
                elif user_input.lower() == 'help':
                    print("""
╔════════════════════════════════════════════════════════════════════╗
║  SYNAPSEAI COMMAND REFERENCE                                       ║
╠════════════════════════════════════════════════════════════════════╣
║  Ask any question:   I'll search my knowledge base and help you    ║
║  'list'             Display all available knowledge topics         ║
║  'reload'           Reload the knowledge base (useful if updated)  ║
║  'help'             Show this help message                         ║
║  'quit'             Exit the chat                                  ║
╚════════════════════════════════════════════════════════════════════╝""")
                    
                elif user_input.lower() == 'list':
                    print(f"\n📚 Knowledge Base ({len(self.knowledge.documents)} topics loaded):\n")
                    topics = sorted(self.knowledge.documents.keys())
                    for i, doc_title in enumerate(topics, 1):
                        print(f"   {i:2}. {doc_title}")
                    print()
                    
                elif user_input.lower() == 'reload':
                    print("🔄 Reloading knowledge base...")
                    self.knowledge.load_documents()
                    print(f"✅ Ready! Loaded {len(self.knowledge.documents)} knowledge topics.\n")
                    
                elif user_input.lower() == 'search':
                    query = input("What would you like to search for? ").strip()
                    if query:
                        results = self.knowledge.search(query, max_results=5)
                        if results:
                            print(f"\n📖 Search Results for '{query}':\n")
                            for i, (score, title, snippet) in enumerate(results, 1):
                                clean_snippet = snippet.replace('##', '').replace('**', '').replace('- ', '').strip()
                                print(f"{i}. [{title}] (relevance: {score})")
                                print(f"   {clean_snippet[:150]}...")
                                print()
                        else:
                            print(f"No results found for '{query}'. Try different keywords!")
                    continue
                    
                else:
                    response = self.generate_response(user_input)
                    print(f"\nSynapseAI: {response}\n")

            except KeyboardInterrupt:
                print("\n\nExiting... Thanks for chatting!")
                break
            except Exception as e:
                print(f"❌ Error: {e}")
                print("Let me try to continue...\n")

def main():
    chat = SynapseChat()
    chat.chat_loop()

if __name__ == "__main__":
    main()