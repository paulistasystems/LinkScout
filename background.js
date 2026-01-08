// LinkScout background.js
console.log("🔗 LinkScout: Background script loaded!");

// Default settings
const DEFAULT_SETTINGS = {
  rootFolder: 'LinkScout',
  showNotifications: true,
  bookmarkLocation: 'toolbar_____' // toolbar_____, menu________, unfiled_____
};

function extractLinks(text) {
  console.log("🔍 extractLinks: Input text:", text);
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const matches = text.match(urlRegex);
  console.log("🔍 extractLinks: Found matches:", matches);
  return matches ? matches : [];
}

function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    console.log("🌐 extractDomain:", url, "->", urlObj.hostname);
    return urlObj.hostname;
  } catch (e) {
    console.error("❌ Invalid URL:", url, e);
    return "unknown";
  }
}

// Removed fetchPageTitle function - using URL as bookmark title directly

// Delay function for rate limiting
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function findOrCreateFolder(parentId, title) {
  console.log("📁 findOrCreateFolder: Looking for folder:", title, "in parent:", parentId);
  try {
    const children = await browser.bookmarks.getChildren(parentId);
    console.log("📁 findOrCreateFolder: Found children:", children.length);
    const existingFolder = children.find(child => child.title === title && !child.url);

    if (existingFolder) {
      console.log("📁 findOrCreateFolder: Found existing folder:", existingFolder);
      return existingFolder;
    }

    console.log("📁 findOrCreateFolder: Creating new folder:", title);
    const newFolder = await browser.bookmarks.create({
      parentId: parentId,
      title: title
    });
    console.log("📁 findOrCreateFolder: Created folder:", newFolder);
    return newFolder;
  } catch (error) {
    console.error("❌ findOrCreateFolder: Error:", error);
    throw error;
  }
}

