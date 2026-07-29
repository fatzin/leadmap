import { createContext, useContext, useReducer, useCallback, useRef, useEffect } from 'react'
import type { Lead, SearchQuery, ViewMode, SortOption, MapCenter } from '@/types'
import { parseReviews } from '@/lib/reviews'
import api from '@/lib/api'
import { haversineKm } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SearchState {
  leads: Lead[]
  currentQuery: SearchQuery | null
  viewMode: ViewMode
  filter: Filter
  isLoading: boolean
  jobId: string | null
  searchHistory: SearchQuery[]
  error: string | null
  sortOption: SortOption
  searchCenter: MapCenter | null
  searchRadius: number
  fastMode: boolean
}

export type Filter = 'all' | 'withoutWebsite' | 'withWebsite'

type Action =
  | { type: 'SET_LEADS'; payload: Lead[] }
  | { type: 'SET_CURRENT_QUERY'; payload: SearchQuery | null }
  | { type: 'SET_VIEW_MODE'; payload: ViewMode }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_JOB_ID'; payload: string | null }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'ADD_TO_HISTORY'; payload: SearchQuery }
  | { type: 'SET_SORT'; payload: SortOption }
  | { type: 'SET_FILTER'; payload: Filter }
  | { type: 'CLEAR_LEADS' }
  | { type: 'SET_SEARCH_HISTORY'; payload: SearchQuery[] }
  | { type: 'SET_SEARCH_CENTER'; payload: MapCenter | null }
  | { type: 'SET_SEARCH_RADIUS'; payload: number }
  | { type: 'SET_FAST_MODE'; payload: boolean }

interface Place {
  title: string; address: string; latitude: number; longitude: number
  link: string; category: string; phone: string
  website?: string; web_site?: string
  review_rating: number; review_count: number; place_id: string
  data_id: string; cid: string; plus_code: string; status: string
  price_range: string; timezone: string; thumbnail: string
  emails?: string[]; user_reviews?: string; user_reviews_extended?: string; reviews_link?: string
}

interface JobStatus { ID: string; Status: string }
interface CreateJobRes { id: string }
interface GridJobRes { grid_id: string; job_ids: string[] }

// ─── Reducer ──────────────────────────────────────────────────────────────────

const initialState: SearchState = {
  leads: [], currentQuery: null, viewMode: 'map', filter: 'all', isLoading: false,
  jobId: null, searchHistory: [], error: null, sortOption: 'relevance',
  searchCenter: null, searchRadius: 30, fastMode: true,
}

