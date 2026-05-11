// LinkScout background.js

// Redireciona todos os logs do background para o console da aba ativa (F12 normal do navegador), 
// contornando falhas no console 'about:debugging'.
const originalConsoles = {
  log: console.log,
  warn: console.warn,
  error: console.error
};

function forwardToActiveTab(type, args) {
  try {
    const formattedArgs = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a));
    browser.tabs.query({active: true, currentWindow: true}).then(tabs => {
      const activeTab = tabs[0];
      // Só injeta se for uma página web real (evita páginas de sistema como about: e moz-extension:)
      if (activeTab && activeTab.id && activeTab.url && activeTab.url.startsWith('http')) {
        const code = `console.${type}("[LinkScout 🤖]", ...${JSON.stringify(formattedArgs)});`;
        browser.tabs.executeScript(activeTab.id, { code: code }).catch(() => {});
      }
    }).catch(() => {});
  } catch (e) {
    // Ignorar falhas de injeção silenciosamente
  }
}

console.log = (...args) => {
  originalConsoles.log(...args);
  forwardToActiveTab('log', args);
};
console.warn = (...args) => {
  originalConsoles.warn(...args);
  forwardToActiveTab('warn', args);
};
console.error = (...args) => {
  originalConsoles.error(...args);
  forwardToActiveTab('error', args);
};

// Open options page on install
browser.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    browser.runtime.openOptionsPage();
  }
});

// Toggle sidebar when toolbar icon is clicked
browser.browserAction.onClicked.addListener(() => {
  browser.sidebarAction.toggle();
});

// Default settings
const DEFAULT_SETTINGS = {
  rootFolder: 'LinkScout',
  bookmarkLocation: 'toolbar_____', // toolbar_____, menu________, unfiled_____
  enableUrlResolver: false,
  aggregatorDomains: [] // Empty by default! Phantom tab is only for user-specified manual targets
};

// Auto-migrate user settings to ensure new tracking domains are covered
async function ensureMigratedSettings() {
  const settings = await browser.storage.sync.get(DEFAULT_SETTINGS);
  let domains = settings.aggregatorDomains || [];
  let changed = false;
  
  // Clean up pure redirectors from the list because they resolve much faster and robustly via HEAD request natively
  const pureRedirects = ['t.co', 't.co/', 'bit.ly', 'bit.ly/', 'tinyurl.com', 'tinyurl.com/', 'lnkd.in', 'lnkd.in/', 'news.google.com', 'google.com/url'];
  const oldLength = domains.length;
  domains = domains.filter(d => !pureRedirects.includes(d));
  if (domains.length !== oldLength) changed = true;

  // Start with default recommended domains if empty
  if (domains.length === 0) {
    domains = [
      'l.facebook.com', 'm.facebook.com', 'facebook.com/l.php', 'l.messenger.com', 'out.reddit.com',
      'youtube.com/redirect'
    ];
    changed = true;
  }

  // Normalize existing facebook domains and add new ones
  const facebookMigrations = [
    {old: 'l.facebook.com/', new: 'l.facebook.com'},
    {old: 'l.messenger.com/', new: 'l.messenger.com'},
    {old: 'out.reddit.com/', new: 'out.reddit.com'}
  ];
  
  for (const m of facebookMigrations) {
    if (domains.includes(m.old)) {
      domains[domains.indexOf(m.old)] = m.new;
      changed = true;
    }
  }

  if (!domains.includes('facebook.com/l.php')) {
    domains.push('facebook.com/l.php');
    changed = true;
  }
  if (!domains.includes('m.facebook.com')) {
    domains.push('m.facebook.com');
    changed = true;
  }

  if (changed) {
    await browser.storage.sync.set({ aggregatorDomains: domains });
    settings.aggregatorDomains = domains;
  }
  return settings;
}

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
async function addLinkToDatabase(url, title = '', folderId = '', folderPath = '', originalUrl = '', redirectResolved = false) {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const record = {
        id: generateId(),
        url,
        originalUrl: originalUrl || url,
        title,
        folderId,
        folderPath,
        createdAt: Date.now(),
        order: 0,
        redirectResolved
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

// Update a link's URL in IndexedDB after resolution
async function updateLinkUrlInDatabase(oldUrl, newUrl, newTitle) {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('url');
      const getRequest = index.get(oldUrl);

      getRequest.onsuccess = () => {
        const record = getRequest.result;
        if (record) {
          const updatedRecord = {
            ...record,
            originalUrl: record.originalUrl || oldUrl,
            url: newUrl,
            title: newTitle || record.title,
            redirectResolved: true
          };
          const putRequest = store.put(updatedRecord);
          putRequest.onsuccess = () => resolve(true);
          putRequest.onerror = () => {
            // If put fails (e.g. unique constraint on new URL), delete old and skip
            console.warn(`[LinkScout] updateLinkUrlInDatabase: put failed for ${newUrl}, likely duplicate`);
            resolve(false);
          };
        } else {
          resolve(false);
        }
      };
      getRequest.onerror = () => resolve(false);
    });
  } catch (error) {
    console.error('Error updating link URL in database:', error);
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
          id: child.id,
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

    // Collect all bookmarks from LinkScout folder (including root-level ones from Firefox Sync)
    const allBookmarks = await collectBookmarksFromFolder(linkScoutFolder.id, rootFolderName);

    let synced = 0;
    let skipped = 0;
    let purgedClones = 0;
    const seenUrls = new Set();
    const liveBookmarkUrls = new Set();

    for (const bookmark of allBookmarks) {
      if (seenUrls.has(bookmark.url)) {
        // It's a duplicate inside Firefox
        try {
          await browser.bookmarks.remove(bookmark.id);
          purgedClones++;
        } catch (e) {}
      } else {
        seenUrls.add(bookmark.url);
        liveBookmarkUrls.add(bookmark.url);
        // Safely attempt to add to IndexedDB
        const added = await addLinkToDatabase(bookmark.url, bookmark.title, bookmark.folderId, bookmark.folderPath);
        if (added) {
          synced++;
        } else {
          skipped++; // Already exists in IDB, but it's the primary one in Firefox
        }
      }
    }

    // Reverse sync: purge IndexedDB records whose bookmarks were deleted via Firefox Sync
    let purgedOrphans = 0;
    try {
      const db = await openDatabase();
      const allRecords = await new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => resolve([]);
      });

      for (const record of allRecords) {
        // Only purge records that belong to our LinkScout folder tree
        if (record.folderPath && record.folderPath.startsWith(rootFolderName)) {
          if (!liveBookmarkUrls.has(record.url)) {
            // This record's bookmark no longer exists in Firefox — likely deleted via Sync
            try {
              await new Promise((resolve) => {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                store.delete(record.id);
                tx.oncomplete = () => resolve();
                tx.onerror = () => resolve();
              });
              purgedOrphans++;
              console.log(`[LinkScout] Reverse sync: Purged orphan from IndexedDB: ${record.url}`);
            } catch (e) {}
          }
        }
      }
    } catch (e) {
      console.error('[LinkScout] Reverse sync error:', e);
    }

    console.log(`Sync complete: ${synced} added, ${skipped} already existed. Purged ${purgedClones} Firefox zombie clones, ${purgedOrphans} orphaned IndexedDB records.`);
    return { synced, skipped, purgedClones, purgedOrphans };
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

