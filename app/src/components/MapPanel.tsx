import { useEffect, useRef, useState } from 'react'
import { useSearch } from '@/context/SearchContext'
import { Map, MapControls, useMap } from '@/components/ui/map'
import * as maplibregl from 'maplibre-gl'
import type { Lead } from '@/types'
import { Star, Phone, MapPin, Globe, X, User, Maximize2, ExternalLink, MessageCircle, ChevronUp, ChevronDown } from 'lucide-react'
import { Dialog, DialogHeader, DialogTitle, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function circlePolygon(lng: number, lat: number, radiusKm: number): [number, number][] {
  const coords: [number, number][] = []
  const latRad = (lat * Math.PI) / 180
  const lngKm = 111.32 * Math.cos(latRad)
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * 2 * Math.PI
    coords.push([lng + (radiusKm * Math.sin(a)) / lngKm, lat + (radiusKm * Math.cos(a)) / 111.32])
  }
  return coords
}

function safeRemove(map: maplibregl.Map, ...ids: string[]) {
  for (const id of ids) {
    try {
      if (map.getLayer(id)) map.removeLayer(id)
      if (map.getSource(id)) map.removeSource(id)
    } catch { /* ignore */ }
  }
}

function ensureGeoJSONSource(map: maplibregl.Map, id: string) {
  if (!map.getSource(id)) {
    map.addSource(id, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  }
  return map.getSource(id) as maplibregl.GeoJSONSource
}

// ─── Layers ───────────────────────────────────────────────────────────────────

const SRC = {
  leads: 'leads',
  center: 'center',
  radius: 'radius',
}

const LAYER = {
  noSite: 'leads-no-site',
  hasSite: 'leads-has-site',
  center: 'center-dot',
  radiusFill: 'radius-fill',
  radiusLine: 'radius-line',
}

const CIRCLE_PAINT = {
  'circle-radius': 8,
  'circle-stroke-width': 2,
  'circle-stroke-color': '#ffffff',
  'circle-stroke-opacity': 0.9,
  'circle-opacity': 0.85,
}

function setupLeadsLayer(map: maplibregl.Map) {
  safeRemove(map, LAYER.noSite, LAYER.hasSite, LAYER.noSite + '-hit', LAYER.hasSite + '-hit')
  ensureGeoJSONSource(map, SRC.leads)

  // Transparent hit area (bigger, invisible) — easier to click
  map.addLayer({ id: LAYER.noSite + '-hit', type: 'circle', source: SRC.leads, filter: ['!=', 'hasWebsite', '1'], paint: { 'circle-radius': 16, 'circle-opacity': 0 } })
  map.addLayer({ id: LAYER.hasSite + '-hit', type: 'circle', source: SRC.leads, filter: ['==', 'hasWebsite', '1'], paint: { 'circle-radius': 16, 'circle-opacity': 0 } })

  // Visible dots
  map.addLayer({ id: LAYER.noSite, type: 'circle', source: SRC.leads, filter: ['!=', 'hasWebsite', '1'], paint: { ...CIRCLE_PAINT, 'circle-color': '#10b981' } })
  map.addLayer({ id: LAYER.hasSite, type: 'circle', source: SRC.leads, filter: ['==', 'hasWebsite', '1'], paint: { ...CIRCLE_PAINT, 'circle-color': '#f59e0b' } })

  // Cursor
  for (const l of [LAYER.noSite, LAYER.hasSite]) {
    map.on('mouseenter', l, () => { map.getCanvas().style.cursor = 'pointer' })
    map.on('mouseleave', l, () => { map.getCanvas().style.cursor = '' })
  }
}

// ─── Popup ────────────────────────────────────────────────────────────────────

function LeadPopup({ lead, pos, onClose, onShowDetails }: { lead: Lead; pos?: { x: number; y: number }; onClose: () => void; onShowDetails: () => void }) {
  return (
    <div
      className="absolute z-50 bg-background/95 backdrop-blur-xl rounded-lg shadow-xl p-3 text-sm max-w-[280px] border pointer-events-auto"
      style={pos ? { left: pos.x, top: pos.y, transform: 'translate(-50%, -110%)' } : { left: '50%', top: '50%', transform: 'translate(-50%, -110%)' }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        aria-label="Fechar"
        className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-gray-700 rounded-full hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        onClick={(e) => { e.stopPropagation(); onClose() }}
      >
        <X className="h-3 w-3" aria-hidden="true" />
      </button>
      <strong className="block font-semibold mb-1 pr-6">{lead.title}</strong>
      {lead.address && <div className="flex items-start gap-1 text-muted-foreground mb-1 text-xs"><MapPin className="h-3 w-3 mt-0.5 shrink-0" /><span>{lead.address}</span></div>}
      {lead.phone && <div className="flex items-center gap-1 text-muted-foreground mb-1 text-xs"><Phone className="h-3 w-3 shrink-0" /><span>{lead.phone}</span></div>}
      {lead.website && <a href={lead.website} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-500 hover:underline text-xs"><Globe className="h-3 w-3" /><span className="truncate">{lead.website}</span></a>}
      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
        {lead.review_count > 0 ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onShowDetails() }}
            className="text-amber-500 flex items-center gap-0.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Star className="h-3 w-3 fill-current" />{lead.review_rating} ({lead.review_count})
          </button>
        ) : (
          <span>Sem avaliações</span>
        )}
        <span className={lead.hasWebsite ? 'text-amber-500' : 'text-emerald-500'}>{lead.hasWebsite ? 'Com site' : 'Sem site'}</span>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onShowDetails() }}
        className="mt-2 w-full flex items-center justify-center gap-1 text-xs py-1.5 rounded-md border hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <Maximize2 className="h-3 w-3" />
        Ver detalhes completos
      </button>
    </div>
  )
}

