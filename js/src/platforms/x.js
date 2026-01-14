/**
 * CHUCK - Chat Harvesting Universal Connection Kit
 * X (Twitter) platform scraper
 *
 * Features:
 * - Capture new messages
 * - Capture sent messages
 * - Capture view counts (occupancy)
 *
 * Note: X blocks outbound connections via CSP. Browser extension can bypass this,
 * but userscript requires a CSP-modifying extension.
 */

import { Seed, ChatMessage } from '../core/index.js';

export class X extends Seed {
    static hostname = 'x.com';
    static altHostname = 'twitter.com';
    static namespace = '0abb36b8-43ab-40b5-be61-4f2c32a75890';

    constructor() {
        const channel = window.location.href.split('/').filter(x => x).at(-1);
        super(X.namespace, 'X', channel);
    }

    async initUUID() {
        // X provides UUIDs for messages, and its CSP blocks the import
        // So we skip UUID initialization here
    }

    prepareChatMessages(pairs) {
        return Promise.all(pairs.map(async (pair) => {
            const message = new ChatMessage(pair.body.uuid, this.platform, this.channel);

            message.username = pair.sender.username;
            message.message = pair.body.body;

            // X sometimes sends messages with future timestamps
            if (pair.body.timestamp <= new Date()) {
                message.sent_at = pair.body.timestamp;
                console.warn('Received message with future timestamp:', pair.body.timestamp);
            } else {
                message.sent_at = Date.now();
            }

            message.avatar = pair.sender.profile_image_url ?? 'https://abs.twimg.com/sticky/default_profile_images/default_profile_400x400.png';
            message.is_verified = pair.sender.verified ?? false;

            return message;
        }));
    }

    parseWebSocketMessage(data) {
        switch (data.kind) {
            case 1:
                const payload = JSON.parse(data.payload);
                if (payload.sender !== undefined && payload.body !== undefined) {
                    const body = JSON.parse(payload.body);
                    if (body.body !== undefined) {
                        return this.prepareChatMessages([{
                            sender: payload.sender,
                            body: body
                        }]).then((data) => {
                            this.sendChatMessages(data);
                        });
                    }
                }
                this._debug('Unknown message type:', data);
                break;
            case 2:
                const payload2 = JSON.parse(data.payload);
                if (payload2.kind == 4) {
                    this.parseWebSocketMessage(payload2);
                }
                break;
            case 4:
                const payload4 = JSON.parse(data.body);
                if (payload4.occupancy !== undefined) {
                    this.sendViewerCount(payload4.occupancy);
                }
                break;
            default:
                break;
        }
    }

    onWebSocketMessage(ws, event) {
        const data = JSON.parse(event.data);
        this.parseWebSocketMessage(data);
    }

    onWebSocketSend(ws, message) {
        const data = JSON.parse(message);
        this.parseWebSocketMessage(data);
    }
}

export default X;
