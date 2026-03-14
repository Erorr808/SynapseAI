package main

// payload.go
// Shared request/response payload definitions.

type PredictPayload struct {
	Text string `json:"text"`
}

type PredictResult struct {
	Text   string  `json:"text"`
	Score  float64 `json:"score"`
	Source string  `json:"source"`
}

