/**
 * CHUCK - Chat Harvesting Universal Connection Kit
 * Debug Recorder - Captures all intercepted traffic for analysis
 */

/**
 * Event status indicating how CHUCK processed the event
 */
export const EventStatus = {
    HANDLED: 'handled',      // Successfully parsed and processed
    IGNORED: 'ignored',      // Recognized but intentionally skipped
    UNHANDLED: 'unhandled',  // Unknown event type, no handler
    ERROR: 'error',          // Handler threw an error
};

/**
 * Event types for categorization
 */
export const EventType = {
    WS_CONNECT: 'ws_connect',
    WS_MESSAGE: 'ws_message',
    WS_SEND: 'ws_send',
    WS_CLOSE: 'ws_close',
    WS_ERROR: 'ws_error',
    FETCH_REQUEST: 'fetch_request',
    FETCH_RESPONSE: 'fetch_response',
    XHR_OPEN: 'xhr_open',
    XHR_SEND: 'xhr_send',
    XHR_RESPONSE: 'xhr_response',
    EVENTSOURCE_OPEN: 'eventsource_open',
    EVENTSOURCE_MESSAGE: 'eventsource_message',
    EVENTSOURCE_ERROR: 'eventsource_error',
    CHAT_MESSAGE: 'chat_message',  // Parsed chat message sent to backend
    VIEWER_COUNT: 'viewer_count',  // Viewer count update
    MESSAGE_REMOVAL: 'message_removal',  // Message deletion
};

/**
 * Debug recorder that captures all intercepted traffic
 */
export class Recorder {
    constructor(platform = 'Unknown') {
        this.platform = platform;
        this.events = [];
        this.recording = false;
        this.startTime = null;
        this.maxEvents = 10000; // Prevent memory issues
    }

    /**
     * Start recording events
     */
    start() {
        if (this.recording) {
            console.log('[CHUCK Recorder] Already recording');
            return;
        }
        this.recording = true;
        this.startTime = Date.now();
        this.events = [];
        console.log(`[CHUCK Recorder] Started recording for ${this.platform}`);
    }

    /**
     * Stop recording events
     */
    stop() {
        if (!this.recording) {
            console.log('[CHUCK Recorder] Not currently recording');
            return;
        }
        this.recording = false;
        console.log(`[CHUCK Recorder] Stopped recording. Captured ${this.events.length} events.`);
    }

    /**
     * Record an event
     * @param {string} type - Event type from EventType
     * @param {object} data - Event data
     * @param {string} status - Event status from EventStatus
     * @param {object} parsed - Parsed result (ChatMessage, etc.) if any
     * @param {string} note - Optional note about why event was ignored/unhandled
     */
    record(type, data, status = EventStatus.UNHANDLED, parsed = null, note = null) {
        if (!this.recording) return;

        // Prevent memory overflow
        if (this.events.length >= this.maxEvents) {
            console.warn('[CHUCK Recorder] Max events reached, stopping recording');
            this.stop();
            return;
        }

        const event = {
            timestamp: Date.now(),
            relativeTime: Date.now() - this.startTime,
            type,
            status,
            url: data.url || null,
            payload: this._safeStringify(data.payload),
            payloadSize: this._getSize(data.payload),
            parsed: parsed ? this._safeStringify(parsed) : null,
            note,
            // Additional metadata
            meta: {
                method: data.method || null,
                statusCode: data.statusCode || null,
                headers: data.headers || null,
                eventName: data.eventName || null,  // For WebSocket events like "App\\Events\\ChatMessageEvent"
            }
        };

        this.events.push(event);
    }

    /**
     * Record a WebSocket message
     */
    recordWebSocket(direction, url, payload, status = EventStatus.UNHANDLED, parsed = null, eventName = null, note = null) {
        const type = direction === 'in' ? EventType.WS_MESSAGE : EventType.WS_SEND;
        this.record(type, { url, payload, eventName }, status, parsed, note);
    }

    /**
     * Record a Fetch response
     */
    recordFetch(url, method, statusCode, payload, status = EventStatus.UNHANDLED, parsed = null, note = null) {
        this.record(EventType.FETCH_RESPONSE, { url, method, statusCode, payload }, status, parsed, note);
    }

    /**
     * Record an XHR response
     */
    recordXhr(url, method, statusCode, payload, status = EventStatus.UNHANDLED, parsed = null, note = null) {
        this.record(EventType.XHR_RESPONSE, { url, method, statusCode, payload }, status, parsed, note);
    }

    /**
     * Record an EventSource message
     */
    recordEventSource(url, payload, status = EventStatus.UNHANDLED, parsed = null, eventName = null, note = null) {
        this.record(EventType.EVENTSOURCE_MESSAGE, { url, payload, eventName }, status, parsed, note);
    }

    /**
     * Record a parsed chat message that was sent to backend
     */
    recordChatMessage(message) {
        this.record(EventType.CHAT_MESSAGE, { payload: message }, EventStatus.HANDLED, message);
    }

    /**
     * Get recording statistics
     */
    getStats() {
        const stats = {
            platform: this.platform,
            recording: this.recording,
            totalEvents: this.events.length,
            duration: this.startTime ? Date.now() - this.startTime : 0,
            byType: {},
            byStatus: {},
        };

        for (const event of this.events) {
            stats.byType[event.type] = (stats.byType[event.type] || 0) + 1;
            stats.byStatus[event.status] = (stats.byStatus[event.status] || 0) + 1;
        }

        return stats;
    }

    /**
     * Get only unhandled events (useful for finding missing handlers)
     */
    getUnhandled() {
        return this.events.filter(e => e.status === EventStatus.UNHANDLED);
    }

    /**
     * Get events by type
     */
    getByType(type) {
        return this.events.filter(e => e.type === type);
    }

    /**
     * Export recording as JSON object
     */
    export() {
        return {
            platform: this.platform,
            recordingStarted: this.startTime ? new Date(this.startTime).toISOString() : null,
            recordingEnded: new Date().toISOString(),
            stats: this.getStats(),
            events: this.events,
        };
    }

    /**
     * Download recording as JSON file
     */
    download(filename = null) {
        const data = this.export();
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const name = filename || `chuck-${this.platform.toLowerCase()}-${date}.json`;

        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log(`[CHUCK Recorder] Downloaded ${name} (${this.events.length} events, ${this._formatSize(json.length)})`);
    }

    /**
     * Clear all recorded events
     */
    clear() {
        this.events = [];
        this.startTime = null;
        console.log('[CHUCK Recorder] Cleared all events');
    }

    /**
     * Safely stringify any value, handling circular references
     */
    _safeStringify(value) {
        if (value === undefined || value === null) return null;
        if (typeof value === 'string') return value;

        try {
            const seen = new WeakSet();
            return JSON.stringify(value, (key, val) => {
                if (typeof val === 'object' && val !== null) {
                    if (seen.has(val)) return '[Circular]';
                    seen.add(val);
                }
                return val;
            });
        } catch (e) {
            return `[Stringify Error: ${e.message}]`;
        }
    }

    /**
     * Get size of payload in bytes
     */
    _getSize(value) {
        if (!value) return 0;
        if (typeof value === 'string') return value.length;
        try {
            return JSON.stringify(value).length;
        } catch {
            return 0;
        }
    }

    /**
     * Format byte size for display
     */
    _formatSize(bytes) {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
}

export default Recorder;
