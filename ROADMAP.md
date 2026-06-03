# 🗺️ LinkScout Roadmap

This document details the planning for LinkScout's evolution, including new features, UX improvements, and critical fixes.

---

## 🛠️ Next Steps (Short Term)

### 🔍 Search and Filter Improvements
- [x] Filter to show only "unresolved" or "error" links.

---

## 🚀 Planned (Medium Term)

### 🖱️ Drag & Drop in Sidebar
- [ ] Manual reorganization of links between folders via drag and drop.
- [ ] Move entire folders to new hierarchical levels.

---

## 🔮 Future Vision (Long Term)

---

## 🐛 Fixes and Continuous Maintenance

### 🐞 Critical Fixes
- [x] ~~Sidebar "Resolve URLs" button fails to resolve Google News links.~~
- [ ] Save links from selection not saving with title when URL is resolved.
- [x] ~~Only the first bookmark from the folder are being resolved.~~
- [x] ~~Synchronized bookmarks not appearing in the sidebar even after pressing the refresh button.~~

### ⚙️ Improvements and Maintenance
- [ ] Performance monitoring for collections with > 10,000 links.
- [ ] Modular refactoring of `background.js` for better readability.

---

## ✅ Recently Completed
- [x] **Fix move-to-top/bottom buttons reverting (v2.7.50)**: Fixed the move-to-top (⬆) and move-to-bottom (⬇) buttons where the folder moved but snapped back to its original position ~500ms later. Root cause: folders are displayed sorted by their `updatedAt` timestamp (both server-side in `getBookmarkTree` and client-side in `sortNodes`), so the native bookmark index set by `browser.bookmarks.move()` was ignored. The `onMoved` handler only bumped the *parent/ancestor* timestamps via `updateFolderTimestamp`, never the moved folder's own — so the silent reload re-sorted by timestamp and undid the move. Fix: `moveFolderToTop`/`moveFolderToBottom` now set the moved folder's own timestamp relative to its siblings (top = newest sibling + 1, bottom = oldest sibling − 1) in the `folderTimestamps` store, so the timestamp sort keeps it in place. Note: in the sidebar's "oldest first" sort toggle, top/bottom visually invert (inherent to timestamp-driven ordering).
- [x] **Fix move-to-top button (v2.7.48)**: Fixed the move-to-top button (⬆) in sidebar folder headers not working. Two bugs: (1) Real folders: `moveToTopFolder()` called `silentLoadBookmarks()` after moving, which triggered `sortNodes()` and immediately re-sorted folders by date, undoing the move. Fix: DOM reorder + in-place `allBookmarksData` update instead of full re-render. (2) Virtual folders: `moveVirtualFolderToTop()` used `parent.firstChild` which can be a text node; fix: uses `parent.querySelector('.folder, .bookmark-item')` to find the first actual element child.
- [x] **Move to top button (v2.7.47)**: Replaced the shuffle bookmarks button (🔀) in the sidebar folder headers with a move-to-top button (⬆) that reorders the folder to the first position within its parent. Real folders use `browser.bookmarks.move()` to set index 0; virtual (domain-grouped) folders are reordered in the DOM.
- [x] **Two-way sync on refresh (v2.7.46)**: Fixed synchronized bookmarks not appearing in the sidebar after pressing refresh. Root cause: refresh only ran `syncBookmarksLightweight` (Firefox → IndexedDB), so bookmarks in IndexedDB that hadn't reached the Firefox tree (e.g. from Firefox Sync) were never restored. Fix: refresh now runs `syncBookmarksLightweight` then `restoreFromDB` sequentially, ensuring full two-way sync before fetching the bookmark tree.
- [x] **Folder URL Resolution — only first bookmark resolved (v2.7.45)**: Fixed bug where resolving a folder would only process the first bookmark. Root cause: `resolveUrlWithPhantomTab` created tabs as `active: true`, stealing focus and causing browser throttling of subsequent tabs; `cleanup()` was fire-and-forget so previous phantom tabs could still exist when the next one was created, causing tab event listener interference. Fix: (1) phantom tabs now created with `active: false` to avoid stealing focus and prevent browser throttling, (2) `cleanup()` is now `async` and awaits `browser.tabs.remove()` to ensure the phantom tab is fully closed before the next resolution starts, (3) added `forceDatabaseSync()` for intermediate DB sync every 5 bookmarks during folder resolution, preventing data loss if the process is interrupted.
- [x] **Internationalization (i18n) (v2.7.44)**: Added multi-language support using the WebExtensions i18n API. Created `_locales/en/` and `_locales/pt_BR/` message catalogs with 55 translated strings. Updated manifest.json with `__MSG_` placeholders and `default_locale`. Localized sidebar, options page, context menus, and all dynamic UI strings via `browser.i18n.getMessage()`. Fixed mixed Portuguese/English strings throughout the UI. Adding more languages requires only a new `_locales/<locale>/messages.json` file. ✅ Multi-language support for extension UI. ✅ Localization of sidebar, options page, and context menus. ✅ Support for multiple languages (PT-BR, EN, and others).
- [x] **Google News URL Resolution (Phantom Tab intermediate redirect fix, v2.7.41)**: Fixed bug where the sidebar "Resolve URLs" button failed to resolve Google News links. Root cause: the Phantom Tab's `tabUpdateListener` classified intermediate Google redirect pages (e.g. `google.com/url?q=target`, `consent.google.com?continue=target`) as "still aggregator", so resolution never completed. Fix: (1) added static URL extraction (`extractTargetFromRedirectUrl`) on intermediate aggregator pages to pull the target URL from query parameters, (2) registered `tabs.onUpdated`/`tabs.onCreated` listeners *before* tab creation to prevent race condition, (3) used `changeInfo.url` for earlier URL change detection.
- [x] **Resolved bookmark title defaults to page title (v2.7.41)**: Changed `resolveFolderUrls` and `resolveMultipleUrls` so that when a URL is resolved, the bookmark label is always set to the fetched page title (via `fetchPageTitle`). Falls back to the resolved URL only if the page has no `<title>` tag. Previously, the old bookmark title was preserved if it differed from the URL, which kept stale/redirector titles.
- [x] **Batch URL Resolution (DB-level dedup)**: Fixed bug where only the first batch of 10 links in a folder was resolved; subsequent batches' bookmarks remained at their original URLs. Root cause: duplicate tracking was done in-memory with stale data and `updateLinkUrlInDatabase` silently failed when the resolved URL already existed in the DB (unique constraint violation on `url` index). Fix: removed all in-memory duplicate tracking from `resolveFolderUrls` and `resolveMultipleUrls`; dedup is now enforced entirely by the IndexedDB unique `url` index. `updateLinkUrlInDatabase` now checks if the target URL already has a record — if so, deletes the old record and its Firefox bookmark, then updates the existing target record. Added `deduplicateResolvedLinks()` post-resolution pass to clean up any remaining duplicates in DB + Firefox bookmarks. DB schema bumped to v3 (clean rebuild on upgrade).
- [x] **Duplicate Links Resolution**: Fixed bug where the "Resolve URLs" button did not discard duplicate links. When URL resolution generated a link that already existed in the folder, the link should be discarded instead of remaining unresolved. Now properly checks for duplicates and removes unresolved entries when a matching link is detected.
- [x] **Sidebar Refresh Performance Fix (v2.7.37)**: Fixed heavy refresh button that caused hangs on low-end laptops and slow response on M4 Mini. Root cause: refresh called full `syncDatabaseWithBookmarks()` + `runBackgroundVerification()` (deduplication) on every click, and `requestDatabaseSync()` also triggered dedup after every bookmark change. Fixes: (1) Refresh now uses lightweight sync (batch-adds missing bookmarks only, no reverse purge/dedup), (2) full sync rewritten with batch IndexedDB operations instead of sequential per-record writes, (3) dedup only runs at startup (removed from `requestDatabaseSync`), (4) dedup rewritten to use single batch transaction instead of one transaction per record with delays. Also fixed bookmark sync being blocked during URL resolution.
- [x] **Status Filter in Sidebar**: Added ⚡ filter button in sidebar header to filter bookmarks by link status: All, Unresolved (redirect URLs like t.co, bit.ly), or Error (failed resolution). Visual indicators: orange left border for unresolved, red for errors. Background script enriches bookmark tree with `redirectResolved` and `originalUrl` from IndexedDB.
- [x] **Google News URL Resolution (sidebar)**: Fixed bug where the sidebar link resolution button did not work for Google News legacy links. The root cause was that `ensureMigratedSettings()` removed `news.google.com` from `aggregatorDomains` (treating it as a "pure redirector" that resolves via HEAD), but Google News uses JavaScript redirects that only the Phantom Tab can follow. The fix: (1) removed `news.google.com` from the `pureRedirects` cleanup list, (2) added `news.google.com` to the default `aggregatorDomains` list, (3) added a migration to restore `news.google.com` for existing users who had it stripped by the previous cleanup.
- [x] **Facebook URL Resolution (sidebar)**: Fixed bug where the sidebar link resolution button did not work for Facebook/Messenger URLs. The issue was that Facebook URLs using JavaScript redirection (not HTTP 3xx) fell into the HEAD/GET path, which cannot follow JS redirects. Now all Facebook/Messenger URLs are routed to the Phantom Tab (which is authenticated in the user's browser). Also added a safety net against incorrect resolution for login/authentication pages.
- [x] **Link Origin (Save Link button)**: Fixed bug where the origin URL was never saved when using "Save This Link" or "Save Selection Links". The cause was a global duplicate check in IndexedDB that rejected the origin if it already existed in any folder. Now the origin is handled separately: saved directly in the destination folder with duplicate checking only at the folder level, ensuring the origin reference is always present.
- [x] **Domain Exclusion List**: Implemented option to exclude domains from automatic URL resolution. Domains can be added via the 🚫 button in the sidebar bookmarks or manually through the Preferences page. The list can be consulted and managed (add/remove) in Preferences. Excluded domains are ignored by `resolveUrl()` and batch resolution functions.
- [x] **URL Resolution (sidebar — specific cases)**: Fixed 3 bugs in the resolution pipeline: (1) Phantom tab is now briefly activated to allow JS redirect execution (Google News, etc.), (2) Facebook/Messenger URLs without redirect parameter are no longer sent to phantom tab (avoids 15s timeout on login pages), (3) Static Google News extraction expanded to `/rss/articles/`, `?url=` parameter, and consent redirect.
- [x] **URL Resolution (sidebar)**: Fixed 3 issues that prevented complete resolution of all links: (1) concurrency guard with counter instead of boolean to support simultaneous resolutions, (2) silent failures now reported as errors instead of "no change", (3) automatic page title search after resolution via `fetchPageTitle()`.
- [x] **Link Origin (Firefox macOS)**: Fixed origin URL capture for "Save This Link" (was never captured) and "Save Selection Links". Extracted logic to `getOriginUrl()` helper with 4 robust fallbacks (`info.pageUrl` → `tab.url` → `tabs.get()` → `tabs.query()`).
- [x] **Batch URL Resolution**: Fixed bug where only the first link in the folder was processed. Added sync suppression flag, rate-limiting between resolutions, title preservation, and IndexedDB synchronization after each resolution.
- [x] **Automatic resolution on selection (macOS Firefox)**: Selection links are now saved immediately (`skipResolve`) and URL resolution is triggered in background.
- [x] **"Resolve URLs" button in sidebar**: Fixed freezing issues and real-time visual feedback.
- [x] **Link Origin in Selection**: Prepend of origin URL when saving multiple selections.
- [x] **Logging System**: Implementation of structured logs for remote debugging.
- [x] **Trash Management**: Auto-cleanup after 30 days and automatic movement on open.
- [x] **Keyboard Shortcut**: `Cmd+Shift+U` to quickly open/close sidebar.
- [x] **URL Resolution in Firefox (macOS) - Message Port Timeout**: Fixed issue where `browser.runtime.sendMessage` was timing out during long resolution operations.
- [x] **Bidirectional Synchronization**: favorites synchronized between IndexedDB and Browser Bookmarks.