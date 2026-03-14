package main

// NOTE: name kept as requested (ImageGeneratior.go, with typo).
// This Go tool delegates to the same protocol as ImageGenerator.js:
// it returns a JSON object describing the requested image.

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"
)

type ImageRequest struct {
	Prompt string `json:"prompt"`
	Size   string `json:"size,omitempty"`
	Style  string `json:"style,omitempty"`
}

type ImageResponse struct {
	ID        string `json:"id"`
	Engine    string `json:"engine"`
	CreatedAt string `json:"createdAt"`
	Prompt    string `json:"prompt"`
	Size      string `json:"size"`
	Style     string `json:"style"`
	Preview   string `json:"preview"`
}

func nowISO() string {
	return time.Now().UTC().Format(time.RFC3339Nano)
}

func main() {
	reader := bufio.NewReader(os.Stdin)
	raw, _ := reader.ReadString('\n')
	raw = strings.TrimSpace(raw)

	req := ImageRequest{}
	if raw != "" {
		_ = json.Unmarshal([]byte(raw), &req)
	}

	prompt := strings.TrimSpace(req.Prompt)
	if prompt == "" {
		prompt = "Empty image prompt."
	}
	size := req.Size
	if strings.TrimSpace(size) == "" {
		size = "1024x1024"
	}
	style := req.Style
	if strings.TrimSpace(style) == "" {
		style = "vivid"
	}

	resp := ImageResponse{
		ID:        fmt.Sprintf("img-go-%d", time.Now().UnixNano()),
		Engine:    "SynapseAI-Image-Go",
		CreatedAt: nowISO(),
		Prompt:    prompt,
		Size:      size,
		Style:     style,
		Preview:   fmt.Sprintf("[Image-Go] style=%s size=%s prompt=\"%s\"", style, size, prompt),
	}

	enc, _ := json.Marshal(resp)
	fmt.Println(string(enc))
}

