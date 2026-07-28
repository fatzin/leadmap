# Spec — Radar de Leads (Google Maps Lead Finder)

## Problem Statement

Como prestador de serviços de landing page e programação, preciso encontrar negócios locais que **não possuem website cadastrado no Google Maps** para abordá-los com uma oferta de criação de site. Atualmente, não existe uma ferramenta gratuita, open source e customizável que una scraping de Google Maps com visualização em mapa e ações de prospecção (WhatsApp, contato direto).

A necessidade imediata é gerar renda extra para custear um casamento — toda ferramenta precisa ser prática, gratuita (ou de custo quase zero) e entregar leads acionáveis.

## Solution

Uma aplicação web auto-hospedada (Docker Compose) com três containers:

- **Frontend** (React + Vite + TypeScript + Tailwind/shadcn/ui + MapCN): interface com sidebar de filtros à esquerda e mapa interativo à direita, mostrando leads em tempo real.
- **Scraper** (gosom/google-maps-scraper): serviço Go que faz scraping do Google Maps via Playwright, expondo uma REST API para criar jobs de busca e obter resultados.
- **Banco** (PostgreSQL): persistência dos leads encontrados.

O usuário digita uma query (ex: "padarias em Goiânia"), define um raio de busca, clica em "Buscar leads sem site", e o scraper roda em background. Os resultados vão aparecendo no mapa conforme são encontrados (polling a cada N segundos). Leads sem website são destacados em verde; leads com site aparecem em amarelo. Cada lead exibe nome, telefone, endereço e botões de ação (WhatsApp, abrir site, ver detalhes). É possível exportar a lista como CSV e visualizar o histórico de buscas anteriores.

## User Stories

1. Como usuário, quero digitar uma query livre (ex: "clínicas em Goiânia") para buscar leads, sem precisar escolher de um dropdown fixo.
2. Como usuário, quero definir um raio de busca (em km) para filtrar leads por proximidade geográfica.
3. Como usuário, quero clicar em "Buscar leads sem site" para iniciar a prospecção em background.
4. Como usuário, quero ver os leads aparecendo no mapa em tempo real conforme o scraper os encontra.
5. Como usuário, quero que leads **sem website** apareçam em destaque (verde) no mapa e leads **com website** apareçam em tom secundário (amarelo).
6. Como usuário, quero ver um painel com total de leads encontrados vs leads sem site.
7. Como usuário, quero clicar em um lead no mapa ou na lista lateral e ver seus detalhes (nome, telefone, endereço, website, rating).
8. Como usuário, quero clicar em um botão "WhatsApp" para abrir o wa.me com o número do lead pré-preenchido.
9. Como usuário, quero clicar em um botão "Abrir site" para visitar o site do lead em uma nova aba (se ele tiver um).
10. Como usuário, quero exportar a lista de leads como CSV para usar em outras ferramentas.
11. Como usuário, quero ver um histórico de buscas anteriores para reexecutar uma busca sem redigitar.
12. Como usuário, quero clicar em uma busca do histórico para recarregar seus resultados no mapa.
13. Como usuário, quero que os resultados da busca sejam persistidos no banco para consulta futura.
14. Como usuário, quero ver um círculo de raio no mapa indicando a área de busca.
15. Como usuário, quero poder alternar entre visualização "mapa" e "lista" (kanban/painel).
16. Como usuário, quero ordenar os leads por relevância, distância ou rating.
17. Como usuário, quero uma mensagem padrão para WhatsApp que eu possa customizar antes de disparar.

## Implementation Decisions

### Architecture

- **3 containers Docker Compose**: `app` (React/Vite/nginx), `scraper` (gosom/google-maps-scraper), `db` (PostgreSQL 16).
- **Frontend chama scraper REST API diretamente** — sem middleware Node. CORS configurado no gosom ou via nginx reverse proxy no container `app`.
- **Comunicação**: React faz `fetch()` para `http://scraper:8080/api/v1/jobs`.

