package web

import (
	"bytes"
	"context"
	"crypto/sha1"
	"embed"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"html/template"
	"io"
	"io/fs"
	"log"
	"math"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
)

//go:embed static
var static embed.FS

type Server struct {
	tmpl map[string]*template.Template
	srv  *http.Server
	svc  *Service
}

func New(svc *Service, addr string) (*Server, error) {
	ans := Server{
		svc:  svc,
		tmpl: make(map[string]*template.Template),
		srv: &http.Server{
			Addr:              addr,
			ReadHeaderTimeout: 10 * time.Second,
			ReadTimeout:       60 * time.Second,
			WriteTimeout:      60 * time.Second,
			IdleTimeout:       120 * time.Second,
			MaxHeaderBytes:    1 << 20,
		},
	}

	staticFS, err := fs.Sub(static, "static")
	if err != nil {
		return nil, err
	}

	fileServer := http.FileServer(http.FS(staticFS))
	mux := http.NewServeMux()

	mux.Handle("/static/", http.StripPrefix("/static/", fileServer))
	mux.HandleFunc("/scrape", ans.scrape)
	mux.HandleFunc("/download", func(w http.ResponseWriter, r *http.Request) {
		r = requestWithID(r)
		ans.download(w, r)
	})
	mux.HandleFunc("/delete", func(w http.ResponseWriter, r *http.Request) {
		r = requestWithID(r)
		ans.delete(w, r)
	})
	mux.HandleFunc("/jobs", ans.getJobs)
	mux.HandleFunc("/view", func(w http.ResponseWriter, r *http.Request) {
		r = requestWithID(r)
		ans.viewJob(w, r)
	})
	mux.HandleFunc("/", ans.index)

	// api routes
	mux.HandleFunc("/api/docs", ans.redocHandler)
	mux.HandleFunc("/api/v1/jobs", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPost:
			ans.apiScrape(w, r)
		case http.MethodGet:
			ans.apiGetJobs(w, r)
		default:
			ans := apiError{
				Code:    http.StatusMethodNotAllowed,
				Message: "Method not allowed",
			}
			renderJSON(w, http.StatusMethodNotAllowed, ans)
		}
	})

	// GET /api/v1/jobs/ - handle all sub-paths: {id}, {id}/download, {id}/results, {id}/progress
	mux.HandleFunc("/api/v1/jobs/", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		parts := strings.TrimPrefix(path, "/api/v1/jobs/")
		if parts == "" || strings.HasPrefix(parts, "/") {
			renderJSON(w, http.StatusNotFound, apiError{Code: http.StatusNotFound, Message: "Not found"})
			return
		}

		idPart := parts
		subPath := ""
		if idx := strings.Index(idPart, "/"); idx > 0 {
			idPart = idPart[:idx]
			subPath = parts[idx:]
		}

		jobID, err := uuid.Parse(idPart)
		if err != nil {
			renderJSON(w, http.StatusUnprocessableEntity, apiError{Code: http.StatusUnprocessableEntity, Message: "Invalid job ID"})
			return
		}

		r = r.WithContext(context.WithValue(r.Context(), idCtxKey, jobID))

		// GET /api/v1/jobs/{id}/results - return typed JSON
		if subPath == "/results" {
			places, err := ans.svc.GetPlaces(r.Context(), jobID.String())
			if err != nil {
				renderJSON(w, http.StatusNotFound, apiError{Code: http.StatusNotFound, Message: err.Error()})
				return
			}
			renderJSON(w, http.StatusOK, places)
			return
		}

		// GET /api/v1/jobs/{id}/download - download CSV
		if subPath == "/download" {
			if r.Method != http.MethodGet {
				renderJSON(w, http.StatusMethodNotAllowed, apiError{Code: http.StatusMethodNotAllowed, Message: "Method not allowed"})
				return
			}
			downloadReq := r.WithContext(context.WithValue(r.Context(), idCtxKey, jobID))
			ans.download(w, downloadReq)
			return
		}

		// GET /api/v1/jobs/{id}/progress - delegated to separate route below

		// Default: GET/DELETE /api/v1/jobs/{id}
		if r.Method == http.MethodDelete {
			if err := ans.svc.Delete(r.Context(), jobID.String()); err != nil {
				renderJSON(w, http.StatusInternalServerError, apiError{Code: http.StatusInternalServerError, Message: err.Error()})
				return
			}
			renderJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
			return
		}

		if r.Method != http.MethodGet {
			renderJSON(w, http.StatusMethodNotAllowed, apiError{Code: http.StatusMethodNotAllowed, Message: "Method not allowed"})
			return
		}

		job, err := ans.svc.Get(r.Context(), jobID.String())
		if err != nil {
			renderJSON(w, http.StatusNotFound, apiError{Code: http.StatusNotFound, Message: http.StatusText(http.StatusNotFound)})
			return
		}
		renderJSON(w, http.StatusOK, job)
	})

	// --- NEW ENDPOINTS ---

	// GET /api/v1/jobs/{id}/progress
	mux.HandleFunc("/api/v1/jobs/{id}/progress", func(w http.ResponseWriter, r *http.Request) {
		r = requestWithID(r)
		if r.Method != http.MethodGet {
			renderJSON(w, http.StatusMethodNotAllowed, apiError{Code: http.StatusMethodNotAllowed, Message: "Method not allowed"})
			return
		}

		id, ok := getIDFromRequest(r)
		if !ok {
			renderJSON(w, http.StatusUnprocessableEntity, apiError{Code: http.StatusUnprocessableEntity, Message: "Invalid ID"})
			return
		}

		job, err := ans.svc.Get(r.Context(), id.String())
		if err != nil {
			renderJSON(w, http.StatusNotFound, apiError{Code: http.StatusNotFound, Message: http.StatusText(http.StatusNotFound)})
			return
		}

		// Update progress with current job status
		ans.svc.progress.SetStatus(id.String(), job.Status)

		progress := ans.svc.progress.GetProgress(id.String())
		progress.Status = job.Status

		renderJSON(w, http.StatusOK, progress)
	})

	// GET /api/v1/jobs/{id}/leads
	mux.HandleFunc("/api/v1/jobs/{id}/leads", func(w http.ResponseWriter, r *http.Request) {
		r = requestWithID(r)
		if r.Method != http.MethodGet {
			renderJSON(w, http.StatusMethodNotAllowed, apiError{Code: http.StatusMethodNotAllowed, Message: "Method not allowed"})
			return
		}

		id, ok := getIDFromRequest(r)
		if !ok {
			renderJSON(w, http.StatusUnprocessableEntity, apiError{Code: http.StatusUnprocessableEntity, Message: "Invalid ID"})
			return
		}

		// Verify job exists
		_, err := ans.svc.Get(r.Context(), id.String())
		if err != nil {
			renderJSON(w, http.StatusNotFound, apiError{Code: http.StatusNotFound, Message: http.StatusText(http.StatusNotFound)})
			return
		}

		places, err := ans.svc.GetPartialLeads(r.Context(), id.String())
		if err != nil && !errors.Is(err, ErrPlacesNotFound) {
			renderJSON(w, http.StatusInternalServerError, apiError{Code: http.StatusInternalServerError, Message: err.Error()})
			return
		}

		if places == nil {
			places = []Place{}
		}

		renderJSON(w, http.StatusOK, places)
	})

	// POST /api/v1/jobs/grid (grid search - divide area into cells)
	mux.HandleFunc("/api/v1/jobs/grid", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			renderJSON(w, http.StatusMethodNotAllowed, apiError{Code: http.StatusMethodNotAllowed, Message: "Method not allowed"})
			return
		}

		var req struct {
			Name         string    `json:"name"`
			Keywords     []string  `json:"keywords"`
			Lang         string    `json:"lang"`
			Lat          float64   `json:"lat"`
			Lon          float64   `json:"lon"`
			Radius       int       `json:"radius"`        // meters
			Depth        int       `json:"depth"`
			MaxTime      int       `json:"max_time"`      // seconds
			GridSize     int       `json:"grid_size"`     // cell size in meters (default: radius/3)
			GridBBox     string    `json:"grid_bbox"`     // "minLat,minLon,maxLat,maxLon"
			GridCell     float64   `json:"grid_cell"`     // custom grid cell multiplier
			ExtraReviews bool      `json:"extra_reviews"` // collect full reviews
			FastMode     bool      `json:"fast_mode"`     // use fast map search
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			renderJSON(w, http.StatusBadRequest, apiError{Code: http.StatusBadRequest, Message: err.Error()})
			return
		}

		if len(req.Keywords) == 0 {
			renderJSON(w, http.StatusUnprocessableEntity, apiError{Code: http.StatusUnprocessableEntity, Message: "missing keywords"})
			return
		}

		const earthRadius = 6378137.0 // meters in km

		if req.Lang == "" {
			req.Lang = "en"
		}
		if req.Depth == 0 {
			req.Depth = 3
		}
		if req.MaxTime == 0 {
			req.MaxTime = 300
		}

		// Determine grid parameters
		var minLat, minLon, maxLat, maxLon float64
		var cellsTotal int

		if req.GridBBox != "" {
			// Parse bounding box
			parts := strings.Split(req.GridBBox, ",")
			if len(parts) != 4 {
				renderJSON(w, http.StatusUnprocessableEntity, apiError{Code: http.StatusUnprocessableEntity, Message: "invalid grid_bbox format"})
				return
			}
			fmt.Sscanf(parts[0], "%f", &minLat)
			fmt.Sscanf(parts[1], "%f", &minLon)
			fmt.Sscanf(parts[2], "%f", &maxLat)
			fmt.Sscanf(parts[3], "%f", &maxLon)
		} else if req.Lat != 0 && req.Lon != 0 && req.Radius > 0 {
			// Calculate bounding box from center + radius
			halfRadius := float64(req.Radius) / 2.0

			// Convert radius to degrees (approximate)
			latDelta := (halfRadius / earthRadius) * (180.0 / math.Pi)
			lonDelta := latDelta / math.Cos(req.Lat*math.Pi/180.0)

			minLat = req.Lat - latDelta
			maxLat = req.Lat + latDelta
			minLon = req.Lon - lonDelta
			maxLon = req.Lon + lonDelta
		} else {
			renderJSON(w, http.StatusUnprocessableEntity, apiError{Code: http.StatusUnprocessableEntity, Message: "need grid_bbox or lat/lon/radius"})
			return
		}

		// Default grid cell size: radius/3 (or ~5km for typical searches)
		cellSize := req.GridSize
		if cellSize <= 0 {
			cellSize = req.Radius / 3
			if cellSize < 1000 {
				cellSize = 3000 // minimum 3km per cell
			}
		}

		// Calculate grid dimensions
		widthDeg := (maxLon - minLon)
		heightDeg := (maxLat - minLat)
		cellWidthDeg := float64(cellSize) / (earthRadius * math.Cos(req.Lat*math.Pi/180.0) * math.Pi / 180.0)
		cellHeightDeg := float64(cellSize) / (earthRadius * math.Pi / 180.0)

		cols := int(math.Ceil(widthDeg / cellWidthDeg))
		rows := int(math.Ceil(heightDeg / cellHeightDeg))
		if cols < 1 { cols = 1 }
		if rows < 1 { rows = 1 }
		cellsTotal = cols * rows

		log.Printf("grid search: %.6f,%.6f to %.6f,%.6f => %dx%d cells (%d total), cellSize=%dm",
			minLat, minLon, maxLat, maxLon, cols, rows, cellsTotal, cellSize)

		// Create a job for each cell
		gridID := uuid.New().String()
		jobIDs := make([]string, 0, cellsTotal)
		for row := 0; row < rows; row++ {
			for col := 0; col < cols; col++ {
				cellMinLat := minLat + float64(row)*cellHeightDeg
				cellMaxLat := cellMinLat + cellHeightDeg
				cellMinLon := minLon + float64(col)*cellWidthDeg
				cellMaxLon := cellMinLon + cellWidthDeg

				// Cell center
				centerLat := (cellMinLat + cellMaxLat) / 2
				centerLon := (cellMinLon + cellMaxLon) / 2
				halfCell := float64(cellSize) / 2.0

			// Calculate zoom level based on cell size
			// Each cell should fit in the viewport at the given zoom level
			cellSize := float64(cellSize)
			cellZoom := math.Max(10, math.Min(16, 15-math.Log2(cellSize/800.0)))
			zoomLevel := int(cellZoom)

			jobData := JobData{
				Keywords:     req.Keywords,
				Lang:         req.Lang,
				Depth:        req.Depth,
				MaxTime:      time.Duration(req.MaxTime) * time.Second,
				Radius:       int(halfCell),
				Lat:          fmt.Sprintf("%.6f", centerLat),
				Lon:          fmt.Sprintf("%.6f", centerLon),
				FastMode:     req.FastMode,
				Zoom:         zoomLevel,
				GridCell:     req.GridCell,
				GridID:       gridID,
				ExtraReviews: req.ExtraReviews,
			}

				jobName := fmt.Sprintf("%s_grid_%d_%d", req.Name, row, col)

				job := Job{
					ID:     uuid.New().String(),
					Name:   jobName,
					Date:   time.Now().UTC(),
					Status: StatusPending,
					Data:   jobData,
				}

				if err := ans.svc.Create(r.Context(), &job); err != nil {
					log.Printf("grid create job %d/%d: %v", row*cols+col+1, cellsTotal, err)
					continue
				}

				jobIDs = append(jobIDs, job.ID)
			}
		}

		resp := gridJobResponse{
			GridID:      gridID,
			TotalCells:  cellsTotal,
			CellSize:    cellSize,
			JobIDs:      jobIDs,
			MinLat:      minLat,
			MinLon:      minLon,
			MaxLat:      maxLat,
			MaxLon:      maxLon,
		}

		renderJSON(w, http.StatusCreated, resp)
	})

	// POST /api/v1/jobs/cache - check if an identical search was already performed
	mux.HandleFunc("/api/v1/jobs/cache", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			renderJSON(w, http.StatusMethodNotAllowed, apiError{Code: http.StatusMethodNotAllowed, Message: "Method not allowed"})
			return
		}

		var req struct {
			Name     string   `json:"name"`
			Keywords []string `json:"keywords"`
			Lat      string   `json:"lat"`
			Lon      string   `json:"lon"`
			Radius   int      `json:"radius"`
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			renderJSON(w, http.StatusBadRequest, apiError{Code: http.StatusBadRequest, Message: err.Error()})
			return
		}

		jobID, err := ans.svc.FindCachedJob(r.Context(), req.Name, req.Keywords, req.Lat, req.Lon, req.Radius)
		if err != nil {
			renderJSON(w, http.StatusInternalServerError, apiError{Code: http.StatusInternalServerError, Message: err.Error()})
			return
		}

		if jobID != "" {
			renderJSON(w, http.StatusOK, map[string]string{"cached_job_id": jobID})
		} else {
			renderJSON(w, http.StatusNotFound, apiError{Code: http.StatusNotFound, Message: "no cached job found"})
		}
	})

	// GET /api/v1/jobs/list - list all jobs for frontend history (grouped by grid_id)
	mux.HandleFunc("/api/v1/jobs/list", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			renderJSON(w, http.StatusMethodNotAllowed, apiError{Code: http.StatusMethodNotAllowed, Message: "Method not allowed"})
			return
		}

		jobs, err := ans.svc.All(r.Context())
		if err != nil {
			renderJSON(w, http.StatusInternalServerError, apiError{Code: http.StatusInternalServerError, Message: err.Error()})
			return
		}

		// Sort by date descending (most recent first)
		for i := 0; i < len(jobs); i++ {
			for j := i + 1; j < len(jobs); j++ {
				if jobs[j].Date.After(jobs[i].Date) {
					jobs[i], jobs[j] = jobs[j], jobs[i]
				}
			}
		}

		// Group by grid_id: grid cells become one entry with job_ids[]
		type historyItem struct {
			ID        string   `json:"id"`
			Name      string   `json:"name"`
			Status    string   `json:"status"`
			Date      string   `json:"date"`
			Keywords  []string `json:"keywords"`
			Radius    int      `json:"radius"`
			JobIDs    []string `json:"job_ids"`
			IsGrid    bool     `json:"is_grid"`
		}

		var result []historyItem
		seenGrid := make(map[string]bool)

		for _, j := range jobs {
			// Skip failed jobs
			if j.Status == StatusFailed {
				continue
			}

			gid := j.Data.GridID
			if gid != "" {
				// Grid cell — skip if already seen this grid_id
				if seenGrid[gid] {
					continue
				}
				seenGrid[gid] = true

				// Collect all job IDs for this grid
				var ids []string
				var statuses []string
				for _, g := range jobs {
					if g.Data.GridID == gid {
						ids = append(ids, g.ID)
						statuses = append(statuses, g.Status)
					}
				}

				// Grid status: "ok" if all ok, "working" if any working, else "failed"
				gStatus := StatusOK
				for _, s := range statuses {
					if s == StatusWorking || s == StatusPending {
						gStatus = StatusWorking
						break
					}
				}

				// Use base name (strip _grid_row_col)
				baseName := j.Name
				if idx := strings.Index(baseName, "_grid_"); idx > 0 {
					baseName = baseName[:idx]
				}

				result = append(result, historyItem{
					ID:       gid,
					Name:     baseName,
					Status:   gStatus,
					Date:     j.Date.Format(time.RFC3339),
					Keywords: j.Data.Keywords,
					Radius:   j.Data.Radius,
					JobIDs:   ids,
					IsGrid:   true,
				})
			} else {
				// Single job
				result = append(result, historyItem{
					ID:       j.ID,
					Name:     j.Name,
					Status:   j.Status,
					Date:     j.Date.Format(time.RFC3339),
					Keywords: j.Data.Keywords,
					Radius:   j.Data.Radius,
					JobIDs:   []string{j.ID},
					IsGrid:   false,
				})
			}
		}

		// Limit to 20
		if len(result) > 20 {
			result = result[:20]
		}

		renderJSON(w, http.StatusOK, result)
	})

	// GET /api/v1/jobs/{id}/ws (WebSocket)
	mux.HandleFunc("/api/v1/jobs/{id}/ws", func(w http.ResponseWriter, r *http.Request) {
		r = requestWithID(r)

		// Add CORS headers for browser WebSocket connections
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Origin, Content-Type, Upgrade, Connection, Sec-WebSocket-Key, Sec-WebSocket-Version")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		id, ok := getIDFromRequest(r)
		if !ok {
			renderJSON(w, http.StatusUnprocessableEntity, apiError{Code: http.StatusUnprocessableEntity, Message: "Invalid ID"})
			return
		}

		// Verify job exists
		_, err := ans.svc.Get(r.Context(), id.String())
		if err != nil {
			renderJSON(w, http.StatusNotFound, apiError{Code: http.StatusNotFound, Message: http.StatusText(http.StatusNotFound)})
			return
		}

		if r.Header.Get("Upgrade") != "websocket" {
			http.Error(w, "Upgrade required", http.StatusBadRequest)
			return
		}

		conn, brw, err := w.(http.Hijacker).Hijack()
		if err != nil {
			log.Printf("websocket hijack failed: %v", err)
			return
		}

		// Accept WebSocket
		key := r.Header.Get("Sec-WebSocket-Key")
		accept := acceptWebSocketKey(key)

		response := fmt.Sprintf(
			"HTTP/1.1 101 Switching Protocols\r\n"+
				"Upgrade: websocket\r\n"+
				"Connection: Upgrade\r\n"+
				"Sec-WebSocket-Accept: %s\r\n\r\n",
			accept,
		)

		if _, err := brw.WriteString(response); err != nil {
			conn.Close()
			return
		}
		brw.Flush()

		// Now handle the websocket connection
		ans.handleWebSocket(conn, id.String())
	})
	// --- END NEW ENDPOINTS ---

	handler := securityHeaders(mux)
	ans.srv.Handler = handler

	tmplsKeys := []string{
		"static/templates/index.html",
		"static/templates/job_rows.html",
		"static/templates/job_row.html",
		"static/templates/job_view.html",
		"static/templates/redoc.html",
	}

	for _, key := range tmplsKeys {
		tmp, err := template.ParseFS(static, key)
		if err != nil {
			return nil, err
		}

		ans.tmpl[key] = tmp
	}

	return &ans, nil
}

