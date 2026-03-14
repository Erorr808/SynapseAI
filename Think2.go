package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"
)

type Think2Request struct {
	Input string `json:"input"`
}

type Think2Response struct {
	ID       string `json:"id"`
	Input    string `json:"input"`
	Response string `json:"response"`
}

func main() {
	reader := bufio.NewReader(os.Stdin)
	raw, _ := reader.ReadString('\n')
	raw = strings.TrimSpace(raw)

	req := Think2Request{}
	if raw != "" {
		_ = json.Unmarshal([]byte(raw), &req)
	}

	text := strings.TrimSpace(req.Input)
	if text == "" {
		text = "No input provided."
	}

	resp := Think2Response{
		ID:       fmt.Sprintf("think2-%d", time.Now().UnixNano()),
		Input:    text,
		Response: "[Think2.go] Simple echo: " + text,
	}

	enc, _ := json.Marshal(resp)
	fmt.Println(string(enc))
}

