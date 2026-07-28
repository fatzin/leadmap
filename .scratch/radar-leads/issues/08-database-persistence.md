# 08 — Persistência em PostgreSQL

**What to build:** Migrar histórico de buscas (e opcionalmente leads) de localStorage para PostgreSQL. Adiciona um pequeno backend API (Express/Go ou até script Node) que faz CRUD nas tabelas `leads` e `search_queries`. O frontend passa a ler/escrever do banco via esse backend.

**Blocked by:** 06 — Histórico de buscas

**Status:** ready-for-agent

- [ ] Decidir stack do backend: minimal Go server ou Express (4º container ou expandir container app)
- [ ] Endpoints REST:
  - `POST /api/search-queries` — salvar nova busca
  - `GET /api/search-queries` — listar histórico
  - `DELETE /api/search-queries/:id` — remover busca
  - `POST /api/leads` — salvar leads de uma busca
  - `GET /api/leads?searchQueryId=X` — listar leads de uma busca
- [ ] Frontend substitui localStorage por chamadas ao backend API
- [ ] Schema já criado no ticket 01 (garantir que está correto)
- [ ] Migração: dados existentes no localStorage são importados para o banco na primeira carga
- [ ] `docker-compose.yml` atualizado se necessário (dependências, networks)