func (s *Server) Start(ctx context.Context) error {
	go func() {
		<-ctx.Done()
		err := s.srv.Shutdown(context.Background())
		if err != nil {
			log.Println(err)
			return
		}
		log.Println("server stopped")
	}()

	fmt.Fprintf(os.Stderr, "visit http://localhost%s\n", s.srv.Addr)

	err := s.srv.ListenAndServe()
	if err != nil && err != http.ErrServerClosed {
		return err
	}

	return nil
}

func (s *Server) handleWebSocket(conn net.Conn, jobID string) {
	defer conn.Close()

	// Send initial state
	progress := s.svc.progress.GetProgress(jobID)
	progressJSON, _ := progress.ToJSON()
	conn.Write([]byte(fmt.Sprintf(`{"type":"status","data":%s}` + "\n", progressJSON)))

	// Poll for updates every 2 seconds
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			// Read latest job status
			job, _ := s.svc.Get(context.Background(), jobID)
			s.svc.progress.SetStatus(jobID, job.Status)

			// Read current progress
			progress := s.svc.progress.GetProgress(jobID)

			// Read current partial leads count
			places, _ := s.svc.GetPartialLeads(context.Background(), jobID)
			if places == nil {
				places = []Place{}
			}

			// Send combined update
			msg := map[string]interface{}{
				"type":    "update",
				"progress": progress,
				"leads":   places,
				"total_leads": len(places),
			}
			msgJSON, _ := json.Marshal(msg)
			conn.Write([]byte(string(msgJSON) + "\n"))

			// If job is completed or failed, stop sending updates
			if job.Status == "ok" || job.Status == "failed" {
				msg := map[string]interface{}{
					"type": "done",
					"status": job.Status,
				}
				msgJSON, _ := json.Marshal(msg)
				conn.Write([]byte(string(msgJSON) + "\n"))
				return
			}
		}
	}
}

