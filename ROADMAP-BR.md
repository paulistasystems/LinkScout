# 🗺️ LinkScout Roadmap

Este documento detalha o planejamento de evolução do LinkScout, incluindo novas funcionalidades, melhorias de UX e correções críticas.

---

## 🛠️ Próximos Passos (Curto Prazo)

### 🔍 Melhorias na Busca e Filtros
- [x] Filtro para mostrar apenas links "não resolvidos" ou "com erro".

---

## 🚀 Planejado (Médio Prazo)

### 🖱️ Drag & Drop na Sidebar
- [ ] Reorganização manual de links entre pastas via arrastar e soltar.
- [ ] Mover pastas inteiras para novos níveis hierárquicos.

---

## 🔮 Visão de Futuro (Longo Prazo)

---

## 🐛 Correções e Manut'enção Contínua

### 🐞 Correções Críticas
- Botão de resolver URLs não está resolvendo links duplicados. Quando a resolução de URL gera um link que já existe na pasta, o link deve ser descartado em vez de permanecer sem resolver.

### ⚙️ Melhorias e Manutenção
- [ ] Monitoramento de performance para coleções com > 10.000 links.
- [ ] Refatoração modular do `background.js` para melhor legibilidade.

---

## ✅ Concluído Recentemente
- [x] **Filtro de Status na Sidebar**: Adicionado botão de filtro ⚡ no header da sidebar para filtrar bookmarks por status de link: Todos, Não Resolvidos (URLs de redirecionamento como t.co, bit.ly) ou Erro (resolução falhou). Indicadores visuais: borda esquerda laranja para não resolvidos, vermelha para erros. Script de background enriquece a árvore de bookmarks com `redirectResolved` e `originalUrl` do IndexedDB.
- [x] **Resolução de URLs do Google News (sidebar)**: Corrigido bug onde o botão de resolver links da sidebar não funcionava para links legados do Google News. A causa raiz era que `ensureMigratedSettings()` removeu `news.google.com` de `aggregatorDomains` (tratando-a como um "redirecionador puro" que resolve via HEAD), mas Google News usa redirecionamentos JavaScript que apenas a Phantom Tab consegue seguir. A correção: (1) removeu `news.google.com` da lista de limpeza `pureRedirects`, (2) adicionou `news.google.com` à lista padrão `aggregatorDomains`, (3) adicionou uma migração para restaurar `news.google.com` para usuários existentes que a tiveram removida pela limpeza anterior.
- [x] **Resolução de URLs do Facebook (sidebar)**: Corrigido bug onde o botão de resolver links da sidebar não funcionava para URLs do Facebook/Messenger. O problema era que URLs do Facebook com redirecionamento via JavaScript (não HTTP 3xx) caíam no caminho HEAD/GET, que não consegue seguir redirects JS. Agora todas as URLs do Facebook/Messenger são roteadas para a Phantom Tab (que está autenticada no navegador do usuário). Também adicionada uma rede de segurança contra resolução incorreta para páginas de login/autenticação.
- [x] **Origem dos Links (botão Salvar Link)**: Corrigido bug onde a URL de origem nunca era salva ao usar "Salvar Este Link" ou "Salvar Links da Seleção". A causa era uma verificação global de duplicatas no IndexedDB que rejeitava a origem se já existisse em qualquer pasta. Agora a origem é tratada separadamente: salva diretamente na pasta de destino com verificação de duplicatas apenas no nível da pasta, garantindo que a referência de origem esteja sempre presente.
- [x] **Lista de Exclusão de Domínios**: Implementada opção para excluir domínios da resolução automática de URLs. Domínios podem ser adicionados via botão 🚫 nos bookmarks da sidebar ou manualmente pela página de Preferências. A lista pode ser consultada e gerenciada (adicionar/remover) nas Preferências. Domínios excluídos são ignorados por `resolveUrl()` e funções de resolução em lote.
- [x] **Resolução de URLs (sidebar — casos específicos)**: Corrigidos 3 bugs na pipeline de resolução: (1) Phantom tab agora é brevemente ativada para permitir execução de JS redirects (Google News, etc.), (2) URLs do Facebook/Messenger sem parâmetro de redirect não são mais enviadas ao phantom tab (evita timeout de 15s em páginas de login), (3) Extração estática do Google News expandida para `/rss/articles/`, parâmetro `?url=` e redirect de consent.
- [x] **Resolução de URLs (sidebar)**: Corrigidos 3 problemas que impediam a resolução completa de todos os links: (1) guard de concorrência com contador em vez de booleano para suportar resoluções simultâneas, (2) falhas silenciosas agora reportadas como erros em vez de "sem alteração", (3) busca automática de título da página após resolução via `fetchPageTitle()`.
- [x] **Origem dos Links (Firefox macOS)**: Corrigida captura da URL de origem para "Salvar Este Link" (nunca era capturada) e "Salvar Links da Seleção". Extraída lógica para helper `getOriginUrl()` com 4 fallbacks robustos (`info.pageUrl` → `tab.url` → `tabs.get()` → `tabs.query()`).
- [x] **Resolução de URLs em Lote**: Corrigido bug onde apenas o primeiro link da pasta era processado. Adicionado flag de supressão de sync, rate-limiting entre resoluções, preservação de títulos e sincronização do IndexedDB após cada resolução.
- [x] **Resolução Automática na Seleção (macOS Firefox)**: Links de seleção agora são salvos imediatamente (`skipResolve`) e a resolução de URLs é disparada em background.
- [x] **Botão "Resolver URLs" na Sidebar**: Correção de travamentos e feedback visual em tempo real.
- [x] **Origem dos Links na Seleção**: Prepend da URL de origem ao salvar múltiplas seleções.
- [x] **Sistema de Logs**: Implementação de logs estruturados para debug remoto.
- [x] **Gestão de Lixeira**: Auto-limpeza após 30 dias e movimentação automática ao abrir.
- [x] **Atalho de Teclado**: `Cmd+Shift+U` para abrir/fechar sidebar rapidamente.
- [x] **Resolução de URLs no Firefox (macOS) - Message Port Timeout**: Corrigido problema onde `browser.runtime.sendMessage` expirava durante operações longas de resolução.
- [x] **Sincronização Bidirecional**: Favoritos sincronizados entre IndexedDB e Browser Bookmarks.
