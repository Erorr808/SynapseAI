package main

// router.go
// Very small placeholder for HTTP routing.

type Route struct {
	Path   string
	Method string
}

var routes = []Route{
	{Path: "/health", Method: "GET"},
}