func (s *Server) index(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	tmpl, ok := s.tmpl["static/templates/index.html"]
	if !ok {
		http.Error(w, "missing tpl", http.StatusInternalServerError)
		return
	}

	data := formData{
		Name:     "",
		MaxTime:  "10m",
		Keywords: []string{},
		Language: "en",
		Zoom:     15,
		FastMode: false,
		Radius:   10000,
		Lat:      "0",
		Lon:      "0",
		Depth:    10,
		Email:    false,
	}

	_ = tmpl.Execute(w, data)
}

func (s *Server) scrape(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	err := r.ParseForm()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	newJob := Job{
		ID:     uuid.New().String(),
		Name:   r.Form.Get("name"),
		Date:   time.Now().UTC(),
		Status: StatusPending,
		Data:   JobData{},
	}

	maxTimeStr := r.Form.Get("maxtime")

	maxTime, err := time.ParseDuration(maxTimeStr)
	if err != nil {
		http.Error(w, "invalid max time", http.StatusUnprocessableEntity)
		return
	}

	if maxTime < time.Minute*3 {
		http.Error(w, "max time must be more than 3m", http.StatusUnprocessableEntity)
		return
	}

	newJob.Data.MaxTime = maxTime

	keywordsStr, ok := r.Form["keywords"]
	if !ok {
		http.Error(w, "missing keywords", http.StatusUnprocessableEntity)
		return
	}

	keywords := strings.Split(keywordsStr[0], "\n")
	for _, k := range keywords {
		k = strings.TrimSpace(k)
		if k == "" {
			continue
		}

		newJob.Data.Keywords = append(newJob.Data.Keywords, k)
	}

	newJob.Data.Lang = r.Form.Get("lang")

	newJob.Data.Zoom, err = strconv.Atoi(r.Form.Get("zoom"))
	if err != nil {
		http.Error(w, "invalid zoom", http.StatusUnprocessableEntity)
		return
	}

	if r.Form.Get("fastmode") == "on" {
		newJob.Data.FastMode = true
	}

	newJob.Data.Radius, err = strconv.Atoi(r.Form.Get("radius"))
	if err != nil {
		http.Error(w, "invalid radius", http.StatusUnprocessableEntity)
		return
	}

	newJob.Data.Lat = r.Form.Get("latitude")
	newJob.Data.Lon = r.Form.Get("longitude")

	newJob.Data.Depth, err = strconv.Atoi(r.Form.Get("depth"))
	if err != nil {
		http.Error(w, "invalid depth", http.StatusUnprocessableEntity)
		return
	}

	newJob.Data.Email = r.Form.Get("email") == "on"

	proxies := strings.Split(r.Form.Get("proxies"), "\n")
	if len(proxies) > 0 {
		for _, p := range proxies {
			p = strings.TrimSpace(p)
			if p == "" {
				continue
			}

			newJob.Data.Proxies = append(newJob.Data.Proxies, p)
		}
	}

	// Read grid params from form
	newJob.Data.GridBBox = r.Form.Get("grid_bbox")
	if gridCellStr := r.Form.Get("grid_cell"); gridCellStr != "" {
		newJob.Data.GridCell, _ = strconv.ParseFloat(gridCellStr, 64)
	}

	err = newJob.Validate()
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnprocessableEntity)
		return
	}

	err = s.svc.Create(r.Context(), &newJob)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	tmpl, ok := s.tmpl["static/templates/job_row.html"]
	if !ok {
		http.Error(w, "missing tpl", http.StatusInternalServerError)
		return
	}

	_ = tmpl.Execute(w, newJob)
}

