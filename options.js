// LinkScout options.js

// Default settings
const DEFAULT_SETTINGS = {
    rootFolder: 'LinkScout',
    bookmarkLocation: 'toolbar_____',
    linksPerFolder: 10,
    resolveBatchSize: 10,
    aggregatorDomains: []
};

// Load saved settings
async function loadSettings() {
    try {
        const settings = await browser.storage.sync.get(DEFAULT_SETTINGS);

        document.getElementById('rootFolder').value = settings.rootFolder;
        document.getElementById('bookmarkLocation').value = settings.bookmarkLocation;
        document.getElementById('linksPerFolder').value = settings.linksPerFolder;
        document.getElementById('resolveBatchSize').value = settings.resolveBatchSize || 10;

        console.log('Settings loaded:', settings);
    } catch (error) {
        console.error('Error loading settings:', error);
        showStatus('Error loading settings', 'error');
    }
}

// Save settings
async function saveSettings() {
    const linksPerFolder = parseInt(document.getElementById('linksPerFolder').value, 10);
    const resolveBatchSize = parseInt(document.getElementById('resolveBatchSize').value, 10);

    const newSettings = {
        rootFolder: document.getElementById('rootFolder').value.trim() || 'LinkScout',
        bookmarkLocation: document.getElementById('bookmarkLocation').value,
        linksPerFolder: linksPerFolder > 0 ? linksPerFolder : 10,
        resolveBatchSize: resolveBatchSize > 0 ? resolveBatchSize : 10
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
document.addEventListener('DOMContentLoaded', loadSettings);
document.getElementById('saveButton').addEventListener('click', saveSettings);

// Force Full Scan Button
document.getElementById('forceRescanButton').addEventListener('click', async () => {
    showStatus('⏳ Ativando varredura em background... Verifique o console interno (F12) ou Ctrl+Shift+J!', 'success');
    try {
        await browser.runtime.sendMessage({ action: 'forceRescan' });
        showStatus('✓ Varredura solicitada! Observe o console.', 'success');
    } catch (e) {
        console.error('Erro ao acionar rescan:', e);
        showStatus('✗ Erro na comunicação de varredura', 'error');
    }
});

// Save on Enter key in text input
document.getElementById('rootFolder').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        saveSettings();
    }
});
