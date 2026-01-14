/**
 * CHUCK - Chat Harvesting Universal Connection Kit
 * Extension popup script
 */

const DEFAULTS = {
    serverUrl: 'ws://127.0.0.2:1350/chat.ws',
    debug: false,
    platforms: {
        kick: true,
        odysee: true,
        rumble: true,
        twitch: true,
        youtube: true,
        vk: true,
        x: true,
        xmrchat: true
    }
};

const platformIds = ['kick', 'odysee', 'rumble', 'twitch', 'youtube', 'vk', 'x', 'xmrchat'];

// Load config from storage
async function loadConfig() {
    return new Promise((resolve) => {
        chrome.storage.sync.get('chuck_config', (result) => {
            resolve(result.chuck_config || { ...DEFAULTS });
        });
    });
}

// Save config to storage
async function saveConfig(config) {
    return new Promise((resolve) => {
        chrome.storage.sync.set({ chuck_config: config }, resolve);
    });
}

// Update UI with config values
function updateUI(config) {
    document.getElementById('serverUrl').value = config.serverUrl || DEFAULTS.serverUrl;
    document.getElementById('debug').checked = config.debug || false;

    platformIds.forEach(id => {
        const checkbox = document.getElementById(`platform-${id}`);
        if (checkbox) {
            checkbox.checked = config.platforms?.[id] !== false;
        }
    });
}

// Get config from UI
function getConfigFromUI() {
    const platforms = {};
    platformIds.forEach(id => {
        const checkbox = document.getElementById(`platform-${id}`);
        if (checkbox) {
            platforms[id] = checkbox.checked;
        }
    });

    return {
        serverUrl: document.getElementById('serverUrl').value || DEFAULTS.serverUrl,
        debug: document.getElementById('debug').checked,
        platforms
    };
}

// Show status message
function showStatus(message, isError = false) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = 'status ' + (isError ? 'error' : 'success');

    setTimeout(() => {
        status.className = 'status';
    }, 3000);
}

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
    const config = await loadConfig();
    updateUI(config);

    // Save button
    document.getElementById('save').addEventListener('click', async () => {
        const config = getConfigFromUI();
        await saveConfig(config);
        showStatus('Settings saved!');
    });

    // Reset button
    document.getElementById('reset').addEventListener('click', async () => {
        await saveConfig({ ...DEFAULTS });
        updateUI(DEFAULTS);
        showStatus('Settings reset to defaults!');
    });
});