func (s *Server) getJobs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	tmpl, ok := s.tmpl["static/templates/job_rows.html"]
	if !ok {
		http.Error(w, "missing tpl", http.StatusInternalServerError)
		return
	}

	jobs, err := s.svc.All(context.Background())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	_ = tmpl.Execute(w, jobs)
}

func (s *Server) download(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	ctx := r.Context()

	id, ok := getIDFromRequest(r)
	if !ok {
		http.Error(w, "Invalid ID", http.StatusUnprocessableEntity)
		return
	}

	filePath, err := s.svc.GetCSV(ctx, id.String())
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	file, err := os.Open(filePath)
	if err != nil {
		http.Error(w, "Failed to open file", http.StatusInternalServerError)
		return
	}
	defer file.Close()

	fileName := filepath.Base(filePath)
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s", fileName))
	w.Header().Set("Content-Type", "text/csv")

	_, err = io.Copy(w, file)
	if err != nil {
		http.Error(w, "Failed to send file", http.StatusInternalServerError)
		return
	}
}

func (s *Server) delete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	deleteID, ok := getIDFromRequest(r)
	if !ok {
		http.Error(w, "Invalid ID", http.StatusUnprocessableEntity)
		return
	}

	err := s.svc.Delete(r.Context(), deleteID.String())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

