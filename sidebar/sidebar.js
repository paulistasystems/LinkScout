// LinkScout Sidebar Script
// Pending resolve operations — maps a resolve key to { resolveBtn, folderId }
const pendingResolves = new Map();

// Listen for resolveComplete broadcasts from the background script.
// This avoids Firefox's message port timeout on long-running resolve operations.
browser.runtime.onMessage.addListener((message) => {
    if (message.action !== 'resolveComplete') return;
    const result = message.result;
    let resolveKey, folderId;
    if (message.resolveType === 'folder') {
        folderId = message.folderId;
        resolveKey = `folder-${folderId}`;
    } else if (message.resolveType === 'virtual') {
        resolveKey = `virtual-${message.virtualFolderId}`;
        folderId = message.virtualFolderId;
    }
    const pending = pendingResolves.get(resolveKey);
    if (pending) {
        pendingResolves.delete(resolveKey);
        const resolveBtn = pending.resolveBtn;
        if (resolveBtn) {
            resolveBtn.disabled = false;
            resolveBtn.classList.remove('resolving');
            resolveBtn.textContent = '🔍';
        }
    }
    if (result && result.success) {
        silentLoadBookmarks().then(() => {
            const updatedFolderEl = document.querySelector(`.folder[data-id="${folderId}"]`);
            if (updatedFolderEl) {
                updatedFolderEl.classList.remove('collapsed');
                showResolveResult(updatedFolderEl, result);
            }
        });
    } else {
        console.error('[LinkScout Sidebar] Resolve failed:', result);
    }
});

const LINKSCOUT_FOLDER_NAME = 'LinkScout';

// DOM Elements
let bookmarkTreeEl;
let loadingStateEl;
let emptyStateEl;
let trashCountEl;
let trashContentEl;
let emptyTrashBtn;
let refreshBtn;
let collapseAllBtn;
let expandAllBtn;
let sortBtn;
let searchInput;
let groupByDomainBtn;


// State
let linkscoutFolderId = null;
let trashFolderId = null;
let currentSortOrder = 'desc'; // 'desc' or 'asc' (desc = newest first)
let searchQuery = '';
let allBookmarksData = []; // Store raw data for filtering/sorting
let groupByDomain = false;
let linksPerFolder = 10;


document.addEventListener('DOMContentLoaded', () => {
  applyI18n();
  bookmarkTreeEl = document.getElementById('bookmarkTree');
    loadingStateEl = document.getElementById('loadingState');
    emptyStateEl = document.getElementById('emptyState');
    refreshBtn = document.getElementById('refreshBtn');
    collapseAllBtn = document.getElementById('collapseAllBtn');
    expandAllBtn = document.getElementById('expandAllBtn');
    sortBtn = document.getElementById('sortBtn');
    searchInput = document.getElementById('searchInput');
    groupByDomainBtn = document.getElementById('groupByDomainBtn');


    // Event listeners
    refreshBtn.addEventListener('click', loadBookmarks);
    collapseAllBtn.addEventListener('click', collapseAllFolders);
    expandAllBtn.addEventListener('click', expandAllFolders);
    sortBtn.addEventListener('click', toggleSortOrder);
    searchInput.addEventListener('input', handleSearch);
    groupByDomainBtn.addEventListener('click', toggleGroupByDomain);



    // Initial sort icon
    updateSortIcon();

    // Initial load
    loadBookmarks();
});

