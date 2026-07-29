import { useState, type FormEvent } from 'react'
import { useSearch } from '@/context/SearchContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

export function SearchForm() {
  const { dispatch, state, startSearch } = useSearch()
  const [query, setQuery] = useState('')
  const [useGrid, setUseGrid] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!query.trim() || state.isLoading) return

    const center = state.searchCenter
    const radius = state.searchRadius
    const q = query.trim()

    dispatch({ type: 'SET_LOADING', payload: true })
    dispatch({ type: 'CLEAR_LEADS' })
    await startSearch(q, radius, center, 3, useGrid && !!center)
  }

  const hasCenter = !!state.searchCenter
  const detailedMode = hasCenter && !state.fastMode
  const showReviews = detailedMode

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1">
        <label htmlFor="search-query" className="text-sm font-medium">O que buscar?</label>
        <Input id="search-query" placeholder="Ex: padarias" value={query} onChange={(e) => setQuery(e.target.value)} disabled={state.isLoading} />
      </div>

      {state.searchCenter && (
        <div className="flex items-center justify-between text-xs text-muted-foreground bg-muted px-3 py-1.5 rounded-md">
          <span>Local: {state.searchCenter.lat.toFixed(4)}, {state.searchCenter.lng.toFixed(4)}</span>
          <button type="button" onClick={() => dispatch({ type: 'SET_SEARCH_CENTER', payload: null })} className="text-destructive hover:underline ml-2 shrink-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">Limpar</button>
        </div>
      )}

      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Raio: {state.searchRadius} km</label>
        <input type="range" min={1} max={100} value={state.searchRadius} onChange={(e) => dispatch({ type: 'SET_SEARCH_RADIUS', payload: Number(e.target.value) })} className="w-full accent-primary" disabled={state.isLoading} />
        <div className="flex justify-between text-xs text-muted-foreground"><span>1 km</span><span>100 km</span></div>
      </div>

      <div className="space-y-2 rounded-lg border p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Modo de busca</span>
          {state.fastMode ? (
            <Badge variant="warning">Rápido</Badge>
          ) : (
            <Badge variant="success">Detalhado</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {state.fastMode
            ? 'Busca mais rápida pelo mapa. Não coleta avaliações.'
            : 'Busca mais lenta, visitando a página de cada lugar. Coleta a primeira página de avaliações.'}
        </p>
        {hasCenter && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={state.fastMode} onChange={(e) => dispatch({ type: 'SET_FAST_MODE', payload: e.target.checked })} disabled={state.isLoading} className="accent-primary h-4 w-4 cursor-pointer" />
            Usar modo rápido
          </label>
        )}
        {!hasCenter && (
          <p className="text-[11px] text-muted-foreground">Clique no mapa para ativar o modo rápido.</p>
        )}
      </div>

      <div className="space-y-1">
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={useGrid} onChange={(e) => setUseGrid(e.target.checked)} disabled={state.isLoading} className="accent-primary h-4 w-4 cursor-pointer" />
          Busca em grade
        </label>
        {useGrid && !hasCenter && (
          <p className="text-[11px] text-amber-600">Clique no mapa para definir o centro da grade antes de buscar.</p>
        )}
        {useGrid && hasCenter && (
          <p className="text-[11px] text-muted-foreground">(~{Math.ceil((state.searchRadius * 2 / 3) ** 2)} jobs)</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {hasCenter && (
          <Badge variant="outline" className="text-xs">Centro definido</Badge>
        )}
        {useGrid && (
          <Badge variant="outline" className="text-xs">Grade ativa</Badge>
        )}
        {showReviews ? (
          <Badge variant="success" className="text-xs">Com primeiras avaliações</Badge>
        ) : (
          <Badge variant="warning" className="text-xs">Sem avaliações</Badge>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={state.isLoading || !query.trim()}>
        {state.isLoading ? 'Buscando...' : 'Buscar leads sem site'}
      </Button>
    </form>
  )
}
