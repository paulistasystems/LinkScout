# 🗺️ LinkScout Roadmap

Este documento detalha o planejamento de evolução do LinkScout, incluindo novas funcionalidades, melhorias de UX e correções críticas.

---

## 🛠️ Próximos Passos (Curto Prazo)

### 🌓 Suporte a Temas (Dark/Light)
- [ ] Implementar detecção automática de tema do sistema.
- [ ] Adicionar alternador manual de tema nas opções.
- [ ] Refinar paleta de cores para o modo claro.

### 📤 Exportação e Backup
- [ ] Funcionalidade para exportar favoritos salvos em formato JSON ou CSV.
- [ ] Backup automático de configurações via `browser.storage.sync`.

### 🔍 Melhorias na Busca e Filtros
- [ ] Busca avançada por domínio ou data.
- [ ] Filtro para mostrar apenas links "não resolvidos" ou "com erro".

---

## 🚀 Planejado (Médio Prazo)

### 🏷️ Sistema de Tags
- [ ] Permitir adicionar tags personalizadas aos links no momento de salvar.
- [ ] Filtragem por tags na sidebar.

### 🖱️ Drag & Drop na Sidebar
- [ ] Reorganização manual de links entre pastas via arrastar e soltar.
- [ ] Mover pastas inteiras para novos níveis hierárquicos.

### 📊 Estatísticas de Uso
- [ ] Painel simples mostrando total de links salvos, domínios mais frequentes e economia de tempo estimada.

---

## 🔮 Visão de Futuro (Longo Prazo)

- [ ] **Integração Cloud**: Sincronização com serviços externos (Pocket, Wallabag).
- [ ] **Reader View Preview**: Prévia do conteúdo do link diretamente na sidebar.
- [ ] **AI Categorization**: Categorização automática de links usando IA local (WebLLM).

---

## 🐛 Correções e Manutenção Contínua

- [ ] Monitoramento de performance para coleções com > 10.000 links.
- [ ] Ajustes de compatibilidade para novas versões do Firefox e Chrome.
- [ ] Refatoração modular do `background.js` para melhor legibilidade.

---

## ✅ Concluído Recentemente

- [x] **Resolução automática na seleção (macOS Firefox)**: Links de seleção agora são salvos imediatamente (`skipResolve`) e a resolução de URLs é disparada em background.
- [x] **Botão "Resolver URLs" na sidebar**: Correção de travamentos e feedback visual em tempo real.
- [x] **Origem dos Links na Seleção**: Prepend da URL de origem ao salvar múltiplas seleções.
- [x] **Sistema de Logs**: Implementação de logs estruturados para debug remoto.
- [x] **Gestão de Lixeira**: Auto-limpeza após 30 dias e movimentação automática ao abrir.
- [x] **Atalho de Teclado**: `Cmd+Shift+U` para abrir/fechar sidebar rapidamente.
- [x] **Resolução de URLs no Firefox (macOS) - Message Port Timeout**: Corrigido problema onde `browser.runtime.sendMessage` expirava durante operações longas de resolução.
- [x] **Sincronização bidirecional**: favoritos sincronizados entre IndexedDB e Browser Bookmarks.
