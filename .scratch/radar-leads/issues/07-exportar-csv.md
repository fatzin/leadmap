# 07 — Exportar CSV

**What to build:** Botão de exportação que gera e baixa um arquivo CSV com todos os leads da busca atual. Colunas: nome, telefone, endereço, website, rating, categoria, coordenadas.

**Blocked by:** 05 — Stats panel

**Status:** ready-for-agent

- [ ] Botão "Exportar CSV" no painel de estatísticas
- [ ] Geração do CSV no frontend (sem backend)
- [ ] Colunas: title, category, phone, website, address, latitude, longitude, review_rating, review_count, has_website
- [ ] Trigger automático de download (blob + link click)
- [ ] Nome do arquivo: `radar-leads-{query}-{data}.csv`
- [ ] Encoding UTF-8 com BOM para acentos portugueses aparecerem corretamente no Excel
- [ ] Indicador de sucesso após download (toast/notificação)
