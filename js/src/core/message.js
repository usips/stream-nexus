/**
 * CHUCK - Chat Harvesting Universal Connection Kit
 * Message data structures
 */

/**
 * Represents an update to be sent to the backend server
 */
export class LivestreamUpdate {
    constructor(platform, channel) {
        this.platform = platform;
        this.channel = channel;
        this.messages = undefined;
        this.removals = undefined;
        this.viewers = undefined;
    }
}

/**
 * Represents a chat message from any platform
 */
export class ChatMessage {
    constructor(id, platform, channel) {
        this.id = id;
        this.platform = platform;
        this.channel = channel;
        this.sent_at = Date.now(); // System timestamp for display ordering
        this.received_at = Date.now(); // Local timestamp for management
        this.is_placeholder = false;

        this.message = '';
        this.emojis = []; // Array of [find, replace, alt] tuples

        this.username = 'DUMMY_USER';
        this.avatar = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='; // Transparent pixel

        this.amount = 0;
        this.currency = 'ZWL';

        this.is_verified = false;
        this.is_sub = false;
        this.is_mod = false;
        this.is_owner = false;
        this.is_staff = false;
    }
}