### Scraper (gosom/google-maps-scraper)

- Usa o gosom via imagem Docker oficial (`gosom/google-maps-scraper`).
- O gosom expõe as seguintes rotas relevantes:
  - `POST /api/v1/jobs` — cria job de scraping (body: `{ input: string, depth: number }`)
  - `GET /api/v1/jobs` — lista jobs
  - `GET /api/v1/jobs/{id}` — obtém status e metadados de um job
  - `GET /api/v1/jobs/{id}/download` — baixa resultados em CSV
- Jobs rodam em background. Frontend faz polling de `GET /api/v1/jobs/{id}` até `status=completed`, depois baixa resultados.
- O scraper NÃO faz filtro "sem site" no backend — o React pós-processa os resultados, separando leads com `website === ""` ou `null` dos que têm site.
- **Proxy**: nenhum no MVP. Adicionar suporte a proxy rotativo (SOCKS5) na v2 se necessário.
- **Rate limit**: começa com `-c 2` (concorrência 2) para evitar bloqueio sem proxy.
- `depth` default: 1 (scroll moderado). Configurável no frontend como "profundidade" opcional.

### Frontend (React + Vite + TypeScript)

- **Build tool**: Vite 6
- **UI framework**: shadcn/ui (Radix primitives + Tailwind)
- **Mapa**: MapCN (`@mapcn/map`) — MapLibre GL com CARTO basemap gratuito, sem API key
- **Estado**: React Context + hooks locais (sem biblioteca de estado global no MVP)
- **Páginas/Rotas**: Single page — sidebar + mapa na mesma view

#### Layout

```
┌──────────────────────────────────────────────────────────┐
│ ┌─────────────────┐ ┌──────────────────────────────────┐ │
│ │  SIDEBAR (320px) │ │          MAPA (flex-1)           │ │
│ │                  │ │                                  │ │
│ │  Logo: "Radar"   │ │   🎯 Círculo de raio            │ │
│ │                  │ │   📍 Markers coloridos          │ │
│ │  ──────────────  │ │   🟢 sem site (verde)            │ │
│ │  Busca           │ │   🟡 tem site (amarelo)          │ │
│ │  ┌────────────┐  │ │                                  │ │
│ │  │ padarias   │  │ │                                  │ │
│ │  │ em Goiânia │  │ │                                  │ │
│ │  └────────────┘  │ │                                  │ │
│ │  Raio: [20 km]   │ │                                  │ │
│ │  [🔍 Buscar]     │ │                                  │ │
│ │                  │ │                                  │ │
│ │  ──────────────  │ │                                  │ │
│ │  143 total       │ │                                  │ │
│ │  112 sem site 🟢 │ │                                  │ │
│ │                  │ │                                  │ │
│ │  ──────────────  │ │                                  │ │
│ │  [Mapa] [Lista]  │ │                                  │ │
│ │                  │ │                                  │ │
│ │  ──── LEADS ──── │ │                                  │ │
│ │  ┌─────────────┐ │ │                                  │ │
│ │  │ Padaria XYZ │ │ │                                  │ │
│ │  │ (62) 9...   │ │ │                                  │ │
│ │  │ Rua A, 123  │ │ │                                  │ │
│ │  │ [💬] [🔗]   │ │ │                                  │ │
│ │  └─────────────┘ │ │                                  │ │
│ │  ┌─────────────┐ │ │                                  │ │
│ │  │ ...         │ │ │                                  │ │
│ │  └─────────────┘ │ │                                  │ │
│ │                  │ │                                  │ │
│ │  ──── HISTÓRICO  │ │                                  │ │
│ │  • padarias      │ │                                  │ │
│ │    Goiânia 20km  │ │                                  │ │
│ │  • clínicas      │ │                                  │ │
│ │    Goiânia 15km  │ │                                  │ │
│ └─────────────────┘ └──────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

#### Component Tree (MVP)

```
App
├── SearchProvider (Context: queries, jobs, leads, polling)
├── Layout
│   ├── Sidebar
│   │   ├── SearchForm
│   │   │   ├── QueryInput (free text)
│   │   │   ├── RadiusSlider
│   │   │   ├── DepthSelect (opcional, default 1)
│   │   │   └── SearchButton
│   │   ├── StatsPanel (total, sem site, com site)
│   │   ├── ViewTabs (Mapa | Lista)
│   │   ├── LeadList
│   │   │   └── LeadCard[]
│   │   │       ├── LeadInfo (name, phone, address)
│   │   │       └── LeadActions (WhatsApp, OpenSite, Details)
│   │   └── SearchHistory
│   │       └── HistoryItem[]
│   └── MapPanel
│       ├── Map (MapCN)
│       │   ├── SearchRadiusCircle
│       │   ├── LeadMarker[]
│       │   └── LeadPopup (on click)
│       └── MapControls (zoom, geolocate)
```

#### Data Types (TypeScript)

```typescript
interface Lead {
  id: string
  title: string
  category: string
  address: string
  phone: string
  website: string
  latitude: number
  longitude: number
  review_rating: number
  review_count: number
  place_id: string
  data_id: string
  cid: string
  plus_code: string
  status: 'open' | 'closed' | 'temporary'
  price_range: string
  timezone: string
  thumbnail: string
  emails: string[]
  hasWebsite: boolean // computed: website !== "" && website !== null
}

