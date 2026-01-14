/**
 * CHUCK - Chat Harvesting Universal Connection Kit
 * Rumble platform scraper
 *
 * Features:
 * - Capture new messages
 * - Capture sent messages
 * - Capture existing messages
 * - Capture emotes
 * - Capture view counts
 * - Capture rants (paid messages)
 */

import { Seed, ChatMessage, uuidv5 } from '../core/index.js';

export class Rumble extends Seed {
    static hostname = 'rumble.com';
    static namespace = '5ceefcfb-4aa5-443a-bea6-1f8590231471';

    emotes = [];

    constructor() {
        const channel = null; // Cannot be determined before DOM is ready
        super(Rumble.namespace, 'Rumble', channel);
    }

    onDocumentReady() {
        // Pop-out chat contains the channel ID in the URL
        if (window.location.href.indexOf('/chat/popup/') >= 0) {
            this.channel = parseInt(window.location.href.split('/').filter(x => x)[4], 10);
        } else {
            // Otherwise, find the channel ID in the DOM (upvote button)
            this.channel = parseInt(document.querySelector('.rumbles-vote-pill')?.dataset.id, 10);
        }

        if (this.channel !== null) {
            this.fetchEmotes();
        }
    }

    fetchEmotes() {
        const init = document.querySelector('body > script:not([src])');
        if (!init) return;

        const code = init.textContent;
        const regex = /{items:(\[[^\(\)]*\]}\])}/;
        const match = code.match(regex);

        if (match) {
            const itemsObj = eval(`"use strict";(${match[1]})`);
            itemsObj.forEach((channel) => {
                if (channel.emotes !== undefined && channel.emotes.length > 0) {
                    channel.emotes.forEach((emote) => {
                        this.emotes[emote.name] = emote.file;
                    });
                }
            });
        }
    }

    receiveChatPairs(messages, users) {
        this.prepareSubscriptions(messages, users).then((data) => {
            data.forEach((datum) => {
                if (datum) this.receiveSubscriptions(datum);
            });
        });

        this.prepareChatMessages(messages, users).then((data) => {
            this.sendChatMessages(data);
        });
    }

    prepareChatMessages(messages, users) {
        return Promise.all(messages
            .filter(async (messageData) => {
                messageData.text.trim() !== '';
            })
            .map(async (messageData, index) => {
                const message = new ChatMessage(
                    uuidv5(messageData.id, this.namespace),
                    this.platform,
                    this.channel
                );

                const user = users.find((user) => user.id === messageData.user_id);
                if (user === undefined) {
                    this.log('User not found:', messageData.user_id);
                    return;
                }

                message.sent_at = Date.parse(messageData.time);
                message.message = messageData.text;

                // Replace :r+emote: with image URLs
                for (const match of message.message.matchAll(/\:([a-zA-Z0-9_\.\+\-]+)\:/g)) {
                    const id = match[1];
                    if (this.emotes[id] !== undefined) {
                        message.emojis.push([match[0], this.emotes[id], `:${id}:`]);
                    } else {
                        this.log(`no emote for ${id}`);
                    }
                }

                message.username = user.username;
                if (user['image.1'] !== undefined) {
                    message.avatar = user['image.1'];
                }

                if (user.badges !== undefined) {
                    user.badges.forEach((badge) => {
                        switch (badge) {
                            case 'admin':
                                message.is_owner = true;
                                break;
                            case 'moderator':
                                message.is_mod = true;
                                break;
                            case 'whale-gray':
                            case 'whale-blue':
                            case 'whale-yellow':
                            case 'locals':
                            case 'locals_supporter':
                            case 'recurring_subscription':
                                message.is_sub = true;
                                break;
                            case 'premium':
                                break;
                            case 'verified':
                                message.is_verified = true;
                                break;
                            default:
                                this.log(`Unknown badge type: ${badge}`);
                                break;
                        }
                    });
                }

                if (messageData.rant !== undefined) {
                    message.amount = messageData.rant.price_cents / 100;
                    message.currency = 'USD';
                }

                return message;
            }));
    }

    prepareSubscriptions(messages, users) {
        return Promise.all(messages
            .filter(messageData => messageData.hasOwnProperty('notification'))
            .map(async (messageData, index) => {
                const user = users.find((user) => user.id === messageData.user_id);
                if (user === undefined) {
                    this.log('User not found:', messageData.user_id);
                    return;
                }

                return {
                    id: messageData.id,
                    gifted: false,
                    buyer: user.username,
                    count: 1,
                    value: 5
                };
            }));
    }

    onEventSourceMessage(es, event) {
        try {
            const json = JSON.parse(event.data);
            switch (json.type) {
                case 'init':
                case 'messages':
                    this.receiveChatPairs(json.data.messages, json.data.users);
                    break;
                default:
                    this._debug('EventSource received data with unknown type.', json);
                    break;
            }
        } catch (e) {
            this.log('EventSource received data with invalid JSON.', e, event.data);
        }
    }

    async onFetchResponse(response) {
        try {
            const url = new URL(response.url);
            if (url.searchParams.get('name') == 'emote.list') {
                await response.json().then((json) => {
                    json.data.items.forEach((channel) => {
                        if (channel.emotes !== undefined && channel.emotes.length > 0) {
                            channel.emotes.forEach((emote) => {
                                this.emotes[emote.name] = emote.file;
                            });
                        }
                    });
                });
            }
        } catch (e) {
            this.log('Fetch response error.', e);
        }
    }

    onXhrOpen(xhr, method, url, async, user, password) {
        if (url.startsWith('https://wn0.rumble.com/service.php')) {
            xhr.addEventListener('readystatechange', (event) => this.onXhrServiceReadyStateChange(xhr, event));
        }
    }

    onXhrServiceReadyStateChange(xhr, event) {
        if (xhr.readyState !== XMLHttpRequest.DONE) return;

        if (xhr.responseType === 'json') {
            const json = xhr.response;
            const viewers = parseInt(json?.data?.viewer_count || json?.data?.num_watching_now, 10);
            if (!isNaN(viewers)) {
                this.sendViewerCount(viewers);
            }
        }
    }
}

export default Rumble;
