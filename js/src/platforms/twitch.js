/**
 * CHUCK - Chat Harvesting Universal Connection Kit
 * Twitch platform scraper
 *
 * Note: Twitch implementation is incomplete - IRC parsing needs work
 */

import { Seed, ChatMessage, uuidv5 } from '../core/index.js';

export class Twitch extends Seed {
    static hostname = 'twitch.tv';
    static namespace = '4a342b79-e302-403a-99be-669b5f27b152';

    constructor() {
        const is_popout = window.location.href.indexOf('/popout/') >= 0;
        const channel = window.location.href.split('/').filter(x => x).at(is_popout ? 3 : 2);

        if (channel === 'p') {
            console.log('[CHUCK::Twitch] Within Twitch static /p/ directory: terminating.');
            return null;
        }

        super(Twitch.namespace, 'Twitch', channel);
    }

    // Twitch messages are encoded as IRC
    // Format: @metadata :user!user@user.tmi.twitch.tv PRIVMSG #channel :message
    parseIrcMessageToJson(message) {
        const json = {};
        const parts = message.split(' :');

        if (parts[0][0] === '@') {
            json.meta = {};
            const pairs = parts[0].slice(1).split(';');
            pairs.forEach((pair) => {
                const [key, value] = pair.split('=');
                json.meta[key.trim()] = value?.trim() ?? '';
            });
        }

        return json;
    }

    parseWebSocketMessage(data) {
        // TODO: Implement IRC message parsing
        this._debug('Twitch WebSocket message:', data);
    }

    onWebSocketMessage(ws, event) {
        this.parseWebSocketMessage(event.data);
    }

    onWebSocketSend(ws, message) {
        this.parseWebSocketMessage(message);
    }
}

export default Twitch;
