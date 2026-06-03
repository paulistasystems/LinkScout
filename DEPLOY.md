# Deployment Guide - LinkScout

This document details the manual process for preparing and publishing a new version of the LinkScout extension.

## Prerequisites
- Ensure all changes have been tested locally.
- Have the `zip` command installed in the terminal (standard on macOS).

## Deployment Process

### 1. Increment the Version
Edit the [manifest.json](manifest.json) file and update the `"version"` field following [semantic versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`). Choose the bump based on what the release contains:

- **PATCH** (`2.7.49` -> `2.7.50`) — backward-compatible bug fixes only. No new UI or features (e.g. fixing a button that reverts).
- **MINOR** (`2.7.50` -> `2.8.0`) — new backward-compatible features or UI additions (e.g. adding a new sidebar button). Reset PATCH to `0`.
- **MAJOR** (`2.7.50` -> `3.0.0`) — breaking changes (incompatible data/schema, removed features). Reset MINOR and PATCH to `0`.

> [!NOTE]
> If a release mixes a fix and a new feature, bump the highest applicable level (MINOR over PATCH).

### 2. Update the Roadmap
Update the [ROADMAP.md](ROADMAP.md) file to reflect the changes made in this release:
- Move completed features from **🛠️ Next Steps** or **🚀 Planned** sections to **✅ Recently Completed**.
- Check off completed items with `[x]` and remove them from their original sections if applicable.
- Add a summary of the changes made (bug fixes, new features, improvements).
- Keep the **✅ Recently Completed** section organized with the latest version at the top.

### 3. Generate the Extension Package
Create a ZIP file containing only the files needed for the extension, naming it according to the version defined in the manifest.

Run the following command in the terminal at the project root:
```bash
VERSION=$(grep '"version"' manifest.json | cut -d '"' -f 4)
zip -r "LinkScout-$VERSION.zip" . -x "*.git*" "*.DS_Store*" "*.zip" "*.md" ".gitignore" "test.html" "deploy.sh"
```

### 4. Commit and Push Changes
After generating the package, record the new version in the Git history with a meaningful commit message that describes the changes made in this release.

```bash
VERSION=$(grep '"version"' manifest.json | cut -d '"' -f 4)
CHANGES=$(git diff --cached --stat | tail -1 | sed 's/^ *//')
git add manifest.json
git commit -m "Release v$VERSION - $CHANGES"
git push origin main
```

> [!NOTE]
> For a more descriptive message, replace `$CHANGES` with a manual summary of the changes (e.g. `Release v2.7.32 - Add time (HH:MM) to session folder name`).

---

## Automation (Optional)
You can use the `deploy.sh` script (if created) to perform all the above steps at once.

---

> [!TIP]
> The generated ZIP file is what should be submitted to [Mozilla Add-ons (AMO)](https://addons.mozilla.org/developers/).
