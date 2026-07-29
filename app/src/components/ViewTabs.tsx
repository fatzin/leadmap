import { useSearch } from '@/context/SearchContext'
import { Map, List } from 'lucide-react'

export function ViewTabs() {
  const { state, dispatch } = useSearch()

  return (
    <div className="flex rounded-lg border p-0.5 bg-muted">
      <button
        onClick={() => dispatch({ type: 'SET_VIEW_MODE', payload: 'map' })}
        className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
          state.viewMode === 'map'
            ? 'bg-background shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <Map className="h-3.5 w-3.5" />
        Mapa
      </button>
      <button
        onClick={() => dispatch({ type: 'SET_VIEW_MODE', payload: 'list' })}
        className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
          state.viewMode === 'list'
            ? 'bg-background shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <List className="h-3.5 w-3.5" />
        Lista
      </button>
    </div>
  )
}