type apiError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type apiScrapeRequest struct {
	Name string
	JobData
}

type apiScrapeResponse struct {
	ID string `json:"id"`
}

type gridJobResponse struct {
	GridID     string   `json:"grid_id"`
	TotalCells int      `json:"total_cells"`
	CellSize   int      `json:"cell_size"`
	JobIDs     []string `json:"job_ids"`
	MinLat     float64  `json:"min_lat"`
	MinLon     float64  `json:"min_lon"`
	MaxLat     float64  `json:"max_lat"`
	MaxLon     float64  `json:"max_lon"`
}

func (s *Server) redocHandler(w http.ResponseWriter, _ *http.Request) {
	tmpl, ok := s.tmpl["static/templates/redoc.html"]
	if !ok {
		http.Error(w, "missing tpl", http.StatusInternalServerError)
		return
	}

	_ = tmpl.Execute(w, nil)
}

func (s *Server) apiScrape(w http.ResponseWriter, r *http.Request) {
	var req apiScrapeRequest

	err := json.NewDecoder(r.Body).Decode(&req)
	if err != nil {
		ans := apiError{
			Code:    http.StatusUnprocessableEntity,
			Message: err.Error(),
		}

		renderJSON(w, http.StatusUnprocessableEntity, ans)
		return
	}

	newJob := Job{
		ID:     uuid.New().String(),
		Name:   req.Name,
		Date:   time.Now().UTC(),
		Status: StatusPending,
		Data:   req.JobData,
	}

	// Set default zoom for fast_mode if not provided
	if newJob.Data.FastMode && newJob.Data.Zoom == 0 {
		newJob.Data.Zoom = 15
	}

	// convert to seconds
	newJob.Data.MaxTime *= time.Second

	err = newJob.Validate()
	if err != nil {
		ans := apiError{
			Code:    http.StatusUnprocessableEntity,
			Message: err.Error(),
		}

		renderJSON(w, http.StatusUnprocessableEntity, ans)
		return
	}

	err = s.svc.Create(r.Context(), &newJob)
	if err != nil {
		ans := apiError{
			Code:    http.StatusInternalServerError,
			Message: err.Error(),
		}

		renderJSON(w, http.StatusInternalServerError, ans)
		return
	}

	ans := apiScrapeResponse{
		ID: newJob.ID,
	}

	renderJSON(w, http.StatusCreated, ans)
}

