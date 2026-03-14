package main

// queue_worker.go
// Very small stub for a background queue worker.

type Job struct {
	ID   string
	Data string
}

type QueueWorker struct {
	queue chan Job
}

func NewQueueWorker(size int) *QueueWorker {
	return &QueueWorker{queue: make(chan Job, size)}
}

func (w *QueueWorker) Enqueue(job Job) {
	w.queue <- job
}