function reducer(state: SearchState, action: Action): SearchState {
  switch (action.type) {
    case 'SET_LEADS': return { ...state, leads: action.payload }
    case 'SET_CURRENT_QUERY': return { ...state, currentQuery: action.payload }
    case 'SET_VIEW_MODE': return { ...state, viewMode: action.payload }
    case 'SET_LOADING': return { ...state, isLoading: action.payload }
    case 'SET_JOB_ID': return { ...state, jobId: action.payload }
    case 'SET_ERROR': return { ...state, error: action.payload }
    case 'ADD_TO_HISTORY': {
      const i = state.searchHistory.findIndex((q) => q.input === action.payload.input && q.radius === action.payload.radius)
      const updated = i !== -1
        ? state.searchHistory.map((q, j) => j === i ? { ...action.payload, createdAt: new Date().toISOString() } : q)
        : [action.payload, ...state.searchHistory].slice(0, 20)
      return { ...state, searchHistory: updated }
    }
    case 'SET_SORT': return { ...state, sortOption: action.payload }
    case 'SET_FILTER': return { ...state, filter: action.payload }
    case 'CLEAR_LEADS': return { ...state, leads: [], currentQuery: null, error: null, filter: 'all' }
    case 'SET_SEARCH_HISTORY': return { ...state, searchHistory: action.payload }
    case 'SET_SEARCH_CENTER': return { ...state, searchCenter: action.payload }
    case 'SET_SEARCH_RADIUS': return { ...state, searchRadius: action.payload }
    case 'SET_FAST_MODE': return { ...state, fastMode: action.payload }
    default: return state
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function placeToLead(place: Place): Lead {
  const website = place.website || place.web_site || ''
  const uid = place.cid || place.place_id || place.data_id || `lead_${crypto.randomUUID()}`
  const primaryReviews = place.user_reviews ? parseReviews(place.user_reviews) : []
  const extendedReviews = place.user_reviews_extended ? parseReviews(place.user_reviews_extended) : []
  return {
    id: uid, title: place.title, category: place.category, address: place.address,
    phone: place.phone, website, link: place.link, latitude: place.latitude, longitude: place.longitude,
    review_rating: place.review_rating, review_count: place.review_count,
    place_id: place.place_id, data_id: place.data_id, cid: place.cid,
    plus_code: place.plus_code, status: 'open' as const, price_range: place.price_range,
    timezone: place.timezone, thumbnail: place.thumbnail,
    emails: place.emails || [], hasWebsite: !!website && website !== '' && website !== 'null',
    reviews: [...primaryReviews, ...extendedReviews],
    reviews_link: place.reviews_link,
  }
}

function stats(leads: Lead[]) {
  return {
    total: leads.length,
    withoutWebsite: leads.filter((l) => !l.hasWebsite).length,
    withWebsite: leads.filter((l) => l.hasWebsite).length,
  }
}

function filterByRadius(leads: Lead[], query: SearchQuery | null): Lead[] {
  if (!query || query.lat == null || query.lon == null || query.radius == null) return leads
  const { lat, lon, radius } = query
  return leads.filter((l) => haversineKm(lat, lon, l.latitude, l.longitude) <= radius)
}

async function fetchResults(jobId: string): Promise<Lead[]> {
  const { data: places } = await api.get<Place[]>(`/api/v1/jobs/${jobId}/results`)
  return (places || []).map(placeToLead)
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface SearchContextType {
  state: SearchState
  dispatch: React.Dispatch<Action>
  startSearch: (input: string, radius: number, center: MapCenter | null, depth?: number, useGrid?: boolean) => Promise<void>
  loadHistoryResults: (query: SearchQuery, jobIds?: string[]) => Promise<void>
}

const SearchContext = createContext<SearchContextType | null>(null)

export function SearchProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const abortRef = useRef<{ cancelled: boolean }>({ cancelled: false })

  useEffect(() => () => { abortRef.current.cancelled = true }, [])

  const startSearch = useCallback(async (input: string, radius: number, center: MapCenter | null, depth = 3, useGrid = false) => {
    abortRef.current = { cancelled: false }
    const ctx = abortRef.current
    dispatch({ type: 'SET_LOADING', payload: true })
    dispatch({ type: 'SET_ERROR', payload: null })
    dispatch({ type: 'SET_LEADS', payload: [] })
    dispatch({ type: 'SET_FILTER', payload: 'all' })

    try {
      const radiusM = radius * 1000
      const baseQuery: Record<string, unknown> = {
        name: input, keywords: [input], lang: 'pt', depth, radius: radiusM, max_time: 300, extra_reviews: !state.fastMode,
      }
      if (center && state.fastMode) { baseQuery.fast_mode = true }

      // Create job(s)
      let jobIds: string[]
      let mainId: string

      if (useGrid && center) {
        // Grid endpoint expects lat/lon as float64
        const { data: grid } = await api.post<GridJobRes>('/api/v1/jobs/grid', { ...baseQuery, lat: center.lat, lon: center.lng })
        if (!grid?.job_ids?.length) throw new Error('Nenhum job criado na grade')
        jobIds = grid.job_ids
        mainId = grid.grid_id
      } else {
        // Single job endpoint expects lat/lon as string
        const body = center ? { ...baseQuery, lat: String(center.lat), lon: String(center.lng) } : baseQuery
        const { data: job } = await api.post<CreateJobRes>('/api/v1/jobs', body)
        if (!job?.id) throw new Error('Falha ao criar job')
        jobIds = [job.id]
        mainId = job.id
      }

      dispatch({ type: 'SET_JOB_ID', payload: mainId })
      const query: SearchQuery = {
        id: mainId, input, radius, depth, createdAt: new Date().toISOString(),
        jobId: mainId, status: 'running', stats: { total: 0, withoutWebsite: 0, withWebsite: 0 },
        lat: center?.lat, lon: center?.lng,
      }
      dispatch({ type: 'SET_CURRENT_QUERY', payload: query })

      // Poll all jobs, accumulate leads
      const allLeads: Lead[] = []
      const done = new Set<string>()
      const failed = new Set<string>()

      const pollJob = async (id: string) => {
        if (done.has(id) || failed.has(id)) return
        try {
          const { data: job } = await api.get<JobStatus>(`/api/v1/jobs/${id}`)
          if (job.Status === 'ok' || job.Status === 'completed') {
            done.add(id)
            allLeads.push(...await fetchResults(id))
            const visible = filterByRadius(allLeads, query)
            dispatch({ type: 'SET_LEADS', payload: [...visible] })
            dispatch({ type: 'SET_CURRENT_QUERY', payload: { ...query, stats: stats(visible) } })
          } else if (job.Status === 'failed') {
            done.add(id); failed.add(id)
          }
        } catch { /* retry next cycle */ }
      }

      const pollAll = async () => {
        if (ctx.cancelled) return
        await Promise.all(jobIds.map(pollJob))
        if (done.size + failed.size >= jobIds.length) {
          const visible = filterByRadius(allLeads, query)
          const completed: SearchQuery = { ...query, id: crypto.randomUUID(), status: 'completed', stats: stats(visible) }
          dispatch({ type: 'SET_LEADS', payload: [...visible] })
          dispatch({ type: 'SET_CURRENT_QUERY', payload: completed })
          dispatch({ type: 'ADD_TO_HISTORY', payload: completed })
          dispatch({ type: 'SET_LOADING', payload: false })
          dispatch({ type: 'SET_JOB_ID', payload: null })
          if (failed.size > 0) dispatch({ type: 'SET_ERROR', payload: `${failed.size} job(s) falharam` })
          return
        }
        setTimeout(pollAll, 5000)
      }

      setTimeout(pollAll, 5000)
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: (err as Error).message })
      dispatch({ type: 'SET_LOADING', payload: false })
      dispatch({ type: 'SET_JOB_ID', payload: null })
    }
  }, [])

  const loadHistoryResults = useCallback(async (query: SearchQuery, jobIds?: string[]) => {
    dispatch({ type: 'SET_LOADING', payload: true })
    dispatch({ type: 'SET_ERROR', payload: null })
    dispatch({ type: 'SET_CURRENT_QUERY', payload: { ...query, status: 'running' } })

    try {
      const ids = jobIds?.length ? jobIds : [query.jobId]
      const allLeads: Lead[] = []

      for (const id of ids) {
        try {
          const leads = await fetchResults(id)
          allLeads.push(...leads)
        } catch { /* skip failed job */ }
      }

      const visible = filterByRadius(allLeads, query)
      dispatch({ type: 'SET_CURRENT_QUERY', payload: { ...query, status: 'completed', stats: stats(visible) } })
      dispatch({ type: 'SET_LEADS', payload: visible })
      dispatch({ type: 'SET_LOADING', payload: false })
    } catch {
      dispatch({ type: 'SET_ERROR', payload: 'Não foi possível carregar os resultados.' })
      dispatch({ type: 'SET_LOADING', payload: false })
    }
  }, [state.fastMode])

  return (
    <SearchContext.Provider value={{ state, dispatch, startSearch, loadHistoryResults }}>
      {children}
    </SearchContext.Provider>
  )
}

export function useSearch() {
  const ctx = useContext(SearchContext)
  if (!ctx) throw new Error('useSearch must be used within SearchProvider')
  return ctx
}
