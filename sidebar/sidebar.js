// LinkScout Sidebar Script

const TRASH_FOLDER_NAME = '🗑️ Lixeira';
const LINKSCOUT_FOLDER_NAME = 'LinkScout';

// DOM Elements
let bookmarkTreeEl;
let loadingStateEl;
let emptyStateEl;
let trashCountEl;
let trashContentEl;
let emptyTrashBtn;
let refreshBtn;

// State
let linkscoutFolderId = null;
let trashFolderId = null;

document.addEventListener('DOMContentLoaded', () => {
    bookmarkTreeEl = document.getElementById('bookmarkTree');
    loadingStateEl = document.getElementById('loadingState');
    emptyStateEl = document.getElementById('emptyState');
    trashCountEl = document.getElementById('trashCount');
    trashContentEl = document.getElementById('trashContent');
    emptyTrashBtn = document.getElementById('emptyTrashBtn');
    refreshBtn = document.getElementById('refreshBtn');

    // Event listeners
    refreshBtn.addEventListener('click', loadBookmarks);
    emptyTrashBtn.addEventListener('click', emptyTrash);
    document.querySelector('.trash-header').addEventListener('click', toggleTrashContent);

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
        trashFolderId = result.trashFolderId;

        renderBookmarkTree(result.bookmarks);
        renderTrash(result.trash);
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

function renderBookmarkTree(items) {
    bookmarkTreeEl.innerHTML = '';

    // Filter out empty folders
    const filteredItems = filterEmptyFolders(items);

    if (!filteredItems || filteredItems.length === 0) {
        showEmpty(true);
        return;
    }

    showEmpty(false);

    filteredItems.forEach(item => {
        if (item.type === 'folder' && item.title !== TRASH_FOLDER_NAME) {
            bookmarkTreeEl.appendChild(createFolderElement(item));
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
    headerEl.innerHTML = `
        <span class="folder-toggle">▼</span>
        <span class="folder-icon">📁</span>
        <span class="folder-name">${escapeHtml(folder.title)}</span>
        <span class="folder-count">${bookmarkCount}</span>
        <div class="folder-actions">
            <button class="folder-action-btn open-all-btn" title="Abrir tudo em abas">🚀 Abrir tudo</button>
        </div>
    `;

    headerEl.addEventListener('click', (e) => {
        if (!e.target.closest('.folder-action-btn')) {
            folderEl.classList.toggle('collapsed');
        }
    });

    const openAllBtn = headerEl.querySelector('.open-all-btn');
    openAllBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openAllInFolder(folder.id);
    });

    folderEl.appendChild(headerEl);

    if (folder.children && folder.children.length > 0) {
        const contentEl = document.createElement('div');
        contentEl.className = 'folder-content';

        folder.children.forEach(child => {
            if (child.type === 'folder' && child.title !== TRASH_FOLDER_NAME) {
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

    itemEl.innerHTML = `
        ${faviconUrl
            ? `<img class="bookmark-favicon" src="${faviconUrl}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="bookmark-favicon-placeholder" style="display:none">🔗</div>`
            : `<div class="bookmark-favicon-placeholder">🔗</div>`
        }
        <span class="bookmark-title" title="${escapeHtml(bookmark.url)}">${escapeHtml(bookmark.title || bookmark.url)}</span>
    `;

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

function renderTrash(trashItems) {
    const count = trashItems ? trashItems.length : 0;
    trashCountEl.textContent = count;
    emptyTrashBtn.disabled = count === 0;

    trashContentEl.innerHTML = '';

    if (trashItems && trashItems.length > 0) {
        trashItems.forEach(item => {
            if (item.type === 'bookmark') {
                trashContentEl.appendChild(createBookmarkElement(item));
            }
        });
    }
}

function toggleTrashContent() {
    const isVisible = trashContentEl.style.display !== 'none';
    trashContentEl.style.display = isVisible ? 'none' : 'block';
}

async function emptyTrash() {
    if (!confirm('Tem certeza que deseja esvaziar a lixeira? Esta ação não pode ser desfeita.')) {
        return;
    }

    try {
        await browser.runtime.sendMessage({ action: 'emptyTrash' });
        loadBookmarks();
    } catch (error) {
        console.error('Error emptying trash:', error);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
