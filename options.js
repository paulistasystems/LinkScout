// LinkScout options.js

// Default settings
const DEFAULT_SETTINGS = {
    rootFolder: 'LinkScout',
    bookmarkLocation: 'toolbar_____',
    updateExistingTitles: false,
    newestLinksFirst: true
};

// Load saved settings
async function loadSettings() {
    try {
        const settings = await browser.storage.sync.get(DEFAULT_SETTINGS);

        document.getElementById('rootFolder').value = settings.rootFolder;
        document.getElementById('bookmarkLocation').value = settings.bookmarkLocation;
        document.getElementById('updateExistingTitles').checked = settings.updateExistingTitles;
        document.getElementById('newestLinksFirst').checked = settings.newestLinksFirst;

        console.log('Settings loaded:', settings);
    } catch (error) {
        console.error('Error loading settings:', error);
        showStatus('Erro ao carregar configurações', 'error');
    }
}

// Save settings
async function saveSettings() {
    const settings = {
        rootFolder: document.getElementById('rootFolder').value.trim() || 'LinkScout',
        bookmarkLocation: document.getElementById('bookmarkLocation').value,
        updateExistingTitles: document.getElementById('updateExistingTitles').checked,
        newestLinksFirst: document.getElementById('newestLinksFirst').checked
    };
    try {
        await browser.storage.sync.set(settings);
        console.log('Settings saved:', settings);
        showStatus('✓ Configurações salvas com sucesso!', 'success');
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
