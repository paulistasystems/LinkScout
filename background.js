// LinkScout background.js

// Open options page on install
browser.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    browser.runtime.openOptionsPage();
  }
});

// Default settings
const DEFAULT_SETTINGS = {
  rootFolder: 'LinkScout',
  bookmarkLocation: 'toolbar_____', // toolbar_____, menu________, unfiled_____
  linksPerFolder: 10 // Maximum links per folder before creating subfolders
};

// IndexedDB for bookmark management
const DB_NAME = 'LinkScoutDB';
const DB_VERSION = 2; // Upgraded for new schema
const STORE_NAME = 'savedLinks';

let dbInstance = null;

// Generate unique ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// Initialize IndexedDB with new schema
function openDatabase() {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      const oldVersion = event.oldVersion;

      // Migration from v1 or fresh install
      if (oldVersion < 2) {
        // Delete old store if exists for clean migration
        if (db.objectStoreNames.contains(STORE_NAME)) {
          db.deleteObjectStore(STORE_NAME);
        }

        // Create new store with id as keyPath
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });

        // Unique index on URL - ensures global uniqueness
        store.createIndex('url', 'url', { unique: true });

        // Index for counting links by folder
        store.createIndex('folderId', 'folderId', { unique: false });

        // Index for ordering by creation date
        store.createIndex('createdAt', 'createdAt', { unique: false });

        // Compound index for folder + date ordering
        store.createIndex('folderPath_createdAt', ['folderPath', 'createdAt'], { unique: false });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onerror = () => {
      console.error('Failed to open IndexedDB:', request.error);
      reject(request.error);
    };
  });
}

// Check if a link already exists in the database (uses url index)
async function isLinkDuplicate(url) {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('url');
      const request = index.get(url);

      request.onsuccess = () => resolve(!!request.result);
      request.onerror = () => resolve(false);
    });
  } catch (error) {
    console.error('Error checking duplicate:', error);
    return false;
  }
}

// Add a link to the database with full metadata (returns false if duplicate)
async function addLinkToDatabase(url, title = '', folderId = '', folderPath = '') {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const record = {
        id: generateId(),
        url,
        title,
        folderId,
        folderPath,
        createdAt: Date.now(),
        order: 0
      };
      const request = store.add(record);

      request.onsuccess = () => resolve(true);
      request.onerror = () => resolve(false); // Duplicate URL (unique constraint)
    });
  } catch (error) {
    console.error('Error adding link to database:', error);
    return false;
  }
}

// Count links in a specific folder
async function getLinksCountByFolder(folderId) {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('folderId');
      const request = index.count(folderId);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(0);
    });
  } catch (error) {
    console.error('Error counting links:', error);
    return 0;
  }
}

// Get links from a folder, ordered by creation date
async function getLinksByFolder(folderId) {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('folderId');
      const request = index.getAll(folderId);

      request.onsuccess = () => {
        let results = request.result || [];
        // Sort by createdAt
        results.sort((a, b) => b.createdAt - a.createdAt);
        resolve(results);
      };
      request.onerror = () => resolve([]);
    });
  } catch (error) {
    console.error('Error getting links:', error);
    return [];
  }
}

// Remove a link from the database by URL
async function removeLinkFromDatabase(url) {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('url');
      const getRequest = index.get(url);

      getRequest.onsuccess = () => {
        if (getRequest.result) {
          const deleteRequest = store.delete(getRequest.result.id);
          deleteRequest.onsuccess = () => resolve(true);
          deleteRequest.onerror = () => resolve(false);
        } else {
          resolve(false);
        }
      };
      getRequest.onerror = () => resolve(false);
    });
  } catch (error) {
    console.error('Error removing link:', error);
    return false;
  }
}

// Recursively collect all bookmarks from a folder and its subfolders
async function collectBookmarksFromFolder(folderId, folderPath = '') {
  const bookmarks = [];
  try {
    const children = await browser.bookmarks.getChildren(folderId);
    for (const child of children) {
      if (child.url) {
        // It's a bookmark
        bookmarks.push({
          url: child.url,
          title: child.title,
          folderId: folderId,
          folderPath: folderPath
        });
      } else {
        // It's a folder, recurse into it
        const subFolderPath = folderPath ? `${folderPath}/${child.title}` : child.title;
        const subBookmarks = await collectBookmarksFromFolder(child.id, subFolderPath);
        bookmarks.push(...subBookmarks);
      }
    }
  } catch (error) {
    console.error('Error collecting bookmarks from folder:', error);
  }
  return bookmarks;
}

