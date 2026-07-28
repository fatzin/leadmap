# 06 — Histórico de buscas

**What to build:** Seção de histórico na sidebar listando buscas anteriores. Cada item mostra query + raio + timestamp. Clique recarrega os resultados no mapa e na lista. Persistido em localStorage (no MVP, sem backend).

**Blocked by:** 02 — Core search flow

**Status:** ready-for-agent

- [ ] Seção "Histórico" na sidebar com lista de buscas anteriores
- [ ] Cada item: query ("padarias em Goiânia"), raio ("20 km"), timestamp relativo ("há 2h")
- [ ] Ao clicar em um item do histórico: reexecuta a busca (cria novo job no gosom)
- [ ] Persistência em localStorage (sobrevive a refresh, persiste entre sessões)
- [ ] Limite de 20 itens no histórico (FIFO — remove o mais antigo ao adicionar novo)
- [ ] Botão "Limpar histórico"
- [ ] Se a busca atual já está no histórico (mesma query + raio): atualiza o timestamp em vez de duplicar
