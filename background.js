// LinkScout background.js

// Default settings
const DEFAULT_SETTINGS = {
  rootFolder: 'LinkScout',
  showNotifications: true,
  bookmarkLocation: 'toolbar_____' // toolbar_____, menu________, unfiled_____
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

async function findOrCreateFolder(parentId, title) {
  try {
    const children = await browser.bookmarks.getChildren(parentId);
    const existingFolder = children.find(child => child.title === title && !child.url);

    if (existingFolder) {
      return existingFolder;
    }

    const newFolder = await browser.bookmarks.create({
      parentId: parentId,
      title: title
    });
    return newFolder;
  } catch (error) {
    throw error;
  }
}

async function createBookmarkStructure(links, pageTitle, settings) {
  // Remove duplicate links
  const uniqueLinks = [...new Set(links)];
  links = uniqueLinks;

  let successCount = 0;
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
    const pageTitleFolder = await findOrCreateFolder(linkScoutFolder.id, pageTitle);

    // Create bookmarks directly in page title folder
    for (const link of links) {
      try {
        await browser.bookmarks.create({
          parentId: pageTitleFolder.id,
          title: link,
          url: link
        });
        successCount++;
      } catch (error) {
        failCount++;
      }
    }

    if (settings.showNotifications) {
      const message = failCount > 0
        ? `Salvos: ${successCount} | Falhas: ${failCount}`
        : `${successCount} link${successCount !== 1 ? 's' : ''} salvo${successCount !== 1 ? 's' : ''} com sucesso!`;

      browser.notifications.create({
        type: 'basic',
        iconUrl: browser.runtime.getURL('icons/linkscout-48.svg'),
        title: 'LinkScout',
        message: message
      });
    }

    return { successCount, failCount };

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
    const sessionFolder = await findOrCreateFolder(linkScoutFolder.id, sessionName);

    // Create bookmarks directly in session folder (no domain subfolder)
    for (const tab of tabs) {
      if (!tab.url || tab.url.startsWith('about:') || tab.url.startsWith('moz-extension:')) {
        continue;
      }

      try {
        await browser.bookmarks.create({
          parentId: sessionFolder.id,
          title: tab.title || tab.url,
          url: tab.url
        });
        successCount++;
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
      const message = failCount > 0
        ? `Salvos e fechados: ${successCount} | Falhas: ${failCount}`
        : `${successCount} aba${successCount !== 1 ? 's' : ''} salva${successCount !== 1 ? 's' : ''} e fechada${successCount !== 1 ? 's' : ''}!`;

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