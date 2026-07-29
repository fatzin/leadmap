package web

import (
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"strconv"
)

// ErrPlacesNotFound is returned by GetPlaces when the job's CSV output does not
// exist. Callers use it to distinguish a missing job (404) from other errors.
var ErrPlacesNotFound = errors.New("places not found")

// Place is a single map-able result extracted from a job's CSV output.
type Place struct {
	Title              string   `json:"title"`
	Address            string   `json:"address"`
	Latitude           float64  `json:"latitude"`
	Longitude          float64  `json:"longitude"`
	Link               string   `json:"link"`
	Category           string   `json:"category"`
	Phone              string   `json:"phone"`
	Website            string   `json:"website"`
	ReviewRating       float64  `json:"review_rating"`
	ReviewCount        int      `json:"review_count"`
	PlaceID            string   `json:"place_id"`
	DataID             string   `json:"data_id"`
	Cid                string   `json:"cid"`
	PlusCode           string   `json:"plus_code"`
	Status             string   `json:"status"`
	PriceRange         string   `json:"price_range"`
	Timezone           string   `json:"timezone"`
	Thumbnail          string   `json:"thumbnail"`
	Emails             []string `json:"emails,omitempty"`
	UserReviews        string   `json:"user_reviews,omitempty"`
	OpenHours          string   `json:"open_hours,omitempty"`
	Description        string   `json:"descriptions,omitempty"`
	ReviewsLink        string   `json:"reviews_link,omitempty"`
	StreetViewURL      string   `json:"street_view_url,omitempty"`
	InputID            string   `json:"input_id,omitempty"`
	PopularTimes       string   `json:"popular_times,omitempty"`
	ReviewsPerRating   string   `json:"reviews_per_rating,omitempty"`
	Images             string   `json:"images,omitempty"`
	Reservations       string   `json:"reservations,omitempty"`
	OrderOnline        string   `json:"order_online,omitempty"`
	Menu               string   `json:"menu,omitempty"`
	Owner              string   `json:"owner,omitempty"`
	CompleteAddress    string   `json:"complete_address,omitempty"`
	CreditCards        string   `json:"credit_cards_accepted,omitempty"`
	About              string   `json:"about,omitempty"`
	UserReviewsExtended string  `json:"user_reviews_extended,omitempty"`
}

// GetPlaces locates the job's CSV output and parses it into mappable places.
// In web mode each job writes exactly one {id}.csv, so that file is the single
// source of truth for the map.
func (s *Service) GetPlaces(_ context.Context, id string) ([]Place, error) {
	path, err := s.csvPath(id)
	if err != nil {
		return nil, err
	}

	f, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("csv file not found for job %s: %w", id, ErrPlacesNotFound)
		}

		return nil, err
	}

	defer func() {
		_ = f.Close()
	}()

	return parsePlaces(f)
}

// parsePlaces reads scraped results from a CSV stream and returns the places
// that have valid coordinates. Columns are resolved by header name so the
// parser tolerates reordering; the names mirror gmaps.Entry.CsvHeaders().
func parsePlaces(r io.Reader) ([]Place, error) {
	reader := csv.NewReader(r)
	reader.FieldsPerRecord = -1

	header, err := reader.Read()
	if err != nil {
		if err == io.EOF {
			return []Place{}, nil
		}

		return nil, err
	}

	col := make(map[string]int, len(header))
	for i, name := range header {
		col[name] = i
	}

	get := func(row []string, name string) string {
		idx, ok := col[name]
		if !ok || idx >= len(row) {
			return ""
		}

		return row[idx]
	}

	places := []Place{}

	for {
		row, err := reader.Read()
		if err == io.EOF {
			break
		}

		if err != nil {
			return nil, err
		}

		lat, errLat := strconv.ParseFloat(get(row, "latitude"), 64)
		lon, errLon := strconv.ParseFloat(get(row, "longitude"), 64)

		if errLat != nil || errLon != nil {
			continue
		}

		if !finite(lat) || !finite(lon) {
			continue
		}

		if lat < -90 || lat > 90 || lon < -180 || lon > 180 {
			continue
		}

		if lat == 0 && lon == 0 {
			continue
		}

		rating, _ := strconv.ParseFloat(get(row, "review_rating"), 64)
		if !finite(rating) {
			rating = 0
		}

		reviewCount, _ := strconv.Atoi(get(row, "review_count"))

		var emails []string
		emailStr := get(row, "emails")
		if emailStr != "" {
			for _, e := range splitCSV(emailStr) {
				emails = append(emails, e)
			}
		}

		places = append(places, Place{
			Title:               get(row, "title"),
			Address:             get(row, "address"),
			Latitude:            lat,
			Longitude:           lon,
			Link:                get(row, "link"),
			Category:            get(row, "category"),
			Phone:               get(row, "phone"),
			Website:             get(row, "website"),
			ReviewRating:        rating,
			ReviewCount:         reviewCount,
			PlaceID:             get(row, "place_id"),
			DataID:              get(row, "data_id"),
			Cid:                 get(row, "cid"),
			PlusCode:            get(row, "plus_code"),
			Status:              get(row, "status"),
			PriceRange:          get(row, "price_range"),
			Timezone:            get(row, "timezone"),
			Thumbnail:           get(row, "thumbnail"),
			Emails:              emails,
			UserReviews:         get(row, "user_reviews"),
			OpenHours:           get(row, "open_hours"),
			Description:         get(row, "descriptions"),
			ReviewsLink:         get(row, "reviews_link"),
			StreetViewURL:       get(row, "street_view_url"),
			InputID:             get(row, "input_id"),
			PopularTimes:        get(row, "popular_times"),
			ReviewsPerRating:    get(row, "reviews_per_rating"),
			Images:              get(row, "images"),
			Reservations:        get(row, "reservations"),
			OrderOnline:         get(row, "order_online"),
			Menu:                get(row, "menu"),
			Owner:               get(row, "owner"),
			CompleteAddress:     get(row, "complete_address"),
			CreditCards:         get(row, "credit_cards_accepted"),
			About:               get(row, "about"),
			UserReviewsExtended: get(row, "user_reviews_extended"),
		})
	}

	return places, nil
}

// finite reports whether f is a usable, real number (not NaN or ±Inf).
func finite(f float64) bool {
	return !math.IsNaN(f) && !math.IsInf(f, 0)
}

func splitCSV(s string) []string {
	var result []string
	for _, v := range split(s, ';') {
		v = trimSpace(v)
		if v != "" {
			result = append(result, v)
		}
	}
	return result
}

func split(s string, c byte) []string {
	var result []string
	i := 0
	for {
		p := indexByte(s, c, i)
		if p < 0 {
			result = append(result, s[i:])
			break
		}
		result = append(result, s[i:p])
		i = p + 1
	}
	return result
}

func indexByte(s string, c byte, i int) int {
	for j := i; j < len(s); j++ {
		if s[j] == c {
			return j
		}
	}
	return -1
}

func trimSpace(s string) string {
	start := 0
	for start < len(s) && (s[start] == ' ' || s[start] == '\t') {
		start++
	}
	end := len(s)
	for end > start && (s[end-1] == ' ' || s[end-1] == '\t') {
		end--
	}
	return s[start:end]
}
