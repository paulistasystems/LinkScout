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

// State
let linkscoutFolderId = null;
let trashFolderId = null;

document.addEventListener('DOMContentLoaded', () => {
    bookmarkTreeEl = document.getElementById('bookmarkTree');
    loadingStateEl = document.getElementById('loadingState');
    emptyStateEl = document.getElementById('emptyState');
    refreshBtn = document.getElementById('refreshBtn');
    collapseAllBtn = document.getElementById('collapseAllBtn');
    expandAllBtn = document.getElementById('expandAllBtn');

    // Event listeners
    refreshBtn.addEventListener('click', loadBookmarks);
    collapseAllBtn.addEventListener('click', collapseAllFolders);
    expandAllBtn.addEventListener('click', expandAllFolders);

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

        renderBookmarkTree(result.bookmarks);
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
        if (item.type === 'folder') {
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

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'folder-actions';

    const openAllBtn = document.createElement('button');
    openAllBtn.className = 'folder-action-btn open-all-btn';
    openAllBtn.title = 'Open all in tabs';
    openAllBtn.textContent = '🚀 Open all';
    actionsDiv.appendChild(openAllBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'folder-action-btn delete-folder-btn';
    deleteBtn.title = 'Excluir pasta'; // "Excluir pasta" as requested
    deleteBtn.textContent = '🗑️';
    actionsDiv.appendChild(deleteBtn);

    headerEl.appendChild(actionsDiv);

    headerEl.addEventListener('click', (e) => {
        if (!e.target.closest('.folder-action-btn')) {
            folderEl.classList.toggle('collapsed');
        }
    });

    openAllBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openAllInFolder(folder.id);
    });

    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteFolder(folder.id);
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
