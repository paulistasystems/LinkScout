# Deployment Guide - LinkScout

This document details the manual process for preparing and publishing a new version of the LinkScout extension.

## Prerequisites
- Ensure all changes have been tested locally.
- Have the `zip` command installed in the terminal (standard on macOS).

## Deployment Process

### 1. Increment the Version
Edit the [manifest.json](manifest.json) file and update the `"version"` field following semantic versioning (Ex: `2.7.20` -> `2.7.21`).

### 2. Generate the Extension Package
Create a ZIP file containing only the files needed for the extension, naming it according to the version defined in the manifest.

Run the following command in the terminal at the project root:
```bash
VERSION=$(grep '"version"' manifest.json | cut -d '"' -f 4)
zip -r "LinkScout-$VERSION.zip" . -x "*.git*" "*.DS_Store*" "*.zip" "*.md" ".gitignore" "test.html" "deploy.sh"
```

### 3. Commit and Push Changes
After generating the package, record the new version in the Git history.

```bash
VERSION=$(grep '"version"' manifest.json | cut -d '"' -f 4)
git add manifest.json
git commit -m "Release v$VERSION"
git push origin main
```

---

## Automation (Optional)
You can use the `deploy.sh` script (if created) to perform all the above steps at once.

---

> [!TIP]
> The generated ZIP file is what should be submitted to [Mozilla Add-ons (AMO)](https://addons.mozilla.org/developers/).
