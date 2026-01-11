# LinkScout

A Firefox extension that saves links from selected text as bookmarks with smart organization.

## Description

LinkScout allows you to save links to your bookmarks with automatic organization. It provides multiple ways to save:
- **Save links from text selection** - Select text containing links and save them all at once
- **Save individual links** - Right-click directly on any link to save it
- **Save all tabs** - Save and close all open tabs with one click

Links are automatically organized into folders based on the page title where they were found.

## Features

- 🔗 **Save Links from Selection** - Extract and save all links from selected text
- 🔗 **Save Single Link** - Right-click on any link to save it directly
- 📑 **Save & Close All Tabs** - Save all open tabs and close them (creates a session folder)
- 📁 **Smart Organization** - Links saved under `LinkScout / [Page Title] / [Link]`
- ⚙️ **Configurable** - Choose bookmark location and folder name

## Build Instructions

### System Requirements

- **Operating System**: macOS, Linux, or Windows
- **Tools Required**: `zip` command-line utility (pre-installed on macOS and Linux)

### Building the Extension

1. **Clone or download the source code**
   ```bash
   git clone <repository-url>
   cd LinkScout
   ```

2. **Run the build script**
   ```bash
   ./build.sh
   ```

   Or manually create the zip:
   ```bash
   zip -r linkscout-v1.1.zip manifest.json background.js content.js options.html options.js icons/ -x "*.DS_Store"
   ```

3. **Output**
   - The build creates `linkscout-v1.1.zip` in the project root directory.

### Project Structure

```
LinkScout/
├── manifest.json      # Extension manifest (Manifest V2)
├── background.js      # Background script for context menu and bookmark logic
├── content.js         # Content script for extracting links from selections
├── options.html       # Options page HTML
├── options.js         # Options page JavaScript
├── icons/
│   └── linkscout-48.svg   # Extension icon
├── build.sh           # Build script
└── README.md          # This file
```

### No Build Dependencies

This extension is written in plain JavaScript with no external dependencies or build tools required. The source code is the final code - no transpilation, bundling, or compilation is needed.

## Installation for Development

### Load the Extension in Firefox

1. **Open Firefox**
2. **Type in the address bar:** `about:debugging#/runtime/this-firefox`
3. **Click "Load Temporary Add-on..."**
4. **Navigate to the folder** containing the extension files.
5. **Select the file** `manifest.json`.
6. The extension will be temporarily loaded.

### Debugging

**View extension logs:**
- Open Browser Console: `Ctrl+Shift+J` (Windows/Linux) or `Cmd+Shift+J` (Mac).

**Reload after changes:**
1. Go back to `about:debugging#/runtime/this-firefox`.
2. Click **"Reload"** next to the LinkScout extension.
3. Or press `Ctrl+R` on the debugging page.

## Usage

### Save Links from Selection
1. Select text containing links on any webpage
2. Right-click to open the context menu
3. Click "🔗 LinkScout: Salvar Links da Seleção"

### Save a Single Link
1. Right-click directly on any link
2. Click "🔗 LinkScout: Salvar Este Link"

### Save All Tabs
1. Right-click on any tab or page
2. Click "🔗 LinkScout: Salvar e Fechar Todas as Abas"
3. All tabs are saved and closed, a new blank tab is created

## Configuration

Access the extension options to configure:
- **Bookmark Location**: Toolbar, Menu, or Other Bookmarks
- **Root Folder Name**: Default is "LinkScout"
- **Notifications**: Enable/disable save notifications

## License

MIT License
