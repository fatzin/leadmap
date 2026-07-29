package gmaps

import (
	"bytes"
	"context"
	"fmt"
	"net/http"
	"net/url"

	"github.com/google/uuid"
	"github.com/gosom/google-maps-scraper/exiter"
	"github.com/gosom/scrapemate"
)

type SearchJobOptions func(*SearchJob)

type MapLocation struct {
	Lat     float64
	Lon     float64
	ZoomLvl float64
	Radius  float64
}

type MapSearchParams struct {
	Location  MapLocation
	Query     string
	ViewportW int
	ViewportH int
	Hl        string
}

type SearchJob struct {
	scrapemate.Job

	params                  *MapSearchParams
	ExitMonitor             exiter.Exiter
	WriterManagedCompletion bool
	ExtractExtraReviews     bool
}

func NewSearchJob(params *MapSearchParams, opts ...SearchJobOptions) *SearchJob {
	const (
		defaultPrio       = scrapemate.PriorityMedium
		defaultMaxRetries = 3
		baseURL           = "https://maps.google.com/search"
	)

	job := SearchJob{
		Job: scrapemate.Job{
			ID:         uuid.New().String(),
			Method:     http.MethodGet,
			URL:        baseURL,
			URLParams:  buildGoogleMapsParams(params),
			MaxRetries: defaultMaxRetries,
			Priority:   defaultPrio,
		},
	}

	job.params = params

	for _, opt := range opts {
		opt(&job)
	}

	return &job
}

func WithSearchJobExtraReviews() SearchJobOptions {
	return func(j *SearchJob) {
		j.ExtractExtraReviews = true
	}
}

func WithSearchJobExitMonitor(exitMonitor exiter.Exiter) SearchJobOptions {
	return func(j *SearchJob) {
		j.ExitMonitor = exitMonitor
	}
}

func WithSearchJobWriterManagedCompletion() SearchJobOptions {
	return func(j *SearchJob) {
		j.WriterManagedCompletion = true
	}
}

func (j *SearchJob) ProcessOnFetchError() bool {
	return true
}

func (j *SearchJob) Process(_ context.Context, resp *scrapemate.Response) (any, []scrapemate.IJob, error) {
	defer func() {
		resp.Document = nil
		resp.Body = nil
		resp.Meta = nil
	}()

	if resp.Error != nil {
		if j.ExitMonitor != nil {
			j.ExitMonitor.IncrSeedCompleted(1)
		}

		return nil, nil, resp.Error
	}

	body := removeFirstLine(resp.Body)
	if len(body) == 0 {
		if j.ExitMonitor != nil {
			j.ExitMonitor.IncrSeedCompleted(1)
		}

		return nil, nil, fmt.Errorf("empty response body")
	}

	entries, err := ParseSearchResults(body)
	if err != nil {
		if j.ExitMonitor != nil {
			j.ExitMonitor.IncrSeedCompleted(1)
		}

		return nil, nil, fmt.Errorf("failed to parse search results: %w", err)
	}

	entries = filterAndSortEntriesWithinRadius(entries,
		j.params.Location.Lat,
		j.params.Location.Lon,
		j.params.Location.Radius,
	)

	if j.ExitMonitor != nil {
		j.ExitMonitor.IncrPlacesFound(len(entries))
		j.ExitMonitor.IncrSeedCompleted(1)

		if !j.WriterManagedCompletion && !j.ExtractExtraReviews {
			j.ExitMonitor.IncrPlacesCompleted(len(entries))
		}
	}

	// If extra reviews requested, create PlaceJob for each entry to fetch full details + reviews.
	// Fast-mode search results don't include a place link, so build one from the place ID or data ID.
	if j.ExtractExtraReviews {
		var nextJobs []scrapemate.IJob
		for _, entry := range entries {
			placeURL := entry.Link
			if placeURL == "" {
				placeURL = buildPlaceURL(entry, j.params.Hl)
			}
			if placeURL == "" {
				continue
			}
			jopts := []PlaceJobOptions{}
			if j.ExitMonitor != nil {
				jopts = append(jopts, WithPlaceJobExitMonitor(j.ExitMonitor))
			}
			if j.WriterManagedCompletion {
				jopts = append(jopts, WithPlaceJobWriterManagedCompletion())
			}
			pj := NewPlaceJob(j.ID, j.params.Hl, placeURL, false, true, jopts...)
			nextJobs = append(nextJobs, pj)
		}
		// Return entries as results AND PlaceJobs as follow-up jobs
		return entries, nextJobs, nil
	}

	return entries, nil, nil
}

func buildPlaceURL(entry *Entry, lang string) string {
	if entry.DataID == "" || entry.Latitude == 0 || entry.Longtitude == 0 {
		return ""
	}

	name := entry.Title
	if name == "" {
		name = "Local"
	}

	return fmt.Sprintf(
		"https://www.google.com/maps/place/%s/data=!4m7!3m6!1s%s!8m2!3d%f!4d%f?hl=%s",
		url.PathEscape(name), entry.DataID, entry.Latitude, entry.Longtitude, lang)
}

func removeFirstLine(data []byte) []byte {
	if len(data) == 0 {
		return data
	}

	index := bytes.IndexByte(data, '\n')
	if index == -1 {
		return []byte{}
	}

	return data[index+1:]
}

func buildGoogleMapsParams(params *MapSearchParams) map[string]string {
	params.ViewportH = 800
	params.ViewportW = 600

	ans := map[string]string{
		"tbm":      "map",
		"authuser": "0",
		"hl":       params.Hl,
		"q":        params.Query,
	}

	pb := fmt.Sprintf("!4m12!1m3!1d3826.902183192154!2d%.4f!3d%.4f!2m3!1f0!2f0!3f0!3m2!1i%d!2i%d!4f%.1f!7i20!8i0"+
		"!10b1!12m22!1m3!18b1!30b1!34e1!2m3!5m1!6e2!20e3!4b0!10b1!12b1!13b1!16b1!17m1!3e1!20m3!5e2!6b1!14b1!46m1!1b0"+
		"!96b1!19m4!2m3!1i360!2i120!4i8",
		params.Location.Lon,
		params.Location.Lat,
		params.ViewportW,
		params.ViewportH,
		params.Location.ZoomLvl,
	)

	ans["pb"] = pb

	return ans
}