async function createBookmarkStructure(links, pageTitle, settings) {
  console.log("🚀 createBookmarkStructure: Starting...");
  console.log("🚀 Links count:", links.length);
  console.log("🚀 Page Title:", pageTitle);
  console.log("🚀 Settings:", JSON.stringify(settings));

  const startTime = Date.now();
  let successCount = 0;
  let failCount = 0;

  try {
    // Get bookmark location from settings
    let parentId = settings.bookmarkLocation || 'toolbar_____';
    console.log("📌 Using bookmark location from settings:", parentId);

    // Verify the location exists
    try {
      const children = await browser.bookmarks.getChildren(parentId);
      console.log("📌 Bookmark location accessible, has", children.length, "children");
    } catch (locationError) {
      console.warn("⚠️ Could not access configured location:", parentId);
      console.warn("⚠️ Error:", locationError.message);

      // Fallback to toolbar
      parentId = "toolbar_____";
      console.log("📌 Falling back to toolbar:", parentId);

      try {
        await browser.bookmarks.getChildren(parentId);
      } catch (toolbarError) {
        // Fallback to menu
        parentId = "menu________";
        console.log("📌 Falling back to menu:", parentId);
      }
    }

    // Create or find root folder
    const rootFolderName = settings.rootFolder || 'LinkScout';
    console.log("📌 Root folder name:", rootFolderName);

    console.log("📁 Creating/finding root folder in:", parentId);
    const linkScoutFolder = await findOrCreateFolder(parentId, rootFolderName);
    console.log("✅ Root folder created/found:", JSON.stringify(linkScoutFolder));

    // Create folder with page title
    console.log("� Creating/finding page title folder:", pageTitle);
    const pageTitleFolder = await findOrCreateFolder(linkScoutFolder.id, pageTitle);
    console.log("✅ Page title folder:", pageTitleFolder.id);

    // Create bookmarks directly in page title folder
    for (const link of links) {
      try {
        console.log("💾 Creating bookmark in folder:", pageTitleFolder.id);
        const bookmark = await browser.bookmarks.create({
          parentId: pageTitleFolder.id,
          title: link,
          url: link
        });
        console.log("✅ Bookmark created with ID:", bookmark.id);

        successCount++;
      } catch (error) {
        console.error(`❌ Failed to create bookmark for ${link.substring(0, 50)}:`, error.message);
        failCount++;
      }
    }

    console.log(`✅ Saved ${links.length} links from page: ${pageTitle}`);

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`🎉 Successfully saved ${successCount} links in ${duration}s`);

    if (settings.showNotifications) {
      const message = failCount > 0
        ? `Salvos: ${successCount} | Falhas: ${failCount}`
        : `${successCount} link${successCount !== 1 ? 's' : ''} salvo${successCount !== 1 ? 's' : ''} com sucesso!`;

      console.log("🔔 Sending notification:", message);
      browser.notifications.create({
        type: 'basic',
        iconUrl: browser.runtime.getURL('icons/linkscout-48.svg'),
        title: 'LinkScout',
        message: message
      });
    }

    return { successCount, failCount };

  } catch (error) {
    console.error("❌ Error in createBookmarkStructure:", error);
    console.error("❌ Error message:", error.message);
    console.error("❌ Error stack:", error.stack);

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
  console.log("🔗 saveAllTabsAndClose: Starting...");

  const settings = await browser.storage.sync.get(DEFAULT_SETTINGS);
  const tabs = await browser.tabs.query({ currentWindow: true });

  console.log("📑 Found", tabs.length, "tabs to save");

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
        console.log("⏭️ Skipping internal tab:", tab.url);
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
        console.log("✅ Saved tab:", tab.title);
      } catch (error) {
        console.error("❌ Failed to save tab:", tab.url, error.message);
        failCount++;
      }
    }

    // Close all saved tabs
    if (tabsToClose.length > 0) {
      console.log("🔒 Closing", tabsToClose.length, "tabs...");

      // Create a new blank tab first to prevent browser from closing
      console.log("📄 Creating new blank tab...");
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
    console.error("❌ Error in saveAllTabsAndClose:", error);
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

console.log("🔗 LinkScout: Creating context menus...");

// Context menu for saving links from selection
browser.contextMenus.create({
  id: "linkscout-save-links",
  title: "Save Links from Selection",
  contexts: ["selection"]
}, () => {
  if (browser.runtime.lastError) {
    console.error("❌ Error creating context menu:", browser.runtime.lastError);
  } else {
    console.log("✅ Context menu 'Save Links' created successfully!");
  }
});

// Context menu for saving all tabs (on page)
browser.contextMenus.create({
  id: "linkscout-save-all-tabs",
  title: "📑 Salvar e Fechar Todas as Abas",
  contexts: ["page"]
}, () => {
  if (browser.runtime.lastError) {
    console.error("❌ Error creating context menu:", browser.runtime.lastError);
  } else {
    console.log("✅ Context menu 'Save All Tabs' created successfully!");
  }
});

// Context menu for saving all tabs (on tab)
browser.contextMenus.create({
  id: "linkscout-save-all-tabs-tab",
  title: "📑 Salvar e Fechar Todas as Abas",
  contexts: ["tab"]
}, () => {
  if (browser.runtime.lastError) {
    console.error("❌ Error creating context menu:", browser.runtime.lastError);
  } else {
    console.log("✅ Context menu 'Save All Tabs (tab)' created successfully!");
  }
});

browser.contextMenus.onClicked.addListener(async (info, tab) => {
  console.log("🖱️ Context menu clicked!");
  console.log("🖱️ Menu Item ID:", info.menuItemId);
  console.log("🖱️ Selection Text:", info.selectionText);
  console.log("🖱️ Tab:", tab);

  if (info.menuItemId === "linkscout-save-links") {
    console.log("✅ Correct menu item clicked");

    // Try to get links from content script first (extracts actual href attributes)
    let links = [];
    let pageTitle = tab.title || "Untitled Page";

    try {
      console.log("📨 Sending message to content script...");
      const response = await browser.tabs.sendMessage(tab.id, { action: "getSelectedLinks" });
      console.log("📬 Response from content script:", response);

      if (response && response.links && response.links.length > 0) {
        links = response.links;
        pageTitle = response.pageTitle || pageTitle;
        console.log("✅ Got links from content script:", links);
      }
    } catch (error) {
      console.warn("⚠️ Content script not available, falling back to text extraction:", error.message);
    }

    // Fallback: try to extract URLs from selection text
    if (links.length === 0 && info.selectionText) {
      console.log("🔄 Falling back to text extraction...");
      links = extractLinks(info.selectionText);
      console.log("🔗 Extracted links from text:", links);
    }

    if (links.length > 0) {
      console.log("✅ Found", links.length, "links");

      // Load settings
      console.log("⚙️ Loading settings...");
      const settings = await browser.storage.sync.get(DEFAULT_SETTINGS);
      console.log("⚙️ Settings loaded:", settings);

      console.log("📄 Page title:", pageTitle);

      console.log("🚀 Calling createBookmarkStructure...");
      try {
        await createBookmarkStructure(links, pageTitle, settings);
        console.log("✅ createBookmarkStructure completed successfully");
      } catch (error) {
        console.error("❌ Error calling createBookmarkStructure:", error);
        console.error("❌ Error stack:", error.stack);
      }
    } else {
      console.log("⚠️ No links found in selection.");

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
  } else if (info.menuItemId === "linkscout-save-all-tabs" || info.menuItemId === "linkscout-save-all-tabs-tab") {
    console.log("✅ Save All Tabs menu item clicked");
    await saveAllTabsAndClose();
  } else {
    console.log("⚠️ Unknown menu item");
  }
});

console.log("🔗 LinkScout: Background script setup complete!");