// Sync IndexedDB with existing bookmarks in LinkScout folder
async function syncDatabaseWithBookmarks() {
  try {
    const settings = await browser.storage.sync.get(DEFAULT_SETTINGS);
    let parentId = settings.bookmarkLocation || 'toolbar_____';

    // Find the root folder
    try {
      await browser.bookmarks.getChildren(parentId);
    } catch (e) {
      parentId = 'toolbar_____';
    }

    const children = await browser.bookmarks.getChildren(parentId);
    const rootFolderName = settings.rootFolder || 'LinkScout';
    const linkScoutFolder = children.find(child => child.title === rootFolderName && !child.url);

    if (!linkScoutFolder) {
      console.log('LinkScout folder not found, nothing to sync');
      return { synced: 0, skipped: 0 };
    }

    // Collect all bookmarks from LinkScout folder
    const allBookmarks = await collectBookmarksFromFolder(linkScoutFolder.id, rootFolderName);

    let synced = 0;
    let skipped = 0;

    for (const bookmark of allBookmarks) {
      const added = await addLinkToDatabase(bookmark.url, bookmark.title, bookmark.folderId, bookmark.folderPath);
      if (added) {
        synced++;
      } else {
        skipped++; // Already exists
      }
    }

    console.log(`Sync complete: ${synced} added, ${skipped} already existed`);
    return { synced, skipped };
  } catch (error) {
    console.error('Error syncing database with bookmarks:', error);
    return { synced: 0, skipped: 0, error: error.message };
  }
}

// Remove all links that have a folderPath starting with the given prefix
async function removeLinksByFolderPathPrefix(folderPathPrefix) {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.openCursor();
      let removedCount = 0;

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const record = cursor.value;
          // Check if folderPath starts with the prefix or equals the prefix
          if (record.folderPath && (record.folderPath === folderPathPrefix || record.folderPath.startsWith(folderPathPrefix + '/'))) {
            cursor.delete();
            removedCount++;
          }
          cursor.continue();
        } else {
          console.log(`Removed ${removedCount} links with folderPath prefix: ${folderPathPrefix}`);
          resolve(removedCount);
        }
      };
      request.onerror = () => resolve(0);
    });
  } catch (error) {
    console.error('Error removing links by folder path:', error);
    return 0;
  }
}

// Build folder path from bookmark node and its parents
async function buildFolderPathFromNode(removeInfo) {
  // We need to build the path from the parent chain
  // removeInfo.parentId gives us the parent folder ID
  try {
    const settings = await browser.storage.sync.get(DEFAULT_SETTINGS);
    const rootFolderName = settings.rootFolder || 'LinkScout';

    // Get the path by walking up the parent chain
    let path = removeInfo.node.title;
    let currentParentId = removeInfo.parentId;

    while (currentParentId) {
      try {
        const parents = await browser.bookmarks.get(currentParentId);
        if (parents && parents[0]) {
          const parent = parents[0];
          if (parent.title === rootFolderName) {
            path = rootFolderName + '/' + path;
            break;
          }
          path = parent.title + '/' + path;
          currentParentId = parent.parentId;
        } else {
          break;
        }
      } catch (e) {
        break;
      }
    }

    return path;
  } catch (error) {
    console.error('Error building folder path:', error);
    return null;
  }
}

// Listen for bookmark deletions and remove from IndexedDB
browser.bookmarks.onRemoved.addListener(async (id, removeInfo) => {
  // removeInfo.node contains the removed bookmark/folder
  const node = removeInfo.node;

  if (node.url) {
    // Single bookmark deleted
    const removed = await removeLinkFromDatabase(node.url);
    if (removed) {
      console.log('Removed from IndexedDB:', node.url);
    }
  } else {
    // Folder deleted - remove all bookmarks by folder path
    const folderPath = await buildFolderPathFromNode(removeInfo);
    if (folderPath) {
      await removeLinksByFolderPathPrefix(folderPath);
    }
  }

  // Update parent folder timestamp
  await updateFolderTimestamp(removeInfo.parentId);
});