interface SearchQuery {
  id: string
  input: string          // ex: "padarias em Goiânia"
  radius: number         // km
  depth: number
  createdAt: string      // ISO
  jobId: string          // gosom job id
  status: 'pending' | 'running' | 'completed' | 'failed'
  stats: {
    total: number
    withoutWebsite: number
    withWebsite: number
  }
}

interface JobStatus {
  id: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  progress: {
    current: number
    total: number
  }
}
```

#### Polling Flow

```
1. User clicks "Buscar"
2. POST /api/v1/jobs { input: "padarias em Goiânia", depth: 1 }
3. Response: { id: "job_123" }
4. setInterval(3000ms):
   GET /api/v1/jobs/job_123
   if status === "completed": 
     GET /api/v1/jobs/job_123/download → parse CSV → set leads
     clearInterval
   else:
     if there are partial results: show what's found so far
```

Nota: O gosom não expõe resultados parciais via REST (só o CSV final). Para feedback em tempo real real, seria necessário WebSocket — mas no MVP, faremos o polling e mostraremos os leads apenas quando o job completar. Se o job for grande, o usuário pode navegar para outras abas enquanto espera.

### PostgreSQL

- Database: `radar_leads`
- Tabela: `leads`

```sql
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  search_query_id UUID NOT NULL REFERENCES search_queries(id),
  title TEXT NOT NULL,
  category TEXT,
  address TEXT,
  phone TEXT,
  website TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  review_rating DOUBLE PRECISION,
  review_count INTEGER,
  place_id TEXT,
  data_id TEXT,
  emails TEXT[],
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE search_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  input TEXT NOT NULL,
  radius_km DOUBLE PRECISION,
  depth INTEGER DEFAULT 1,
  gosom_job_id TEXT,
  status TEXT DEFAULT 'pending',
  stats_total INTEGER DEFAULT 0,
  stats_without_website INTEGER DEFAULT 0,
  stats_with_website INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_leads_search_query ON leads(search_query_id);
