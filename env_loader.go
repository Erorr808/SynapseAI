package main

// env_loader.go
// Loads environment variables like API keys.

import "os"

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