// Sync database on extension startup
syncDatabaseWithBookmarks().then(result => {
  console.log('Initial sync result:', result);
});


function extractLinks(text) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const matches = text.match(urlRegex);
  return matches ? matches : [];
}

function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (e) {
    return "unknown";
  }
}

// Delay function for rate limiting
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function findOrCreateFolder(parentId, title, index = undefined) {
  try {
    const children = await browser.bookmarks.getChildren(parentId);
    const existingFolder = children.find(child => child.title === title && !child.url);

    if (existingFolder) {
      // Move existing folder to the specified index if provided
      if (index !== undefined && existingFolder.index !== index) {
        await browser.bookmarks.move(existingFolder.id, { parentId, index });
      }
      return existingFolder;
    }

    const createOptions = {
      parentId: parentId,
      title: title
    };
    if (index !== undefined) {
      createOptions.index = index;
    }
    const newFolder = await browser.bookmarks.create(createOptions);
    return newFolder;
  } catch (error) {
    throw error;
  }
}

// Find existing bookmark by URL in a folder
async function findExistingBookmark(parentId, url) {
  try {
    const children = await browser.bookmarks.getChildren(parentId);
    return children.find(child => child.url === url);
  } catch (error) {
    return null;
  }
}

// Create or update bookmark, avoiding duplicates globally via IndexedDB
async function createOrUpdateBookmark(parentId, title, url, index = undefined, folderPath = '') {
  // Check global duplicate via IndexedDB
  const isGlobalDuplicate = await isLinkDuplicate(url);
  if (isGlobalDuplicate) {
    return { action: 'skipped', bookmark: null, reason: 'global_duplicate' };
  }

  const existing = await findExistingBookmark(parentId, url);

  if (existing) {
    return { action: 'skipped', bookmark: existing };
  }

  const createOptions = { parentId, title, url };
  if (index !== undefined) {
    createOptions.index = index;
  }
  const newBookmark = await browser.bookmarks.create(createOptions);

  // Add to IndexedDB for global duplicate tracking with full metadata
  await addLinkToDatabase(url, title, parentId, folderPath);

  // Update folder timestamp
  await updateFolderTimestamp(parentId);

  return { action: 'created', bookmark: newBookmark };
}

async function createBookmarkStructure(links, pageTitle, settings) {
  let successCount = 0;
  let skippedCount = 0;
  let updatedCount = 0;
  let failCount = 0;

  try {
    // Get bookmark location from settings
    let parentId = settings.bookmarkLocation || 'toolbar_____';

    // Verify the location exists
    try {
      await browser.bookmarks.getChildren(parentId);
    } catch (locationError) {
      // Fallback to toolbar
      parentId = "toolbar_____";

      try {
        await browser.bookmarks.getChildren(parentId);
      } catch (toolbarError) {
        // Fallback to menu
        parentId = "menu________";
      }
    }

    // Create or find root folder
    const rootFolderName = settings.rootFolder || 'LinkScout';
    const linkScoutFolder = await findOrCreateFolder(parentId, rootFolderName);

    // Check if page title folder already exists
    const existingChildren = await browser.bookmarks.getChildren(linkScoutFolder.id);
    const existingFolder = existingChildren.find(child => child.title === pageTitle && !child.url);
    const folderAlreadyExists = !!existingFolder;

    // Create folder with page title
    const pageTitleFolder = await findOrCreateFolder(linkScoutFolder.id, pageTitle, 0);

    // Create bookmarks with subfolder logic

    const linksPerFolder = settings.linksPerFolder || 10;

    // If folder already exists, add links directly and then reorganize
    if (folderAlreadyExists) {
      // Add all new links directly to the folder (or to the last subfolder if subfolders exist)
      const baseFolderPath = `${rootFolderName}/${pageTitle}`;
      for (const link of links) {
        try {
          const result = await createOrUpdateBookmark(
            pageTitleFolder.id,
            link,
            link,
            0,
            baseFolderPath
          );
          if (result.action === 'created') successCount++;
          else if (result.action === 'skipped') skippedCount++;
          else if (result.action === 'updated') updatedCount++;
        } catch (error) {
          failCount++;
        }
      }

      // Reorganize the folder to maintain proper subfolder structure
      await reorganizePageFolder(pageTitleFolder.id, linksPerFolder);
    } else {
      // New folder - use the original logic
      const needsSubfolders = links.length > linksPerFolder;

      if (needsSubfolders) {
        // Split links into chunks and create subfolders
        const chunks = [];
        for (let i = 0; i < links.length; i += linksPerFolder) {
          chunks.push(links.slice(i, i + linksPerFolder));
        }

        for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
          const chunk = chunks[chunkIndex];
          const startNum = chunkIndex * linksPerFolder + 1;
          const endNum = startNum + chunk.length - 1;
          const folderName = `${startNum}-${endNum}`;
          const subFolder = await findOrCreateFolder(pageTitleFolder.id, folderName);

          const subFolderPath = `${rootFolderName}/${pageTitle}/${folderName}`;
          for (const link of chunk) {
            try {
              const result = await createOrUpdateBookmark(
                subFolder.id,
                link,
                link,
                undefined,
                subFolderPath
              );
              if (result.action === 'created') successCount++;
              else if (result.action === 'skipped') skippedCount++;
              else if (result.action === 'updated') updatedCount++;
            } catch (error) {
              failCount++;
            }
          }
        }
      } else {
        // Create bookmarks directly in page title folder (with duplicate detection)
        const directFolderPath = `${rootFolderName}/${pageTitle}`;
        for (const link of links) {
          try {
            const result = await createOrUpdateBookmark(
              pageTitleFolder.id,
              link,
              link,
              undefined,
              directFolderPath
            );
            if (result.action === 'created') successCount++;
            else if (result.action === 'skipped') skippedCount++;
            else if (result.action === 'updated') updatedCount++;
          } catch (error) {
            failCount++;
          }
        }
      }
    }

    // Removed notification code - Firefox notifications are unreliable

    return { successCount, skippedCount, updatedCount, failCount };

  } catch (error) {
    // Removed notification code - Firefox notifications are unreliable

    throw error;
  }
}