let syncTimeoutId = null;
let resolvingUrlsCount = 0;

function requestDatabaseSync() {
  // Suppress sync during URL resolution to prevent race conditions with dedup
  if (resolvingUrlsCount > 0) {
    console.log('[LinkScout] Sync suprimido: resolução de URLs em andamento.');
    return;
  }
  if (syncTimeoutId) clearTimeout(syncTimeoutId);
  syncTimeoutId = setTimeout(async () => {
    syncTimeoutId = null;
    await syncDatabaseWithBookmarks();
    runBackgroundVerification();
  }, 2500);
}

// Listen for bookmark deletions and remove from IndexedDB
browser.bookmarks.onRemoved.addListener(async (id, removeInfo) => {
  const node = removeInfo.node;

  if (node.url) {
    const removed = await removeLinkFromDatabase(node.url);
    if (removed) {
      console.log('Removed from IndexedDB:', node.url);
    }
  } else {
    const folderPath = await buildFolderPathFromNode(removeInfo);
    if (folderPath) {
      await removeLinksByFolderPathPrefix(folderPath);
    }
  }

  await updateFolderTimestamp(removeInfo.parentId);
  requestDatabaseSync();
});

// Listen for new bookmark creations (or folders)
browser.bookmarks.onCreated.addListener(async (id, bookmark) => {
  if (isRestoringBookmarks) return;
  await updateFolderTimestamp(bookmark.parentId);
  requestDatabaseSync();
});

// Listen for bookmark changes (e.g. title or url changed natively in Firefox)
browser.bookmarks.onChanged.addListener(async (id, changeInfo) => {
  try {
    const results = await browser.bookmarks.get(id);
    if (results && results.length > 0) {
      await updateFolderTimestamp(results[0].parentId);
    }
  } catch(e) {}
  
  requestDatabaseSync();
});

// Listen for bookmark moves (from one folder to another, or changing index)
browser.bookmarks.onMoved.addListener(async (id, moveInfo) => {
  await updateFolderTimestamp(moveInfo.oldParentId);
  await updateFolderTimestamp(moveInfo.parentId);
  requestDatabaseSync();
});


// Deduplicate existing database records by normalizing URLs
// Runs asynchronously in background to avoid blocking the browser
async function deduplicateExistingDatabase() {
  try {
    const db = await openDatabase();

    // Get all records
    const allRecords = await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    });

    if (allRecords.length === 0) {
      console.log('[LinkScout] No records to deduplicate');
      return { removed: 0, updated: 0, total: 0 };
    }

    console.log(`[LinkScout] Deduplication: Analyzing ${allRecords.length} records...`);

    // Group records by normalized URL
    const groups = new Map();
    for (const record of allRecords) {
      const normalizedUrl = normalizeUrl(record.url);
      if (!groups.has(normalizedUrl)) {
        groups.set(normalizedUrl, []);
      }
      groups.get(normalizedUrl).push(record);
    }

    let removedCount = 0;
    let updatedCount = 0;
    const duplicateGroups = [...groups.entries()].filter(([, g]) => g.length > 1);

    console.log(`[LinkScout] Found ${duplicateGroups.length} groups with duplicates`);

    for (const [normalizedUrl, records] of duplicateGroups) {
      // Sort by createdAt ascending — keep the oldest
      records.sort((a, b) => a.createdAt - b.createdAt);
      const duplicates = records.slice(1);

      // Remove duplicate records and their Firefox bookmarks
      for (const dup of duplicates) {
        try {
          // Remove from IndexedDB
          await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const request = store.delete(dup.id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
          });

          // Remove corresponding Firefox bookmark (only within its stored folder)
          if (dup.folderId) {
            try {
              const children = await browser.bookmarks.getChildren(dup.folderId);
              const bookmark = children.find(c => c.url === dup.url);
              if (bookmark) {
                await browser.bookmarks.remove(bookmark.id);
              }
            } catch (e) {
              // Folder might not exist anymore, skip
            }
          }

          removedCount++;
          console.log(`[LinkScout] Removed duplicate: ${dup.url}`);
        } catch (e) {
          console.error('[LinkScout] Error removing duplicate:', e);
        }

        // Small delay to avoid blocking the browser
        await delay(10);
      }

      // Update the kept record's URL to normalized version if it changed
      const keepRecord = records[0];
      if (keepRecord.url !== normalizedUrl) {
        const newTitle = (keepRecord.title === keepRecord.url) ? normalizedUrl : keepRecord.title;
        try {
          await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const updatedRecord = {
              ...keepRecord,
              originalUrl: keepRecord.originalUrl || keepRecord.url,
              url: normalizedUrl,
              title: newTitle
            };
            store.put(updatedRecord);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          });

          // Also update the Firefox bookmark URL
          if (keepRecord.folderId) {
            try {
              const children = await browser.bookmarks.getChildren(keepRecord.folderId);
              const bookmark = children.find(c => c.url === keepRecord.url);
              if (bookmark) {
                await browser.bookmarks.update(bookmark.id, { url: normalizedUrl, title: newTitle });
              }
            } catch (e) {
              // Folder might not exist, skip
            }
          }

          updatedCount++;
        } catch (e) {
          console.error('[LinkScout] Error updating record URL:', e);
        }
      }
    }

    console.log(`[LinkScout] Deduplication complete: ${removedCount} removed, ${updatedCount} updated out of ${allRecords.length} total`);
    return { removed: removedCount, updated: updatedCount, total: allRecords.length };
  } catch (error) {
    console.error('[LinkScout] Deduplication error:', error);
    return { removed: 0, updated: 0, error: error.message };
  }
}



let isBackgroundJobRunning = false;
let isRestoringBookmarks = false;

async function runBackgroundVerification() {
  if (isBackgroundJobRunning) {
    console.log('[LinkScout] Processo em background já está rodando. Ignorando novo disparo.');
    return;
  }
  
  isBackgroundJobRunning = true;
  console.log('[LinkScout] Iniciando processo de verificação em background...');
  try {
    const dedupeResult = await deduplicateExistingDatabase();
    console.log('[LinkScout] Deduplication result:', dedupeResult);
  } catch (error) {
    console.error('[LinkScout] Erro na verificação em background:', error);
  } finally {
    isBackgroundJobRunning = false;
    console.log('[LinkScout] Processo de verificação em background finalizado.');
  }
}