async function loadBookmarks() {
  showLoading(true);
  try {
        // Use the lightweight sync on the hot path: it only adds bookmarks that
        // are missing from IndexedDB. The full sync (dedup + reverse-sync purge)
        // already runs once at startup (see restoreBookmarksFromDB().then(...) in
        // background.js), so re-running it on every sidebar open just repeats two
        // full bookmark traversals.
        await browser.runtime.sendMessage({ action: 'syncBookmarksLightweight' });
    let result = await browser.runtime.sendMessage({ action: 'getBookmarkTree' });
    if (result.error) {
      console.error('Error loading bookmarks:', result.error);
      showEmpty(true);
      return;
    }
    // Two-way sync safety net (v2.7.46): only when the Firefox tree is empty but
    // IndexedDB may still hold links (e.g. a Firefox Sync wipe) do we pay for the
    // emergency restore, then re-fetch. restoreFromDB itself bails immediately if
    // the folder isn't empty, so this stays off the common-case hot path.
    if (!result.bookmarks || result.bookmarks.length === 0) {
      await browser.runtime.sendMessage({ action: 'restoreFromDB' });
      result = await browser.runtime.sendMessage({ action: 'getBookmarkTree' });
      if (result.error) {
        console.error('Error loading bookmarks:', result.error);
        showEmpty(true);
        return;
      }
    }
    linkscoutFolderId = result.linkscoutFolderId;
    allBookmarksData = result.bookmarks;
    linksPerFolder = result.linksPerFolder || 10;
    renderBookmarkTree();
  } catch (error) {
    console.error('Error loading bookmarks:', error);
    showEmpty(true);
  }
  showLoading(false);
}

let pendingReload = null;
function requestSilentReload() {
    if (pendingReload) clearTimeout(pendingReload);
    pendingReload = setTimeout(() => { silentLoadBookmarks(); }, 500);
}

if (browser.bookmarks) {
    if (browser.bookmarks.onCreated) browser.bookmarks.onCreated.addListener((id, bookmark) => { handleBookmarkCreated(id, bookmark); });
    if (browser.bookmarks.onRemoved) browser.bookmarks.onRemoved.addListener((id, removeInfo) => { handleBookmarkRemoved(id, removeInfo); });
    if (browser.bookmarks.onChanged) browser.bookmarks.onChanged.addListener(requestSilentReload);
    if (browser.bookmarks.onMoved) browser.bookmarks.onMoved.addListener(requestSilentReload);
}

function handleBookmarkCreated(id, bookmark) {
    if (!bookmark.url) { requestSilentReload(); return; }

    function findAndAdd(nodes) {
        for (let node of nodes) {
            if (node.id === bookmark.parentId) {
                if (!node.children) node.children = [];
                node.children.push({ type: 'bookmark', id: bookmark.id, url: bookmark.url, title: bookmark.title || bookmark.url, dateAdded: bookmark.dateAdded || Date.now() });
                return true;
            }
            if (node.type === 'folder' && node.children) { if (findAndAdd(node.children)) return true; }
        }
        return false;
    }

    if (bookmark.parentId === linkscoutFolderId) {
        if (!allBookmarksData) allBookmarksData = [];
        allBookmarksData.push({ type: 'bookmark', id: bookmark.id, url: bookmark.url, title: bookmark.title || bookmark.url, dateAdded: bookmark.dateAdded || Date.now() });
    } else {
        if (allBookmarksData) findAndAdd(allBookmarksData);
    }

    if (groupByDomain || searchQuery) { requestSilentReload(); return; }

    let targetContainer = null;
    let targetFolderEl = null;
    if (bookmark.parentId === linkscoutFolderId) {
        targetContainer = bookmarkTreeEl;
    } else {
        targetFolderEl = document.querySelector(`.folder[data-id="${bookmark.parentId}"]`);
        if (!targetFolderEl) { requestSilentReload(); return; }
        targetFolderEl.style.display = 'block';
        targetContainer = targetFolderEl.querySelector('.folder-content');
        if (!targetContainer) {
            targetContainer = document.createElement('div');
            targetContainer.className = 'folder-content';
            targetFolderEl.appendChild(targetContainer);
        }
    }

    const bookmarkEl = createBookmarkElement({ id: bookmark.id, url: bookmark.url, title: bookmark.title || bookmark.url });
    const existingBookmarks = Array.from(targetContainer.querySelectorAll('.bookmark-item'));
    if (currentSortOrder === 'desc') {
        if (existingBookmarks.length > 0) { targetContainer.insertBefore(bookmarkEl, existingBookmarks[0]); }
        else { targetContainer.appendChild(bookmarkEl); }
    } else { targetContainer.appendChild(bookmarkEl); }

    if (targetFolderEl) {
        let current = targetFolderEl;
        while (current && current.classList.contains('folder')) {
            current.style.display = 'block';
            const header = Array.from(current.children).find(c => c.classList.contains('folder-header'));
            if (header) {
                const countSpan = header.querySelector('.folder-count');
                if (countSpan) { const count = parseInt(countSpan.textContent, 10); if (!isNaN(count)) countSpan.textContent = count + 1; }
            }
            if (current.parentElement) { current = current.parentElement.closest('.folder'); } else { break; }
        }
    }
    showEmpty(false);
}

