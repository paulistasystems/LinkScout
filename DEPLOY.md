# Guia de Deploy - LinkScout

Este documento detalha o processo manual para preparar e publicar uma nova versão da extensão LinkScout.

## Pré-requisitos
- Certifique-se de que todas as alterações foram testadas localmente.
- Tenha o comando `zip` instalado no terminal (padrão no macOS).

## Processo de Deploy

### 1. Incrementar a Versão
Edite o arquivo [manifest.json](file:///Users/paulista/LinkScout/manifest.json) e atualize o campo `"version"` seguindo o versionamento semântico (Ex: `2.7.20` -> `2.7.21`).

### 2. Gerar o Pacote da Extensão
Crie um arquivo ZIP contendo apenas os arquivos necessários para a extensão, nomeando-o de acordo com a versão definida no manifest.

Execute o seguinte comando no terminal na raiz do projeto:
```bash
VERSION=$(grep '"version"' manifest.json | cut -d '"' -f 4)
zip -r "LinkScout-$VERSION.zip" . -x "*.git*" "*.DS_Store*" "*.zip" "*.md" ".gitignore" "test.html" "deploy.sh"
```

### 3. Commit e Push das Alterações
Após gerar o pacote, registre a nova versão no histórico do Git.

```bash
VERSION=$(grep '"version"' manifest.json | cut -d '"' -f 4)
git add manifest.json
git commit -m "Release v$VERSION"
git push origin main
```

---

## Automatização (Opcional)
Você pode utilizar o script `deploy.sh` (se criado) para realizar todos os passos acima de uma só vez.

---

> [!TIP]
> O arquivo ZIP gerado é o que deve ser enviado para o [Mozilla Add-ons (AMO)](https://addons.mozilla.org/developers/).
