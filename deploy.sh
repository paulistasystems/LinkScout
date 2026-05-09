#!/bin/bash

# LinkScout Deployment Script
# Este script automatiza o processo de bump de versão, zip e push.

# 1. Obter versão atual do manifest.json
CURRENT_VERSION=$(grep '"version"' manifest.json | cut -d '"' -f 4)
echo "Versão atual: $CURRENT_VERSION"

# 2. Solicitar nova versão
read -p "Digite a nova versão (ou pressione Enter para manter $CURRENT_VERSION): " NEW_VERSION
NEW_VERSION=${NEW_VERSION:-$CURRENT_VERSION}

if [ "$NEW_VERSION" != "$CURRENT_VERSION" ]; then
    # Atualizar manifest.json (macOS sed requer backup ou string vazia)
    sed -i '' "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" manifest.json
    echo "Versão atualizada para $NEW_VERSION no manifest.json"
fi

# 3. Gerar ZIP
ZIP_NAME="LinkScout-$NEW_VERSION.zip"
echo "Gerando pacote $ZIP_NAME..."

# Se já existir um zip com o mesmo nome, move para o lixo
if [ -f "$ZIP_NAME" ]; then
    if command -v trash >/dev/null 2>&1; then
        trash "$ZIP_NAME"
    else
        rm "$ZIP_NAME"
    fi
fi

zip -r "$ZIP_NAME" . -x "*.git*" "*.DS_Store*" "*.zip" "*.md" ".gitignore" "test.html" "deploy.sh"

# 4. Git Commit e Push
echo "Comitando alterações..."
git add manifest.json
git commit -m "Release v$NEW_VERSION"
git push origin master

echo "Deploy concluído com sucesso! Versão $NEW_VERSION pronta para envio."
