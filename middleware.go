package main

// middleware.go
// Simple timing middleware stub.

import "time"

func timeCall(fn func()) time.Duration {
	start := time.Now()
	fn()
	return time.Since(start)
}