function handleBookmarkRemoved(id, removeInfo) {
    const folderEl = document.querySelector(`.folder[data-id="${id}"]`);
    if (folderEl) { removeElementAndUpdateCounts(`.folder[data-id="${id}"]`, true); }
    else {
        const bookmarkEl = document.querySelector(`.bookmark-item[data-id="${id}"]`);
        if (bookmarkEl) { removeElementAndUpdateCounts(`.bookmark-item[data-id="${id}"]`, false); }
    }
    function findAndRemove(nodes) {
        if (!nodes) return false;
        for (let i = 0; i < nodes.length; i++) {
            let node = nodes[i];
            if (node.id === id) { nodes.splice(i, 1); return true; }
            if (node.type === 'folder' && node.children) { if (findAndRemove(node.children)) return true; }
        }
        return false;
    }
    findAndRemove(allBookmarksData);
}

async function silentLoadBookmarks() {
    try {
        const scrollPos = bookmarkTreeEl.scrollTop;
        const expandedFolders = Array.from(bookmarkTreeEl.querySelectorAll('.folder:not(.collapsed)')).map(f => f.dataset.id);
        const result = await browser.runtime.sendMessage({ action: 'getBookmarkTree' });
        if (result.error) { console.error('Error in silent reload:', result.error); return; }
        linkscoutFolderId = result.linkscoutFolderId;
        allBookmarksData = result.bookmarks;
        linksPerFolder = result.linksPerFolder || 10;
        renderBookmarkTree();
Array.from(bookmarkTreeEl.querySelectorAll('.folder')).forEach(f => {
      if (expandedFolders.includes(f.dataset.id)) { f.classList.remove('collapsed'); } else { f.classList.add('collapsed'); }
    });
        bookmarkTreeEl.scrollTop = scrollPos;
    } catch (error) { console.error('Error reloading silently:', error); }
}

function showLoading(show) {
    loadingStateEl.style.display = show ? 'flex' : 'none';
    if (show) { bookmarkTreeEl.innerHTML = ''; emptyStateEl.style.display = 'none'; }
}

function showEmpty(show) { emptyStateEl.style.display = show ? 'flex' : 'none'; }

function renderBookmarkTree() {
    bookmarkTreeEl.innerHTML = '';
  let processedItems;
  if (groupByDomain) {
    let allItems = JSON.parse(JSON.stringify(allBookmarksData));
    allItems = filterNodes(allItems, searchQuery);
    processedItems = groupBookmarksByDomain(allItems);
    processedItems = sortNodes(processedItems);
    processedItems = filterEmptyFolders(processedItems);
  } else {
    processedItems = filterNodes(JSON.parse(JSON.stringify(allBookmarksData)), searchQuery);
    processedItems = sortNodes(processedItems);
    processedItems = filterEmptyFolders(processedItems);
  }
    if (!processedItems || processedItems.length === 0) { showEmpty(true); return; }
    showEmpty(false);
    processedItems.forEach(item => {
        if (item.type === 'folder') {
            const folderEl = createFolderElement(item);
            if (searchQuery || groupByDomain) { folderEl.classList.remove('collapsed'); }
            bookmarkTreeEl.appendChild(folderEl);
        } else if (item.type === 'bookmark') {
            bookmarkTreeEl.appendChild(createBookmarkElement(item));
        }
    });
}

function filterEmptyFolders(items) {
    if (!items) return [];
    return items.filter(item => {
        if (item.type === 'bookmark') return true;
        if (item.type === 'folder') {
            item.children = filterEmptyFolders(item.children);
            return countBookmarks(item) > 0;
        }
        return false;
    });
}

