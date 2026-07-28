# 03 — Mapa com markers

**What to build:** Mapa interativo (MapCN/MapLibre) no lado direito mostrando os leads como pins coloridos. Leads sem website em verde, leads com website em amarelo. Círculo de raio da busca. Popup ao clicar em um marker.

**Blocked by:** 02 — Core search flow

**Status:** ready-for-agent

- [ ] MapCN map component ocupa a área direita da tela
- [ ] Markers para cada lead: 🟢 verde se `hasWebsite === false`, 🟡 amarelo se `hasWebsite === true`
- [ ] Círculo de raio sobreposto no mapa (centro ≈ localização da busca, raio em km)
- [ ] Ao clicar em um marker: popup com nome, telefone, endereço do lead
- [ ] Mapa centraliza e faz zoom automático para cobrir todos os markers
- [ ] Controles de mapa: zoom (+/-), geolocalização
- [ ] Ao importar leads de busca anterior ou nova busca, mapa atualiza markers
- [ ] Integração com o SearchProvider (leads fluem do estado React para o mapa)