// Disaster recovery: restore bookmarks from IndexedDB if Firefox tree is empty
async function restoreBookmarksFromDB() {
  try {
    const settings = await browser.storage.sync.get(DEFAULT_SETTINGS);
    let parentId = settings.bookmarkLocation || 'toolbar_____';
    try { await browser.bookmarks.getChildren(parentId); } catch(e) { parentId = 'toolbar_____'; }

    const children = await browser.bookmarks.getChildren(parentId);
    const rootFolderName = settings.rootFolder || 'LinkScout';
    const linkScoutFolder = children.find(child => child.title === rootFolderName && !child.url);

    if (linkScoutFolder) {
      const allBms = await collectBookmarksFromFolder(linkScoutFolder.id, rootFolderName);
      if (allBms.length > 0) return; // Not empty, no need to restore
    }

    const db = await openDatabase();
    const allRecords = await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    });

    if (allRecords.length === 0) return; // DB is empty too

    console.log('[LinkScout] Iniciando restauração de emergência! Restabelecendo', allRecords.length, 'links do IndexedDB para o Firefox.');
    isRestoringBookmarks = true;

    const root = await findOrCreateFolder(parentId, rootFolderName);
    
    // Group records by folderPath
    const recordsByPath = {};
    for (const rec of allRecords) {
       const path = rec.folderPath || rootFolderName;
       if (!recordsByPath[path]) recordsByPath[path] = [];
       recordsByPath[path].push(rec);
    }

    for (const [path, recs] of Object.entries(recordsByPath)) {
       const parts = path.split('/');
       let currentParentId = root.id;
       let startIndex = parts[0] === rootFolderName ? 1 : 0;
       
       for (let i = startIndex; i < parts.length; i++) {
          if (!parts[i]) continue;
          const folder = await findOrCreateFolder(currentParentId, parts[i]);
          currentParentId = folder.id;
       }

       for (const rec of recs) {
          try {
             await browser.bookmarks.create({
                parentId: currentParentId,
                title: rec.title || rec.url,
                url: rec.url
             });
          } catch(e) {}
       }
    }
    
    isRestoringBookmarks = false;
    console.log('[LinkScout] Restauração de emergência concluída.');
  } catch (e) {
    isRestoringBookmarks = false;
    console.error('[LinkScout] Erro na restauração:', e);
  }
}

// Sync database on extension startup, then run deduplication in background
restoreBookmarksFromDB().then(() => {
  syncDatabaseWithBookmarks().then(result => {
    console.log('Initial sync result:', result);
    runBackgroundVerification();
  });
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

// Try to fetch the page title from a URL by loading it and parsing <title>
async function fetchPageTitle(url) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return null;

    // Read only the first chunk of the response to find <title> without downloading the full page
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let html = '';

    while (html.length < 50000) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });

      // Check if we have a complete <title> tag
      const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (match) {
        reader.cancel();
        const title = match[1].trim().replace(/\s+/g, ' ');
        return title || null;
      }
    }
    reader.cancel();
    return null;
  } catch (e) {
    return null;
  }
}

