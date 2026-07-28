# 02 — Core search flow (scraper → leads)

**What to build:** Fluxo completo de busca: usuário digita query + raio, clica "Buscar", scraper roda em background, resultados aparecem como uma lista minimamente estilizada na sidebar. Sem mapa, sem ações — só o ciclo funcional com feedback visual.

**Blocked by:** 01 — Scaffold do projeto

**Status:** ready-for-agent

- [ ] Sidebar com SearchForm: campo de texto livre para query, slider de raio (km), botão "Buscar leads sem site"
- [ ] Ao clicar "Buscar": POST para gosom API (`/api/v1/jobs`), recebe job ID
- [ ] Polling a cada 3s (`GET /api/v1/jobs/{id}`) até status `completed`
- [ ] Indicador visual de carregamento (spinner/skeleton) enquanto o scraper roda
- [ ] Quando completo: baixa CSV (`GET /api/v1/jobs/{id}/download`) e faz parse no frontend
- [ ] Lista de resultados na sidebar: cards simples com nome, telefone, endereço do lead — sem JSON puro
- [ ] Estado de "nenhum resultado encontrado" com mensagem amigável
- [ ] Estado de erro (scraper falhou, rede, etc.) com mensagem e opção de tentar novamente
- [ ] Layout: sidebar (esquerda) + área vazia direita (reservada para o mapa no ticket 03)