// Function to save all tabs and close them
async function saveAllTabsAndClose() {
  const settings = await browser.storage.sync.get(DEFAULT_SETTINGS);
  const tabs = await browser.tabs.query({ currentWindow: true });

  if (tabs.length === 0) {
    return;
  }

  // Filter valid tabs upfront — these will always be closed at the end
  const validTabs = tabs.filter(tab =>
    tab.url && !tab.url.startsWith('about:') && !tab.url.startsWith('moz-extension:')
  );

  if (validTabs.length === 0) {
    return;
  }

  // Collect all valid tab IDs to close — regardless of bookmark save success
  const tabsToClose = validTabs.map(tab => tab.id);

  let successCount = 0;
  let skippedCount = 0;
  let updatedCount = 0;
  let failCount = 0;

  try {
    // Get bookmark location from settings
    let parentId = settings.bookmarkLocation || 'toolbar_____';

    try {
      await browser.bookmarks.getChildren(parentId);
    } catch (locationError) {
      parentId = "toolbar_____";
      try {
        await browser.bookmarks.getChildren(parentId);
      } catch (toolbarError) {
        parentId = "menu________";
      }
    }

    // Create root folder
    const rootFolderName = settings.rootFolder || 'LinkScout';
    const linkScoutFolder = await findOrCreateFolder(parentId, rootFolderName);

    // Create a folder named after weekday - dd/mm/yyyy
    const now = new Date();
    const weekday = now.toLocaleDateString('en-US', { weekday: 'long' });
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const sessionName = `${weekday} - ${day}/${month}/${year}`;
    const sessionFolder = await findOrCreateFolder(linkScoutFolder.id, sessionName, 0);

    // Create bookmarks with subfolder logic
    const linksPerFolder = settings.linksPerFolder || 10;
    const needsSubfolders = validTabs.length > linksPerFolder;

    if (needsSubfolders) {
      // Split tabs into chunks and create subfolders
      const chunks = [];
      for (let i = 0; i < validTabs.length; i += linksPerFolder) {
        chunks.push(validTabs.slice(i, i + linksPerFolder));
      }

      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        const chunk = chunks[chunkIndex];
        const startNum = chunkIndex * linksPerFolder + 1;
        const endNum = startNum + chunk.length - 1;
        const folderName = `${startNum}-${endNum}`;
        const subFolder = await findOrCreateFolder(sessionFolder.id, folderName);

        const subFolderPath = `${rootFolderName}/${sessionName}/${folderName}`;
        for (const tab of chunk) {
          try {
            const result = await createOrUpdateBookmark(
              subFolder.id,
              tab.title || tab.url,
              tab.url,
              undefined,
              subFolderPath
            );
            if (result.action === 'created') successCount++;
            else if (result.action === 'skipped') skippedCount++;
            else if (result.action === 'updated') updatedCount++;
          } catch (error) {
            failCount++;
          }
        }
      }
    } else {
      // Create bookmarks directly in session folder
      const sessionFolderPath = `${rootFolderName}/${sessionName}`;
      for (const tab of validTabs) {
        try {
          const result = await createOrUpdateBookmark(
            sessionFolder.id,
            tab.title || tab.url,
            tab.url,
            0,
            sessionFolderPath
          );
          if (result.action === 'created') successCount++;
          else if (result.action === 'skipped') skippedCount++;
          else if (result.action === 'updated') updatedCount++;
        } catch (error) {
          failCount++;
        }
      }
    }
  } catch (error) {
    console.error('Error saving tabs as bookmarks:', error);
  }

  // Always close all valid tabs, regardless of bookmark save success/failure
  try {
    if (tabsToClose.length > 0) {
      // Create a new blank tab first to prevent browser from closing
      await browser.tabs.create({ active: true });
      await browser.tabs.remove(tabsToClose);
    }
  } catch (closeError) {
    console.error('Error closing tabs:', closeError);
  }
}

