/**
 * CHUCK - Chat Harvesting Universal Connection Kit
 * Extension background service worker
 */

// Listen for installation
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        // Set default config on first install
        chrome.storage.sync.set({
            chuck_config: {
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
            }
        });
        console.log('[CHUCK] Extension installed with default config');
    }
});

// Handle messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'getConfig') {
        chrome.storage.sync.get('chuck_config', (result) => {
            sendResponse(result.chuck_config);
        });
        return true; // Keep message channel open for async response
    }

    if (message.type === 'setConfig') {
        chrome.storage.sync.set({ chuck_config: message.config }, () => {
            sendResponse({ success: true });
        });
        return true;
    }
});
