package main

// VideoGeneratior.go (typo preserved): Go-side video description generator.

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"
)

type VideoRequest struct {
	Prompt          string  `json:"prompt"`
	DurationSeconds float64 `json:"durationSeconds,omitempty"`
	Resolution      string  `json:"resolution,omitempty"`
}

type VideoResponse struct {
	ID              string  `json:"id"`
	Engine          string  `json:"engine"`
	CreatedAt       string  `json:"createdAt"`
	Prompt          string  `json:"prompt"`
	DurationSeconds float64 `json:"durationSeconds"`
	Resolution      string  `json:"resolution"`
	Preview         string  `json:"preview"`
}

func nowISOVid() string {
	return time.Now().UTC().Format(time.RFC3339Nano)
}

func main() {
	reader := bufio.NewReader(os.Stdin)
	raw, _ := reader.ReadString('\n')
	raw = strings.TrimSpace(raw)

	req := VideoRequest{}
	if raw != "" {
		_ = json.Unmarshal([]byte(raw), &req)
	}

	prompt := strings.TrimSpace(req.Prompt)
	if prompt == "" {
		prompt = "Empty video prompt."
	}
	dur := req.DurationSeconds
	if dur <= 0 {
		dur = 10
	}
	res := strings.TrimSpace(req.Resolution)
	if res == "" {
		res = "1920x1080"
	}

	resp := VideoResponse{
		ID:              fmt.Sprintf("vid-go-%d", time.Now().UnixNano()),
		Engine:          "SynapseAI-Video-Go",
		CreatedAt:       nowISOVid(),
		Prompt:          prompt,
		DurationSeconds: dur,
		Resolution:      res,
		Preview:         fmt.Sprintf("[Video-Go] %.1fs at %s prompt=\"%s\"", dur, res, prompt),
	}

	enc, _ := json.Marshal(resp)
	fmt.Println(string(enc))
}