function createFolderElement(folder) {
    const folderEl = document.createElement('div');
    const isVirtualFolder = String(folder.id).startsWith('domain-');
    folderEl.className = isVirtualFolder ? 'folder virtual' : 'folder';
    folderEl.dataset.id = folder.id;
    const bookmarkCount = countBookmarks(folder);
    const headerEl = document.createElement('div');
    headerEl.className = 'folder-header';
    const toggleSpan = document.createElement('span'); toggleSpan.className = 'folder-toggle'; toggleSpan.textContent = '▼'; headerEl.appendChild(toggleSpan);
    const iconSpan = document.createElement('span'); iconSpan.className = 'folder-icon'; iconSpan.textContent = '📁'; headerEl.appendChild(iconSpan);
    const nameSpan = document.createElement('span'); nameSpan.className = 'folder-name'; nameSpan.textContent = folder.title; headerEl.appendChild(nameSpan);
    const countSpan = document.createElement('span'); countSpan.className = 'folder-count'; countSpan.textContent = bookmarkCount; headerEl.appendChild(countSpan);
    const actionsDiv = document.createElement('div'); actionsDiv.className = 'folder-actions';
  const moveToTopBtn = document.createElement('button'); moveToTopBtn.className = 'folder-action-btn move-to-top-btn'; moveToTopBtn.title = browser.i18n.getMessage('sidebarMoveToTop'); moveToTopBtn.textContent = '⬆'; actionsDiv.appendChild(moveToTopBtn);
  const moveToBottomBtn = document.createElement('button'); moveToBottomBtn.className = 'folder-action-btn move-to-bottom-btn'; moveToBottomBtn.title = browser.i18n.getMessage('sidebarMoveToBottom'); moveToBottomBtn.textContent = '⬇'; actionsDiv.appendChild(moveToBottomBtn);
    const resolveBtn = document.createElement('button'); resolveBtn.className = 'folder-action-btn resolve-btn';   resolveBtn.title = browser.i18n.getMessage('sidebarResolveUrls'); resolveBtn.textContent = '🔍'; actionsDiv.appendChild(resolveBtn);
    const openAllBtn = document.createElement('button'); openAllBtn.className = 'folder-action-btn open-all-btn';   openAllBtn.title = browser.i18n.getMessage('sidebarOpenAllInTabs');
  openAllBtn.textContent = browser.i18n.getMessage('sidebarOpenAll'); actionsDiv.appendChild(openAllBtn);
    const deleteBtn = document.createElement('button'); deleteBtn.className = 'folder-action-btn delete-folder-btn';   deleteBtn.title = browser.i18n.getMessage('sidebarDeleteFolder'); deleteBtn.textContent = '🗑️'; actionsDiv.appendChild(deleteBtn);
    headerEl.appendChild(actionsDiv);
  if (isVirtualFolder) {
    moveToTopBtn.addEventListener('click', (e) => { e.stopPropagation(); moveVirtualFolderToTop(folderEl); });
    moveToBottomBtn.addEventListener('click', (e) => { e.stopPropagation(); moveVirtualFolderToBottom(folderEl); });
    resolveBtn.addEventListener('click', (e) => { e.stopPropagation(); resolveVirtualFolder(folder); });
        openAllBtn.addEventListener('click', (e) => { e.stopPropagation(); openAllInVirtualFolder(folder); });
        deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteVirtualFolder(folder); });
    } else {
    moveToTopBtn.addEventListener('click', (e) => { e.stopPropagation(); moveToTopFolder(folder.id, folderEl); });
    moveToBottomBtn.addEventListener('click', (e) => { e.stopPropagation(); moveToBottomFolder(folder.id, folderEl); });
    resolveBtn.addEventListener('click', (e) => { e.stopPropagation(); resolveFolder(folder.id, folderEl); });
        openAllBtn.addEventListener('click', (e) => { e.stopPropagation(); openAllInFolder(folder.id); });
        deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteFolder(folder.id); });
    }
    headerEl.addEventListener('click', (e) => { if (!e.target.closest('.folder-action-btn')) { folderEl.classList.toggle('collapsed'); } });
    folderEl.appendChild(headerEl);
    if (folder.children && folder.children.length > 0) {
        const contentEl = document.createElement('div'); contentEl.className = 'folder-content';
        folder.children.forEach(child => {
            if (child.type === 'folder') { contentEl.appendChild(createFolderElement(child)); }
            else if (child.type === 'bookmark') { contentEl.appendChild(createBookmarkElement(child)); }
        });
        folderEl.appendChild(contentEl);
    }
    return folderEl;
}

