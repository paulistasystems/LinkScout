// LinkScout background.js

// Default settings
const DEFAULT_SETTINGS = {
  rootFolder: 'LinkScout',
  showNotifications: true,
  bookmarkLocation: 'toolbar_____', // toolbar_____, menu________, unfiled_____
  updateExistingTitles: false, // Update title of existing bookmarks if URL matches
  newestLinksFirst: true // New links appear at the top of the folder
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

    // Create folder with page title
    const newestFirst = settings.newestLinksFirst !== false; // Default to true
    const pageTitleFolder = await findOrCreateFolder(linkScoutFolder.id, pageTitle, newestFirst ? 0 : undefined);

    // Create bookmarks directly in page title folder (with duplicate detection)
    const updateTitles = settings.updateExistingTitles || false;
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

    if (settings.showNotifications) {
      let message = '';
      const parts = [];
      if (successCount > 0) parts.push(`${successCount} salvo${successCount !== 1 ? 's' : ''}`);
      if (skippedCount > 0) parts.push(`${skippedCount} duplicado${skippedCount !== 1 ? 's' : ''}`);
      if (updatedCount > 0) parts.push(`${updatedCount} atualizado${updatedCount !== 1 ? 's' : ''}`);
      if (failCount > 0) parts.push(`${failCount} falha${failCount !== 1 ? 's' : ''}`);
      message = parts.join(' | ');

      browser.notifications.create({
        type: 'basic',
        iconUrl: browser.runtime.getURL('icons/linkscout-48.svg'),
        title: 'LinkScout',
        message: message || 'Nenhum link para salvar.'
      });
    }

    return { successCount, skippedCount, updatedCount, failCount };

  } catch (error) {
    if (settings.showNotifications) {
      browser.notifications.create({
        type: 'basic',
        iconUrl: browser.runtime.getURL('icons/linkscout-48.svg'),
        title: 'LinkScout - Erro',
        message: 'Erro ao salvar favoritos: ' + error.message
      });
    }

    throw error;
  }
}

// Function to save all tabs and close them
async function saveAllTabsAndClose() {
  const settings = await browser.storage.sync.get(DEFAULT_SETTINGS);
  const tabs = await browser.tabs.query({ currentWindow: true });

  if (tabs.length === 0) {
    if (settings.showNotifications) {
      browser.notifications.create({
        type: 'basic',
        iconUrl: browser.runtime.getURL('icons/linkscout-48.svg'),
        title: 'LinkScout',
        message: 'Nenhuma aba para salvar.'
      });
    }
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

    // Create bookmarks directly in session folder (with duplicate detection)
    const updateTitles = settings.updateExistingTitles || false;
    for (const tab of tabs) {
      if (!tab.url || tab.url.startsWith('about:') || tab.url.startsWith('moz-extension:')) {
        continue;
      }

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

    // Close all saved tabs
    if (tabsToClose.length > 0) {
      // Create a new blank tab first to prevent browser from closing
      await browser.tabs.create({ active: true });
      await browser.tabs.remove(tabsToClose);
    }

    if (settings.showNotifications) {
      const parts = [];
      const savedClosed = successCount + skippedCount + updatedCount;
      if (savedClosed > 0) parts.push(`${savedClosed} aba${savedClosed !== 1 ? 's' : ''} fechada${savedClosed !== 1 ? 's' : ''}`);
      if (skippedCount > 0) parts.push(`${skippedCount} duplicada${skippedCount !== 1 ? 's' : ''}`);
      if (updatedCount > 0) parts.push(`${updatedCount} atualizada${updatedCount !== 1 ? 's' : ''}`);
      if (failCount > 0) parts.push(`${failCount} falha${failCount !== 1 ? 's' : ''}`);
      const message = parts.join(' | ') || 'Nenhuma aba para salvar.';

      browser.notifications.create({
        type: 'basic',
        iconUrl: browser.runtime.getURL('icons/linkscout-48.svg'),
        title: 'LinkScout',
        message: message
      });
    }

  } catch (error) {
    if (settings.showNotifications) {
      browser.notifications.create({
        type: 'basic',
        iconUrl: browser.runtime.getURL('icons/linkscout-48.svg'),
        title: 'LinkScout - Erro',
        message: 'Erro ao salvar abas: ' + error.message
      });
    }
  }
}

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
      if (settings.showNotifications) {
        browser.notifications.create({
          type: 'basic',
          iconUrl: browser.runtime.getURL('icons/linkscout-48.svg'),
          title: 'LinkScout',
          message: 'Nenhum link encontrado na seleção.'
        });
      }
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
      if (settings.showNotifications) {
        browser.notifications.create({
          type: 'basic',
          iconUrl: browser.runtime.getURL('icons/linkscout-48.svg'),
          title: 'LinkScout',
          message: 'Nenhum link encontrado.'
        });
      }
    }
  } else if (info.menuItemId === "linkscout-save-all-tabs" || info.menuItemId === "linkscout-save-all-tabs-tab") {
    await saveAllTabsAndClose();
  }
});