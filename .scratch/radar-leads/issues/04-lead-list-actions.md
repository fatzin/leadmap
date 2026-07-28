# 04 — Lead list + actions

**What to build:** Lista de leads na sidebar com cards enriquecidos e botões de ação. WhatsApp (abre wa.me), Abrir site (se tiver), Ver detalhes (modal/popup com informações completas). ViewTabs para alternar entre visualização Mapa e Lista.

**Blocked by:** 02 — Core search flow

**Status:** ready-for-agent

- [ ] LeadCard estilizado com: nome, categoria, telefone, endereço, indicador visual de "sem site" vs "com site"
- [ ] Botão WhatsApp: abre `https://wa.me/55XX...` com número do lead
- [ ] Botão "Abrir site": abre website do lead em nova aba (desabilitado se não tiver site)
- [ ] Modal/popup de detalhes: nome, telefone, endereço completo, website, rating, reviews, categoria
- [ ] ViewTabs: abas "Mapa" e "Lista" — em "Lista", a área do mapa é substituída por uma visualização ampliada da lista (modo kanban/painel)
- [ ] Scroll infinito ou paginação na lista se houver muitos leads
- [ ] Ordenação: dropdown para ordenar leads por relevância, distância, rating
