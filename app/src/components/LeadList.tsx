import { useMemo } from 'react'
import { useSearch, type Filter } from '@/context/SearchContext'
import { LeadCard } from './LeadCard'
import { Skeleton } from '@/components/ui/skeleton'
import { Search, AlertCircle, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { SortOption } from '@/types'

export function LeadList() {
  const { state, dispatch, startSearch } = useSearch()
  const { leads, isLoading, error, currentQuery, sortOption, filter } = state

  const filtered = useMemo(() => {
    if (filter === 'all') return leads
    return leads.filter((l) => filter === 'withoutWebsite' ? !l.hasWebsite : l.hasWebsite)
  }, [leads, filter])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    if (sortOption === 'rating') arr.sort((a, b) => b.review_rating - a.review_rating)
    else if (sortOption === 'distance') {
      const cLat = filtered.reduce((s, l) => s + l.latitude, 0) / filtered.length
      const cLng = filtered.reduce((s, l) => s + l.longitude, 0) / filtered.length
      arr.sort((a, b) => Math.hypot(a.latitude - cLat, a.longitude - cLng) - Math.hypot(b.latitude - cLat, b.longitude - cLng))
    }
    return arr
  }, [filtered, sortOption])

  if (error) return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <AlertCircle className="h-8 w-8 text-destructive mb-2" />
      <p className="text-sm text-muted-foreground mb-3">{error}</p>
      <Button variant="outline" size="sm" onClick={() => currentQuery && startSearch(currentQuery.input, currentQuery.radius, null, currentQuery.depth)}>
        <RotateCcw className="h-4 w-4 mr-1" /> Tentar novamente
      </Button>
    </div>
  )

  if (isLoading) return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="rounded-lg border p-3 space-y-2">
          <Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /><Skeleton className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  )

  if (currentQuery?.status === 'completed' && leads.length === 0) return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Search className="h-8 w-8 text-muted-foreground mb-2" />
      <p className="text-sm text-muted-foreground">Nenhum resultado encontrado</p>
      <p className="text-xs text-muted-foreground mt-1">Tente ajustar sua busca ou aumentar o raio</p>
    </div>
  )

  if (leads.length === 0) return null

  const counts = {
    all: leads.length,
    withoutWebsite: leads.filter((l) => !l.hasWebsite).length,
    withWebsite: leads.filter((l) => l.hasWebsite).length,
  }

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: `Todos (${counts.all})` },
    { key: 'withoutWebsite', label: `Sem site (${counts.withoutWebsite})` },
    { key: 'withWebsite', label: `Com site (${counts.withWebsite})` },
  ]

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between border-b pb-2">
        <div className="flex flex-wrap gap-1">
          {filters.map((f) => (
            <button key={f.key} type="button" onClick={() => dispatch({ type: 'SET_FILTER', payload: f.key })}
              className={`text-xs px-2 py-1 rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${filter === f.key ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground hover:bg-muted'}`}>
              {f.label}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 shrink-0" onClick={() => dispatch({ type: 'CLEAR_LEADS' })}>
          <X className="h-3 w-3" /> Limpar resultados
        </Button>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{filtered.length} leads</p>
        <select className="text-xs border rounded px-1 py-0.5 bg-background" value={sortOption}
          onChange={(e) => dispatch({ type: 'SET_SORT', payload: e.target.value as SortOption })}>
          <option value="relevance">Relevância</option>
          <option value="rating">Rating</option>
          <option value="distance">Distância</option>
        </select>
      </div>
      <div className="space-y-2">
        {sorted.map((lead) => <LeadCard key={lead.id} lead={lead} />)}
      </div>
    </div>
  )
}