// Check if a folder name matches the numbered subfolder pattern (e.g., "1-10", "11-20")
function isNumberedSubfolder(title) {
  return /^\d+-\d+$/.test(title);
}

// Collect all bookmarks (links) from a folder, including from numbered subfolders
async function collectAllBookmarks(folderId) {
  const bookmarks = [];
  const children = await browser.bookmarks.getChildren(folderId);

  for (const child of children) {
    if (child.url) {
      // It's a bookmark
      bookmarks.push({ title: child.title, url: child.url });
    } else if (isNumberedSubfolder(child.title)) {
      // It's a numbered subfolder, collect its bookmarks
      const subChildren = await browser.bookmarks.getChildren(child.id);
      for (const subChild of subChildren) {
        if (subChild.url) {
          bookmarks.push({ title: subChild.title, url: subChild.url });
        }
      }
    }
  }

  return bookmarks;
}

// Remove numbered subfolders from a folder
async function removeNumberedSubfolders(folderId) {
  const children = await browser.bookmarks.getChildren(folderId);

  for (const child of children) {
    if (!child.url && isNumberedSubfolder(child.title)) {
      await browser.bookmarks.removeTree(child.id);
    }
  }
}

// Remove direct bookmarks from a folder (keeping subfolders)
async function removeDirectBookmarks(folderId) {
  const children = await browser.bookmarks.getChildren(folderId);

  for (const child of children) {
    if (child.url) {
      await browser.bookmarks.remove(child.id);
    }
  }
}

// Reorganize a single page folder based on linksPerFolder setting
async function reorganizePageFolder(folderId, linksPerFolder) {
  // Collect all bookmarks (from direct children and numbered subfolders)
  const allBookmarks = await collectAllBookmarks(folderId);

  if (allBookmarks.length === 0) return;

  // Remove existing numbered subfolders
  await removeNumberedSubfolders(folderId);

  // Remove direct bookmarks
  await removeDirectBookmarks(folderId);

  // Recreate structure based on new setting
  if (allBookmarks.length > linksPerFolder) {
    // Create chunks and subfolders
    const chunks = [];
    for (let i = 0; i < allBookmarks.length; i += linksPerFolder) {
      chunks.push(allBookmarks.slice(i, i + linksPerFolder));
    }

    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunk = chunks[chunkIndex];
      const startNum = chunkIndex * linksPerFolder + 1;
      const endNum = startNum + chunk.length - 1;
      const folderName = `${startNum}-${endNum}`;
      const subFolder = await findOrCreateFolder(folderId, folderName);

      for (const bookmark of chunk) {
        await browser.bookmarks.create({
          parentId: subFolder.id,
          title: bookmark.title,
          url: bookmark.url
        });
      }
    }
  } else {
    // Put all bookmarks directly in the folder
    for (const bookmark of allBookmarks) {
      await browser.bookmarks.create({
        parentId: folderId,
        title: bookmark.title,
        url: bookmark.url
      });
    }
  }
}

