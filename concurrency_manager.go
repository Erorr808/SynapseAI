package main

// concurrency_manager.go
// Manages goroutines / concurrency for AI requests.

import "sync"

type ConcurrencyManager struct {
	wg sync.WaitGroup
}

func (m *ConcurrencyManager) Go(f func()) {
	m.wg.Add(1)
	go func() {
		defer m.wg.Done()
		f()
	}()
}

func (m *ConcurrencyManager) Wait() {
	m.wg.Wait()
}

