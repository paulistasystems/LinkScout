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
  updateExistingTitles: false, // Update title of existing bookmarks if URL matches
  newestLinksFirst: true, // New links appear at the top of the folder
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
async function getLinksByFolder(folderId, newestFirst = true) {
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
        results.sort((a, b) => newestFirst
          ? b.createdAt - a.createdAt
          : a.createdAt - b.createdAt);
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
async function createOrUpdateBookmark(parentId, title, url, updateTitleIfExists = false, index = undefined, folderPath = '') {
  // Check global duplicate via IndexedDB
  const isGlobalDuplicate = await isLinkDuplicate(url);
  if (isGlobalDuplicate) {
    return { action: 'skipped', bookmark: null, reason: 'global_duplicate' };
  }

  const existing = await findExistingBookmark(parentId, url);

  if (existing) {
    if (updateTitleIfExists && existing.title !== title) {
      await browser.bookmarks.update(existing.id, { title });
      return { action: 'updated', bookmark: existing };
    }
    return { action: 'skipped', bookmark: existing };
  }

  const createOptions = { parentId, title, url };
  if (index !== undefined) {
    createOptions.index = index;
  }
  const newBookmark = await browser.bookmarks.create(createOptions);

  // Add to IndexedDB for global duplicate tracking with full metadata
  await addLinkToDatabase(url, title, parentId, folderPath);

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
    const newestFirst = settings.newestLinksFirst !== false; // Default to true
    const pageTitleFolder = await findOrCreateFolder(linkScoutFolder.id, pageTitle, newestFirst ? 0 : undefined);

    // Create bookmarks with subfolder logic
    const updateTitles = settings.updateExistingTitles || false;
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
            updateTitles,
            newestFirst ? 0 : undefined,
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
                updateTitles,
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
              updateTitles,
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
    // Removed notification code - Firefox notifications are unreliable
    return;
  }

  let successCount = 0;
  let skippedCount = 0;
  let updatedCount = 0;
  let failCount = 0;
  const tabsToClose = [];

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

    // Create a folder named after weekday, date, and time
    const now = new Date();
    const weekdays = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    const weekday = weekdays[now.getDay()];
    const date = now.toLocaleDateString('pt-BR');
    const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const sessionName = `${weekday} ${date} ${time}`;
    const newestFirst = settings.newestLinksFirst !== false; // Default to true
    const sessionFolder = await findOrCreateFolder(linkScoutFolder.id, sessionName, newestFirst ? 0 : undefined);

    // Create bookmarks with subfolder logic
    const updateTitles = settings.updateExistingTitles || false;
    const linksPerFolder = settings.linksPerFolder || 10;

    // Filter valid tabs first
    const validTabs = tabs.filter(tab =>
      tab.url && !tab.url.startsWith('about:') && !tab.url.startsWith('moz-extension:')
    );
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
              updateTitles,
              newestFirst ? 0 : undefined,
              subFolderPath
            );
            if (result.action === 'created') successCount++;
            else if (result.action === 'skipped') skippedCount++;
            else if (result.action === 'updated') updatedCount++;
            tabsToClose.push(tab.id);
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
            updateTitles,
            newestFirst ? 0 : undefined,
            sessionFolderPath
          );
          if (result.action === 'created') successCount++;
          else if (result.action === 'skipped') skippedCount++;
          else if (result.action === 'updated') updatedCount++;
          tabsToClose.push(tab.id);
        } catch (error) {
          failCount++;
        }
      }
    }

    // Close all saved tabs
    if (tabsToClose.length > 0) {
      // Create a new blank tab first to prevent browser from closing
      await browser.tabs.create({ active: true });
      await browser.tabs.remove(tabsToClose);
    }

    // Removed notification code - Firefox notifications are unreliable

  } catch (error) {
    // Removed notification code - Firefox notifications are unreliable
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

// Listen for messages from options page
browser.runtime.onMessage.addListener(async (message, sender) => {
  if (message.action === 'reorganizeFolders') {
    const result = await reorganizeAllFolders(message.settings);
    return result;
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