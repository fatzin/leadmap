import { useState } from 'react'
import { SearchProvider, useSearch } from '@/context/SearchContext'
import { Sidebar } from '@/components/Sidebar'
import { MapPanel } from '@/components/MapPanel'
import { LeadList } from '@/components/LeadList'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Menu } from 'lucide-react'

function MainContent({ sidebarOpen, onMenuClick }: { sidebarOpen: boolean; onMenuClick: () => void }) {
  const { state } = useSearch()

  const menuButton = !sidebarOpen ? (
    <button
      type="button"
      onClick={onMenuClick}
      className="md:hidden absolute top-3 left-3 z-50 inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1.5 text-xs font-medium shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Menu className="h-3.5 w-3.5" />
      Menu
    </button>
  ) : null

  if (state.viewMode === 'list' && state.leads.length > 0) {
    return (
      <div className="flex-1 overflow-hidden relative flex flex-col">
        {menuButton}
        <ScrollArea className="h-full p-4 pt-12 md:pt-4">
          <div id="lead-list"><LeadList /></div>
        </ScrollArea>
      </div>
    )
  }

  return (
    <div className="flex-1 relative flex flex-col">
      {menuButton}
      <MapPanel />
    </div>
  )
}

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <SearchProvider>
      <div className="flex h-screen w-screen overflow-hidden">
        <Sidebar open={sidebarOpen} onOpenChange={setSidebarOpen} />
        <MainContent sidebarOpen={sidebarOpen} onMenuClick={() => setSidebarOpen((o) => !o)} />
      </div>
    </SearchProvider>
  )
}
