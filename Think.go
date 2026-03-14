package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"
)

type ThinkRequest struct {
	Input string                 `json:"input"`
	Meta  map[string]interface{} `json:"meta,omitempty"`
}

type ThinkResponse struct {
	ID         string                 `json:"id"`
	ReceivedAt string                 `json:"receivedAt"`
	CompletedAt string                `json:"completedAt"`
	Input      string                 `json:"input"`
	Response   string                 `json:"response"`
	Status     map[string]interface{} `json:"status"`
}

func nowISO() string {
	return time.Now().UTC().Format(time.RFC3339Nano)
}

func main() {
	reader := bufio.NewReader(os.Stdin)
	raw, _ := reader.ReadString('\n')
	raw = strings.TrimSpace(raw)

	req := ThinkRequest{}
	if raw != "" {
		_ = json.Unmarshal([]byte(raw), &req)
	}

	input := strings.TrimSpace(req.Input)
	if input == "" {
		input = "No input provided."
	}

	resp := ThinkResponse{
		ID:          fmt.Sprintf("think-go-%d", time.Now().UnixNano()),
		ReceivedAt:  nowISO(),
		CompletedAt: nowISO(),
		Input:       input,
		Response:    fmt.Sprintf("[Think.go] Echo: %s", input),
		Status: map[string]interface{}{
			"engine": "Think.go",
		},
	}

	enc, _ := json.Marshal(resp)
	fmt.Println(string(enc))
}

