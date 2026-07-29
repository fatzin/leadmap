package web

import (
	"encoding/json"
	"fmt"
	"math"
	"sync"
)

// Progress represents the current progress of a scraping job.
type Progress struct {
	JobID         string `json:"job_id"`
	Status        string `json:"status"`
	Found         int    `json:"found"`
	CsvLines      int    `json:"csv_lines"`
	CellsTotal    int    `json:"cells_total"`
	CellsDone     int    `json:"cells_done"`
	EstimatedDone float64 `json:"estimated_done_percent"`
	StartTime     string  `json:"start_time"`
}

// JobProgressStore is a thread-safe store for job progress info.
// It lets the web scraper update progress while API handlers read it.
type JobProgressStore struct {
	mu     sync.RWMutex
	// jobID -> progress
	entries map[string]*ProgressEntry
}

// ProgressEntry holds per-job progress counters.
type ProgressEntry struct {
	JobID       string
	Status      string
	Found       int
	CsvLines    int
	CellsTotal  int
	CellsDone   int
	StartTime   string
}

// NewJobProgressStore creates an empty store.
func NewJobProgressStore() *JobProgressStore {
	return &JobProgressStore{
		entries: make(map[string]*ProgressEntry),
	}
}

// SetStatus records the job status.
func (s *JobProgressStore) SetStatus(jobID, status string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	e := s.getOrCreate(jobID)
	e.Status = status
}

// SetStartTime records when the job started.
func (s *JobProgressStore) SetStartTime(jobID, startTime string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	e := s.getOrCreate(jobID)
	e.StartTime = startTime
}

// SetGridInfo records grid scraping info (total cells, done cells).
func (s *JobProgressStore) SetGridInfo(jobID string, total, done int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	e := s.getOrCreate(jobID)
	e.CellsTotal = total
	e.CellsDone = done
}

// AddPlacese records newly found places (incrementally).
func (s *JobProgressStore) AddPlaces(jobID string, count int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	e := s.getOrCreate(jobID)
	e.Found += count
	e.CsvLines += count
}

// GetProgress returns the current progress for a job.
func (s *JobProgressStore) GetProgress(jobID string) *Progress {
	s.mu.RLock()
	defer s.mu.RUnlock()
	e, ok := s.entries[jobID]
	if !ok {
		return &Progress{JobID: jobID, Status: "not_found"}
	}
	p := &Progress{
		JobID:   e.JobID,
		Status:  e.Status,
		Found:   e.Found,
		CsvLines: e.CsvLines,
		CellsTotal: e.CellsTotal,
		CellsDone:  e.CellsDone,
		StartTime:  e.StartTime,
	}
	if p.CellsTotal > 0 {
		p.EstimatedDone = float64(p.CellsDone) / float64(p.CellsTotal) * 100
		p.EstimatedDone = math.Round(p.EstimatedDone*100) / 100
	}
	return p
}

func (s *JobProgressStore) getOrCreate(jobID string) *ProgressEntry {
	e, ok := s.entries[jobID]
	if !ok {
		e = &ProgressEntry{JobID: jobID}
		s.entries[jobID] = e
	}
	return e
}

// ToJSON returns the progress as a JSON string.
func (p *Progress) ToJSON() (string, error) {
	data, err := json.Marshal(p)
	if err != nil {
		return "", fmt.Errorf("marshal progress: %w", err)
	}
	return string(data), nil
}
