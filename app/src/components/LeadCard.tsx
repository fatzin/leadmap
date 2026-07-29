import { useState } from 'react'
import type { Lead } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogHeader, DialogTitle, DialogContent } from '@/components/ui/dialog'
import { ExternalLink, MessageCircle, Info, Globe, Phone, MapPin, Star, User } from 'lucide-react'

interface LeadCardProps {
  lead: Lead
}

export function LeadCard({ lead }: LeadCardProps) {
  const [showDetails, setShowDetails] = useState(false)

  const waNumber = lead.phone.replace(/\D/g, '')
  const waUrl = waNumber ? `https://wa.me/${waNumber}` : null

  return (
    <>
      <div className="rounded-lg border bg-card p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h4 className="font-medium text-sm truncate">{lead.title}</h4>
            {lead.category && (
              <p className="text-xs text-muted-foreground truncate">{lead.category}</p>
            )}
          </div>
          <Badge variant={lead.hasWebsite ? 'warning' : 'success'}>
            {lead.hasWebsite ? 'com site' : 'sem site'}
          </Badge>
        </div>

        <div className="space-y-1 text-xs text-muted-foreground">
          {lead.phone && (
            <div className="flex items-center gap-1.5">
              <Phone className="h-3 w-3 shrink-0" />
              <span>{lead.phone}</span>
            </div>
          )}
          {lead.address && (
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{lead.address}</span>
            </div>
          )}
          {lead.review_count > 0 ? (
            <button
              type="button"
              onClick={() => setShowDetails(true)}
              className="flex items-center gap-1.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Star className="h-3 w-3 shrink-0" />
              <span>{lead.review_rating} ({lead.review_count} avaliações)</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <Star className="h-3 w-3 shrink-0" />
              <span>Sem avaliações</span>
            </div>
          )}
        </div>

        <div className="flex gap-1.5 pt-1">
          {waUrl && (
            <Button variant="outline" size="sm" className="flex-1 gap-1 text-xs h-7" asChild>
              <a href={waUrl} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-3 w-3" />
                WhatsApp
              </a>
            </Button>
          )}
          {lead.website && (
            <Button variant="outline" size="sm" className="flex-1 gap-1 text-xs h-7" asChild>
              <a href={lead.website} target="_blank" rel="noopener noreferrer">
                <Globe className="h-3 w-3" />
                Site
              </a>
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-xs h-7"
            onClick={() => setShowDetails(true)}
          >
            <Info className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogHeader>
          <DialogTitle>{lead.title}</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-3">
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
            {lead.category && (
              <>
                <span className="text-muted-foreground">Categoria</span>
                <span>{lead.category}</span>
              </>
            )}
            {lead.phone && (
              <>
                <span className="text-muted-foreground">Telefone</span>
                <span>{lead.phone}</span>
              </>
            )}
            {lead.address && (
              <>
                <span className="text-muted-foreground">Endereço</span>
                <span>{lead.address}</span>
              </>
            )}
            {lead.website && (
              <>
                <span className="text-muted-foreground">Website</span>
                <a href={lead.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline flex items-center gap-1 break-all">
                  {lead.website} <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              </>
            )}
            {lead.review_count > 0 && (
              <>
                <span className="text-muted-foreground">Rating</span>
                <span>{lead.review_rating} / 5 ({lead.review_count} avaliações)</span>
              </>
            )}
            {lead.latitude && lead.longitude && (
              <>
                <span className="text-muted-foreground">Coordenadas</span>
                <span>{lead.latitude.toFixed(4)}, {lead.longitude.toFixed(4)}</span>
              </>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            {waUrl && (
              <Button size="sm" className="flex-1 gap-1" asChild>
                <a href={waUrl} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp
                </a>
              </Button>
            )}
            {lead.website && (
              <Button variant="outline" size="sm" className="flex-1 gap-1" asChild>
                <a href={lead.website} target="_blank" rel="noopener noreferrer">
                  <Globe className="h-4 w-4" />
                  Abrir site
                </a>
              </Button>
            )}
          </div>

          <div className="pt-2 border-t">
            <h5 className="text-sm font-medium mb-2">
              {lead.review_count > 0 ? `Avaliações (${lead.review_count})` : 'Avaliações'}
            </h5>
            {lead.reviews.length > 0 ? (
              <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                <p className="text-[10px] text-muted-foreground">
                  Mostrando as primeiras avaliações coletadas ({lead.reviews.length} de {lead.review_count || lead.reviews.length}).
                </p>
                {lead.reviews.map((review, idx) => (
                  <div key={idx} className="text-sm space-y-1">
                    <div className="flex items-center gap-2">
                      {review.profile_picture ? (
                        <img
                          src={review.profile_picture}
                          alt={review.name}
                          className="h-6 w-6 rounded-full object-cover"
                        />
                      ) : (
                        <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center">
                          <User className="h-3 w-3 text-muted-foreground" />
                        </div>
                      )}
                      <span className="font-medium text-xs">{review.name}</span>
                      {review.rating > 0 && (
                        <span className="text-xs text-amber-600">★ {review.rating}</span>
                      )}
                      {review.when && (
                        <span className="text-xs text-muted-foreground ml-auto">{review.when}</span>
                      )}
                    </div>
                    {review.description && (
                      <p className="text-xs text-muted-foreground pl-8">{review.description}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : lead.review_count > 0 ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  O scraper encontrou {lead.review_count} avaliações, mas o texto completo não foi coletado.
                </p>
                {(lead.reviews_link || lead.link) && (
                  <Button variant="outline" size="sm" className="w-full gap-1 text-xs h-7" asChild>
                    <a href={lead.reviews_link || lead.link} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3 w-3" />
                      Ver no Google Maps
                    </a>
                  </Button>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Sem avaliações disponíveis.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
