package main

// Secondary Go image generator that simply wraps ImageGeneratior.go's protocol.

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"
)

type Image2Request struct {
	Prompt string `json:"prompt"`
	Size   string `json:"size,omitempty"`
	Style  string `json:"style,omitempty"`
}

type Image2Response struct {
	ID        string `json:"id"`
	Engine    string `json:"engine"`
	CreatedAt string `json:"createdAt"`
	Prompt    string `json:"prompt"`
	Size      string `json:"size"`
	Style     string `json:"style"`
	Preview   string `json:"preview"`
}

func nowISO2() string {
	return time.Now().UTC().Format(time.RFC3339Nano)
}

func main() {
	reader := bufio.NewReader(os.Stdin)
	raw, _ := reader.ReadString('\n')
	raw = strings.TrimSpace(raw)

	req := Image2Request{}
	if raw != "" {
		_ = json.Unmarshal([]byte(raw), &req)
	}

	prompt := strings.TrimSpace(req.Prompt)
	if prompt == "" {
		prompt = "Empty image prompt."
	}
	size := strings.TrimSpace(req.Size)
	if size == "" {
		size = "1024x1024"
	}
	style := strings.TrimSpace(req.Style)
	if style == "" {
		style = "vivid"
	}

	resp := Image2Response{
		ID:        fmt.Sprintf("img2-go-%d", time.Now().UnixNano()),
		Engine:    "SynapseAI-Image-Go-2",
		CreatedAt: nowISO2(),
		Prompt:    prompt,
		Size:      size,
		Style:     style,
		Preview:   fmt.Sprintf("[Image-Go-2] style=%s size=%s prompt=\"%s\"", style, size, prompt),
	}

	enc, _ := json.Marshal(resp)
	fmt.Println(string(enc))
}

