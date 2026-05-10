# LinkScout Roadmap

Este documento descreve as funcionalidades planejadas, em desenvolvimento e correções de bugs para o LinkScout.

## 🚀 Em Breve (Próximas Funcionalidades)


 

## 🐛 Correções de Bugs



## ✅ Concluído Recentemente

- [x] **Resolução automática na seleção (macOS Firefox)**: Links de seleção agora são salvos imediatamente (`skipResolve`) e a resolução de URLs é disparada em background de forma assíncrona. Elimina bloqueio de até 15s por link.
- [x] **Botão "Resolver URLs" na sidebar (macOS Firefox)**: Adicionado `.catch()` nas cadeias fire-and-forget para que a sidebar sempre receba `resolveComplete` — mesmo em caso de erro. Botão não fica mais travado em "resolving". Adicionado try-catch em `collectAllBookmarkNodes` e safety net global em `resolveUrl`.
- [x] **Resolução de URLs no Firefox (macOS) - Message Port Timeout**: Corrigido problema onde `browser.runtime.sendMessage` expirava durante operações longas de resolução. Implementado padrão fire-and-forget com broadcast `resolveComplete` via `onMessage`.
- [x] **Origem dos Links na Seleção**: Ao salvar links de uma seleção, o link da página de origem é incluído como a primeira entrada para referência.
- [x] **Melhoria no Sistema de Logs**: Logs detalhados com prefixo `[LinkScout 🔍 Resolve]` no console do navegador para a ação de "Resolver URLs".
- [x] **Resolução de URLs no Firefox (macOS)**: Corrigido `collectAllBookmarkNodes` para recursão completa em todas as subpastas + feedback visual no botão resolve.
- [x] Sincronização bidirecional de favoritos.
- [x] Gerenciamento de lixeira com auto-limpeza de 30 dias.
- [x] Atalho de teclado para abrir/fechar sidebar.
- [x] Reorganização automática de pastas baseada em limites de links.
