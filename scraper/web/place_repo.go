package web

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// PlaceWithDetails holds a full scraped place record.
type PlaceWithDetails struct {
	ID           string
	JobID        string
	Title        string
	Category     string
	Address      string
	Phone        string
	Website      string
	Latitude     float64
	Longitude    float64
	ReviewRating float64
	ReviewCount  int
	PlaceID      string
	DataID       string
	CID          string
	PlusCode     string
	Status       string
	PriceRange   string
	Timezone     string
	Thumbnail    string
	Emails       string
	HasWebsite   bool
	CreatedAt    int64
}

// PlaceRepository persists and retrieves scraped places.
type PlaceRepository interface {
	CreateBatch(ctx context.Context, jobID string, places []PlaceWithDetails) error
	FindByJobID(ctx context.Context, jobID string) ([]PlaceWithDetails, error)
	CountByJobID(ctx context.Context, jobID string) (int, error)
}

type placeRepository struct {
	db *sql.DB
}

func NewPlaceRepository(db *sql.DB) PlaceRepository {
	return &placeRepository{db: db}
}

const createBatchQuery = `
INSERT OR REPLACE INTO places (
    id, job_id, title, category, address, phone, website, latitude, longitude,
    review_rating, review_count, place_id, data_id, cid, plus_code, status,
    price_range, timezone, thumbnail, emails, has_website, created_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

const findByJobIDQuery = `
SELECT id, job_id, title, category, address, phone, website, latitude, longitude,
    review_rating, review_count, place_id, data_id, cid, plus_code, status,
    price_range, timezone, thumbnail, emails, has_website, created_at
FROM places
WHERE job_id = ?
ORDER BY created_at DESC`

const countByJobIDQuery = `SELECT COUNT(*) FROM places WHERE job_id = ?`

func (r *placeRepository) CreateBatch(ctx context.Context, jobID string, places []PlaceWithDetails) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("placeRepository CreateBatch begin: %w", err)
	}

	defer func() { _ = tx.Rollback() }()

	stmt, err := tx.PrepareContext(ctx, createBatchQuery)
	if err != nil {
		return fmt.Errorf("placeRepository CreateBatch prepare: %w", err)
	}

	defer stmt.Close()

	for i := range places {
		p := places[i]
		p.ID = uuid.New().String()
		p.JobID = jobID
		p.CreatedAt = time.Now().Unix()

		hasWebsite := 0
		if p.HasWebsite {
			hasWebsite = 1
		}

		_, err := stmt.ExecContext(ctx,
			p.ID, p.JobID, p.Title, p.Category, p.Address, p.Phone, p.Website,
			p.Latitude, p.Longitude, p.ReviewRating, p.ReviewCount, p.PlaceID,
			p.DataID, p.CID, p.PlusCode, p.Status, p.PriceRange, p.Timezone,
			p.Thumbnail, p.Emails, hasWebsite, p.CreatedAt,
		)
		if err != nil {
			return fmt.Errorf("placeRepository CreateBatch exec index %d: %w", i, err)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("placeRepository CreateBatch commit: %w", err)
	}

	return nil
}

func (r *placeRepository) FindByJobID(ctx context.Context, jobID string) ([]PlaceWithDetails, error) {
	rows, err := r.db.QueryContext(ctx, findByJobIDQuery, jobID)
	if err != nil {
		return nil, fmt.Errorf("placeRepository FindByJobID query: %w", err)
	}

	defer rows.Close()

	var ans []PlaceWithDetails

	for rows.Next() {
		place, err := scanPlace(rows)
		if err != nil {
			return nil, fmt.Errorf("placeRepository FindByJobID scan: %w", err)
		}

		ans = append(ans, place)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("placeRepository FindByJobID rows: %w", err)
	}

	return ans, nil
}

func (r *placeRepository) CountByJobID(ctx context.Context, jobID string) (int, error) {
	var count int

	if err := r.db.QueryRowContext(ctx, countByJobIDQuery, jobID).Scan(&count); err != nil {
		return 0, fmt.Errorf("placeRepository CountByJobID scan: %w", err)
	}

	return count, nil
}

type scannablePlace interface {
	Scan(dest ...any) error
}

func scanPlace(row scannablePlace) (PlaceWithDetails, error) {
	var p PlaceWithDetails
	var hasWebsite int

	var category, address, phone, website, placeID, dataID, cid, plusCode sql.NullString
	var status, priceRange, timezone, thumbnail, emails sql.NullString
	var reviewRating sql.NullFloat64
	var reviewCount sql.NullInt64

	err := row.Scan(
		&p.ID, &p.JobID, &p.Title, &category, &address, &phone, &website,
		&p.Latitude, &p.Longitude, &reviewRating, &reviewCount, &placeID, &dataID,
		&cid, &plusCode, &status, &priceRange, &timezone, &thumbnail, &emails,
		&hasWebsite, &p.CreatedAt,
	)
	if err != nil {
		return PlaceWithDetails{}, err
	}

	p.Category = category.String
	p.Address = address.String
	p.Phone = phone.String
	p.Website = website.String
	p.PlaceID = placeID.String
	p.DataID = dataID.String
	p.CID = cid.String
	p.PlusCode = plusCode.String
	p.Status = status.String
	p.PriceRange = priceRange.String
	p.Timezone = timezone.String
	p.Thumbnail = thumbnail.String
	p.Emails = emails.String
	p.ReviewRating = reviewRating.Float64
	p.ReviewCount = int(reviewCount.Int64)
	p.HasWebsite = hasWebsite == 1

	return p, nil
}
