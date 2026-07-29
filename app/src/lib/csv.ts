import type { Lead } from '@/types'

export function exportLeadsToCSV(leads: Lead[], queryName: string): void {
  const headers = [
    'title', 'category', 'phone', 'website', 'address',
    'latitude', 'longitude', 'review_rating', 'review_count',
    'has_website', 'place_id', 'emails',
  ]

  const rows = leads.map((lead) => [
    escapeCSV(lead.title),
    escapeCSV(lead.category),
    escapeCSV(lead.phone),
    escapeCSV(lead.website),
    escapeCSV(lead.address),
    lead.latitude.toString(),
    lead.longitude.toString(),
    lead.review_rating.toString(),
    lead.review_count.toString(),
    lead.hasWebsite ? 'sim' : 'não',
    escapeCSV(lead.place_id),
    escapeCSV(lead.emails.join(';')),
  ])

  const BOM = '\uFEFF'
  const csvContent = BOM + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url

  const date = new Date().toISOString().split('T')[0]
  const safeName = queryName.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30)
  link.download = `radar-leads-${safeName}-${date}.csv`

  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function escapeCSV(value: string): string {
  if (!value) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}
