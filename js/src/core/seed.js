/**
 * CHUCK - Chat Harvesting Universal Connection Kit
 * Base Seed class for platform-specific scrapers
 */

import { Config, DEFAULTS } from './config.js';
import { uuidv5 } from './uuid.js';
import { ChatMessage, LivestreamUpdate } from './message.js';

// Get the window object (handles userscript's unsafeWindow)
const WINDOW = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window);

/**
 * Base class for all platform scrapers
 * Handles WebSocket/Fetch/XHR patching and communication with backend
 */
export class Seed {
    // Platform identification
    channel = null;
    platform = null;
    namespace = null;
    viewers = null;

    // Backend connection
    chatSocket = null;
    chatSocketTimeout = null;
    chatMessageQueue = [];
    updateQueue = [];

    // Configuration
    serverUrl = DEFAULTS.serverUrl;
    debug = DEFAULTS.debug;

    constructor(namespace, platform, channel) {
        this.namespace = namespace;
        this.platform = platform;
        this.channel = channel;

        this.log('Initializing.');

        // Load config then initialize
        this._initAsync();
    }

    async _initAsync() {
        try {
            this.serverUrl = await Config.get('serverUrl', DEFAULTS.serverUrl);
            this.debug = await Config.get('debug', DEFAULTS.debug);
        } catch (e) {
            // Config not available, use defaults
        }

        this.eventSourcePatch();
        this.fetchPatch();
        this.webSocketPatch();
        this.xhrPatch();

        this.bindEvents();
        this.initUUID();
    }

    //
    // Logging
    //
    _debug(message, ...args) {
        if (this.debug) {
            this.log(message, ...args);
        }
    }

    log(message, ...args) {
        if (args.length > 0) {
            console.log(`[CHUCK::${this.platform}] ${message}`, ...args);
        } else {
            console.log(`[CHUCK::${this.platform}] ${message}`);
        }
    }

    warn(message, ...args) {
        const f = console.warn ?? console.log;
        if (args.length > 0) {
            f(`[CHUCK::${this.platform}] ${message}`, ...args);
        } else {
            f(`[CHUCK::${this.platform}] ${message}`);
        }
    }

    error(message, ...args) {
        const f = console.error ?? console.log;
        if (args.length > 0) {
            f(`[CHUCK::${this.platform}] ${message}`, ...args);
        } else {
            f(`[CHUCK::${this.platform}] ${message}`);
        }
    }

    //
    // UUID Setup
    //
    initUUID() {
        // Make UUID available globally for platform classes
        if (!window.UUID) {
            window.UUID = {};
        }
        window.UUID.v5 = uuidv5;
    }

    //
    // Page Events
    //
    bindEvents() {
        document.addEventListener('DOMContentLoaded', (event) => this.onDocumentReady(event));
        document.addEventListener('DOMContentLoaded', (event) => this.createChatSocket());
        window.addEventListener('beforeunload', (event) => this.onBeforeUnload(event));
    }

    onDocumentReady(event) {
        this._debug('Document ready.');
    }

    onBeforeUnload(event) {
        this._debug('Window is about to unload.');
        this.sendViewerCount(0);
    }

    //
    // Chat Socket
    //
    createChatSocket() {
        if (this.chatSocket !== null && this.chatSocket.readyState === WebSocket.OPEN) {
            this.log('Chat socket already exists and is open.');
        } else {
            this.log('Creating chat socket.');
            const ws = new WebSocket.oldWebSocket(this.serverUrl);
            ws.addEventListener('open', (event) => this.onChatSocketOpen(ws, event));
            ws.addEventListener('message', (event) => this.onChatSocketMessage(ws, event));
            ws.addEventListener('close', (event) => this.onChatSocketClose(ws, event));
            ws.addEventListener('error', (event) => this.onChatSocketError(ws, event));

            ws.chuck_socket = true;
            this.chatSocket = ws;
        }

        return this.chatSocket;
    }

    onChatSocketOpen(ws, event) {
        this._debug('Chat socket opened.');
        this.sendChatMessages(this.chatMessageQueue);
        this.chatMessageQueue = [];
    }

    onChatSocketMessage(ws, event) {
        this._debug('Chat socket received data.', event);
    }

    onChatSocketClose(ws, event) {
        this._debug('Chat socket closed.', event);
        this.chatSocketTimeout = setTimeout(() => this.createChatSocket(), 3000);
    }

    onChatSocketError(ws, event) {
        this._debug('Chat socket errored.', event);
        ws.close();
        this.chatSocketTimeout = setTimeout(() => this.createChatSocket(), 3000);
    }

    //
    // Message Sending
    //
    queueLivestreamUpdate(update) {
        const ws_open = this?.chatSocket?.readyState === WebSocket.OPEN;
        const seed_ready = this.channel !== null;

        if (ws_open && seed_ready) {
            this.chatSocket.send(JSON.stringify(update));
        } else {
            this.warn('Forcing messages to queue. Socket open:', ws_open, 'Seed ready:', seed_ready);
            this.updateQueue.push(update);
        }
    }

    sendChatMessages(messages) {
        this._debug('Sending chat messages.', messages);
        const update = new LivestreamUpdate(this.platform, this.channel);

        if (Array.isArray(messages)) {
            update.messages = messages;
        } else if (messages instanceof ChatMessage) {
            update.messages = [messages];
        } else {
            this.warn('Invalid messages parameter. Expected ChatMessage or Array of ChatMessage.', messages);
            return;
        }

        this.queueLivestreamUpdate(update);
    }