CREATE INDEX idx_leads_coordinates ON leads(latitude, longitude);
CREATE INDEX idx_search_queries_created ON search_queries(created_at DESC);
```

### Docker Compose

```yaml
services:
  app:
    build: ./app
    ports:
      - "3000:3000"
    volumes:
      - ./app:/app
      - /app/node_modules
    environment:
      - VITE_SCRAPER_URL=http://scraper:8080
      - VITE_DB_URL=postgres://postgres:postgres@db:5432/radar_leads
    depends_on:
      - scraper
      - db

  scraper:
    image: gosom/google-maps-scraper
    ports:
      - "8080:8080"
    volumes:
      - scraper-data:/opt
    environment:
      - GMAPS_SCRAPER_WEB=true
      - GMAPS_SCRAPER_ADDR=:8080
      - GMAPS_SCRAPER_DATA_FOLDER=/gmapsdata
      - GMAPS_SCRAPER_LANG=pt
      - GMAPS_SCRAPER_C=2

  db:
    image: postgres:16-alpine
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=radar_leads
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./db/init.sql:/docker-entrypoint-initdb.d/init.sql

volumes:
  scraper-data:
  pgdata:
```

### MVP Features (Ordered by Priority)

1. Busca com query livre + raio
2. Mapa com markers (verde=sem site, amarelo=com site, círculo de raio)
3. Lista de leads na sidebar com ações (WhatsApp, abrir site)
4. Painel de estatísticas (total vs sem site)
5. Histórico de buscas (persistido no banco)
6. Exportar CSV

### v2 (Post-MVP — for reference only)

- WebSocket para atualização em tempo real durante scraping
- Enriquecimento de emails (scraping dos sites dos leads)
- Mensagem WhatsApp customizável
- Status do lead (contatado, não respondeu, convertido)
- Modo "disparo em massa" (enviar WhatsApp para múltiplos leads)
- Suporte a proxy rotativo
- Autenticação multi-usuário
- Painel de analytics

## Testing Decisions

**O que testar (por prioridade):**

1. **Fluxo de busca completo (integração)**: usuário digita query → scraper job é criado → polling retorna leads → aparecem no mapa. Teste com gosom em Docker (container de teste).
2. **Filtro "sem site"**: dado um conjunto de leads mockados, verificar que os sem site são destacados e contados corretamente.
3. **Exportação CSV**: dado um conjunto de leads, verificar que o CSV gerado contém todas as linhas e colunas esperadas.
4. **Componentes isolados**: LeadCard, StatsPanel, SearchForm, RadiusSlider — testar renderização e interações com React Testing Library.

**O que NÃO testar (no MVP):**
- Scraping real do Google Maps (é comportamento do gosom, testado pelo projeto deles)
- Banco de dados em testes unitários (testar com mocks)
- Rotas de API do gosom (são do projeto deles)

**Ferramentas:**
- Vitest (já vem com Vite)
- React Testing Library (para componentes)
- Playwright (para testes E2E — opcional, pós-MVP)

## Out of Scope

- Scraping de outras plataformas (Yelp, Bing Maps, etc.)
- Autenticação/multi-usuário
- Modo "disparo em massa" de WhatsApp
- Enriquecimento de leads com dados de LinkedIn/Instagram
- Deploy em produção (VPS, Kubernetes) — MVP roda local via Docker Compose
- Aplicativo mobile
- Suporte a proxy no MVP
- Integração com CRM external (HubSpot, Pipedrive)

## Further Notes

- **Licenciamento**: O gosom/google-maps-scraper é MIT. O frontend deste projeto também será MIT. O scraping de dados do Google Maps é legalmente nebuloso — este projeto é para uso educacional/pessoal. O usuário é responsável pelo compliance.
- **Idioma**: A interface será em português (BR). A documentação e o spec estão em português, seguindo o idioma do usuário.
- **Região inicial**: Goiânia, GO. O app é genérico e funcionará para qualquer cidade, mas a validação inicial será com dados de Goiânia.
- **Motivação**: O usuário precisa gerar renda para custear o casamento. Agilidade na entrega do MVP é prioridade sobre refinamento estético.
- **2026**: Google Places API mudou em Março/2025 (fim do crédito $200, novo modelo per-SKU). O gosom usa scraping via Playwright, não a API oficial, então não é afetado por essas mudanças.
