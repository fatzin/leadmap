import { useEffect, useState, useCallback } from 'react'
import { useSearch } from '@/context/SearchContext'
import { Button } from '@/components/ui/button'
import { Clock, Trash2 } from 'lucide-react'
import api from '@/lib/api'
import type { SearchQuery } from '@/types'

interface HistoryItem {
  id: string
  name: string
  status: string
  date: string
  keywords: string[]
  radius: number
  job_ids: string[]
  is_grid: boolean
}

export function SearchHistory() {
  const { loadHistoryResults } = useSearch()
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(true)

  const loadHistory = useCallback(async () => {
    try {
      const { data } = await api.get<HistoryItem[]>('/api/v1/jobs/list')
      setHistory(data || [])
    } catch {
      setHistory([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  const handleClear = async () => {
    for (const item of history) {
      for (const id of item.job_ids) {
        try { await api.delete(`/api/v1/jobs/${id}`) } catch { /* ignore */ }
      }
    }
    setHistory([])
    loadHistory()
  }

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'agora'
    if (mins < 60) return `há ${mins}min`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `há ${hours}h`
    return `há ${Math.floor(hours / 24)}d`
  }

  const handleClick = (item: HistoryItem) => {
    const query: SearchQuery = {
      id: item.id,
      input: item.keywords?.join(', ') || item.name,
      radius: Math.round((item.radius || 0) / 1000),
      depth: 3,
      createdAt: item.date,
      jobId: item.id,
      status: 'completed',
      stats: { total: 0, withoutWebsite: 0, withWebsite: 0 },
    }
    loadHistoryResults(query, item.job_ids)
  }

  if (loading) {
    return (
      <div className="space-y-2">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Histórico</h3>
        <div className="space-y-1 text-xs text-muted-foreground">Carregando...</div>
      </div>
    )
  }

  if (history.length === 0) return null

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Histórico</h3>
        <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={handleClear}>
          <Trash2 className="h-3 w-3" /> Limpar
        </Button>
      </div>
      <div className="space-y-1">
        {history.map((item) => {
          const input = item.keywords?.join(', ') || item.name
          const radiusKm = Math.round((item.radius || 0) / 1000)
          const badge = item.is_grid ? `grid · ${item.job_ids.length} cells` : `${radiusKm} km`
          return (
            <button
              key={item.id}
              onClick={() => handleClick(item)}
              className="w-full text-left rounded-md px-2 py-1.5 hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <div className="flex items-center gap-1.5 text-sm">
                <Clock className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="truncate">{input}</span>
                {item.status === 'working' && <span className="text-amber-500 text-[10px]">●</span>}
              </div>
              <div className="text-xs text-muted-foreground pl-5">
                {badge} &middot; {timeAgo(item.date)}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