    sendRemoveMessages(ids) {
        this._debug('Sending remove message for IDs:', ids);
        const update = new LivestreamUpdate(this.platform, this.channel);
        update.removals = ids;
        this.queueLivestreamUpdate(update);
    }

    sendViewerCount(count) {
        this._debug('Updating viewer count. Current viewers:', count);
        this.viewers = count;

        let update = new LivestreamUpdate(this.platform, this.channel);
        update.viewers = count;
        this.queueLivestreamUpdate(update);
    }

    receiveSubscriptions(sub) {
        const message = new ChatMessage(
            uuidv5(sub.id, this.namespace),
            this.platform,
            this.channel
        );
        message.username = sub.buyer;
        message.amount = sub.value * sub.count;
        message.currency = 'USD';

        if (sub.gifted) {
            if (sub.count > 1) {
                message.message = `${message.username} gifted ${sub.count} subscriptions!`;
            } else {
                message.message = `${message.username} gifted a subscription!`;
            }
        } else {
            if (sub.count > 1) {
                message.message = `${message.username} subscribed for ${sub.count} months!`;
            } else {
                message.message = `${message.username} subscribed for 1 month!`;
            }
        }

        this.log('Sending subscription message.', message);
        this.sendChatMessages([message]);
    }

    //
    // EventSource Patching
    //
    eventSourcePatch() {
        const self = this;
        const oldEventSource = WINDOW.EventSource;
        const newEventSource = function(url, config) {
            const es = new oldEventSource(url, config);

            es.addEventListener('message', function(event) {
                self.onEventSourceMessage(es, event);
            });

            return es;
        };
        newEventSource.chuck_patched = true;
        newEventSource.oldEventSource = oldEventSource;
        WINDOW.EventSource = Object.assign(newEventSource, oldEventSource);
        return WINDOW.EventSource;
    }

    onEventSourceMessage(es, event) {
        this._debug('EventSource received data.', event);
    }

    //
    // Fetch Patching
    //
    fetchPatch() {
        const self = this;
        const oldFetch = WINDOW.fetch;
        const newFetch = function(...args) {
            let [resource, config] = args;
            const response = oldFetch(resource, config);
            response.then((data) => {
                const newData = data.clone();
                self.onFetchResponse(newData);
                return data;
            });
            return response;
        };
        newFetch.chuck_patched = true;
        newFetch.oldFetch = oldFetch;
        WINDOW.fetch = Object.assign(newFetch, oldFetch);
        return WINDOW.fetch;
    }

    onFetchResponse(response) {
        this._debug('Fetch received data.', response);
    }

    //
    // WebSocket Patching
    //
    webSocketPatch() {
        const self = this;
        const oldWebSocket = WINDOW.WebSocket;
        const newWebSocket = function(url, protocols) {
            const ws = new oldWebSocket(url, protocols);
            const oldWsSend = ws.send;
            ws.send = function(data) {
                self.onWebSocketSend(ws, data);
                return oldWsSend.apply(ws, arguments);
            };
            ws.addEventListener('message', (event) => self.onWebSocketMessage(ws, event));
            ws.send.chuck_patched = true;
            return ws;
        };
        newWebSocket.chuck_patched = true;
        newWebSocket.oldWebSocket = oldWebSocket;
        WINDOW.WebSocket = Object.assign(newWebSocket, oldWebSocket);
        return WINDOW.WebSocket;
    }

    onWebSocketMessage(ws, event) {
        this._debug('WebSocket received data.', event);
    }

    onWebSocketSend(ws, data) {
        this._debug('WebSocket sent data.', data);
    }

    //
    // XHR Patching
    //
    xhrPatch() {
        const self = this;

        const oldXhrOpen = WINDOW.XMLHttpRequest.prototype.open;
        const newXhrOpen = function(method, url, async, user, password) {
            self.onXhrOpen(this, method, url, async, user, password);
            return oldXhrOpen.apply(this, arguments);
        };
        newXhrOpen.chuck_patched = true;
        WINDOW.XMLHttpRequest.prototype.open = Object.assign(newXhrOpen, oldXhrOpen);

        const oldXhrSend = WINDOW.XMLHttpRequest.prototype.send;
        const newXhrSend = function(body) {
            self.onXhrSend(this, body);
            return oldXhrSend.apply(this, arguments);
        };
        newXhrSend.chuck_patched = true;
        WINDOW.XMLHttpRequest.prototype.send = Object.assign(newXhrSend, oldXhrSend);

        return WINDOW.XMLHttpRequest;
    }

    onXhrOpen(xhr, method, url, async, user, password) {
        this._debug('XHR opened.', method, url, async, user, password);
        xhr.addEventListener('readystatechange', (event) => this.onXhrReadyStateChange(xhr, event));
    }

    onXhrReadyStateChange(xhr, event) {
        this._debug('XHR ready state changed.', event);
    }

    onXhrSend(xhr, body) {
        this._debug('XHR sent data.', body);
    }
}

// Export helpers for platform classes
export { WINDOW, uuidv5, ChatMessage, LivestreamUpdate };