// Reorganize all folders inside LinkScout root folder
async function reorganizeAllFolders(settings) {
  try {
    // Get bookmark location
    let parentId = settings.bookmarkLocation || 'toolbar_____';

    try {
      await browser.bookmarks.getChildren(parentId);
    } catch (locationError) {
      parentId = "toolbar_____";
      try {
        await browser.bookmarks.getChildren(parentId);
      } catch (toolbarError) {
        parentId = "menu________";
      }
    }

    // Find root folder
    const rootFolderName = settings.rootFolder || 'LinkScout';
    const children = await browser.bookmarks.getChildren(parentId);
    const linkScoutFolder = children.find(child => child.title === rootFolderName && !child.url);

    if (!linkScoutFolder) {
      console.log('LinkScout folder not found, nothing to reorganize');
      return { success: true, message: 'No folder to reorganize' };
    }

    // Get all page title folders inside LinkScout
    const pageFolders = await browser.bookmarks.getChildren(linkScoutFolder.id);
    const linksPerFolder = settings.linksPerFolder || 10;

    let reorganizedCount = 0;
    for (const folder of pageFolders) {
      if (!folder.url) {
        // It's a folder, reorganize it
        await reorganizePageFolder(folder.id, linksPerFolder);
        reorganizedCount++;
      }
    }

    console.log(`Reorganized ${reorganizedCount} folders with ${linksPerFolder} links per folder`);
    return { success: true, reorganizedCount };

  } catch (error) {
    console.error('Error reorganizing folders:', error);
    return { success: false, error: error.message };
  }
}

// ============================================
// SIDEBAR FUNCTIONALITY
// ============================================

// Update timestamp for a folder and its ancestors when its content changes
async function updateFolderTimestamp(folderId) {
  try {
    const timestamps = (await browser.storage.local.get('folderTimestamps')).folderTimestamps || {};
    const now = Date.now();

    // Update the folder itself
    timestamps[folderId] = now;

    // Walk up the tree to update ancestors
    let currentId = folderId;

    // Safety break to prevent infinite loops
    let depth = 0;
    const MAX_DEPTH = 20;

    while (currentId && depth < MAX_DEPTH) {
      depth++;
      try {
        const results = await browser.bookmarks.get(currentId);
        if (!results || results.length === 0 || !results[0].parentId) {
          break;
        }

        const parentId = results[0].parentId;

        // Stop at root containers
        if (parentId === 'root________' || parentId === 'toolbar_____' ||
          parentId === 'menu________' || parentId === 'unfiled_____') {
          break;
        }

        // Update ancestor
        timestamps[parentId] = now;
        currentId = parentId;
      } catch (e) {
        // Folder might have been deleted or other error
        break;
      }
    }

    await browser.storage.local.set({ folderTimestamps: timestamps });
  } catch (error) {
    console.error('Error updating folder timestamp:', error);
  }
}

// Open a bookmark in new tab and remove it
async function openAndRemove(bookmarkId) {
  try {
    const bookmarks = await browser.bookmarks.get(bookmarkId);
    if (bookmarks.length === 0 || !bookmarks[0].url) {
      return { success: false, error: 'Bookmark not found' };
    }

    const bookmark = bookmarks[0];
    const parentId = bookmark.parentId;

    // Open in new tab
    await browser.tabs.create({ url: bookmark.url, active: false });

    // Remove the bookmark
    await browser.bookmarks.remove(bookmarkId);

    // Explicitly update parent folder timestamp to ensure it's fresh for the sidebar reload
    if (parentId) {
      await updateFolderTimestamp(parentId);
    }

    return { success: true };
  } catch (error) {
    console.error('Error opening and removing bookmark:', error);
    return { success: false, error: error.message };
  }
}


// Collect all bookmark IDs from a folder (recursive)
async function collectBookmarkIds(folderId) {
  const ids = [];
  const children = await browser.bookmarks.getChildren(folderId);

  for (const child of children) {
    if (child.url) {
      ids.push(child.id);
    } else {
      const subIds = await collectBookmarkIds(child.id);
      ids.push(...subIds);
    }
  }

  return ids;
}

