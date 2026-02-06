# LinkScout

A Firefox extension that saves links from selected text as bookmarks with smart organization.

## Summary (for Firefox AMO - no markdown, max 250 chars)

Save links from selected text as bookmarks with smart organization. Extract multiple links at once, save individual links, or save all tabs. Automatic folder organization and duplicate detection.

## Description (for Firefox AMO - supports markdown)

LinkScout makes it easy to save and organize links from any webpage. Whether you're researching, collecting resources, or just want to save interesting links for later, LinkScout has you covered.

**Multiple ways to save:**
- **Save links from text selection** - Select text containing links and save them all at once
- **Save individual links** - Right-click directly on any link to save it
- **Save all tabs** - Save and close all open tabs with one click

**Smart organization:**
- Links are automatically organized into folders based on the page title
- Duplicate detection prevents saving the same link twice
- Option to show newest links/folders at the top

## Features

- 🔗 **Save Links from Selection** - Extract and save all links from selected text
- 🔗 **Save Single Link** - Right-click on any link to save it directly
- 📑 **Save & Close All Tabs** - Save all open tabs and close them (creates a session folder)
- 📁 **Smart Organization** - Links saved under `LinkScout / [Page Title] / [Link]`
- 📂 **Auto Subfolders** - When saving more than X links, automatically creates numbered subfolders (e.g., 1-10, 11-20)
- 🔄 **Duplicate Detection** - Automatically detects and skips duplicate links in the same folder
- ⬆️ **Newest First** - Option to show newest links/folders at the top (configurable)
- ⚙️ **Configurable** - Choose bookmark location, folder name and more

## Build Instructions

### System Requirements

- **Operating System**: macOS, Linux, or Windows
- **Tools Required**: `zip` command-line utility (pre-installed on macOS and Linux)

### Building the Extension

1. **Clone or download the source code**
   ```bash
   git clone https://github.com/paulistasystems/LinkScout.git
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
- **Update Existing Titles**: Update bookmark titles when duplicates are found
- **Newest Links First**: Show newest links/folders at the top (enabled by default)
- **Links per Folder**: Maximum links per folder before creating subfolders (default: 10). When changed, existing folders are automatically reorganized.
- **Remove Duplicates**: Remove duplicate links before saving when selecting multiple links (disabled by default)

## License

MIT License
