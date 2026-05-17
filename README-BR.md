# LinkScout

Uma extensão Firefox que salva links de texto selecionado como favoritos com organização inteligente.

## Resumo (para Firefox AMO - máximo 250 caracteres)

Salve links de texto selecionado como favoritos com organização inteligente. Extraia múltiplos links de uma vez, salve links individuais ou salve todas as abas. Organização automática de pastas e detecção de duplicatas.

## Descrição (para Firefox AMO - suporta markdown)

LinkScout facilita salvar e organizar links de qualquer página da web. Quer você esteja pesquisando, coletando recursos ou apenas queira salvar links interessantes para depois, LinkScout cobre tudo.

**Múltiplas formas de salvar:**
- **Salvar links de seleção de texto** - Selecione texto contendo links e salve-os todos de uma vez
- **Salvar links individuais** - Clique com botão direito diretamente em qualquer link para salvá-lo
- **Salvar todas as abas** - Salve e feche todas as abas abertas com um único clique

**Organização inteligente:**
- Links são automaticamente organizados em pastas baseadas no título da página
- Detecção de duplicatas evita salvar o mesmo link duas vezes seguindo redirecionamentos (ex: bit.ly -> site original)
- Deduplicação em background de favoritos existentes para manter sua coleção limpa
- Opção para mostrar links/pastas mais novos no topo

## Funcionalidades

- 🔗 **Salvar Links da Seleção** - Extraia e salve todos os links do texto selecionado
- 🔗 **Salvar Link Individual** - Clique com botão direito em qualquer link para salvá-lo diretamente
- 📑 **Salvar e Fechar Todas as Abas** - Salve todas as abas abertas e feche-as (cria uma pasta de sessão)
- 🔍 **Pesquisar e Ordenar** - Pesquisa em tempo real e ordem configurável (Mais novos/Mais antigos) na Barra Lateral
- 🗂️ **Gerenciador de Barra Lateral** - Visualize, abra e gerencie favoritos. Inclui atalho de teclado (Ctrl+Shift+U / Cmd+Shift+U), expandir/recolher tudo, abrir tudo em abas + auto-exclusão ao abrir
- 🔄 **Sincronização Bidirecional** - Favoritos totalmente sincronizados entre o navegador e IndexedDB, tratando automaticamente exclusões e itens adicionados via Firefox Sync
- 📁 **Organização Inteligente** - Links salvos em `LinkScout / [Título da Página] / [Link]`
- 📂 **Subpastas Automáticas** - Ao salvar mais de X links, cria automaticamente subpastas numeradas (ex: 1-10, 11-20)
- 🔄 **Detecção de Duplicatas** - Detecta e ignora automaticamente links duplicados globalmente usando IndexedDB. Resolve redirecionamentos (seguindo links `bit.ly` ou `t.co` para seu destino final) e normaliza URLs removendo parâmetros de rastreamento
- 🧹 **Deduplicação em Background** - Limpa automaticamente favoritos duplicados existentes em background na inicialização sem bloquear o navegador
- ⚡ **UI em Tempo Real** - Árvore de barra lateral atualiza instantaneamente via manipulação DOM quando links são adicionados ou removidos, sem recarregar a página ou deslocar o layout
- 🗑️ **Gerenciamento de Lixeira** - Links abertos movem para Lixeira automaticamente. Lixeira auto-limpa após 30 dias
- ⚙️ **Configurável** - Escolha local do favorito, nome da pasta e mais

## Instruções de Build

### Requisitos do Sistema

- **Sistema Operacional**: macOS, Linux ou Windows
- **Ferramentas Necessárias**: utilitário `zip` de linha de comando (pré-instalado no macOS e Linux)

### Construindo a Extensão

1. **Clone ou baixe o código-fonte**
   ```bash
   git clone https://github.com/paulistasystems/LinkScout.git
   cd LinkScout
   ```

2. **Crie o arquivo zip**
   ```bash
   zip -r LinkScout-v2.7.17.zip manifest.json background.js content.js options.html options.js sidebar/ icons/ -x "*.DS_Store"
   ```

