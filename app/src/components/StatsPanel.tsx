import { useSearch } from '@/context/SearchContext'
import { exportLeadsToCSV } from '@/lib/csv'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'

export function StatsPanel() {
  const { state } = useSearch()
  const { currentQuery, leads } = state

  if (!currentQuery || currentQuery.status !== 'completed') {
    return (
      <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
        Nenhuma busca realizada
      </div>
    )
  }

  const { total, withoutWebsite, withWebsite } = currentQuery.stats
  const pct = total > 0 ? Math.round((withoutWebsite / total) * 100) : 0

  const handleExport = () => {
    exportLeadsToCSV(leads, currentQuery.input)
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-muted p-2 text-center">
          <div className="text-xl font-bold">{total}</div>
          <div className="text-xs text-muted-foreground">Total</div>
        </div>
        <div className="rounded-lg bg-emerald-50 p-2 text-center dark:bg-emerald-950">
          <div className="text-xl font-bold text-emerald-700 dark:text-emerald-300">{withoutWebsite}</div>
          <div className="text-xs text-emerald-600 dark:text-emerald-400">Sem site</div>
        </div>
        <div className="rounded-lg bg-amber-50 p-2 text-center dark:bg-amber-950">
          <div className="text-xl font-bold text-amber-700 dark:text-amber-300">{withWebsite}</div>
          <div className="text-xs text-amber-600 dark:text-amber-400">Com site</div>
        </div>
      </div>
      <div className="text-center text-sm text-muted-foreground">
        {pct}% sem site
      </div>
      <Button variant="outline" size="sm" className="w-full gap-2" onClick={handleExport}>
        <Download className="h-4 w-4" />
        Exportar CSV
      </Button>
    </div>
  )
}
