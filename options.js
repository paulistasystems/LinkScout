// LinkScout options.js

// Default settings
const DEFAULT_SETTINGS = {
    rootFolder: 'LinkScout',
    bookmarkLocation: 'toolbar_____',
    linksPerFolder: 10,
    aggregatorDomains: []
};

// Load saved settings
async function loadSettings() {
    try {
        const settings = await browser.storage.sync.get(DEFAULT_SETTINGS);

        document.getElementById('rootFolder').value = settings.rootFolder;
        document.getElementById('bookmarkLocation').value = settings.bookmarkLocation;
        document.getElementById('linksPerFolder').value = settings.linksPerFolder;

        console.log('Settings loaded:', settings);
    } catch (error) {
        console.error('Error loading settings:', error);
        showStatus('Error loading settings', 'error');
    }
}

// Save settings
async function saveSettings() {
    const linksPerFolder = parseInt(document.getElementById('linksPerFolder').value, 10);
    const newSettings = {
        rootFolder: document.getElementById('rootFolder').value.trim() || 'LinkScout',
        bookmarkLocation: document.getElementById('bookmarkLocation').value,
        linksPerFolder: linksPerFolder > 0 ? linksPerFolder : 10
    };

    try {
        // Get current settings to check if linksPerFolder changed
        const currentSettings = await browser.storage.sync.get(DEFAULT_SETTINGS);
        const linksPerFolderChanged = currentSettings.linksPerFolder !== newSettings.linksPerFolder;

        // Save new settings
        await browser.storage.sync.set(newSettings);
        console.log('Settings saved:', newSettings);

        // If linksPerFolder changed, reorganize existing folders
        if (linksPerFolderChanged) {
            showStatus('⏳ Reorganizing folders...', 'success');
            try {
                const result = await browser.runtime.sendMessage({
                    action: 'reorganizeFolders',
                    settings: newSettings
                });
                if (result && result.success) {
                    showStatus(`✓ Settings saved! ${result.reorganizedCount || 0} folders reorganized.`, 'success');
                } else {
                    showStatus('✓ Settings saved!', 'success');
                }
            } catch (reorgError) {
                console.error('Error reorganizing folders:', reorgError);
                showStatus('✓ Settings saved (reorganization failed)', 'success');
            }
        } else {
            showStatus('✓ Settings saved successfully!', 'success');
        }
    } catch (error) {
        console.error('Error saving settings:', error);
        showStatus('✗ Error saving settings', 'error');
    }
}

// Show status message
function showStatus(message, type) {
    const statusElement = document.getElementById('statusMessage');
    statusElement.textContent = message;
    statusElement.className = `status-message ${type}`;
    statusElement.style.display = 'block';

    setTimeout(() => {
        statusElement.style.display = 'none';
    }, 3000);
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    loadShortcutDisplay();
    loadExcludedDomains();
});
document.getElementById('saveButton').addEventListener('click', saveSettings);

// Load and display the current keyboard shortcut
async function loadShortcutDisplay() {
    const shortcutEl = document.getElementById('shortcutDisplay');
    const manageLink = document.getElementById('manageShortcutsLink');

    try {
        const commands = await browser.commands.getAll();
        const sidebarCmd = commands.find(c => c.name === '_execute_sidebar_action');
        if (sidebarCmd && sidebarCmd.shortcut) {
            shortcutEl.textContent = sidebarCmd.shortcut;
        } else {
            shortcutEl.textContent = 'Not set';
            shortcutEl.style.color = '#999';
        }
    } catch (e) {
        shortcutEl.textContent = 'Ctrl+Shift+U';
    }

    if (manageLink) {
        manageLink.addEventListener('click', (e) => {
            e.preventDefault();
            browser.tabs.create({ url: 'about:addons' });
        });
    }
}



// Save on Enter key in text input
document.getElementById('rootFolder').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        saveSettings();
    }
});

// --- Excluded Domains Management ---

let excludedDomainsCache = [];

async function loadExcludedDomains() {
    try {
        const result = await browser.runtime.sendMessage({ action: 'getExcludedDomains' });
        if (result && result.success) {
            excludedDomainsCache = result.domains || [];
            renderExcludedDomains();
        }
    } catch (error) {
        console.error('Error loading excluded domains:', error);
    }
}

function renderExcludedDomains() {
    const listEl = document.getElementById('excludedDomainsList');
    const emptyEl = document.getElementById('excludedDomainsEmpty');
    listEl.innerHTML = '';

    if (excludedDomainsCache.length === 0) {
        emptyEl.style.display = 'block';
        return;
    }

    emptyEl.style.display = 'none';

    for (const domain of excludedDomainsCache.sort()) {
        const item = document.createElement('div');
        item.className = 'excluded-domain-item';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'domain-name';
        nameSpan.textContent = domain;
        item.appendChild(nameSpan);

        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-domain-btn';
        removeBtn.textContent = '🗑️ Remove';
        removeBtn.addEventListener('click', () => removeExcludedDomain(domain));
        item.appendChild(removeBtn);

        listEl.appendChild(item);
    }
}

async function addExcludedDomain() {
    const input = document.getElementById('excludeDomainInput');
    const domain = input.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
    if (!domain) return;

    try {
        const result = await browser.runtime.sendMessage({ action: 'addExcludedDomain', domain });
        if (result && result.success) {
            excludedDomainsCache = result.domains;
            renderExcludedDomains();
            input.value = '';
            showStatus(`✓ "${domain}" added to exclusion list`, 'success');
        }
    } catch (error) {
        console.error('Error adding excluded domain:', error);
        showStatus('✗ Error adding domain', 'error');
    }
}

async function removeExcludedDomain(domain) {
    try {
        const result = await browser.runtime.sendMessage({ action: 'removeExcludedDomain', domain });
        if (result && result.success) {
            excludedDomainsCache = result.domains;
            renderExcludedDomains();
            showStatus(`✓ "${domain}" removed from exclusion list`, 'success');
        }
    } catch (error) {
        console.error('Error removing excluded domain:', error);
        showStatus('✗ Error removing domain', 'error');
    }
}

document.getElementById('addExcludeDomainBtn').addEventListener('click', addExcludedDomain);
document.getElementById('excludeDomainInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        addExcludedDomain();
    }
});
