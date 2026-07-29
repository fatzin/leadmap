export interface Review {
  name: string
  rating: number
  description: string
  when: string
  profile_picture?: string
}

export interface Lead {
  id: string
  title: string
  category: string
  address: string
  phone: string
  website: string
  link?: string
  latitude: number
  longitude: number
  review_rating: number
  review_count: number
  place_id: string
  data_id: string
  cid: string
  plus_code: string
  status: 'open' | 'closed' | 'temporary'
  price_range: string
  timezone: string
  thumbnail: string
  emails: string[]
  hasWebsite: boolean
  reviews: Review[]
  reviews_link?: string
}

export interface SearchQuery {
  id: string
  input: string
  radius: number
  depth: number
  createdAt: string
  jobId: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  stats: {
    total: number
    withoutWebsite: number
    withWebsite: number
  }
  lat?: number
  lon?: number
}

export interface JobStatus {
  id: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  progress: {
    current: number
    total: number
  }
}

export type ViewMode = 'map' | 'list'

export interface MapCenter {
  lat: number
  lng: number
}

export type SortOption = 'relevance' | 'distance' | 'rating'

export interface ScrapingParams {
  name: string
  keywords: string[]
  lang: string
  center: { latitude: number; longitude: number }
  radius: number
  maxTime?: number
}

export interface ScraperProgress {
  job_id: string
  status: string
  found: number
  csv_lines: number
  cells_total: number
  cells_done: number
  estimated_done_percent: number
  start_time: string
}

export interface ScraperJob {
  id: string
  name: string
  date: string
  status: string
  data: {
    keywords: string[]
    lang: string
    radius: number
    lat: string
    lon: string
    max_time: number
    depth: number
    email: boolean
    zoom: number
    fast_mode: boolean
  }
}
