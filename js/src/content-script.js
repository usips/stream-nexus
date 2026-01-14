/**
 * CHUCK - Chat Harvesting Universal Connection Kit
 * Extension content script
 *
 * This runs in an isolated world and injects the main script into the page context
 */

// Inject the main script into the page context
// This is necessary because content scripts run in an isolated world
// and cannot directly patch window.WebSocket, window.fetch, etc.
const script = document.createElement('script');
script.src = chrome.runtime.getURL('injected.js');
script.onload = function() {
    this.remove();
};
(document.head || document.documentElement).appendChild(script);

// Listen for messages from the injected script
window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (!event.data || event.data.source !== 'CHUCK') return;

    // Forward messages to background script if needed
    if (event.data.type === 'log') {
        console.log('[CHUCK Content]', event.data.message);
    }
});