// Normalize URL by removing tracking parameters, fragments, and trailing slashes
function normalizeUrl(url) {
  try {
    const urlObj = new URL(url);
    const trackingParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
      'fbclid', 'gclid', 'dclid', 'msclkid', 'twclid',
      'mc_cid', 'mc_eid', 'ref', '_ref', 'ref_', '_ga', '_gid',
      'yclid', 'zanpid', 'igshid'
    ];
    trackingParams.forEach(p => urlObj.searchParams.delete(p));
    urlObj.hash = '';
    let normalized = urlObj.toString();
    if (urlObj.pathname !== '/' && normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch (e) {
    return url;
  }
}

// Extract target URL directly from query parameters without making requests if possible
function extractTargetFromRedirectUrl(url) {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname;
    
    // Google News: try to decode CBM base64 protobuf encoded articles
    if (domain.includes('news.google.com') && (urlObj.pathname.includes('/articles/') || urlObj.pathname.includes('/read/'))) {
      try {
        const b64 = urlObj.pathname.split(/\/articles\/|\/read\//)[1].split('?')[0];
        if (b64) {
          let safeB64 = b64.replace(/-/g, '+').replace(/_/g, '/');
          while (safeB64.length % 4) safeB64 += '='; // Essential padding for atob()
          const text = atob(safeB64);
          const httpIndex = text.indexOf('http');
          if (httpIndex !== -1) {
            let finalUrl = '';
            for (let i = httpIndex; i < text.length; i++) {
              const charCode = text.charCodeAt(i);
              // ASCII printable characters range from 32 to 126
              if (charCode >= 32 && charCode <= 126) {
                finalUrl += text[i];
              } else {
                break; // End of string in protobuf
              }
            }
            if (finalUrl.startsWith('http')) return decodeURIComponent(finalUrl);
          }
        }
      } catch (e) {
        // If decoding fails, naturally fallback to phantom tab or HEAD request
        console.error('[LinkScout] Google News base64 parse error:', e);
      }
    }

    // Facebook and Messenger: look for 'u' parameter, especially in l.php or /flx/warn
    if (domain.includes('facebook.com') || domain.includes('messenger.com')) {
      const u = urlObj.searchParams.get('u');
      if (u) return decodeURIComponent(u);
    }
    
    // YouTube redirect: look for 'q' parameter
    if (domain.includes('youtube.com') && urlObj.pathname.includes('/redirect')) {
      const q = urlObj.searchParams.get('q');
      if (q) return decodeURIComponent(q);
    }
    
    // Reddit out domain: look for 'url' parameter
    if (domain.includes('reddit.com')) {
      const urlParam = urlObj.searchParams.get('url');
      if (urlParam) return decodeURIComponent(urlParam);
    }

    // Google custom redirect tracking
    if (domain.includes('google.com') && urlObj.pathname.includes('/url')) {
      const q = urlObj.searchParams.get('q') || urlObj.searchParams.get('url');
      if (q) return decodeURIComponent(q);
    }

    return null;
  } catch (e) {
    return null;
  }
}

// Resolve URL by opening a hidden background tab, waiting for JS redirects, and capturing the final URL
async function resolveUrlWithPhantomTab(url, aggregatorDomains) {
  return new Promise(async (resolve) => {
    let resolved = false;
    let fallbackTimeout;
    let tabId = null;
    let childTabIds = [];

    console.log(`[LinkScout 🔍 Resolve] Phantom Tab: Iniciando para ${url}`);
    console.log(`[LinkScout 🔍 Resolve] Phantom Tab: Domínios agregadores ativos: ${aggregatorDomains.join(', ')}`);

    function cleanup(finalUrl) {
      if (resolved) return;
      resolved = true;
      clearTimeout(fallbackTimeout);
      browser.tabs.onUpdated.removeListener(tabUpdateListener);
      browser.tabs.onCreated.removeListener(tabCreatedListener);
      
      if (tabId !== null) {
        browser.tabs.remove(tabId).catch(() => {});
      }
      for (const cId of childTabIds) {
        browser.tabs.remove(cId).catch(() => {});
      }
      
      console.log(`[LinkScout 🔍 Resolve] Phantom Tab: Resolvido final -> ${finalUrl}`);
      resolve(normalizeUrl(finalUrl));
    }

    function tabCreatedListener(tab) {
      // Rastrear abas filhas e netas geradas pela aba rastreadora original
      if (tab.openerTabId === tabId || childTabIds.includes(tab.openerTabId)) {
         console.log(`[LinkScout 🔍 Resolve] Phantom Tab: Interceptou nova aba filha gerada: ${tab.id}`);
         childTabIds.push(tab.id);
      }
    }

    function tabUpdateListener(updatedTabId, changeInfo, updatedTab) {
      // Analisar tanto a aba raiz quanto as suas crias diretas
      if (updatedTabId === tabId || childTabIds.includes(updatedTabId)) {
        // Se a URL mudou e já não é mais um link agregador (escapou do redirecionador)
        if (updatedTab.url && updatedTab.url !== url && updatedTab.url !== 'about:blank') {
           const isStillAggregator = aggregatorDomains.some(domain => {
             try {
               const u = new URL(updatedTab.url);
               return (u.hostname + u.pathname).includes(domain);
             } catch (e) {
               return updatedTab.url.includes(domain);
             }
           });
           
           if (!isStillAggregator) {
             console.log(`[LinkScout 🔍 Resolve] Phantom Tab: Detectou redirecionamento externo na aba ${updatedTabId}: ${updatedTab.url}`);
             cleanup(updatedTab.url);
           }
        }
      }
    }

    try {
      // Cria a aba em background silenciosa
      const tab = await browser.tabs.create({ url: url, active: false });
      tabId = tab.id;
      
      // Injetar blindagem para forçar redirecionamento na mesma janela (evita abas órfãs com noopener)
      browser.tabs.executeScript(tabId, {
        code: `
          const s = document.createElement('script');
          s.textContent = "window.open = function(u){ window.location.href = u; return window; };";
          (document.head || document.documentElement).appendChild(s);
          document.addEventListener('click', e => {
            const a = e.target.closest('a');
            if (a) { a.removeAttribute('target'); }
          }, true);
        `,
        runAt: "document_start"
      }).catch(() => {});
      
      browser.tabs.onCreated.addListener(tabCreatedListener);
      browser.tabs.onUpdated.addListener(tabUpdateListener);

      // Timeout de 15 segundos para evitar phantom tabs acumuladas
      fallbackTimeout = setTimeout(() => {
        if (resolved) return;
        console.warn(`[LinkScout 🔍 Resolve] Phantom Tab: ⏱️ Timeout alcançado (15s) para ${url}. Fechando todas as abas vinculadas.`);
        browser.tabs.get(tabId).then(t => {
          // Fallback: se travou no redirecionador nativo do google, extrair param
          if (t.url && t.url.includes('google.com/url')) {
             try {
               let u = new URL(t.url);
               let q = u.searchParams.get('q') || u.searchParams.get('url');
               if (q) {
                 console.log(`[LinkScout 🔍 Resolve] Phantom Tab: Extração manual segura via parametro q para ${t.url}`);
                 return cleanup(q);
               }
             } catch(e) {}
          }
          cleanup(t.url || url);
        }).catch(() => {
          cleanup(url);
        });
      }, 15000);
    } catch (e) {
      console.error("[LinkScout 🔍 Resolve] Phantom Tab: ❌ Erro crítico ao criar aba raiz:", e);
      cleanup(url);
    }
  });
}

// Resolve URL by following redirects via HEAD request (with timeout)
// Falls back to normalizeUrl if the request fails
// IMPORTANT: This function MUST NEVER throw — always returns a URL (original if resolution fails)
async function resolveUrl(url, depth = 0) {
  try {
  console.log(`[LinkScout 🔍 Resolve] resolveUrl: Iniciando (depth=${depth}) para ${url}`);
  
  if (depth > 10) {
    console.warn(`[LinkScout 🔍 Resolve] resolveUrl: ⚠️ Limite de recursão alcançado para ${url}`);
    return url;
  }
  
  // Try static extraction first to bypass warning pages and save time (Facebook, Reddit, YT, Google tracking)
  const extractResult = extractTargetFromRedirectUrl(url);
  if (extractResult && extractResult !== url) {
    console.log(`[LinkScout 🔍 Resolve] resolveUrl: ✅ Extração estática bem-sucedida: ${url} -> ${extractResult}`);
    // Recurse to handle chained redirects!
    return resolveUrl(extractResult, depth + 1);
  } else if (extractResult === url) {
    console.log(`[LinkScout 🔍 Resolve] resolveUrl: Extração estática retornou mesma URL, sem redirecionamento`);
    return url;
  }

  const settings = await ensureMigratedSettings();
  const aggregatorDomains = settings.aggregatorDomains;
  
  const googleNewsHubs = ['/stories/', '/topics/', '/publications/', '/showcase', '/my/library', '/foryou', '/home'];
  const isHub = (url.includes('news.google.com') && googleNewsHubs.some(hub => url.includes(hub))) || url.includes('accounts.google.com/SignOutOptions');

  // Sempre considerar esses domínios como agregadores para fallback de Aba Fantasma, 
  // caso a extração estática falhe (ex: /stories/ do Google News que usa JS para redirecionar)
  const isAggregator = (aggregatorDomains.some(domain => url.includes(domain)) || 
                       url.includes('news.google.com') ||
                       url.includes('google.com/url')) &&
                       !isHub;

  // Usar Aba Fantasma para links agregadores que podem rodar via Javascript ou bloquear HEAD
  if (isAggregator) {
    console.log(`[LinkScout 🔍 Resolve] resolveUrl: 🔮 Detectado agregador -> Acionando Phantom Tab para ${url}`);
    const effectiveDomains = [...aggregatorDomains, 'news.google.com', 'google.com/url'];
    return await resolveUrlWithPhantomTab(url, effectiveDomains);
  }

  console.log(`[LinkScout 🔍 Resolve] resolveUrl: 🌐 Iniciando requisição HEAD para ${url}`);
  try {
    let finalUrl = url;
    let headFailed = false;
    let headResponseOk = false;
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => { controller.abort(); }, 5000);
      const response = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: controller.signal });
      clearTimeout(timeoutId);
      finalUrl = response.url;
      headResponseOk = response.ok;
    } catch (e) {
      console.warn(`[LinkScout 🔍 Resolve] resolveUrl: ⚠️ HEAD falhou para ${url}:`, e.message);
      headFailed = true;
    }

    // Fallback: se HEAD falhou, retornou a mesma URL c/ erro nativo, ou for sabidamente um redirecionador HTML (t.co)
    if (headFailed || (finalUrl === url && (!headResponseOk || url.includes('t.co/') || url.includes('bit.ly/')))) {
        console.log(`[LinkScout 🔍 Resolve] resolveUrl: 🔄 Tentando GET fallback para ${url}...`);
        const getController = new AbortController();
        const getTimeout = setTimeout(() => { getController.abort(); }, 6000);
        let getFailed = false;
        
        try {
            const getResponse = await fetch(url, { method: 'GET', redirect: 'follow', signal: getController.signal });
            finalUrl = getResponse.url;
            
            // Se a URL final ainda é igual, tenta ler o corpo para HTML redirect tags
            if (finalUrl === url) {
               const text = await getResponse.text();
               
               // Validação ultra restrita: apenas tag <meta http-equiv="refresh" ...>
               const metaMatch = text.match(/<meta\s+[^>]*http-equiv=['"]?refresh['"]?[^>]*content=['"]?\d+;\s*url=['"]?(https?:\/\/[^'">\s]+)/i) 
                              || text.match(/<meta\s+[^>]*content=['"]?\d+;\s*url=['"]?(https?:\/\/[^'">\s]+)[^>]*http-equiv=['"]?refresh['"]?/i);
               if (metaMatch && metaMatch[1]) {
                   finalUrl = metaMatch[1];
               } else {
                   // Validação restrita de JS comumente usado em anonimizadores puros
                   if (text.includes("location.replace")) {
                       const jsMatch = text.match(/location\.replace\(['"]((https?:\/\/[^'"]+))['"]\)/);
                       if (jsMatch && jsMatch[1]) {
                           finalUrl = jsMatch[1].replace(/\\\/\/g, '/');
                       }
                   }
               }
            }
        } catch (e) {
            console.error(`[LinkScout 🔍 Resolve] resolveUrl: ❌ GET fallback falhou para ${url}:`, e.message);
            getFailed = true;
        } finally {
            clearTimeout(getTimeout);
        }

        // Both HEAD and GET failed — this is a hard failure, return null
        if (headFailed && getFailed) {
            console.error(`[LinkScout 🔍 Resolve] resolveUrl: 🛑 Falha total (HEAD+GET) para ${url}`);
            return null;
        }
    }

    console.log(`[LinkScout 🔍 Resolve] resolveUrl: ✅ Sucesso. ${url} -> ${finalUrl}`);
    return normalizeUrl(finalUrl);
  } catch (error) {
    console.error(`[LinkScout 🔍 Resolve] resolveUrl: ❌ Erro irreversível ao resolver ${url}:`, error.message);
    return null;
  }
  } catch (outerError) {
    // Global safety net — resolveUrl must NEVER throw
    console.error(`[LinkScout 🔍 Resolve] resolveUrl: 🛑 Exceção global capturada para ${url}:`, outerError.message);
    return null;
  }
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
// URLs are resolved (redirects followed) and normalized before duplicate check
async function createOrUpdateBookmark(parentId, title, url, index = undefined, folderPath = '', skipResolve = false) {
  const originalUrl = url;
  // Resolve URL: follow redirects + normalize (remove tracking params, fragments)
  let resolvedUrl;
  if (skipResolve) {
    resolvedUrl = normalizeUrl(url); // Fast path: tabs already have their final URLs
  } else {
    resolvedUrl = await resolveUrl(url);
    // resolveUrl returns null on hard failure — fall back to normalized original URL
    if (resolvedUrl === null) resolvedUrl = normalizeUrl(url);
  }

  // Check global duplicate via IndexedDB (using resolved URL)
  const isGlobalDuplicate = await isLinkDuplicate(resolvedUrl);
  if (isGlobalDuplicate) {
    return { action: 'skipped', bookmark: null, reason: 'global_duplicate' };
  }

  const existing = await findExistingBookmark(parentId, resolvedUrl);
  if (existing) {
    return { action: 'skipped', bookmark: existing };
  }

  const createOptions = { parentId, title, url: resolvedUrl };
  if (index !== undefined) {
    createOptions.index = index;
  }
  const newBookmark = await browser.bookmarks.create(createOptions);

  // Only mark as redirectResolved if the URL actually changed during resolution,
  // or if we skipped resolution entirely (tabs already have final URLs).
  // If resolveUrl returned the same URL (failed to resolve), let the background job retry.
  const wasActuallyResolved = skipResolve || (resolvedUrl !== originalUrl);

  // Add to IndexedDB for global duplicate tracking with full metadata
  await addLinkToDatabase(resolvedUrl, title, parentId, folderPath, originalUrl, wasActuallyResolved);

  // Update folder timestamp
  await updateFolderTimestamp(parentId);

  return { action: 'created', bookmark: newBookmark };
}

async function createBookmarkStructure(links, pageTitle, settings) {
  let successCount = 0;
  let skippedCount = 0;
  let updatedCount = 0;
  let failCount = 0;

  // Collect bookmark IDs created during this operation for background resolution
  const createdBookmarkIds = [];

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
    // IMPORTANT: Save immediately with skipResolve=true to avoid blocking.
    // Resolution is triggered in background after all links are saved.

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
            baseFolderPath,
            true // skipResolve — save immediately, resolve later
          );
          if (result.action === 'created') {
            successCount++;
            if (result.bookmark) createdBookmarkIds.push(result.bookmark.id);
          }
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
                subFolderPath,
                true // skipResolve — save immediately, resolve later
              );
              if (result.action === 'created') {
                successCount++;
                if (result.bookmark) createdBookmarkIds.push(result.bookmark.id);
              }
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
              directFolderPath,
              true // skipResolve — save immediately, resolve later
            );
            if (result.action === 'created') {
              successCount++;
              if (result.bookmark) createdBookmarkIds.push(result.bookmark.id);
            }
            else if (result.action === 'skipped') skippedCount++;
            else if (result.action === 'updated') updatedCount++;
          } catch (error) {
            failCount++;
          }
        }
      }
    }

    // Removed notification code - Firefox notifications are unreliable

    // Trigger background resolution for all newly created bookmarks
    // This runs asynchronously — the user sees the links saved immediately
    if (createdBookmarkIds.length > 0) {
      console.log(`[LinkScout 🔍 Resolve] Background resolve: Disparando resolução para ${createdBookmarkIds.length} bookmarks recém-salvos`);
      resolveMultipleUrls(createdBookmarkIds).then(result => {
        console.log(`[LinkScout 🔍 Resolve] Background resolve: Concluído.`, result);
      }).catch(error => {
        console.error(`[LinkScout 🔍 Resolve] Background resolve: ❌ Falha:`, error.message);
      });
    }

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
    
    // Check if session folder already exists
    const existingChildren = await browser.bookmarks.getChildren(linkScoutFolder.id);
    const existingSessionFolder = existingChildren.find(child => child.title === sessionName && !child.url);
    const folderAlreadyExists = !!existingSessionFolder;

    const sessionFolder = await findOrCreateFolder(linkScoutFolder.id, sessionName, 0);

    // Create bookmarks with subfolder logic
    const linksPerFolder = parseInt(settings.linksPerFolder, 10) || 10;

    if (folderAlreadyExists) {
      // Add all new tabs directly to the folder and then reorganize
      const sessionFolderPath = `${rootFolderName}/${sessionName}`;
      for (const tab of validTabs) {
        try {
          const result = await createOrUpdateBookmark(
            sessionFolder.id,
            tab.title || tab.url,
            tab.url,
            0,
            sessionFolderPath,
            true // skipResolve = true
          );
          if (result.action === 'created') successCount++;
          else if (result.action === 'skipped') skippedCount++;
          else if (result.action === 'updated') updatedCount++;
        } catch (error) {
          failCount++;
        }
      }

      // Reorganize the folder to maintain proper subfolder structure
      await reorganizePageFolder(sessionFolder.id, linksPerFolder);
    } else {
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
                subFolderPath,
                true // skipResolve = true
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
              sessionFolderPath,
              true // skipResolve = true
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

// Collect ALL bookmark nodes (recursively from all subfolders, not just numbered ones)
async function collectAllBookmarkNodes(folderId) {
  const bookmarks = [];
  try {
    const children = await browser.bookmarks.getChildren(folderId);

    for (const child of children) {
      if (child.url) {
        bookmarks.push(child);
      } else {
        // Recurse into ALL subfolders (numbered or otherwise)
        try {
          const subBookmarks = await collectAllBookmarkNodes(child.id);
          bookmarks.push(...subBookmarks);
        } catch (subError) {
          console.error(`[LinkScout] Erro ao coletar bookmarks da subpasta ${child.id}:`, subError.message);
        }
      }
    }
  } catch (error) {
    console.error(`[LinkScout] Erro ao coletar bookmarks da pasta ${folderId}:`, error.message);
  }
  return bookmarks;
}

// Reorganize a single page folder based on linksPerFolder setting safely via moves
async function reorganizePageFolder(folderId, linksPerFolder) {
  const allNodes = await collectAllBookmarkNodes(folderId);
  if (allNodes.length === 0) return;

  const children = await browser.bookmarks.getChildren(folderId);
  const oldSubfolders = children.filter(c => !c.url && isNumberedSubfolder(c.title));

  if (allNodes.length > linksPerFolder) {
    const chunks = [];
    for (let i = 0; i < allNodes.length; i += linksPerFolder) {
      chunks.push(allNodes.slice(i, i + linksPerFolder));
    }

    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunk = chunks[chunkIndex];
      const startNum = chunkIndex * linksPerFolder + 1;
      const endNum = startNum + chunk.length - 1;
      const folderName = `${startNum}-${endNum}`;
      
      let subFolder = oldSubfolders.find(f => f.title === folderName);
      if (!subFolder) {
        subFolder = await findOrCreateFolder(folderId, folderName);
      } else {
        oldSubfolders.splice(oldSubfolders.indexOf(subFolder), 1);
      }

      for (let i = 0; i < chunk.length; i++) {
        const node = chunk[i];
        if (node.parentId !== subFolder.id || node.index !== i) {
          await browser.bookmarks.move(node.id, { parentId: subFolder.id, index: i });
        }
      }
    }
  } else {
    for (let i = 0; i < allNodes.length; i++) {
      const node = allNodes[i];
      if (node.parentId !== folderId || node.index !== i) {
        await browser.bookmarks.move(node.id, { parentId: folderId, index: i });
      }
    }
  }

  for (const old of oldSubfolders) {
    try {
      await browser.bookmarks.removeTree(old.id);
    } catch(e) {}
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
async function openAllInFolderAndRemove(folderId) {
  try {
    const bookmarkIds = await collectBookmarkIds(folderId);
    let count = 0;

    // Get parent ID before deleting items, for timestamp update
    const folders = await browser.bookmarks.get(folderId);
    const parentId = folders[0] ? folders[0].parentId : null;

    // Use a single promise array for tabs.create to be fast
    for (const id of bookmarkIds) {
       try {
           const bms = await browser.bookmarks.get(id);
           if (bms && bms.length > 0 && bms[0].url) {
               // Fire tab creation without awaiting to make it instant
               browser.tabs.create({ url: bms[0].url, active: false });
               await browser.bookmarks.remove(id);
               count++;
           }
       } catch (e) {
           console.error('Error opening item:', e);
       }
    }

    // Check if folder is empty and delete it if so
    const children = await browser.bookmarks.getChildren(folderId);
    if (children.length === 0) {
      await browser.bookmarks.remove(folderId);
      // Folder deleted, update parent's timestamp
      if (parentId) {
        await updateFolderTimestamp(parentId);
      }
    } else {
      // Folder remains, update its own timestamp
      await updateFolderTimestamp(folderId);
    }

    return { success: true, count };
  } catch (error) {
    console.error('Error opening all in folder:', error);
    return { success: false, count: 0, error: error.message };
  }
}

// Bulk open and trash
async function openMultipleAndTrash(bookmarkIds) {
    let count = 0;
    let anyParentId = null;

    for (const id of bookmarkIds) {
       try {
           const bms = await browser.bookmarks.get(id);
           if (bms && bms.length > 0 && bms[0].url) {
               anyParentId = bms[0].parentId;
               browser.tabs.create({ url: bms[0].url, active: false });
               await browser.bookmarks.remove(id);
               count++;
           }
       } catch (e) {
           console.error('Error opening item:', e);
       }
    }

    if (anyParentId) {
        await updateFolderTimestamp(anyParentId);
    }
    
    return { success: true, count };
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

// Shuffle all bookmarks within a folder (and its numbered subfolders) randomly
async function shuffleBookmarksInFolder(folderId) {
  try {
    // Collect all bookmark nodes from the folder (including numbered subfolders)
    const allNodes = await collectAllBookmarkNodes(folderId);
    if (allNodes.length <= 1) {
      return { success: true, count: allNodes.length };
    }

    // Fisher-Yates shuffle
    for (let i = allNodes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allNodes[i], allNodes[j]] = [allNodes[j], allNodes[i]];
    }

    // Get current settings for linksPerFolder
    const settings = await browser.storage.sync.get(DEFAULT_SETTINGS);
    const linksPerFolder = parseInt(settings.linksPerFolder, 10) || 10;

    // Get existing children to find old subfolders
    const children = await browser.bookmarks.getChildren(folderId);
    const oldSubfolders = children.filter(c => !c.url && isNumberedSubfolder(c.title));

    if (allNodes.length > linksPerFolder) {
      // Redistribute shuffled bookmarks into numbered subfolders
      const chunks = [];
      for (let i = 0; i < allNodes.length; i += linksPerFolder) {
        chunks.push(allNodes.slice(i, i + linksPerFolder));
      }

      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        const chunk = chunks[chunkIndex];
        const startNum = chunkIndex * linksPerFolder + 1;
        const endNum = startNum + chunk.length - 1;
        const folderName = `${startNum}-${endNum}`;

        let subFolder = oldSubfolders.find(f => f.title === folderName);
        if (!subFolder) {
          subFolder = await findOrCreateFolder(folderId, folderName);
        } else {
          oldSubfolders.splice(oldSubfolders.indexOf(subFolder), 1);
        }

        for (let i = 0; i < chunk.length; i++) {
          const node = chunk[i];
          await browser.bookmarks.move(node.id, { parentId: subFolder.id, index: i });
        }
      }
    } else {
      // All fit in the root folder, move them directly
      for (let i = 0; i < allNodes.length; i++) {
        const node = allNodes[i];
        await browser.bookmarks.move(node.id, { parentId: folderId, index: i });
      }
    }

    // Clean up old empty subfolders
    for (const old of oldSubfolders) {
      try {
        const remaining = await browser.bookmarks.getChildren(old.id);
        if (remaining.length === 0) {
          await browser.bookmarks.remove(old.id);
        }
      } catch (e) {}
    }

    // Update folder timestamp
    await updateFolderTimestamp(folderId);

    return { success: true, count: allNodes.length };
  } catch (error) {
    console.error('Error shuffling folder:', error);
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
      linkscoutFolderId: linkScoutFolder.id,
      linksPerFolder: settings.linksPerFolder || 10
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

// Resolve all URLs in a folder (and its subfolders) by following redirects
async function resolveFolderUrls(folderId) {
  console.log(`[LinkScout 🔍 Resolve] ===== INÍCIO: Resolução de pasta (folderId: ${folderId}) =====`);
  resolvingUrlsCount++;
  try {
    const allNodes = await collectAllBookmarkNodes(folderId);
    console.log(`[LinkScout 🔍 Resolve] Encontrados ${allNodes.length} bookmarks na pasta e subpastas`);
    
    if (allNodes.length === 0) {
      console.log(`[LinkScout 🔍 Resolve] Pasta vazia, nada a resolver.`);
      return { success: true, resolved: 0, total: 0 };
    }

    let resolvedCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    
    for (let i = 0; i < allNodes.length; i++) {
      const node = allNodes[i];
      console.log(`[LinkScout 🔍 Resolve] [${i + 1}/${allNodes.length}] Resolvendo: ${node.url}`);
      try {
        const resolvedUrl = await resolveUrl(node.url);
        if (resolvedUrl === null) {
          // Hard failure — resolveUrl could not reach the URL at all
          errorCount++;
          console.error(`[LinkScout 🔍 Resolve] [${i + 1}/${allNodes.length}] ❌ Falha na resolução de ${node.url}`);
        } else if (resolvedUrl !== node.url) {
          // Preserve the original title if it's meaningful (not just the old URL)
          let newTitle = (node.title && node.title !== node.url) ? node.title : resolvedUrl;
          // Try to fetch a proper page title for the resolved URL
          try {
            const fetchedTitle = await fetchPageTitle(resolvedUrl);
            if (fetchedTitle) newTitle = fetchedTitle;
          } catch (_) { /* keep existing title */ }
          console.log(`[LinkScout 🔍 Resolve] [${i + 1}/${allNodes.length}] ✅ Resolvido: ${node.url} -> ${resolvedUrl} (título: ${newTitle})`);
          await browser.bookmarks.update(node.id, {
            url: resolvedUrl,
            title: newTitle
          });
          // Keep IndexedDB in sync to prevent dedup conflicts
          await updateLinkUrlInDatabase(node.url, resolvedUrl, newTitle);
          resolvedCount++;
        } else {
          console.log(`[LinkScout 🔍 Resolve] [${i + 1}/${allNodes.length}] ⏭️ Sem alteração: ${node.url}`);
          skippedCount++;
        }
      } catch (e) {
        errorCount++;
        console.error(`[LinkScout 🔍 Resolve] [${i + 1}/${allNodes.length}] ❌ Falha ao resolver ${node.url}:`, e.message);
      }
      // Rate-limit between resolutions to avoid network congestion
      if (i < allNodes.length - 1) await delay(200);
    }

    await updateFolderTimestamp(folderId);
    console.log(`[LinkScout 🔍 Resolve] ===== FIM: ${resolvedCount} resolvidos, ${skippedCount} sem alteração, ${errorCount} erros de ${allNodes.length} total =====`);
    return { success: true, resolved: resolvedCount, total: allNodes.length, errors: errorCount };
  } catch (error) {
    console.error('[LinkScout 🔍 Resolve] ❌ Erro crítico na resolução de pasta:', error);
    return { success: false, error: error.message };
  } finally {
    resolvingUrlsCount--;
    // Trigger a single sync now that resolution is complete
    requestDatabaseSync();
  }
}

// Resolve URLs for a list of bookmark IDs (used for virtual/domain-grouped folders)
async function resolveMultipleUrls(bookmarkIds) {
  console.log(`[LinkScout 🔍 Resolve] ===== INÍCIO: Resolução múltipla (${bookmarkIds.length} IDs) =====`);
  resolvingUrlsCount++;
  try {
    let resolvedCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    
    for (let i = 0; i < bookmarkIds.length; i++) {
      const id = bookmarkIds[i];
      try {
        const bms = await browser.bookmarks.get(id);
        if (!bms || bms.length === 0 || !bms[0].url) {
          console.log(`[LinkScout 🔍 Resolve] [${i + 1}/${bookmarkIds.length}] ⏭️ Bookmark ${id} não encontrado ou sem URL`);
          skippedCount++;
          continue;
        }

        const bookmark = bms[0];
        console.log(`[LinkScout 🔍 Resolve] [${i + 1}/${bookmarkIds.length}] Resolvendo: ${bookmark.url}`);
        const resolvedUrl = await resolveUrl(bookmark.url);
        if (resolvedUrl === null) {
          // Hard failure — resolveUrl could not reach the URL at all
          errorCount++;
          console.error(`[LinkScout 🔍 Resolve] [${i + 1}/${bookmarkIds.length}] ❌ Falha na resolução de ${bookmark.url}`);
        } else if (resolvedUrl !== bookmark.url) {
          // Preserve the original title if it's meaningful (not just the old URL)
          let newTitle = (bookmark.title && bookmark.title !== bookmark.url) ? bookmark.title : resolvedUrl;
          // Try to fetch a proper page title for the resolved URL
          try {
            const fetchedTitle = await fetchPageTitle(resolvedUrl);
            if (fetchedTitle) newTitle = fetchedTitle;
          } catch (_) { /* keep existing title */ }
          console.log(`[LinkScout 🔍 Resolve] [${i + 1}/${bookmarkIds.length}] ✅ Resolvido: ${bookmark.url} -> ${resolvedUrl} (título: ${newTitle})`);
          await browser.bookmarks.update(id, {
            url: resolvedUrl,
            title: newTitle
          });
          // Keep IndexedDB in sync to prevent dedup conflicts
          await updateLinkUrlInDatabase(bookmark.url, resolvedUrl, newTitle);
          resolvedCount++;
        } else {
          console.log(`[LinkScout 🔍 Resolve] [${i + 1}/${bookmarkIds.length}] ⏭️ Sem alteração: ${bookmark.url}`);
          skippedCount++;
        }
      } catch (e) {
        errorCount++;
        console.error(`[LinkScout 🔍 Resolve] [${i + 1}/${bookmarkIds.length}] ❌ Falha no bookmark ${id}:`, e.message);
      }
      // Rate-limit between resolutions to avoid network congestion
      if (i < bookmarkIds.length - 1) await delay(200);
    }

    console.log(`[LinkScout 🔍 Resolve] ===== FIM: ${resolvedCount} resolvidos, ${skippedCount} sem alteração, ${errorCount} erros de ${bookmarkIds.length} total =====`);
    return { success: true, resolved: resolvedCount, total: bookmarkIds.length, errors: errorCount };
  } catch (error) {
    console.error('[LinkScout 🔍 Resolve] ❌ Erro crítico na resolução múltipla:', error);
    return { success: false, error: error.message };
  } finally {
    resolvingUrlsCount--;
    // Trigger a single sync now that resolution is complete
    requestDatabaseSync();
  }
}

// Listen for messages from options page and sidebar
browser.runtime.onMessage.addListener(async (message, sender) => {
  if (message.action === 'reorganizeFolders') {
    const result = await reorganizeAllFolders(message.settings);
    return result;
  }

  if (message.action === 'resolveFolder') {
    // Return immediately to avoid Firefox message port timeout on long-running operations.
    // The actual work is done asynchronously and the result is broadcast back.
    const folderId = message.folderId;
    console.log(`[LinkScout 🔍 Resolve] Handler: Recebido resolveFolder para pasta ${folderId}`);
    resolveFolderUrls(folderId).then(result => {
      console.log(`[LinkScout 🔍 Resolve] Handler: resolveFolderUrls concluído, enviando resolveComplete`, result);
      browser.runtime.sendMessage({
        action: 'resolveComplete',
        resolveType: 'folder',
        folderId: folderId,
        result: result
      }).catch(() => {}); // Sidebar may be closed
    }).catch(error => {
      // CRITICAL: Always notify sidebar even on failure, otherwise button stays stuck
      console.error(`[LinkScout 🔍 Resolve] Handler: ❌ resolveFolderUrls falhou:`, error.message);
      browser.runtime.sendMessage({
        action: 'resolveComplete',
        resolveType: 'folder',
        folderId: folderId,
        result: { success: false, error: error.message }
      }).catch(() => {});
    });
    return { started: true };
  }

  if (message.action === 'resolveMultipleUrls') {
    // Return immediately to avoid Firefox message port timeout on long-running operations.
    const bookmarkIds = message.bookmarkIds;
    const virtualFolderId = message.virtualFolderId || null;
    console.log(`[LinkScout 🔍 Resolve] Handler: Recebido resolveMultipleUrls para ${bookmarkIds.length} IDs`);
    resolveMultipleUrls(bookmarkIds).then(result => {
      console.log(`[LinkScout 🔍 Resolve] Handler: resolveMultipleUrls concluído, enviando resolveComplete`, result);
      browser.runtime.sendMessage({
        action: 'resolveComplete',
        resolveType: 'virtual',
        virtualFolderId: virtualFolderId,
        result: result
      }).catch(() => {}); // Sidebar may be closed
    }).catch(error => {
      // CRITICAL: Always notify sidebar even on failure, otherwise button stays stuck
      console.error(`[LinkScout 🔍 Resolve] Handler: ❌ resolveMultipleUrls falhou:`, error.message);
      browser.runtime.sendMessage({
        action: 'resolveComplete',
        resolveType: 'virtual',
        virtualFolderId: virtualFolderId,
        result: { success: false, error: error.message }
      }).catch(() => {});
    });
    return { started: true };
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

  if (message.action === 'openMultipleAndTrash') {
    return await openMultipleAndTrash(message.bookmarkIds);
  }

  if (message.action === 'shuffleFolder') {
    return await shuffleBookmarksInFolder(message.folderId);
  }

  if (message.action === 'deleteFolder') {
    return await deleteFolderAndContents(message.folderId);
  }

  if (message.action === 'deleteBookmark') {
    try {
      await browser.bookmarks.remove(message.bookmarkId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
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

// Robust helper to capture the origin page URL.
// Firefox macOS may not always populate info.pageUrl or tab.url in context menu handlers,
// so we use multiple fallbacks to ensure we always get the origin.
async function getOriginUrl(info, tab) {
  // 1st try: context menu API's pageUrl (requires tabs permission)
  let originUrl = info.pageUrl;

  // 2nd try: tab object URL
  if (!originUrl && tab && tab.url) {
    originUrl = tab.url;
  }

  // 3rd try: re-fetch the tab by ID (Firefox macOS sometimes has stale tab objects)
  if (!originUrl && tab && tab.id) {
    try {
      const freshTab = await browser.tabs.get(tab.id);
      originUrl = freshTab.url;
      console.log(`[LinkScout] Origem obtida via tabs.get(): ${originUrl}`);
    } catch (e) {
      console.warn(`[LinkScout] Falha ao obter URL via tabs.get():`, e.message);
    }
  }

  // 4th try: query for the active tab in the current window (final fallback)
  if (!originUrl) {
    try {
      const activeTabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (activeTabs.length > 0 && activeTabs[0].url) {
        originUrl = activeTabs[0].url;
        console.log(`[LinkScout] Origem obtida via tabs.query(): ${originUrl}`);
      }
    } catch (e) {
      console.warn(`[LinkScout] Falha ao obter URL via tabs.query():`, e.message);
    }
  }

  console.log(`[LinkScout] Origem debug: info.pageUrl=${info.pageUrl}, tab.url=${tab ? tab.url : 'N/A'}, originUrl=${originUrl}`);
  return originUrl;
}

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
      // Prepend the origin page URL as the first entry for reference
      const originUrl = await getOriginUrl(info, tab);
      if (originUrl && originUrl.startsWith('http')) {
        links.unshift(originUrl);
        console.log(`[LinkScout] Origem da seleção adicionada: ${originUrl}`);
      }

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

      // Prepend the origin page URL as the first entry for reference
      const originUrl = await getOriginUrl(info, tab);
      if (originUrl && originUrl.startsWith('http')) {
        links.unshift(originUrl);
        console.log(`[LinkScout] Origem do link adicionada: ${originUrl}`);
      }

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