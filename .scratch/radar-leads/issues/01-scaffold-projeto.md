# 01 — Scaffold do projeto

**What to build:** Estrutura completa do projeto para que um `docker compose up` inicie os 3 containers (app, scraper, db) e o frontend React seja acessível no navegador.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `docker-compose.yml` com 3 services: `app`, `scraper`, `db`
- [ ] `Dockerfile` para o container `app` (multi-stage: dev com Vite, prod com nginx)
- [ ] Projeto React + Vite + TypeScript criado (via `npm create vite@latest`)
- [ ] Tailwind CSS + shadcn/ui instalados e configurados
- [ ] MapCN (`@mapcn/map`) instalado
- [ ] SQL de init do PostgreSQL em `db/init.sql` (tabelas `leads` e `search_queries`)
- [ ] `.gitignore` atualizado
- [ ] `docker compose up` sobe tudo e `localhost:3000` mostra página React em branco
