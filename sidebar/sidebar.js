// LinkScout Sidebar Script

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
        // Get bookmark tree from background script
        const result = await browser.runtime.sendMessage({ action: 'getBookmarkTree' });

        if (result.error) {
            console.error('Error loading bookmarks:', result.error);
            showEmpty(true);
            return;
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

function showLoading(show) {
    loadingStateEl.style.display = show ? 'flex' : 'none';
    if (show) {
        bookmarkTreeEl.innerHTML = '';
        emptyStateEl.style.display = 'none';
    }
}

function showEmpty(show) {
    emptyStateEl.style.display = show ? 'flex' : 'none';
}

function renderBookmarkTree() {
    bookmarkTreeEl.innerHTML = '';

    let processedItems;

    if (groupByDomain) {
        // Group by domain mode: flatten all bookmarks, then group by hostname
        let allItems = JSON.parse(JSON.stringify(allBookmarksData));
        // Apply search filter first
        allItems = filterNodes(allItems, searchQuery);
        processedItems = groupBookmarksByDomain(allItems);
        // Sort domain folders alphabetically (or by count)
        processedItems = sortNodes(processedItems);
        processedItems = filterEmptyFolders(processedItems);
    } else {
        // Normal mode
        // 1. Filter
        processedItems = filterNodes(JSON.parse(JSON.stringify(allBookmarksData)), searchQuery);
        // 2. Sort
        processedItems = sortNodes(processedItems);
        // 3. Filter empty folders (post-filter cleanup)
        processedItems = filterEmptyFolders(processedItems);
    }

    if (!processedItems || processedItems.length === 0) {
        showEmpty(true);
        return;
    }

    showEmpty(false);

    processedItems.forEach(item => {
        if (item.type === 'folder') {
            const folderEl = createFolderElement(item);
            // If searching or grouping by domain, expand folders
            if (searchQuery || groupByDomain) {
                folderEl.classList.remove('collapsed');
            }
            bookmarkTreeEl.appendChild(folderEl);
        } else if (item.type === 'bookmark') {
            bookmarkTreeEl.appendChild(createBookmarkElement(item));
        }
    });
}

// Filter out folders that have no bookmarks (recursively)
function filterEmptyFolders(items) {
    if (!items) return [];

    return items.filter(item => {
        if (item.type === 'bookmark') return true;
        if (item.type === 'folder') {
            // Recursively filter children
            item.children = filterEmptyFolders(item.children);
            // Keep folder only if it has bookmarks
            return countBookmarks(item) > 0;
        }
        return false;
    });
}

function createFolderElement(folder) {
    const folderEl = document.createElement('div');
    folderEl.className = 'folder';
    folderEl.dataset.id = folder.id;

    const bookmarkCount = countBookmarks(folder);

    const headerEl = document.createElement('div');
    headerEl.className = 'folder-header';

    const toggleSpan = document.createElement('span');
    toggleSpan.className = 'folder-toggle';
    toggleSpan.textContent = '▼';
    headerEl.appendChild(toggleSpan);

    const iconSpan = document.createElement('span');
    iconSpan.className = 'folder-icon';
    iconSpan.textContent = '📁';
    headerEl.appendChild(iconSpan);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'folder-name';
    nameSpan.textContent = folder.title;
    headerEl.appendChild(nameSpan);

    const countSpan = document.createElement('span');
    countSpan.className = 'folder-count';
    countSpan.textContent = bookmarkCount;
    headerEl.appendChild(countSpan);

    const isVirtualFolder = String(folder.id).startsWith('domain-');

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'folder-actions';

    const openAllBtn = document.createElement('button');
    openAllBtn.className = 'folder-action-btn open-all-btn';
    openAllBtn.title = 'Open all in tabs';
    openAllBtn.textContent = '🚀 Open all';
    actionsDiv.appendChild(openAllBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'folder-action-btn delete-folder-btn';
    deleteBtn.title = 'Excluir pasta';
    deleteBtn.textContent = '🗑️';
    actionsDiv.appendChild(deleteBtn);

    headerEl.appendChild(actionsDiv);

    if (isVirtualFolder) {
        openAllBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openAllInVirtualFolder(folder);
        });

        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteVirtualFolder(folder);
        });
    } else {
        openAllBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openAllInFolder(folder.id);
        });

        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteFolder(folder.id);
        });
    }

    headerEl.addEventListener('click', (e) => {
        if (!e.target.closest('.folder-action-btn')) {
            folderEl.classList.toggle('collapsed');
        }
    });

    folderEl.appendChild(headerEl);

    if (folder.children && folder.children.length > 0) {
        const contentEl = document.createElement('div');
        contentEl.className = 'folder-content';

        folder.children.forEach(child => {
            if (child.type === 'folder') {
                contentEl.appendChild(createFolderElement(child));
            } else if (child.type === 'bookmark') {
                contentEl.appendChild(createBookmarkElement(child));
            }
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

    // Get favicon
    const faviconUrl = getFaviconUrl(bookmark.url);

    if (faviconUrl) {
        const favicon = document.createElement('img');
        favicon.className = 'bookmark-favicon';
        favicon.src = faviconUrl;
        const placeholder = document.createElement('div');
        placeholder.className = 'bookmark-favicon-placeholder';
        placeholder.style.display = 'none';
        placeholder.textContent = '🔗';
        favicon.onerror = function () {
            this.style.display = 'none';
            placeholder.style.display = 'flex';
        };
        itemEl.appendChild(favicon);
        itemEl.appendChild(placeholder);
    } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'bookmark-favicon-placeholder';
        placeholder.textContent = '🔗';
        itemEl.appendChild(placeholder);
    }

    const titleSpan = document.createElement('span');
    titleSpan.className = 'bookmark-title';
    titleSpan.title = bookmark.url;
    titleSpan.textContent = bookmark.title || bookmark.url;
    itemEl.appendChild(titleSpan);

    itemEl.addEventListener('click', () => openAndTrash(bookmark.id));

    return itemEl;
}

function getFaviconUrl(url) {
    try {
        const urlObj = new URL(url);
        return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`;
    } catch {
        return null;
    }
}

function countBookmarks(folder) {
    let count = 0;
    if (folder.children) {
        folder.children.forEach(child => {
            if (child.type === 'bookmark') {
                count++;
            } else if (child.type === 'folder') {
                count += countBookmarks(child);
            }
        });
    }
    return count;
}

async function openAndTrash(bookmarkId) {
    try {
        await browser.runtime.sendMessage({
            action: 'openAndTrash',
            bookmarkId
        });
        // Reload to reflect changes
        loadBookmarks();
    } catch (error) {
        console.error('Error opening bookmark:', error);
    }
}

async function openAllInFolder(folderId) {
    try {
        const result = await browser.runtime.sendMessage({
            action: 'openAllInFolder',
            folderId
        });
        if (result.count > 0) {
            loadBookmarks();
        }
    } catch (error) {
        console.error('Error opening all bookmarks:', error);
    }
}

async function deleteFolder(folderId) {
    try {
        await browser.runtime.sendMessage({
            action: 'deleteFolder',
            folderId
        });
        loadBookmarks();
    } catch (error) {
        console.error('Error deleting folder:', error);
    }
}

// Virtual folder operations (domain grouping)
function collectIdsFromVirtualFolder(folder) {
    const ids = [];
    if (!folder.children) return ids;
    for (const child of folder.children) {
        if (child.type === 'bookmark') {
            ids.push(child.id);
        } else if (child.type === 'folder' && child.children) {
            ids.push(...collectIdsFromVirtualFolder(child));
        }
    }
    return ids;
}

async function openAllInVirtualFolder(folder) {
    const ids = collectIdsFromVirtualFolder(folder);
    for (const id of ids) {
        await openAndTrash(id);
    }
}

async function deleteVirtualFolder(folder) {
    const ids = collectIdsFromVirtualFolder(folder);
    for (const id of ids) {
        try {
            await browser.runtime.sendMessage({ action: 'deleteBookmark', bookmarkId: id });
        } catch (e) { /* ignore */ }
    }
    loadBookmarks();
}


function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function collapseAllFolders() {
    const folders = bookmarkTreeEl.querySelectorAll('.folder');
    folders.forEach(folder => folder.classList.add('collapsed'));
}

function expandAllFolders() {
    const folders = bookmarkTreeEl.querySelectorAll('.folder');
    folders.forEach(folder => folder.classList.remove('collapsed'));
}

// Group by Domain
function toggleGroupByDomain() {
    groupByDomain = !groupByDomain;
    groupByDomainBtn.classList.toggle('active', groupByDomain);
    renderBookmarkTree();
}

function collectAllBookmarksFromTree(items) {
    const bookmarks = [];
    if (!items) return bookmarks;
    for (const item of items) {
        if (item.type === 'bookmark') {
            bookmarks.push(item);
        } else if (item.type === 'folder' && item.children) {
            bookmarks.push(...collectAllBookmarksFromTree(item.children));
        }
    }
    return bookmarks;
}

function groupBookmarksByDomain(items) {
    const allBookmarks = collectAllBookmarksFromTree(items);
    const domainMap = {};

    for (const bm of allBookmarks) {
        let domain = 'other';
        try {
            domain = new URL(bm.url).hostname.replace(/^www\./, '');
        } catch { /* keep 'other' */ }

        if (!domainMap[domain]) {
            domainMap[domain] = [];
        }
        domainMap[domain].push(bm);
    }

    // Convert to virtual folder objects, splitting large domains into subfolders
    return Object.keys(domainMap)
        .sort((a, b) => a.localeCompare(b))
        .map(domain => {
            const bookmarks = domainMap[domain];

            if (bookmarks.length > linksPerFolder) {
                // Split into numbered subfolders
                const children = [];
                for (let i = 0; i < bookmarks.length; i += linksPerFolder) {
                    const chunk = bookmarks.slice(i, i + linksPerFolder);
                    const startNum = i + 1;
                    const endNum = i + chunk.length;
                    children.push({
                        type: 'folder',
                        id: `domain-${domain}-${startNum}-${endNum}`,
                        title: `${startNum}-${endNum}`,
                        children: chunk,
                        updatedAt: 0,
                        dateAdded: 0
                    });
                }
                return {
                    type: 'folder',
                    id: `domain-${domain}`,
                    title: domain,
                    children,
                    updatedAt: 0,
                    dateAdded: 0
                };
            }

            return {
                type: 'folder',
                id: `domain-${domain}`,
                title: domain,
                children: bookmarks,
                updatedAt: 0,
                dateAdded: 0
            };
        });
}

// Search Handler
function handleSearch(e) {
    searchQuery = e.target.value.toLowerCase().trim();
    renderBookmarkTree();
}

// Sort Config
function toggleSortOrder() {
    currentSortOrder = currentSortOrder === 'desc' ? 'asc' : 'desc';
    updateSortIcon();
    renderBookmarkTree();
}

function updateSortIcon() {
    sortBtn.textContent = currentSortOrder === 'desc' ? '⬇️' : '⬆️';
    sortBtn.title = currentSortOrder === 'desc' ? 'Sort: Newest First' : 'Sort: Oldest First';
}

// Recursive Sort
function sortNodes(nodes) {
    if (!nodes) return [];

    return nodes.sort((a, b) => {
        // Folders always first? Replicating background logic preference
        const aIsFolder = a.type === 'folder';
        const bIsFolder = b.type === 'folder';

        if (aIsFolder && bIsFolder) {
            // Sort folders by time (updatedAt > dateAdded > title)
            const updatedA = a.updatedAt || 0;
            const updatedB = b.updatedAt || 0;

            if (updatedA !== updatedB) {
                return currentSortOrder === 'desc' ? updatedB - updatedA : updatedA - updatedB;
            }

            // Fallback to creation date
            const createdA = a.dateAdded || 0;
            const createdB = b.dateAdded || 0;

            if (createdA !== createdB) {
                return currentSortOrder === 'desc' ? createdB - createdA : createdA - createdB;
            }

            // Fallback to title
            return a.title.localeCompare(b.title);
        }

        if (aIsFolder && !bIsFolder) return -1;
        if (!aIsFolder && bIsFolder) return 1;

        return 0; // Keep bookmarks order (or sort them too if needed, but request focused on folders)
    }).map(node => {
        if (node.children) {
            node.children = sortNodes(node.children);
        }
        return node;
    });
}

// Recursive Filter
function filterNodes(nodes, query) {
    if (!query) return nodes;

    return nodes.filter(node => {
        const matchesRequest = (node.title && node.title.toLowerCase().includes(query)) ||
            (node.url && node.url.toLowerCase().includes(query));

        if (node.children) {
            node.children = filterNodes(node.children, query);
            // If it's a folder, keep it if it matches OR if it has matching children
            return matchesRequest || node.children.length > 0;
        }

        return matchesRequest;
    });
}
