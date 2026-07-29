import { SearchForm } from './SearchForm'
import { StatsPanel } from './StatsPanel'
import { ViewTabs } from './ViewTabs'
import { LeadList } from './LeadList'
import { SearchHistory } from './SearchHistory'
import { Separator } from '@/components/ui/separator'
import { useSearch } from '@/context/SearchContext'
import { ScrollArea } from '@/components/ui/scroll-area'
import { X } from 'lucide-react'

interface SidebarProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function Sidebar({ open, onOpenChange }: SidebarProps) {
  const { state } = useSearch()

  return (
    <>
      <aside
        className={
          "fixed md:relative z-30 h-full w-80 shrink-0 border-r bg-background/80 backdrop-blur-xl flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] " +
          (open ? "translate-x-0" : "-translate-x-full md:translate-x-0")
        }
      >
        <div className="p-3 border-b shrink-0 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Radar</h1>
            <p className="text-xs text-muted-foreground">Leads Finder</p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="md:hidden inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="Fechar menu"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <ScrollArea className="flex-1 p-3">
          <div className="space-y-4">
            <SearchForm />
            <Separator />
            <StatsPanel />
            <SearchHistory />
            {state.leads.length > 0 && (
              <>
                <Separator />
                <ViewTabs />
                <Separator />
                {state.viewMode === 'map' && (
                  <div className="space-y-2" id="lead-list">
                    <LeadList />
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </aside>
      <div
        className={
          "fixed inset-0 z-20 bg-black/50 md:hidden transition-opacity duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] " +
          (open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none")
        }
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />
    </>
  )
}
