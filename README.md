# 🎯 LeadMap — Radar de Leads do Google Maps

<p align="center">
  <strong>Ferramenta open-source e visual para prospecção de negócios locais no Google Maps com foco em empresas sem website.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-blue?logo=react" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-v4-38B2AC?logo=tailwindcss" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/Vite-8-646CFF?logo=vite" alt="Vite" />
  <img src="https://img.shields.io/badge/MapLibre_GL-Free_Maps-blueviolet?logo=maplibre" alt="MapLibre GL" />
  <img src="https://img.shields.io/badge/Go-Scraper-00ADD8?logo=go" alt="Go Scraper" />
  <img src="https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker" alt="Docker" />
</p>

---

## 💡 Sobre o Projeto

O **LeadMap (Radar de Leads)** foi desenvolvido para freelancers, desenvolvedores, agências e consultores que buscam oportunidades de prospecção ativa no mercado local. 

Muitos estabelecimentos comerciais cadastrados no Google Maps **não possuem website** ou presença digital estruturada. O LeadMap automatiza a extração desses dados, filtra instantaneamente os estabelecimentos que carecem de site e plota tudo em um mapa interativo com atalhos de contato direto via WhatsApp.

---

## ✨ Funcionalidades Principais

- 🗺️ **Mapa Interativo em Tempo Real**: Plotagem de leads geolocalizados utilizando MapLibre GL com mapa base CARTO (100% gratuito, sem necessidade de chaves de API pagas do Google Maps).
- 🟢🟡 **Destaque Visual Inteligente**:
  - 🟢 **Verde**: Estabelecimentos **sem website** (alta prioridade para prospecção).
  - 🟡 **Amarelo**: Estabelecimentos **com website**.
- ⚡ **Modos de Busca Flexíveis**:
  - **Modo Rápido**: Varredura ágil diretamente pelo viewport do mapa.
  - **Modo Detalhado**: Visita cada perfil no Google Maps para extrair horários de funcionamento, telefone, redes sociais e primeiras avaliações de clientes.
  - **Busca em Grade (Grid Search)**: Divide a área selecionada em células geométricas menores para cobrir 100% da região sem perder leads por limite de paginação.
- 💬 **Ações Imediatas de Contato**:
  - Botão de atalho direto para **WhatsApp** (`wa.me`) com o telefone pré-formatado.
  - Link direto para o website (quando houver).
  - Modal com informações completas (endereço, categoria, avaliações, nota média).
- 📊 **Painel de Métricas**: Contagem em tempo real de total de leads encontrados e porcentagem sem site.
- 🕒 **Histórico de Buscas**: Armazena as consultas anteriores, permitindo recarregar os dados no mapa com 1 clique ou limpar o histórico.
- 📥 **Exportação em CSV**: Exporte todos os leads capturados para planilhas ou sistemas de CRM.
- 📱 **Interface Responsiva**: Visualização em painel lateral, lista/cards ou mapa em tela cheia com suporte a dispositivos móveis.

---

## 🏗️ Arquitetura do Sistema

O projeto é estruturado em microsserviços via **Docker Compose**:

```
 ┌──────────────────────────────────────────────────────────┐
 │                  Navegador do Usuário                    │
 └────────────────────────────┬─────────────────────────────┘
                              │ HTTP / WebSocket (:6900)
                              ▼
 ┌──────────────────────────────────────────────────────────┐
 │         Frontend (React 19 + Vite + MapLibre GL)         │
 │                  Container: app (:6900)                  │
 └────────────────────────────┬─────────────────────────────┘
                              │ Proxy / REST API (:6901)
                              ▼
 ┌──────────────────────────────────────────────────────────┐
 │        Scraper Service (Go + Playwright / Chromium)      │
 │                Container: scraper (:6901)                │
 └──────────────────────────────────────────────────────────┘
```

- **`app`**: Single Page Application construída com React 19, Tailwind CSS v4, componentes Radix UI e MapLibre GL.
- **`scraper`**: Serviço backend em Go de alta performance (`google-maps-scraper`) que gerencia instâncias headless do Chromium via Playwright, processa filas de jobs e expõe REST APIs e WebSockets.

---

## 🚀 Como Executar

### 📋 Pré-requisitos

- [Docker](https://www.docker.com/) e [Docker Compose](https://docs.docker.com/compose/) instalados.

### 🐳 Executando com Docker Compose (Recomendado)

1. Clone o repositório:
   ```bash
   git clone https://github.com/fatzin/leadmap.git
   cd leadmap
   ```

2. Suba os containers com Docker Compose:
   ```bash
   docker compose up --build
   ```

3. Acesse a aplicação no seu navegador:
   - **Frontend**: [http://localhost:6900](http://localhost:6900)
   - **Scraper API**: [http://localhost:6901](http://localhost:6901)

---

### 💻 Desenvolvimento Local (Sem Docker para o Frontend)

Caso queira rodar o frontend localmente em modo desenvolvimento:

1. Inicie o scraper (via Docker ou binário Go):
   ```bash
   docker compose up scraper
   ```

2. Em outro terminal, acesse a pasta `app`, instale as dependências e inicie o Vite:
   ```bash
   cd app
   npm install
   npm run dev
   ```

3. Abra [http://localhost:6900](http://localhost:6900).

---

## 🔍 Script de Busca em Grade CLI (`grid-search.sh`)

Para extrações massivas em lote via linha de comando:

```bash
chmod +x ./grid-search.sh
./grid-search.sh "<palavra-chave>" <latitude> <longitude> <raio_km>
```

**Exemplo:**
```bash
./grid-search.sh "advocacia" -16.6816 -49.2554 8
```

O script calcula o bounding box geográfico, divide a área em células de 2km e gera um arquivo CSV completo com todos os leads minerados.

---

## 🛠️ Tecnologias Utilizadas

- **Frontend**:
  - [React 19](https://react.dev/)
  - [TypeScript](https://www.typescriptlang.org/)
  - [Vite](https://vitejs.dev/)
  - [Tailwind CSS v4](https://tailwindcss.com/)
  - [MapLibre GL](https://maplibre.org/)
  - [Radix UI](https://www.radix-ui.com/)
  - [Lucide React](https://lucide.dev/)
  - [PapaParse](https://www.papaparse.com/)
- **Scraper & Infra**:
  - [Go (Golang)](https://go.dev/)
  - [Playwright](https://playwright.dev/)
  - [Docker & Docker Compose](https://www.docker.com/)

---

## 📄 Licença

Distribuído sob a licença MIT. Consulte `LICENSE` para obter mais informações.
