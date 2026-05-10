# LinkScout Roadmap

Este documento descreve as funcionalidades planejadas, em desenvolvimento e correções de bugs para o LinkScout.

## 🚀 Em Breve (Próximas Funcionalidades)

_Nenhuma funcionalidade pendente no momento._

## 🐛 Correções de Bugs

 o botão de ação de "Resolver URLs" na  sidebar não funcionando no macos firefox

## ✅ Concluído Recentemente

- [x] **Resolução de URLs no Firefox (macOS) - Message Port Timeout**: Corrigido problema onde `browser.runtime.sendMessage` expirava durante operações longas de resolução. Implementado padrão fire-and-forget com broadcast `resolveComplete` via `onMessage`.
- [x] **Origem dos Links na Seleção**: Ao salvar links de uma seleção, o link da página de origem é incluído como a primeira entrada para referência.
- [x] **Melhoria no Sistema de Logs**: Logs detalhados com prefixo `[LinkScout 🔍 Resolve]` no console do navegador para a ação de "Resolver URLs".
- [x] **Resolução de URLs no Firefox (macOS)**: Corrigido `collectAllBookmarkNodes` para recursão completa em todas as subpastas + feedback visual no botão resolve.
- [x] Sincronização bidirecional de favoritos.
- [x] Gerenciamento de lixeira com auto-limpeza de 30 dias.
- [x] Atalho de teclado para abrir/fechar sidebar.
- [x] Reorganização automática de pastas baseada em limites de links.