function PositionedPopup({ lead, onClose, onShowDetails }: { lead: Lead; onClose: () => void; onShowDetails: () => void }) {
  const { map, isLoaded } = useMap()
  const [tick, setTick] = useState(0)

  // tick is read to force re-render when the map moves/pans/zooms
  const pos = (() => {
    void tick
    if (!isLoaded || !map || lead.latitude == null || lead.longitude == null) return null
    const p = map.project([lead.longitude, lead.latitude])
    const canvas = map.getCanvas()
    const margin = 20
    const visible = p.x > -margin && p.x < canvas.width + margin && p.y > -margin && p.y < canvas.height + margin
    return visible ? { x: p.x, y: p.y } : null
  })()

  useEffect(() => {
    if (!isLoaded || !map) return
    const onMove = () => setTick((t) => t + 1)
    map.on('move', onMove)
    return () => { map.off('move', onMove) }
  }, [isLoaded, map])

  if (!pos) return null
  return <LeadPopup lead={lead} pos={pos} onClose={onClose} onShowDetails={onShowDetails} />
}

// ─── Viewport List (horizontal bar at top) ─────────────────────────────────────

type MapFilter = 'all' | 'withoutWebsite' | 'withWebsite'

function ViewportList({ leads, filter, onFilterChange, onSelect, expanded, onToggle }: {
  leads: Lead[]
  filter: MapFilter
  onFilterChange: (f: MapFilter) => void
  onSelect: (lead: Lead) => void
  expanded: boolean
  onToggle: () => void
}) {
  const filtered = filter === 'all' ? leads
    : filter === 'withoutWebsite' ? leads.filter((l) => !l.hasWebsite)
    : leads.filter((l) => l.hasWebsite)

  const counts = {
    all: leads.length,
    withoutWebsite: leads.filter((l) => !l.hasWebsite).length,
    withWebsite: leads.filter((l) => l.hasWebsite).length,
  }

  return (
    <div className="absolute top-3 left-3 right-3 z-40 bg-background/80 backdrop-blur-xl rounded-xl border shadow-xl">
      <div className="flex items-center gap-3 px-4 py-2">
        <span className="text-sm font-medium">{filtered.length} leads nesta área</span>
        <div className="ml-auto flex items-center gap-1.5 text-xs">
          {expanded && (
            <>
              <span className="text-muted-foreground">Filtrar:</span>
              {(['all', 'withoutWebsite', 'withWebsite'] as MapFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => onFilterChange(f)}
                  className={`px-2.5 py-1 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                    filter === f
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {f === 'all' ? `Todos (${counts.all})` : f === 'withoutWebsite' ? `Sem site (${counts.withoutWebsite})` : `Com site (${counts.withWebsite})`}
                </button>
              ))}
            </>
          )}
          <button
            onClick={onToggle}
            className="ml-1 p-1 rounded-md hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            title={expanded ? 'Recolher lista' : 'Expandir lista'}
            aria-label={expanded ? 'Recolher lista' : 'Expandir lista'}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {expanded && (
        filtered.length > 0 ? (
          <div className="flex gap-3 overflow-x-auto p-3 border-t" style={{ scrollbarWidth: 'thin' }}>
            {filtered.map((lead) => (
              <button
                key={lead.id}
                onClick={() => onSelect(lead)}
                className="shrink-0 w-64 text-left rounded-lg border bg-card p-3 hover:shadow-md hover:border-primary/30 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <h4 className="font-medium text-sm truncate flex-1">{lead.title}</h4>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 font-medium ${
                    lead.hasWebsite ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {lead.hasWebsite ? 'com site' : 'sem site'}
                  </span>
                </div>
                {lead.category && <p className="text-xs text-muted-foreground truncate mb-1.5">{lead.category}</p>}
                {lead.address && <p className="text-[11px] text-muted-foreground truncate mb-1.5">{lead.address}</p>}
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                  {lead.phone && <span className="flex items-center gap-1 truncate"><Phone className="h-3 w-3 shrink-0" />{lead.phone}</span>}
                  {lead.review_rating > 0 && (
                    <span className="flex items-center gap-0.5 shrink-0 text-amber-500">
                      <Star className="h-3 w-3 fill-current" />
                      {lead.review_rating} <span className="text-muted-foreground">({lead.review_count})</span>
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground border-t">
            Nenhum lead nesta área com o filtro selecionado
          </div>
        )
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function MapLayers() {
  const { map, isLoaded } = useMap()
  const { state, dispatch } = useSearch()
  const { leads, currentQuery, searchCenter, searchRadius, filter } = state
  const clickAttached = useRef(false)
  const fittedForQuery = useRef<string | null>(null)
  const [popupId, setPopupId] = useState<string | null>(null)

  const popupLead = leads.find((l) => l.id === popupId) || null
  const [modalLead, setModalLead] = useState<Lead | null>(null)
  const [viewportLeads, setViewportLeads] = useState<Lead[]>([])
  const [viewportExpanded, setViewportExpanded] = useState(false)
  const mapFilter = filter

  // Map click → open popup on marker, or set search center on empty area
  useEffect(() => {
    if (!isLoaded || !map || clickAttached.current) return
    clickAttached.current = true
    map.on('click', (e: maplibregl.MapMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, { layers: [LAYER.noSite, LAYER.hasSite, LAYER.noSite + '-hit', LAYER.hasSite + '-hit'] })
      if (features.length > 0) {
        const id = features[0].properties?.id as string | undefined
        if (id) setPopupId(id)
      } else {
        setPopupId(null)
        dispatch({ type: 'SET_SEARCH_CENTER', payload: { lat: e.lngLat.lat, lng: e.lngLat.lng } })
      }
    })
  }, [isLoaded, map, dispatch])

  // Track viewport → filter leads visible on screen
  useEffect(() => {
    if (!isLoaded || !map) return
    const update = () => {
      const bounds = map.getBounds()
      setViewportLeads(leads.filter((l) =>
        l.latitude && l.longitude &&
        l.latitude >= bounds.getSouth() && l.latitude <= bounds.getNorth() &&
        l.longitude >= bounds.getWest() && l.longitude <= bounds.getEast()
      ))
    }
    update()
    map.on('moveend', update)
    return () => { map.off('moveend', update) }
  }, [isLoaded, map, leads])

  // Setup leads layer once
  useEffect(() => {
    if (!isLoaded || !map || map.getLayer(LAYER.noSite)) return
    setupLeadsLayer(map)
  }, [isLoaded, map])

  // Update leads data
  useEffect(() => {
    if (!isLoaded || !map) return
    const src = map.getSource(SRC.leads) as maplibregl.GeoJSONSource | undefined
    if (!src) return
    src.setData({
      type: 'FeatureCollection',
      features: leads
        .filter((l) => l.latitude && l.longitude)
        .filter((l) => filter === 'all' || (filter === 'withoutWebsite' ? !l.hasWebsite : l.hasWebsite))
        .map((l) => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [l.longitude, l.latitude] },
          properties: { id: l.id, title: l.title, hasWebsite: l.hasWebsite ? '1' : '0' },
        })),
    })
  }, [isLoaded, map, leads, filter])

  // Fit bounds once per search, not on every lead update
  useEffect(() => {
    if (!isLoaded || !map || leads.length === 0 || searchCenter) return
    const queryId = currentQuery?.id || null
    if (queryId && fittedForQuery.current === queryId) return
    fittedForQuery.current = queryId
    const bounds = new maplibregl.LngLatBounds()
    leads.forEach((l) => l.latitude && l.longitude && bounds.extend([l.longitude, l.latitude]))
    if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 500 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, map, leads.length, searchCenter, currentQuery?.id])

  // Radius circle - update source data instead of removing layers; do not depend on leads
  useEffect(() => {
    if (!isLoaded || !map) return
    const hasCenter = searchCenter?.lat != null && searchCenter?.lng != null
    const hasQueryCenter = currentQuery?.lat != null && currentQuery?.lon != null
    if (!hasCenter && !hasQueryCenter) {
      safeRemove(map, LAYER.radiusFill, LAYER.radiusLine)
      return
    }
    const center = hasCenter
      ? searchCenter!
      : { lat: currentQuery!.lat!, lng: currentQuery!.lon! }
    const radius = hasCenter ? searchRadius : currentQuery!.radius
    const poly = circlePolygon(center.lng, center.lat, radius)
    const add = () => {
      ensureGeoJSONSource(map, SRC.radius).setData({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [poly] }, properties: {} })
      if (!map.getLayer(LAYER.radiusFill)) {
        map.addLayer({ id: LAYER.radiusFill, type: 'fill', source: SRC.radius, paint: { 'fill-color': 'rgba(59,130,246,0.06)' } })
        map.addLayer({ id: LAYER.radiusLine, type: 'line', source: SRC.radius, paint: { 'line-color': '#3b82f6', 'line-width': 2, 'line-opacity': 0.6 } })
      }
    }
    if (map.isStyleLoaded()) add()
    else map.once('styledata', add)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, map, searchCenter?.lat, searchCenter?.lng, searchRadius, currentQuery?.lat, currentQuery?.lon, currentQuery?.radius])

  // Search center marker
  useEffect(() => {
    if (!isLoaded || !map) return
    if (searchCenter) {
      safeRemove(map, LAYER.center)
      ensureGeoJSONSource(map, SRC.center).setData({
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [searchCenter.lng, searchCenter.lat] }, properties: {} }],
      })
      if (!map.getLayer(LAYER.center)) {
        map.addLayer({ id: LAYER.center, type: 'circle', source: SRC.center, paint: { 'circle-radius': 8, 'circle-color': '#3b82f6', 'circle-stroke-width': 3, 'circle-stroke-color': '#ffffff' } })
      }
    } else {
      safeRemove(map, LAYER.center)
    }
  }, [isLoaded, map, searchCenter])

  return (
    <>
      {popupLead && (
        <PositionedPopup
          lead={popupLead}
          onClose={() => setPopupId(null)}
          onShowDetails={() => { setModalLead(popupLead); setPopupId(null) }}
        />
      )}
      <Dialog open={modalLead !== null} onOpenChange={(open) => { if (!open) setModalLead(null) }}>
        {modalLead && (
          <>
            <DialogHeader>
              <DialogTitle>{modalLead.title}</DialogTitle>
            </DialogHeader>
            <DialogContent className="space-y-3">
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
                {modalLead.category && (<><span className="text-muted-foreground">Categoria</span><span>{modalLead.category}</span></>)}
                {modalLead.phone && (<><span className="text-muted-foreground">Telefone</span><span>{modalLead.phone}</span></>)}
                {modalLead.address && (<><span className="text-muted-foreground">Endereço</span><span>{modalLead.address}</span></>)}
                {modalLead.website && (<><span className="text-muted-foreground">Website</span><a href={modalLead.website} target="_blank" rel="noreferrer" className="text-blue-600 underline flex items-center gap-1 break-all">{modalLead.website}<ExternalLink className="h-3 w-3 shrink-0" /></a></>)}
                {modalLead.review_count > 0 && (<><span className="text-muted-foreground">Rating</span><span>{modalLead.review_rating} / 5 ({modalLead.review_count} avaliações)</span></>)}
                {modalLead.latitude && modalLead.longitude && (<><span className="text-muted-foreground">Coordenadas</span><span>{modalLead.latitude.toFixed(4)}, {modalLead.longitude.toFixed(4)}</span></>)}
              </div>
              <div className="flex gap-2 pt-2">
                {modalLead.phone && (
                  <Button size="sm" className="flex-1 gap-1" asChild>
                    <a href={`https://wa.me/${modalLead.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-4 w-4" />WhatsApp</a>
                  </Button>
                )}
                {modalLead.website && (
                  <Button variant="outline" size="sm" className="flex-1 gap-1" asChild>
                    <a href={modalLead.website} target="_blank" rel="noopener noreferrer"><Globe className="h-4 w-4" />Abrir site</a>
                  </Button>
                )}
              </div>
              <div className="pt-2 border-t">
                <h5 className="text-sm font-medium mb-2">
                  {modalLead.review_count > 0 ? `Avaliações (${modalLead.review_count})` : 'Avaliações'}
                </h5>
                {modalLead.reviews.length > 0 ? (
                  <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                    <p className="text-[10px] text-muted-foreground">
                      Mostrando as primeiras avaliações coletadas ({modalLead.reviews.length} de {modalLead.review_count || modalLead.reviews.length}).
                    </p>
                    {modalLead.reviews.map((r, i) => (
                      <div key={i} className="text-sm space-y-1">
                        <div className="flex items-center gap-2">
                          {r.profile_picture ? <img src={r.profile_picture} alt={r.name} className="h-6 w-6 rounded-full object-cover" /> : <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center"><User className="h-3 w-3 text-muted-foreground" /></div>}
                          <span className="font-medium text-xs">{r.name}</span>
                          {r.rating > 0 && <span className="text-xs text-amber-600">★ {r.rating}</span>}
                          {r.when && <span className="text-xs text-muted-foreground ml-auto">{r.when}</span>}
                        </div>
                        {r.description && <p className="text-xs text-muted-foreground pl-8">{r.description}</p>}
                      </div>
                    ))}
                  </div>
                ) : modalLead.review_count > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      O scraper encontrou {modalLead.review_count} avaliações, mas o texto completo não foi coletado.
                    </p>
                    {(modalLead.reviews_link || modalLead.link) && (
                      <Button variant="outline" size="sm" className="w-full gap-1 text-xs h-7" asChild>
                        <a href={modalLead.reviews_link || modalLead.link} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3 w-3" />Ver no Google Maps</a>
                      </Button>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Sem avaliações disponíveis.</p>
                )}
              </div>
            </DialogContent>
          </>
        )}
      </Dialog>
      <ViewportList
        leads={viewportLeads}
        filter={mapFilter}
        onFilterChange={(f) => dispatch({ type: 'SET_FILTER', payload: f })}
        onSelect={(lead) => { setModalLead(lead); setPopupId(null) }}
        expanded={viewportExpanded}
        onToggle={() => setViewportExpanded((v) => !v)}
      />
    </>
  )
}

export function MapPanel() {
  return (
    <div className="flex-1 relative">
      <a
        href="#lead-list"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-24 z-50 inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-2 text-xs font-medium shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        Pular para lista de leads
      </a>
      <Map center={[-49.38, -16.68]} zoom={12} className="h-full w-full">
        <MapControls showZoom showLocate />
        <MapLayers />
      </Map>
    </div>
  )
}
