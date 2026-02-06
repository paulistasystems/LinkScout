// LinkScout options.js

// Default settings
const DEFAULT_SETTINGS = {
    rootFolder: 'LinkScout',
    bookmarkLocation: 'toolbar_____',
    updateExistingTitles: false,
    newestLinksFirst: true,
    linksPerFolder: 10,
    removeDuplicates: false
};

// Load saved settings
async function loadSettings() {
    try {
        const settings = await browser.storage.sync.get(DEFAULT_SETTINGS);

        document.getElementById('rootFolder').value = settings.rootFolder;
        document.getElementById('bookmarkLocation').value = settings.bookmarkLocation;
        document.getElementById('updateExistingTitles').checked = settings.updateExistingTitles;
        document.getElementById('newestLinksFirst').checked = settings.newestLinksFirst;
        document.getElementById('linksPerFolder').value = settings.linksPerFolder;
        document.getElementById('removeDuplicates').checked = settings.removeDuplicates;

        console.log('Settings loaded:', settings);
    } catch (error) {
        console.error('Error loading settings:', error);
        showStatus('Erro ao carregar configurações', 'error');
    }
}

// Save settings
async function saveSettings() {
    const linksPerFolder = parseInt(document.getElementById('linksPerFolder').value, 10);
    const newSettings = {
        rootFolder: document.getElementById('rootFolder').value.trim() || 'LinkScout',
        bookmarkLocation: document.getElementById('bookmarkLocation').value,
        updateExistingTitles: document.getElementById('updateExistingTitles').checked,
        newestLinksFirst: document.getElementById('newestLinksFirst').checked,
        linksPerFolder: linksPerFolder > 0 ? linksPerFolder : 10,
        removeDuplicates: document.getElementById('removeDuplicates').checked
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
            showStatus('⏳ Reorganizando pastas...', 'success');
            try {
                const result = await browser.runtime.sendMessage({
                    action: 'reorganizeFolders',
                    settings: newSettings
                });
                if (result && result.success) {
                    showStatus(`✓ Configurações salvas! ${result.reorganizedCount || 0} pastas reorganizadas.`, 'success');
                } else {
                    showStatus('✓ Configurações salvas!', 'success');
                }
            } catch (reorgError) {
                console.error('Error reorganizing folders:', reorgError);
                showStatus('✓ Configurações salvas (reorganização falhou)', 'success');
            }
        } else {
            showStatus('✓ Configurações salvas com sucesso!', 'success');
        }
    } catch (error) {
        console.error('Error saving settings:', error);
        showStatus('✗ Erro ao salvar configurações', 'error');
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

// Save on Enter key in text input
document.getElementById('rootFolder').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        saveSettings();
    }
});