3. **Saída**
   - Isso cria `LinkScout-v2.7.17.zip` no diretório raiz do projeto.

### Estrutura do Projeto

```
LinkScout/
├── manifest.json      # Manifesto da extensão (Manifest V2)
├── background.js      # Script em background para menu de contexto e lógica de favoritos
├── content.js         # Script de conteúdo para extrair links de seleções
├── options.html       # HTML da página de opções
├── options.js         # JavaScript da página de opções
├── icons/
│   └── linkscout-48.svg   # Ícone da extensão
└── README.md          # Este arquivo
```

### Sem Dependências de Build

Esta extensão é escrita em JavaScript puro sem dependências externas ou ferramentas de build necessárias. O código-fonte é o código final - nenhuma transpilação, empacotamento ou compilação é necessária.

## Instalação para Desenvolvimento

### Carregar a Extensão no Firefox

1. **Abra o Firefox**
2. **Digite na barra de endereços:** `about:debugging#/runtime/this-firefox`
3. **Clique em "Carregar Add-on Temporário..."**
4. **Navegue para a pasta** contendo os arquivos da extensão.
5. **Selecione o arquivo** `manifest.json`.
6. A extensão será carregada temporariamente.

### Depuração

**Ver logs da extensão:**
- Abra o Console do Navegador: `Ctrl+Shift+J` (Windows/Linux) ou `Cmd+Shift+J` (Mac).

**Recarregar após mudanças:**
1. Volte para `about:debugging#/runtime/this-firefox`.
2. Clique em **"Recarregar"** ao lado da extensão LinkScout.
3. Ou pressione `Ctrl+R` na página de depuração.

## Uso

### Salvar Links da Seleção
1. Selecione texto contendo links em qualquer página da web
2. Clique com botão direito para abrir o menu de contexto
3. Clique em "🔗 LinkScout: Salvar Links da Seleção"

### Salvar um Link Individual
1. Clique com botão direito diretamente em qualquer link
2. Clique em "🔗 LinkScout: Salvar Este Link"

### Salvar Todas as Abas
1. Clique com botão direito em qualquer aba ou página
2. Clique em "🔗 LinkScout: Salvar e Fechar Todas as Abas"
3. Todas as abas são salvas e fechadas, uma nova aba em branco é criada

### Gerenciador de Barra Lateral
1. Clique no ícone do LinkScout na barra de ferramentas ou barra lateral (ou pressione **Ctrl+Shift+U** / **Cmd+Shift+U**)
2. **Navegue**: Expanda/recolha pastas para ver favoritos
3. **Abrir e Lixeira**: Clique em qualquer favorito para abri-lo em uma nova aba e movê-lo automaticamente para a pasta "🗑️ Lixeira"
4. **Abrir Tudo**: Clique em "🚀 Abrir tudo" em uma pasta para abrir todos os favoritos em abas e movê-los para a lixeira
5. **Gerenciar Lixeira**: Veja itens descartados e esvazie a lixeira manualmente (itens são auto-excluídos após 30 dias)
6. **Barra de Ferramentas**: Use ➖ para recolher tudo, ➕ para expandir tudo, e 🔄 para atualizar a visualização

## Configuração

Acesse as opções da extensão para configurar:
- **Local do Favorito**: Barra de Ferramentas, Menu ou Outros Favoritos
- **Nome da Pasta Raiz**: Padrão é "LinkScout"
- **Links por Pasta**: Máximo de links por pasta antes de criar subpastas (padrão: 10). Quando alterado, pastas existentes são reorganizadas automaticamente.

> **Nota:**
> - Detecção de duplicatas está sempre ativa. Links são armazenados em um banco de dados IndexedDB, e qualquer tentativa de salvar um link duplicado é automaticamente ignorada.
> - Links mais novos são sempre exibidos no topo.
> - Títulos de favoritos existentes são preservados se uma URL duplicada for encontrada.

## Licença

Licença MIT