// Open all bookmarks in a folder and remove
// Open all bookmarks in a folder and remove
async function openAllInFolderAndRemove(folderId) {
  try {
    const bookmarkIds = await collectBookmarkIds(folderId);
    let count = 0;

    // Get parent ID before deleting items, for timestamp update
    const folders = await browser.bookmarks.get(folderId);
    const parentId = folders[0] ? folders[0].parentId : null;

    for (const id of bookmarkIds) {
      const result = await openAndRemove(id);
      if (result.success) count++;
    }

    // Check if folder is empty and delete it if so
    const children = await browser.bookmarks.getChildren(folderId);
    if (children.length === 0) {
      await browser.bookmarks.remove(folderId);
      // Folder deleted, update parent's timestamp (it was modified)
      if (parentId) {
        await updateFolderTimestamp(parentId);
      }
    } else {
      // Folder remains, update its own timestamp so it moves to top (links were removed)
      await updateFolderTimestamp(folderId);
    }

    return { success: true, count };
  } catch (error) {
    console.error('Error opening all in folder:', error);
    return { success: false, count: 0, error: error.message };
  }
}

// Delete a folder and its contents
async function deleteFolderAndContents(folderId) {
  try {
    // Get parent ID before deleting, for timestamp update
    const folders = await browser.bookmarks.get(folderId);
    const parentId = folders[0] ? folders[0].parentId : null;

    await browser.bookmarks.removeTree(folderId);

    // Update parent timestamp to move it to top
    if (parentId) {
      await updateFolderTimestamp(parentId);
    }

    return { success: true };
  } catch (error) {
    console.error('Error deleting folder:', error);
    return { success: false, error: error.message };
  }
}

// Build bookmark tree for sidebar (sorted by last modified)
async function getBookmarkTreeForSidebar() {
  try {
    const settings = await browser.storage.sync.get(DEFAULT_SETTINGS);
    let parentId = settings.bookmarkLocation || 'toolbar_____';

    try {
      await browser.bookmarks.getChildren(parentId);
    } catch (e) {
      parentId = 'toolbar_____';
    }

    const children = await browser.bookmarks.getChildren(parentId);
    const rootFolderName = settings.rootFolder || 'LinkScout';
    const linkScoutFolder = children.find(child => child.title === rootFolderName && !child.url);

    if (!linkScoutFolder) {
      return { bookmarks: [], linkscoutFolderId: null };
    }

    // Get folder timestamps
    const timestamps = (await browser.storage.local.get('folderTimestamps')).folderTimestamps || {};

    // Build tree recursively
    async function buildTree(folderId) {
      const items = [];
      const children = await browser.bookmarks.getChildren(folderId);

      for (const child of children) {
        if (child.url) {
          items.push({
            id: child.id,
            title: child.title,
            url: child.url,
            type: 'bookmark',
            dateAdded: child.dateAdded || 0
          });
        } else {
          const subItems = await buildTree(child.id);
          items.push({
            id: child.id,
            title: child.title,
            type: 'folder',
            children: subItems,
            updatedAt: timestamps[child.id] || 0, // Default to 0 if not set
            dateAdded: child.dateAdded || 0
          });
        }
      }

      // Sort items: Folders first (by modified date), then bookmarks
      // Or just mix them and sort by specific logic? The request implies folders.
      // "na sidebar, altere para que a ultima pasta lida [...] seja ordenada no inicio"
      // User likely wants folders sorted by activity.

      items.sort((a, b) => {
        // If one is folder and other is bookmark, prioritize folder? 
        // Or just sort folders by date and leave bookmarks as is/by date?
        // Let's sort everything by "modified" if applicable, but bookmarks don't have explicit modified tracking here easily unless we add it.
        // For now, let's sort folders amongst themselves at the top.

        const aIsFolder = a.type === 'folder';
        const bIsFolder = b.type === 'folder';

        if (aIsFolder && bIsFolder) {
          return (b.updatedAt || 0) - (a.updatedAt || 0);
        }

        // Keep folders on top
        // if (aIsFolder && !bIsFolder) return -1;
        // if (!aIsFolder && bIsFolder) return 1;

        return 0; // Keep original order for bookmarks
      });

      return items;
    }

    const bookmarks = await buildTree(linkScoutFolder.id);

    return {
      bookmarks,
      linkscoutFolderId: linkScoutFolder.id
    };
  } catch (error) {
    console.error('Error getting bookmark tree:', error);
    return { error: error.message };
  }
}

