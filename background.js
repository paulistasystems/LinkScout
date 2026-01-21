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

// Create or update bookmark, avoiding duplicates
async function createOrUpdateBookmark(parentId, title, url, updateTitleIfExists = false, index = undefined) {
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
  return { action: 'created', bookmark: newBookmark };
}

async function createBookmarkStructure(links, pageTitle, settings) {
  // Remove duplicate links
  const uniqueLinks = [...new Set(links)];
  links = uniqueLinks;

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
      for (const link of links) {
        try {
          const result = await createOrUpdateBookmark(
            pageTitleFolder.id,
            link,
            link,
            updateTitles,
            newestFirst ? 0 : undefined
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

          for (const link of chunk) {
            try {
              const result = await createOrUpdateBookmark(
                subFolder.id,
                link,
                link,
                updateTitles
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
        for (const link of links) {
          try {
            const result = await createOrUpdateBookmark(
              pageTitleFolder.id,
              link,
              link,
              updateTitles
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

        for (const tab of chunk) {
          try {
            const result = await createOrUpdateBookmark(
              subFolder.id,
              tab.title || tab.url,
              tab.url,
              updateTitles,
              newestFirst ? 0 : undefined
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
      for (const tab of validTabs) {
        try {
          const result = await createOrUpdateBookmark(
            sessionFolder.id,
            tab.title || tab.url,
            tab.url,
            updateTitles,
            newestFirst ? 0 : undefined
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