/**
 * CHUCK - Chat Harvesting Universal Connection Kit
 * Odysee platform scraper
 *
 * Features:
 * - Capture new messages
 * - Capture sent messages
 * - Capture existing messages
 * - Capture view counts
 * - Capture fiat superchats
 */

import { Seed, ChatMessage, uuidv5, EventStatus } from '../core/index.js';

export class Odysee extends Seed {
    static hostname = 'odysee.com';
    static namespace = 'd80f03bf-d30a-48e9-9e9f-81616366eefd';

    emojis = [];

    constructor() {
        const channel = window.location.href.split('/').filter(x => x).at(-2);
        super(Odysee.namespace, 'Odysee', channel);
    }

    onDocumentReady(event) {
        this._debug('Document ready.');
        // Identify all emojis from button elements
        for (const button of document.querySelectorAll('.button.button--alt.button--file-action')) {
            const emoji = button.title;
            const url = button.querySelector('img')?.src;
            if (emoji !== undefined && url !== undefined) {
                this.emojis[emoji] = url;
            } else {
                this.warn('Unknown emoji button.', button);
            }
        }
        this._debug('Emojis found.', this.emojis.length);
    }

    receiveChatMessages(json) {
        return this.prepareChatMessages(json).then((data) => {
            this.sendChatMessages(data);
        });
    }

    prepareChatMessages(json) {
        return Promise.all(json.map(async (item) => {
            const message = new ChatMessage(
                uuidv5(item.comment_id, this.namespace),
                this.platform,
                this.channel
            );
            message.avatar = 'https://thumbnails.odycdn.com/optimize/s:160:160/quality:85/plain/https://spee.ch/spaceman-png:2.png';
            message.username = item.channel_name;
            message.message = item.comment;
            message.sent_at = ((item.timestamp - 1) * 1000);

            if (item.is_fiat === true) {
                message.amount = item.support_amount;
                message.currency = 'USD';
            }

            message.is_owner = item.is_creator ?? false;

            return message;
        }));
    }

    async onFetchResponse(response) {
        try {
            const url = new URL(response.url);
            const method = url.searchParams.get('m');
            switch (method) {
                case 'comment.List':
                case 'comment.SuperChatList':
                    const cloned1 = response.clone();
                    await cloned1.json().then(async (data) => {
                        if (data.result !== undefined && data.result.items !== undefined) {
                            this.receiveChatMessages(data.result.items);
                            this.recordFetchHandled(response.url, 'GET', response.status, data, {
                                method: method,
                                itemCount: data.result.items.length
                            });
                        }
                    });
                    break;
                case 'comment.Create':
                    const cloned2 = response.clone();
                    await cloned2.json().then(async (data) => {
                        if (data.result !== undefined && data.result.comment_id !== undefined) {
                            this.receiveChatMessages([data.result]);
                            this.recordFetchHandled(response.url, 'POST', response.status, data, {
                                method: method,
                                commentId: data.result.comment_id
                            });
                        }
                        return data;
                    });
                    break;
                default:
                    this.recordFetchIgnored(response.url, 'GET', response.status, 'Unknown method');
                    break;
            }
        } catch (e) {
            this.error('Fetch response error.', e);
            this.recorder.record('fetch_response', {
                url: response.url,
                method: 'GET',
                statusCode: response.status,
                payload: e.message
            }, EventStatus.ERROR, null, e.message);
        }
    }

    onWebSocketMessage(ws, event) {
        const json = JSON.parse(event.data);
        switch (json.type) {
            case 'delta':
                this.receiveChatMessages([json.data.comment]);
                this.recordWebSocketHandled(ws, 'in', event.data, json.data.comment, json.type);
                break;
            case 'removed':
                this.recordWebSocketIgnored(ws, 'in', event.data, json.type, 'Message removal not forwarded');
                break;
            case 'viewers':
                this.sendViewerCount(json.data.connected);
                this.recordWebSocketHandled(ws, 'in', event.data, { viewers: json.data.connected }, json.type);
                break;
            default:
                this.log(`Unknown update type.`, json);
                this.recordWebSocketUnhandled(ws, 'in', event.data, json.type);
                break;
        }
    }
}

export default Odysee;
