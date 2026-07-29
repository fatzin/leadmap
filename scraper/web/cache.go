package web

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"
)

const searchCacheTTL = 24 * time.Hour

// CacheKey generates a deterministic key for a search query.
func CacheKey(name string, keywords []string, lat, lon string, radius int) string {
	sorted := make([]string, len(keywords))
	copy(sorted, keywords)
	sort.Strings(sorted)
	return fmt.Sprintf("%s|%s|%s|%s|%d", name, strings.Join(sorted, ","), lat, lon, radius)
}

// FindCachedJob looks for a completed job matching the cache key within TTL.
// Returns the job ID if found, empty string otherwise.
func (s *Service) FindCachedJob(ctx context.Context, name string, keywords []string, lat, lon string, radius int) (string, error) {
	jobs, err := s.repo.Select(ctx, SelectParams{Status: StatusOK})
	if err != nil {
		return "", fmt.Errorf("select cached jobs: %w", err)
	}

	targetKey := CacheKey(name, keywords, lat, lon, radius)

	for _, j := range jobs {
		// Skip jobs older than TTL
		if time.Since(j.Date) > searchCacheTTL {
			continue
		}

		// Build the job's cache key from its data
		jobKey := CacheKey(j.Name, j.Data.Keywords, j.Data.Lat, j.Data.Lon, j.Data.Radius)

		if jobKey == targetKey {
			return j.ID, nil
		}
	}

	return "", nil
}
