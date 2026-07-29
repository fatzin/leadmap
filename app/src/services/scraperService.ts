import axios from 'axios'
import type { Lead, ScrapingParams, ScraperJob, ScraperProgress } from '@/types'

const BASE = '/api/v1'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface StartJobResponse {
  id: string
}

export interface PartialLeadsResponse {
  data: Record<string, unknown>[]
  total: number
}

export type WebSocketMessage =
  | { type: 'status'; data: Record<string, unknown> }
  | { type: 'update'; progress: Record<string, unknown>; leads: Record<string, unknown>[]; total_leads: number }
  | { type: 'done'; status: string }

export type ScraperStatus = 'pending' | 'working' | 'ok' | 'failed'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toApiParams(p: ScrapingParams): Record<string, unknown> {
  return {
    name: p.name,
    keywords: p.keywords,
    lang: p.lang,
    radius: p.radius * 1000, // meters
    lat: p.center.latitude.toString(),
    lon: p.center.longitude.toString(),
    max_time: p.maxTime || 300,
  }
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────

export async function startJob(params: ScrapingParams): Promise<StartJobResponse> {
  const res = await axios.post(`${BASE}/jobs`, toApiParams(params))
  return res.data as StartJobResponse
}

export async function getJobs(): Promise<ScraperJob[]> {
  const res = await axios.get(`${BASE}/jobs`)
  return res.data as ScraperJob[]
}

export async function getJob(id: string): Promise<ScraperJob> {
  const res = await axios.get(`${BASE}/jobs/${id}`)
  return res.data as ScraperJob
}

export async function deleteJob(id: string): Promise<void> {
  await axios.delete(`${BASE}/jobs/${id}`)
}

export function downloadJob(id: string): void {
  window.open(`${BASE}/jobs/${id}/download`, '_blank')
}

// ─── Progress ─────────────────────────────────────────────────────────────────

export async function getProgress(jobId: string): Promise<ScraperProgress> {
  try {
    const res = await axios.get(`${BASE}/jobs/${jobId}/progress`)
    return res.data as ScraperProgress
  } catch {
    return {
      job_id: jobId,
      status: 'unknown',
      found: 0,
      csv_lines: 0,
      cells_total: 0,
      cells_done: 0,
      estimated_done_percent: 0,
      start_time: '',
    }
  }
}

// ─── Partial Leads (read results while job is running) ────────────────────────

export async function getPartialLeads(jobId: string): Promise<Record<string, unknown>[]> {
  try {
    const res = await axios.get(`${BASE}/jobs/${jobId}/leads`)
    return (res.data as Record<string, unknown>[]) || []
  } catch {
    return []
  }
}

// ─── WebSocket Streaming ─────────────────────────────────────────────────────

export function createWebSocketStream(
  jobId: string,
  onProgress: (progress: Record<string, unknown>) => void,
  onLeads: (leads: Record<string, unknown>[]) => void,
  onComplete?: (status: string) => void,
  onError?: (err: Event) => void,
): () => void {
  // Connect directly to scraper for WebSocket (avoid Vite proxy issues)
  const wsUrl = `ws://localhost:6901/api/v1/jobs/${jobId}/ws`

  console.log('[WS] Connecting to:', wsUrl)
  const ws = new WebSocket(wsUrl)
  let aborted = false

  ws.onopen = () => {
    console.log('[WS] Connected!')
  }

  ws.onmessage = (event) => {
    if (aborted || ws.readyState !== WebSocket.OPEN) return
    try {
      const msg = JSON.parse(event.data) as WebSocketMessage
      console.log('[WS] Message:', msg.type, 'leads:', msg.type === 'update' ? msg.total_leads : 'N/A')
      switch (msg.type) {
        case 'status':
          onProgress(msg.data)
          break
        case 'update':
          onProgress(msg.progress)
          onLeads(msg.leads)
          break
        case 'done':
          onComplete?.(msg.status)
          ws.close()
          break
        default:
          break
      }
    } catch (err) {
      onError?.(err as Event)
    }
  }

  ws.onerror = (event) => {
    onError?.(event)
  }

  ws.onclose = () => {}

  return () => {
    aborted = true
    if (ws.readyState === WebSocket.OPEN) ws.close()
  }
}

// ─── Export / Import ──────────────────────────────────────────────────────────

export function exportCSV(leads: Lead[]): void {
  if (leads.length === 0) return

  const headers = Object.keys(leads[0] || {}) as (keyof Lead)[]
  const csv = [
    headers.join(','),
    ...leads.map((l) =>
      headers
        .map((h) => {
          const val = l[h]
          if (val === null || val === undefined) return ''
          const str = String(val)
          return /[,"\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
        })
        .join(','),
    ),
  ].join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `leads-${Date.now()}.csv`
  link.click()
  URL.revokeObjectURL(url)
}
