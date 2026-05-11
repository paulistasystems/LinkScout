# 🗺️ LinkScout Roadmap

Este documento detalha o planejamento de evolução do LinkScout, incluindo novas funcionalidades, melhorias de UX e correções críticas.

---

## 🛠️ Próximos Passos (Curto Prazo)


### 🔍 Melhorias na Busca e Filtros
- [ ] Filtro para mostrar apenas links "não resolvidos" ou "com erro".

---

## 🚀 Planejado (Médio Prazo)


### 🖱️ Drag & Drop na Sidebar
- [ ] Reorganização manual de links entre pastas via arrastar e soltar.
- [ ] Mover pastas inteiras para novos níveis hierárquicos.

---

## 🔮 Visão de Futuro (Longo Prazo)

---

## 🐛 Correções e Manutenção Contínua

### 🐞 Correções Críticas

### ⚙️ Melhorias e Manutenção
- [ ] Monitoramento de performance para coleções com > 10.000 links.
- [ ] Refatoração modular do `background.js` para melhor legibilidade.

---

## ✅ Concluído Recentemente

- [x] **Origem dos Links (botão Salvar Link)**: Corrigido bug onde a URL de origem nunca era salva ao usar "Salvar Este Link" ou "Salvar Links da Seleção". A causa era a verificação global de duplicatas no IndexedDB, que rejeitava a origem se já existisse em qualquer pasta. Agora a origem é tratada separadamente: salva diretamente na pasta de destino com verificação de duplicatas apenas no nível da pasta, garantindo que a referência de origem esteja sempre presente.

- [x] **Lista de Exclusão de Domínios**: Implementada opção para excluir domínios da resolução automática de URLs. Domínios podem ser adicionados pelo botão 🚫 nos bookmarks da sidebar ou manualmente pela página de Preferências. A lista pode ser consultada e gerenciada (adicionar/remover) nas Preferências. Domínios excluídos são ignorados pelo `resolveUrl()` e pelas funções de resolução em lote.
- [x] **Resolução de URLs (sidebar — casos específicos)**: Corrigidos 3 bugs na pipeline de resolução: (1) Phantom tab agora é ativada brevemente para permitir execução de JS redirects (Google News, etc.), (2) URLs do Facebook/Messenger sem parâmetro de redirect não são mais enviadas ao phantom tab (evita timeout de 15s em páginas de login), (3) Extração estática do Google News expandida para `/rss/articles/`, parâmetro `?url=` e redirect de consent.
- [x] **Resolução de URLs (sidebar)**: Corrigidos 3 problemas que impediam a resolução completa de todos os links: (1) guard de concorrência com contador em vez de booleano para suportar resoluções simultâneas, (2) falhas silenciosas agora reportadas como erros em vez de "sem alteração", (3) busca automática de título da página após resolução via `fetchPageTitle()`.
- [x] **Origem dos Links (Firefox macOS)**: Corrigida captura da URL de origem para "Salvar Este Link" (nunca era capturada) e "Salvar Links da Seleção". Extraída lógica para helper `getOriginUrl()` com 4 fallbacks robustos (`info.pageUrl` → `tab.url` → `tabs.get()` → `tabs.query()`).
- [x] **Resolução de URLs em lote**: Corrigido bug onde apenas o primeiro link da pasta era processado. Adicionado flag de supressão de sync, rate-limiting entre resoluções, preservação de títulos e sincronização do IndexedDB após cada resolução.
- [x] **Resolução automática na seleção (macOS Firefox)**: Links de seleção agora são salvos imediatamente (`skipResolve`) e a resolução de URLs é disparada em background.
- [x] **Botão "Resolver URLs" na sidebar**: Correção de travamentos e feedback visual em tempo real.
- [x] **Origem dos Links na Seleção**: Prepend da URL de origem ao salvar múltiplas seleções.
- [x] **Sistema de Logs**: Implementação de logs estruturados para debug remoto.
- [x] **Gestão de Lixeira**: Auto-limpeza após 30 dias e movimentação automática ao abrir.
- [x] **Atalho de Teclado**: `Cmd+Shift+U` para abrir/fechar sidebar rapidamente.
- [x] **Resolução de URLs no Firefox (macOS) - Message Port Timeout**: Corrigido problema onde `browser.runtime.sendMessage` expirava durante operações longas de resolução.
- [x] **Sincronização bidirecional**: favoritos sincronizados entre IndexedDB e Browser Bookmarks.