func (s *Server) apiGetJobs(w http.ResponseWriter, r *http.Request) {
	jobs, err := s.svc.All(r.Context())
	if err != nil {
		apiError := apiError{
			Code:    http.StatusInternalServerError,
			Message: err.Error(),
		}

		renderJSON(w, http.StatusInternalServerError, apiError)
		return
	}

	renderJSON(w, http.StatusOK, jobs)
}

func (s *Server) apiGetJob(w http.ResponseWriter, r *http.Request) {
	id, ok := getIDFromRequest(r)
	if !ok {
		apiError := apiError{
			Code:    http.StatusUnprocessableEntity,
			Message: "Invalid ID",
		}

		renderJSON(w, http.StatusUnprocessableEntity, apiError)
		return
	}

	job, err := s.svc.Get(r.Context(), id.String())
	if err != nil {
		apiError := apiError{
			Code:    http.StatusNotFound,
			Message: http.StatusText(http.StatusNotFound),
		}

		renderJSON(w, http.StatusNotFound, apiError)
		return
	}

	renderJSON(w, http.StatusOK, job)
}

// viewJob renders the map modal fragment for a job, embedding the job's places
// directly so the client needs no separate data request.
func (s *Server) viewJob(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	id, ok := getIDFromRequest(r)
	if !ok {
		http.Error(w, "Invalid ID", http.StatusUnprocessableEntity)
		return
	}

	places, err := s.svc.GetPlaces(r.Context(), id.String())

	if err != nil {
		if !errors.Is(err, ErrPlacesNotFound) {
			log.Printf("view job %s: %v", id, err)
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}

		// No CSV yet: render the modal with an empty state rather than an error.
		places = []Place{}
	}

	tmpl, ok := s.tmpl["static/templates/job_view.html"]
	if !ok {
		http.Error(w, "missing tpl", http.StatusInternalServerError)
		return
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, places); err != nil {
		log.Printf("view job %s: render: %v", id, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	_, _ = buf.WriteTo(w)
}

func (s *Server) apiDeleteJob(w http.ResponseWriter, r *http.Request) {
	id, ok := getIDFromRequest(r)
	if !ok {
		apiError := apiError{
			Code:    http.StatusUnprocessableEntity,
			Message: "Invalid ID",
		}

		renderJSON(w, http.StatusUnprocessableEntity, apiError)
		return
	}

	err := s.svc.Delete(r.Context(), id.String())
	if err != nil {
		apiError := apiError{
			Code:    http.StatusInternalServerError,
			Message: err.Error(),
		}

		renderJSON(w, http.StatusInternalServerError, apiError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

type formData struct {
	Name     string
	MaxTime  string
	Keywords []string
	Language string
	Zoom     int
	FastMode bool
	Radius   int
	Lat      string
	Lon      string
	Depth    int
	Email    bool
	Proxies  []string
}

type ctxKey string

const idCtxKey ctxKey = "id"

func requestWithID(r *http.Request) *http.Request {
	id := r.PathValue("id")
	if id == "" {
		id = r.URL.Query().Get("id")
	}

	parsed, err := uuid.Parse(id)
	if err == nil {
		r = r.WithContext(context.WithValue(r.Context(), idCtxKey, parsed))
	}

	return r
}

func getIDFromRequest(r *http.Request) (uuid.UUID, bool) {
	id, ok := r.Context().Value(idCtxKey).(uuid.UUID)

	return id, ok
}

func renderJSON(w http.ResponseWriter, code int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(data)
}

func formatDate(t time.Time) string {
	return t.Format("Jan 02, 2006 15:04:05")
}

// acceptWebSocketKey computes the SHA1 hash required by the WebSocket protocol.
func acceptWebSocketKey(key string) string {
	h := sha1.Sum([]byte(key + "258EAFA5-E914-47DA-95CA-5AB5D3C96049"))
	return base64.StdEncoding.EncodeToString(h[:])
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("X-XSS-Protection", "1; mode=block")
		w.Header().Set("Content-Security-Policy",
			"default-src 'self'; "+
				"script-src 'self' cdn.redoc.ly cdnjs.cloudflare.com 'unsafe-inline' 'unsafe-eval'; "+
				"worker-src 'self' blob:; "+
				"style-src 'self' 'unsafe-inline' fonts.googleapis.com cdnjs.cloudflare.com; "+
				"img-src 'self' data: cdn.redoc.ly cdnjs.cloudflare.com *.tile.openstreetmap.org; "+
				"font-src 'self' fonts.gstatic.com; "+
				"connect-src 'self'")

		next.ServeHTTP(w, r)
	})
}