// Setup alarm for daily trash cleanup - REMOVED
// browser.alarms.create('cleanup-trash', { periodInMinutes: 1440 }); // 24 hours

// browser.alarms.onAlarm.addListener((alarm) => {
//   if (alarm.name === 'cleanup-trash') {
//     cleanupOldTrashItems();
//   }
// });

// Run cleanup on startup - REMOVED
// cleanupOldTrashItems();

// Listen for messages from options page and sidebar
browser.runtime.onMessage.addListener(async (message, sender) => {
  if (message.action === 'reorganizeFolders') {
    const result = await reorganizeAllFolders(message.settings);
    return result;
  }

  // Sidebar message handlers
  if (message.action === 'getBookmarkTree') {
    return await getBookmarkTreeForSidebar();
  }

  if (message.action === 'openAndTrash') {
    return await openAndRemove(message.bookmarkId);
  }

  if (message.action === 'openAllInFolder') {
    return await openAllInFolderAndRemove(message.folderId);
  }

  if (message.action === 'deleteFolder') {
    return await deleteFolderAndContents(message.folderId);
  }
});

// Function to create context menus
async function createContextMenus() {
  // Remove all existing menus first
  await browser.contextMenus.removeAll();

  // Create menu items directly
  browser.contextMenus.create({
    id: "linkscout-save-links",
    title: "🔗 LinkScout: Salvar Links da Seleção",
    contexts: ["selection"]
  });

  browser.contextMenus.create({
    id: "linkscout-save-single-link",
    title: "🔗 LinkScout: Salvar Este Link",
    contexts: ["link"]
  });

  browser.contextMenus.create({
    id: "linkscout-save-all-tabs",
    title: "🔗 LinkScout: Salvar e Fechar Todas as Abas",
    contexts: ["page"]
  });

  browser.contextMenus.create({
    id: "linkscout-save-all-tabs-tab",
    title: "🔗 LinkScout: Salvar e Fechar Todas as Abas",
    contexts: ["tab"]
  });
}

// Create menus on startup
createContextMenus();

browser.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "linkscout-save-links") {
    // Try to get links from content script first (extracts actual href attributes)
    let links = [];
    let pageTitle = tab.title || "Untitled Page";

    try {
      const response = await browser.tabs.sendMessage(tab.id, { action: "getSelectedLinks" });

      if (response && response.links && response.links.length > 0) {
        links = response.links;
        pageTitle = response.pageTitle || pageTitle;
      }
    } catch (error) {
      // Content script not available, will fall back to text extraction
    }

    // Fallback: try to extract URLs from selection text
    if (links.length === 0 && info.selectionText) {
      links = extractLinks(info.selectionText);
    }

    if (links.length > 0) {
      // Load settings
      const settings = await browser.storage.sync.get(DEFAULT_SETTINGS);

      try {
        await createBookmarkStructure(links, pageTitle, settings);
      } catch (error) {
        // Error handled in createBookmarkStructure
      }
    } else {
      // Show notification about no links found
      const settings = await browser.storage.sync.get(DEFAULT_SETTINGS);
      // Removed notification code - Firefox notifications are unreliable
    }
  } else if (info.menuItemId === "linkscout-save-single-link") {
    if (info.linkUrl) {
      const pageTitle = tab.title || "Untitled Page";
      const links = [info.linkUrl];

      const settings = await browser.storage.sync.get(DEFAULT_SETTINGS);

      try {
        await createBookmarkStructure(links, pageTitle, settings);
      } catch (error) {
        // Error handled in createBookmarkStructure
      }
    } else {
      const settings = await browser.storage.sync.get(DEFAULT_SETTINGS);
      // Removed notification code - Firefox notifications are unreliable
    }
  } else if (info.menuItemId === "linkscout-save-all-tabs" || info.menuItemId === "linkscout-save-all-tabs-tab") {
    await saveAllTabsAndClose();
  }
});