function createBookmarkElement(bookmark) {
    const itemEl = document.createElement('div');
    itemEl.className = 'bookmark-item';
    itemEl.dataset.id = bookmark.id;
    itemEl.dataset.url = bookmark.url;

    const faviconUrl = getFaviconUrl(bookmark.url);
    if (faviconUrl) {
        const favicon = document.createElement('img'); favicon.className = 'bookmark-favicon'; favicon.src = faviconUrl;
        const placeholder = document.createElement('div'); placeholder.className = 'bookmark-favicon-placeholder'; placeholder.style.display = 'none'; placeholder.textContent = '🔗';
        favicon.onerror = function () { this.style.display = 'none'; placeholder.style.display = 'flex'; };
        itemEl.appendChild(favicon); itemEl.appendChild(placeholder);
    } else {
        const placeholder = document.createElement('div'); placeholder.className = 'bookmark-favicon-placeholder'; placeholder.textContent = '🔗'; itemEl.appendChild(placeholder);
    }

    const titleSpan = document.createElement('span'); titleSpan.className = 'bookmark-title'; titleSpan.title = bookmark.url; titleSpan.textContent = bookmark.title || bookmark.url; itemEl.appendChild(titleSpan);

    const excludeBtn = document.createElement('button'); excludeBtn.className = 'bookmark-exclude-btn';   excludeBtn.title = browser.i18n.getMessage('sidebarExcludeDomain'); excludeBtn.textContent = '🚫';
    excludeBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
            const hostname = new URL(bookmark.url).hostname.replace(/^www\./, '');
            const result = await browser.runtime.sendMessage({ action: 'addExcludedDomain', domain: hostname });
            if (result && result.success) { showExcludeToast(hostname); }
        } catch (err) { console.error('Error excluding domain:', err); }
    });
    itemEl.appendChild(excludeBtn);
    itemEl.addEventListener('click', () => openAndTrash(bookmark.id));
    return itemEl;
}

