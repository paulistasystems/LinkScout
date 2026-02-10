#!/bin/bash

# LinkScout Build Script
# Creates the extension zip file for Mozilla Add-ons submission

set -e

echo "Building LinkScout extension..."

# Get version from manifest.json
VERSION=$(grep -o '"version": "[^"]*"' manifest.json | cut -d'"' -f4)
OUTPUT_FILE="linkscout-v${VERSION}.zip"

# Remove existing zip if present
if [ -f "$OUTPUT_FILE" ]; then
    rm "$OUTPUT_FILE"
    echo "Removed existing $OUTPUT_FILE"
fi

# Create the zip file
zip -r "$OUTPUT_FILE" \
    manifest.json \
    background.js \
    content.js \
    options.html \
    options.html \
    options.js \
    sidebar/ \
    icons/ \
    -x "*.DS_Store" \
    -x "*.git*" \
    -x "build.sh" \
    -x "README.md" \
    -x "*.zip"

echo ""
echo "✅ Build complete: $OUTPUT_FILE"
echo ""
echo "Contents:"
unzip -l "$OUTPUT_FILE"
