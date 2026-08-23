# Design — Pipeline Leadmap → Landing Page → Proposta

**Data:** 2026-07-29
**Status:** Aprovado (design), aguardando revisão do spec
**Prazo:** Hoje (29/07) montar o pipeline; amanhã (30/07) rodar 100 LPs para 10 vendas.

---

## 1. Problema e meta

Encontrar negócios locais em Goiânia sem website (ou com site antigo), gerar landing pages validadas
de alta qualidade usando o [Ditto](https://github.com/ion-design/ditto.site) para clonar esqueletos
de LPs já validadas no nicho, aplicar a paleta de cores + copy + avaliações de cada estabelecimento, e
entregar uma proposta comercial acionável para o usuário contatar e fechar a venda.

**Meta numérica:** 100 landing pages geradas → 10 vendas (conversão alvo de 10%) em 2 dias.
**Hoje:** montar o pipeline. **Amanhã:** executar.

## 2. Decisões-chave (resumo)

| # | Decisão | Valor |
|---|---|---|
| 1 | Abordagem | B — pipeline scriptado (determinístico) + LLM só nos julgamentos |
| 2 | Execução | Sequencial, batches de 10, sem paralelismo de 100 |
| 3 | Aprovação | Batch — painel com screenshot + preview link + copy + veredito |
| 4 | Esqueleto LP | Descobrir 1-3 LPs validadas por nicho (setup 1x) |
| 5 | Hosting | VPS + nginx, subdomínio `lp-{slug}.dominio.com` |
| 6 | Ditto | Self-host local com Playwright, sem API key |
| 7 | LLM | Umans API — grátis, serializada (max 4 paralelo, opencode usa 1) |
| 8 | Custo | ~$0 |
| 9 | Customização | **Livre** — LLM lê estrutura de cada template e reescreve por lead (sem schema canônico) |
| 10 | Proposta | HTML (→PDF) + texto WhatsApp/email + link da LP |
| 11 | Skills | Merge das 3 referências numa skill customizada única de design-taste |

## 3. Arquitetura

**Approach B:** um orchestrator determinístico (Node/TypeScript) drive o funil; o LLM é invocado
apenas nos pontos onde código não decide sozinho (verificar leads, julgar sites antigos, gerar copy,
self-review de qualidade). Os passos mecânicos (clonar com Ditto, build, deploy no nginx, screenshot)
são código determinístico entre as chamadas de LLM.

### Componentes

| Componente | Responsabilidade | Onde roda |
|---|---|---|
| **Orchestrator** | Drive o funil, manter estado (SQLite), chamar tudo | Máquina local do usuário |
| **Leadmap API** | Fonte de leads (scraper gosom já existente) | Container Docker `:6901` |
| **Ditto CLI** | Clonar LPs de referência e sites de leads (`npm run clone`) | Local, self-host com Playwright |
| **LLM gateway** | Chamadas à Umans API nos pontos fuzzy (mesma auth/endpoint do opencode) | API externa Umans (GLM 5.2 + Kimi K2.7) |
| **SearXNG** | Meta-search self-hosted: achar se o lead tem site na web | Self-host (instância do usuário) |
| **Firecrawl** | Raspagem de URL → markdown limpo + screenshots para o LLM julgar "site antigo?" | Self-host (github.com/firecrawl/firecrawl) |
| **Playwright** | Screenshots para verify + self-review + painel | Local (vem com Ditto) |
| **nginx** | Hospedar LPs de preview | VPS do usuário (deploy via SSH/rsync) |
| **Painel de aprovação** | Web page simples servida pelo orchestrator | Local `:4000` |
| **Biblioteca de templates** | `templates/{nicho}/` com LPs de referência clonadas | Local |

## 4. O funil (fluxo de dados)

### Setup (1x, hoje)

Para cada um dos 10 nichos (Advocacia, psicologia, nutrição, estética/beleza, odontologia, clínica,
medicina, corretor imobiliário, imobiliária, consultoria):

1. O agente faz web search por landing pages validadas no nicho (mercado brasileiro).
2. Seleciona 1-3 URLs de referência.
3. Ditto clona cada uma → `templates/{nicho}/`.
4. Esses templates são reusados por todos os leads daquele nicho.

### Funil por lead (100 leads, amanhã)

```
1. LEAD DISCOVERY + FETCH
   Para cada nicho, o orchestrator cria um job de scraping no leadmap:
     POST /api/v1/jobs { input: "<query do nicho> em Goiânia", depth: 1 }
     (queries: "advogados em Goiânia", "psicólogos em Goiânia", "dentistas em Goiânia", etc.)
   Poll GET /api/v1/jobs/{id} até status=completed
   GET /api/v1/jobs/{id}/results → leads
   Nicho do lead = herdado da query que o originou (não precisa inferir do category)
   filtro: website=="" (candidato NO_SITE) ou website!="" (candidato OLD_SITE)
           AND ReviewRating >= 4.0 (acima de 4 estrelas)
           AND ReviewCount >= 1 (mínimo para ter provas sociais na LP)
   priorização: ORDER BY ReviewCount DESC (quanto mais reviews, melhor — vai primeiro no funil)
   Dedup: por place_id/data_id entre jobs de nichos diferentes

2. VERIFY (LLM)
   SearXNG busca "{nome} {cidade}" → achou site?
     não  → tag NO_SITE
   sim  → Firecrawl raspa o site (markdown) + Playwright screenshot da home
          → LLM Kimi (visão) julga "antigo?" a partir do screenshot + conteúdo (markdown)
              sim → tag OLD_SITE
              não → tag SKIP (já tem site bom, descarta)

3. GENERATE LP (Ditto determinístico + LLM customize)
   NO_SITE  → cp templates/{nicho}/{selecionado} → work/{slug}  (round-robin entre os templates do nicho)
   OLD_SITE → npm run clone -- {site do lead} --out=work/{slug}
   LLM (GLM 5.2) lê estrutura do projeto + gera copy + reescreve arquivos relevantes
   aplica paleta de cores (extraída de thumbnail/images ou CSS capturado)
   injeta reviews (top 3-5, selecionados por rating DESC preferindo textos longos/descritivos) e imagens do lead
   npm run build → rsync dist/ → VPS → nginx reload
   URL: https://lp-{slug}.dominio.com

4. SELF-REVIEW (LLM Kimi, visão)
   Playwright screenshot da LP deployada
   LLM roda checklist de qualidade (taste-skill: contraste, copy, hero fit, paleta, reviews visíveis)
   → PASS ou FAIL (re-tenta customize 1x se FAIL)

5. BATCH APPROVAL (humano, a cada 10 LPs)
   Painel mostra: screenshot + preview link + copy gerada + veredito do self-review
   Usuário aprova/rejeita

6. PROPOSAL (determinístico)
   Aprovadas → gera HTML (→PDF) + texto WhatsApp/email + link da LP

7. CONTATO (humano)
   Usuário dispara WhatsApp → atualiza estado (won/lost/pending)
```

## 5. Modelo de dados / estado

SQLite (`pipeline.db`), tabela `leads`:

```
id              TEXT PRIMARY KEY   -- slug do lead
leadmap_id      TEXT               -- id no leadmap
name            TEXT
niche           TEXT
phone           TEXT
website_status  TEXT               -- NO_SITE | OLD_SITE | SKIP
verify_screenshot TEXT             -- path do screenshot do site existente (se OLD_SITE)
lp_source       TEXT               -- template_id | own_site
lp_path         TEXT               -- work/{slug}
lp_url          TEXT               -- https://lp-{slug}.dominio.com
self_review     TEXT               -- PASS | FAIL | RETRY
approval_status TEXT               -- PENDING | APPROVED | REJECTED
proposal_html   TEXT               -- path do HTML da proposta
proposal_text   TEXT               -- texto WhatsApp/email
contact_status  TEXT               -- NOT_CONTACTED | SENT | WON | LOST
created_at      TIMESTAMP
updated_at      TIMESTAMP
```

O orchestrator lê essa tabela para saber qual lead está em qual estágio e **retoma de onde parou**
(crash no #47 não perde os 46 feitos).

## 6. Caminho crítico: geração de LP (detalhe)

```
INPUT: 1 lead verificado (NO_SITE ou OLD_SITE) + template do nicho

CLONE (Ditto, ~30-60s)
   NO_SITE  → cp templates/{nicho}/{selecionado} → work/{slug}  (round-robin entre os templates do nicho para variar LPs)
  OLD_SITE → npm run clone -- {site do lead} --out=work/{slug}
  ↓

CUSTOMIZE (LLM GLM 5.2, 1 chamada)
  1. LLM lê arquivos safe-to-edit do projeto gerado (src/app/content.ts, components/)
  2. Gera copy a partir de: reviews + description + category + niche do lead
     - hero headline + subtitle
     - 3 value props
     - CTA
  3. Extrai paleta:
     NO_SITE  → quantização de cor do thumbnail/images[] do Google Maps
     OLD_SITE → lê CSS capturado pelo Ditto
     fallback → LLM infere paleta apropriada ao nicho (parte do passo customize)
  4. Reescreve arquivos:
     - substitui texto (copy gerada)
     - aplica paleta (CSS vars / tailwind config)
     - injeta reviews (top 3-5) em seção de provas sociais
     - troca hero image por thumbnail/images do lead
  ↓

BUILD + DEPLOY (determinístico, ~20s)
  npm run build
  rsync dist/ → VPS:/var/www/lp-{slug}/
  escreve nginx server block (ou location) → nginx -s reload
  URL final: https://lp-{slug}.dominio.com
  ↓

SELF-REVIEW (LLM Kimi K2.7 visão, 1 chamada)
  Playwright screenshot da LP deployada
  LLM roda checklist do taste-skill (contraste, copy, hero fit, paleta consistente, reviews visíveis)
  → PASS | FAIL (se FAIL, re-tenta o CUSTOMIZE 1x com feedback do que falhou)
```

**Decisão de customização:** LIVRE (sem schema canônico). O LLM infere a estrutura de cada
template/clone e reescreve. Justificativa: LLM grátis, setup mais rápido hoje, flexibilidade
maior. Tradeoff: mais frágil para 100 leads, mitigado pelo self-review com retry.

## 7. Roteamento de modelo LLM

| Tarefa | Modelo | Motivo |
|---|---|---|
| Verify: julgar "site antigo?" (screenshot) | `umans-kimi-k2.7` | Visão + raciocínio (pensa antes) |
| Self-review: checklist de qualidade (screenshot) | `umans-kimi-k2.7` | Visão + raciocínio |
| Gerar copy (texto) | `umans-glm-5.2` | 400K contexto, texto forte |
| Web search verify (raciocínio texto) | `umans-glm-5.2` | Raciocínio texto |

Configuração no orchestrator (env vars): `MODEL_VERIFY=umans-kimi-k2.7`,
`MODEL_REVIEW=umans-kimi-k2.7`, `MODEL_COPY=umans-glm-5.2`.

**Serialização:** todas as chamadas LLM são sequenciais (uma por vez). Alinha com batch de 10 e
com o limite de paralelização da Umans (4, sendo 1 já usado pelo opencode).

**Hoje vs amanhã:** Hoje o opencode (GLM 5.2) valida cada passo manualmente durante o build.
Amanhã o script autonomiza chamando a API da Umans direto nos mesmos pontos.

## 8. Aprovação em batch

- A cada 10 LPs prontas (PASS no self-review), o orchestrator pausa e abre o painel em `:4000`.
- Painel mostra por LP: thumbnail screenshot + preview link + copy gerada + veredito do self-review.
- Usuário aprova/rejeita cada uma.
- Aprovadas avançam para PROPOSAL; rejeitadas são marcadas `REJECTED` (não regeneram
  automaticamente — o usuário pode re-disparar manualmente um lead específico se quiser).

## 9. Proposta comercial (etapa 6)

Para cada LP aprovada, o orchestrator gera:

1. **HTML** (em `propostas/{slug}.html`, conversível a PDF via print) contendo:
   - Nome do negócio
   - O que foi construído (resumo da LP)
   - Escopo: LP + domínio + hospedagem + ajustes
   - Preço e prazo (dependência: usuário define tabela de preços durante o build — ver seção 14)
   - Link de preview da LP
2. **Texto de WhatsApp/email** (curto, direto): gancho + link de preview + CTA.
3. **Link da LP** (`https://lp-{slug}.dominio.com`).

## 10. Infraestrutura

- **Orchestrator**: script Node/TypeScript na máquina local do usuário.
- **Ditto**: clone do repo `ion-design/ditto.site`, `npm ci && npx playwright install chromium`,
  invocado via `npm run clone -- <url> --out=<dir>`.
- **SearXNG + Firecrawl**: serviços self-hosted **persistentes** (ficam up durante toda a execução).
  SearXNG responde buscas web; Firecrawl raspagem de URL → markdown + screenshots.
  O orchestrator depende de ambos estarem disponíveis.
- **LLM gateway (Umans)**: o script Node reutiliza **a mesma auth e endpoint do opencode**
  (lê config/credentials do opencode). Modelos conforme seção 7.
- **VPS nginx + Cloudflare**: Cloudflare na frente do domínio (DNS wildcard `*.dominio.com` → VPS IP).
  TLS terminado na Cloudflare (flexível: Cloudflare→VPS em HTTP, ou full com origin cert).
  No VPS, nginx serve `/var/www/lp-{slug}/` na porta 80. Subdomínios `lp-{slug}.dominio.com`.
- **SQLite**: arquivo `pipeline.db` local, sem servidor.
- **Painel**: server HTTP simples no orchestrator (`:4000`).

## 11. Skills

Em vez de instalar 3 skills separadas (taste-skill leonxlnx, emilkowalski, jakubkrehel) que
conflitariam, criar **uma skill customizada única** de design-taste que mergeia o melhor delas:

- Inferência de direção estética do brief (taste-skill)
- Dials de densidade/motion/variância (taste-skill)
- Princípios de polish e micro-interações (emilkowalski)
- Padrões de componente/layout (jakubkrehel)

Usada nos pontos: self-review (checklist de qualidade) e geração de copy (tom e estrutura).
A skill guia o LLM sobre o que constitui uma LP de qualidade e o que evitar (anti-patterns de AI genérico).

## 12. Tratamento de erros

- **Ditto falha ao clonar** (site quebra, timeout): marca lead como `SKIP_CLONE_FAILED`, segue próximo.
- **Build falha**: log do erro, marca `BUILD_FAILED`, retry 1x, se persistir pula.
- **LLM call falha** (rate limit, rede): retry com backoff exponencial (3 tentativas).
- **Self-review FAIL 2x**: marca LP como `REVIEW_FAILED`, vai para batch mesmo assim com flag
  vermelha (usuário decide manualmente).
- **nginx reload falha**: alerta, não bloqueia o funil (LP já está no disco, só faltou ativar).
- **Crash do orchestrator**: estado no SQLite garante retomada. Ao reiniciar, lê `leads` e
  continua de onde cada um parou.

## 13. Testes

Priorizados pelo prazo (hoje é build, amanhã é execução):

1. **Smoke test do funil com 1 lead** (hoje): lead fake ou real → verify → generate → deploy →
   self-review → proposta. Validar que o caminho inteiro funciona ponta a ponta.
2. **Validar templates de 1 nicho** (hoje): descobrir + clonar 1-3 LPs de referência de um nicho,
   confirmar que a customização (LLM reescrever) funciona e o build passa.
3. **Teste de deploy nginx** (hoje): 1 LP deployada, confirmar URL acessível.
4. **Teste do painel de batch** (hoje): 2-3 LPs fake no painel, aprovar/rejeitar.
5. **Não testar**: scraping real do Google Maps (já é do gosom), o banco em unit tests.

## 14. Defaults ajustáveis (confirmar na revisão)

- **Filtro de reviews**: `ReviewRating >= 4.0` (acima de 4 estrelas) AND `ReviewCount >= 1`
  (mínimo para provas sociais). **Priorização por `ReviewCount DESC`** — quanto mais reviews,
  mais cedo o lead entra no funil. Confirmado pelo usuário.
- **10 nichos**: Advocacia, psicologia, nutrição, estética/beleza, odontologia, clínica, medicina,
  corretor imobiliário, imobiliária, consultoria. Lista final confirmada.
- **Tamanho do batch**: 10. Ajustável.
- **Preço na proposta**: **dependência do usuário** — definir valor e estrutura de oferta
  (ex: R$X pela LP + domínio + hospedagem + N ajustes) durante o build hoje. O orchestrator
  injeta esse valor na proposta; não é uma decisão de design.

## 15. Fora de escopo (MVP)

- Disparo automático de WhatsApp em massa (usuário dispara manualmente na etapa 7).
- Persistência multi-usuário / autenticação.
- Enriquecimento de leads com LinkedIn/Instagram.
- WebSocket para atualização em tempo real durante scraping.
- Otimização de SEO das LPs (foco em preview visual para venda, não tráfego orgânico ainda).