function getFaviconUrl(url) {
    try { const urlObj = new URL(url); return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`; } catch { return null; }
}

function countBookmarks(folder) {
    let count = 0;
    if (folder.children) { folder.children.forEach(child => { if (child.type === 'bookmark') { count++; } else if (child.type === 'folder') { count += countBookmarks(child); } }); }
    return count;
}

function removeElementAndUpdateCounts(elementSelector, isFolder = false) {
    const el = document.querySelector(elementSelector); if (!el) return;
    const removedCount = isFolder ? el.querySelectorAll('.bookmark-item').length : 1;
    let current = el.parentElement; const ancestorFolders = [];
    while (current) { const ancestor = current.closest('.folder'); if (ancestor) { ancestorFolders.push(ancestor); current = ancestor.parentElement; } else { break; } }
    el.remove();
    ancestorFolders.forEach(ancestorEl => {
        const header = Array.from(ancestorEl.children).find(c => c.classList.contains('folder-header'));
        if (header) { const countSpan = header.querySelector('.folder-count'); if (countSpan) { const count = parseInt(countSpan.textContent, 10); if (!isNaN(count) && count > 0) { const newCount = Math.max(0, count - removedCount); countSpan.textContent = newCount; if (newCount === 0) { ancestorEl.style.display = 'none'; } } } }
    });
    const remaining = document.querySelectorAll('.bookmark-item'); if (remaining.length === 0) { showEmpty(true); }
}

async function openAndTrash(bookmarkId, skipDOMRemove = false) {
    try { await browser.runtime.sendMessage({ action: 'openAndTrash', bookmarkId }); if (!skipDOMRemove) { removeElementAndUpdateCounts(`.bookmark-item[data-id="${bookmarkId}"]`, false); } } catch (error) { console.error('Error opening bookmark:', error); }
}

async function openAllInFolder(folderId) {
    try { const result = await browser.runtime.sendMessage({ action: 'openAllInFolder', folderId }); if (result && result.count > 0) { removeElementAndUpdateCounts(`.folder[data-id="${folderId}"]`, true); } } catch (error) { console.error('Error opening all bookmarks:', error); }
}

async function deleteFolder(folderId) {
    try { await browser.runtime.sendMessage({ action: 'deleteFolder', folderId }); removeElementAndUpdateCounts(`.folder[data-id="${folderId}"]`, true); } catch (error) { console.error('Error deleting folder:', error); }
}

function collectIdsFromVirtualFolder(folder) {
    const ids = []; if (!folder.children) return ids;
    for (const child of folder.children) { if (child.type === 'bookmark') { ids.push(child.id); } else if (child.type === 'folder' && child.children) { ids.push(...collectIdsFromVirtualFolder(child)); } }
    return ids;
}

async function openAllInVirtualFolder(folder) {
    const ids = collectIdsFromVirtualFolder(folder); if (ids.length === 0) return;
    try { await browser.runtime.sendMessage({ action: 'openMultipleAndTrash', bookmarkIds: ids }); removeElementAndUpdateCounts(`.folder[data-id="${folder.id}"]`, true); } catch (e) { console.error('Error opening all in virtual folder:', e); }
}

async function deleteVirtualFolder(folder) {
    const ids = collectIdsFromVirtualFolder(folder);
    for (const id of ids) { try { await browser.runtime.sendMessage({ action: 'deleteBookmark', bookmarkId: id }); } catch (e) { /* ignore */ } }
    removeElementAndUpdateCounts(`.folder[data-id="${folder.id}"]`, true);
}

async function moveToTopFolder(folderId, folderEl) {
try {
const result = await browser.runtime.sendMessage({ action: 'moveFolderToTop', folderId });
if (result && result.success) {
const parent = folderEl.parentElement;
if (parent) {
const firstEl = parent.querySelector('.folder, .bookmark-item');
if (firstEl && firstEl !== folderEl) {
parent.insertBefore(folderEl, firstEl);
}
}
if (allBookmarksData) {
if (parent === bookmarkTreeEl) {
const idx = allBookmarksData.findIndex(n => n.id === folderId);
if (idx > 0) {
const [node] = allBookmarksData.splice(idx, 1);
allBookmarksData.unshift(node);
}
} else if (parent && parent.dataset && parent.dataset.id) {
const parentId = parent.dataset.id;
const folderParent = allBookmarksData.find(n => n.type === 'folder' && n.id === parentId);
if (folderParent && folderParent.children) {
const childIdx = folderParent.children.findIndex(n => n.id === folderId);
if (childIdx > 0) {
const [node] = folderParent.children.splice(childIdx, 1);
folderParent.children.unshift(node);
}
} else {
const idx = allBookmarksData.findIndex(n => n.id === folderId);
if (idx > 0) {
const [node] = allBookmarksData.splice(idx, 1);
allBookmarksData.unshift(node);
}
}
}
}
}
} catch (error) { console.error('Error moving folder to top:', error); }
}

function moveVirtualFolderToTop(folderEl) {
const parent = folderEl.parentElement;
if (!parent) return;
const firstEl = parent.querySelector('.folder, .bookmark-item');
if (firstEl && firstEl !== folderEl) {
parent.insertBefore(folderEl, firstEl);
}
}

async function moveToBottomFolder(folderId, folderEl) {
try {
const result = await browser.runtime.sendMessage({ action: 'moveFolderToBottom', folderId });
if (result && result.success) {
const parent = folderEl.parentElement;
if (parent) {
const siblings = parent.querySelectorAll(':scope > .folder, :scope > .bookmark-item');
const lastEl = siblings[siblings.length - 1];
if (lastEl && lastEl !== folderEl) {
parent.appendChild(folderEl);
}
}
if (allBookmarksData) {
if (parent === bookmarkTreeEl) {
const idx = allBookmarksData.findIndex(n => n.id === folderId);
if (idx !== -1 && idx < allBookmarksData.length - 1) {
const [node] = allBookmarksData.splice(idx, 1);
allBookmarksData.push(node);
}
} else if (parent && parent.dataset && parent.dataset.id) {
const parentId = parent.dataset.id;
const folderParent = allBookmarksData.find(n => n.type === 'folder' && n.id === parentId);
if (folderParent && folderParent.children) {
const childIdx = folderParent.children.findIndex(n => n.id === folderId);
if (childIdx !== -1 && childIdx < folderParent.children.length - 1) {
const [node] = folderParent.children.splice(childIdx, 1);
folderParent.children.push(node);
}
} else {
const idx = allBookmarksData.findIndex(n => n.id === folderId);
if (idx !== -1 && idx < allBookmarksData.length - 1) {
const [node] = allBookmarksData.splice(idx, 1);
allBookmarksData.push(node);
}
}
}
}
}
} catch (error) { console.error('Error moving folder to bottom:', error); }
}

function moveVirtualFolderToBottom(folderEl) {
const parent = folderEl.parentElement;
if (!parent) return;
const siblings = parent.querySelectorAll(':scope > .folder, :scope > .bookmark-item');
const lastEl = siblings[siblings.length - 1];
if (lastEl && lastEl !== folderEl) {
parent.appendChild(folderEl);
}
}


async function resolveFolder(folderId, folderEl) {
    const resolveBtn = folderEl.querySelector('.resolve-btn');
    if (resolveBtn) { resolveBtn.disabled = true; resolveBtn.classList.add('resolving'); resolveBtn.textContent = ''; }
    const resolveKey = `folder-${folderId}`; pendingResolves.set(resolveKey, { resolveBtn });
    try { const ack = await browser.runtime.sendMessage({ action: 'resolveFolder', folderId }); console.log(`[LinkScout Sidebar] Resolve folder ${folderId} started:`, ack); }
    catch (error) { console.error('Error starting folder resolve:', error); pendingResolves.delete(resolveKey); if (resolveBtn) { resolveBtn.disabled = false; resolveBtn.classList.remove('resolving'); resolveBtn.textContent = '🔍'; } }
}

async function resolveVirtualFolder(folder) {
    const ids = collectIdsFromVirtualFolder(folder); if (ids.length === 0) return;
    const folderEl = document.querySelector(`.folder[data-id="${folder.id}"]`); const resolveBtn = folderEl ? folderEl.querySelector('.resolve-btn') : null;
    if (resolveBtn) { resolveBtn.disabled = true; resolveBtn.classList.add('resolving'); resolveBtn.textContent = ''; }
    const resolveKey = `virtual-${folder.id}`; pendingResolves.set(resolveKey, { resolveBtn });
    try { const ack = await browser.runtime.sendMessage({ action: 'resolveMultipleUrls', bookmarkIds: ids, virtualFolderId: folder.id }); console.log(`[LinkScout Sidebar] Resolve virtual folder ${folder.id} started:`, ack); }
    catch (e) { console.error('Error starting virtual folder resolve:', e); pendingResolves.delete(resolveKey); if (resolveBtn) { resolveBtn.disabled = false; resolveBtn.classList.remove('resolving'); resolveBtn.textContent = '🔍'; } }
}

function showResolveResult(folderEl, result) {
    const header = folderEl.querySelector('.folder-header'); if (!header) return;
    const badge = document.createElement('span'); badge.className = 'resolve-result-badge';
  if (result.resolved > 0) { badge.textContent = browser.i18n.getMessage('sidebarResolvedCount', [result.resolved]); badge.classList.add('success'); }
  else { badge.textContent = browser.i18n.getMessage('sidebarAllUpToDate'); badge.classList.add('neutral'); }
    header.appendChild(badge);
    setTimeout(() => { badge.classList.add('fade-out'); setTimeout(() => badge.remove(), 500); }, 3000);
}

function escapeHtml(text) { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }

function collapseAllFolders() { const folders = bookmarkTreeEl.querySelectorAll('.folder'); folders.forEach(folder => folder.classList.add('collapsed')); }
function expandAllFolders() { const folders = bookmarkTreeEl.querySelectorAll('.folder'); folders.forEach(folder => folder.classList.remove('collapsed')); }

function toggleGroupByDomain() { groupByDomain = !groupByDomain; groupByDomainBtn.classList.toggle('active', groupByDomain); renderBookmarkTree(); }

function collectAllBookmarksFromTree(items) {
    const bookmarks = []; if (!items) return bookmarks;
    for (const item of items) { if (item.type === 'bookmark') { bookmarks.push(item); } else if (item.type === 'folder' && item.children) { bookmarks.push(...collectAllBookmarksFromTree(item.children)); } }
    return bookmarks;
}

function groupBookmarksByDomain(items) {
    const allBookmarks = collectAllBookmarksFromTree(items); const domainMap = {};
    for (const bm of allBookmarks) { let domain = 'other'; try { domain = new URL(bm.url).hostname.replace(/^www\./, ''); } catch { /* keep 'other' */ } if (!domainMap[domain]) { domainMap[domain] = []; } domainMap[domain].push(bm); }
    return Object.keys(domainMap).sort((a, b) => a.localeCompare(b)).map(domain => {
        const bookmarks = domainMap[domain];
        if (bookmarks.length > linksPerFolder) {
            const children = [];
            for (let i = 0; i < bookmarks.length; i += linksPerFolder) { const chunk = bookmarks.slice(i, i + linksPerFolder); const startNum = i + 1; const endNum = i + chunk.length; children.push({ type: 'folder', id: `domain-${domain}-${startNum}-${endNum}`, title: `${startNum}-${endNum}`, children: chunk, updatedAt: 0, dateAdded: 0 }); }
            return { type: 'folder', id: `domain-${domain}`, title: domain, children, updatedAt: 0, dateAdded: 0 };
        }
        return { type: 'folder', id: `domain-${domain}`, title: domain, children: bookmarks, updatedAt: 0, dateAdded: 0 };
    });
}

function handleSearch(e) { searchQuery = e.target.value.toLowerCase().trim(); renderBookmarkTree(); }

function toggleSortOrder() { currentSortOrder = currentSortOrder === 'desc' ? 'asc' : 'desc'; updateSortIcon(); renderBookmarkTree(); }

function updateSortIcon() { sortBtn.textContent = currentSortOrder === 'desc' ? '⬇️' : '⬆️';   sortBtn.title = currentSortOrder === 'desc' ? browser.i18n.getMessage('sidebarSortNewestFirst') : browser.i18n.getMessage('sidebarSortOldestFirst'); }


function sortNodes(nodes) {
    if (!nodes) return [];
    return nodes.sort((a, b) => {
        const aIsFolder = a.type === 'folder'; const bIsFolder = b.type === 'folder';
        if (aIsFolder && bIsFolder) {
            const updatedA = a.updatedAt || 0; const updatedB = b.updatedAt || 0;
            if (updatedA !== updatedB) { return currentSortOrder === 'desc' ? updatedB - updatedA : updatedA - updatedB; }
            const createdA = a.dateAdded || 0; const createdB = b.dateAdded || 0;
            if (createdA !== createdB) { return currentSortOrder === 'desc' ? createdB - createdA : createdA - createdB; }
            return a.title.localeCompare(b.title);
        }
        if (aIsFolder && !bIsFolder) return -1; if (!aIsFolder && bIsFolder) return 1; return 0;
    }).map(node => { if (node.children) { node.children = sortNodes(node.children); } return node; });
}

function filterNodes(nodes, query) {
    if (!query) return nodes;
    return nodes.filter(node => {
        const matchesRequest = (node.title && node.title.toLowerCase().includes(query)) || (node.url && node.url.toLowerCase().includes(query));
        if (node.children) { node.children = filterNodes(node.children, query); return matchesRequest || node.children.length > 0; }
        return matchesRequest;
    });
}


function showExcludeToast(domain) {
    const existing = document.querySelector('.exclude-toast'); if (existing) existing.remove();
    const toast = document.createElement('div'); toast.className = 'exclude-toast';   toast.textContent = browser.i18n.getMessage('sidebarDomainExcluded', [domain]);
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('visible'));
    setTimeout(() => { toast.classList.remove('visible'); setTimeout(() => toast.remove(), 300); }, 2000);
}