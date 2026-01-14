/**
 * CHUCK - Chat Harvesting Universal Connection Kit
 * Kick.com platform scraper
 *
 * Features:
 * - Capture new messages
 * - Capture sent messages
 * - Capture existing messages (chat history)
 * - Capture emotes
 * - Capture view counts
 * - Capture KicksGifted (premium gifts)
 */

import { Seed, ChatMessage, uuidv5 } from '../core/index.js';

export class Kick extends Seed {
    static hostname = 'kick.com';
    static namespace = '6efe7271-da75-4c2f-93fc-ddf37d02b8a9';

    channel_id = null;
    livestream_id = null;

    constructor() {
        const channel = window.location.href.split('/').filter(x => x)[2]?.toLowerCase();
        super(Kick.namespace, 'Kick', channel);
        this.fetchChatHistory();
    }

    async fetchChatHistory() {
        const channel_info = await fetch(`https://kick.com/api/v2/channels/${this.channel}`).then(response => response.json());
        this.channel_id = channel_info.id;
        this.livestream_id = channel_info.livestream?.id;

        fetch(`https://kick.com/api/v2/channels/${this.channel_id}/messages`)
            .then(response => response.json())
            .then(json => {
                this.log(json);
                json.data.messages.reverse().forEach((messageJson) => {
                    const message = this.prepareChatMessage(messageJson);
                    this.sendChatMessages([message]);
                });
            });
    }

    receiveChatMessage(json) {
        const message = this.prepareChatMessage(json);
        this.sendChatMessages([message]);
    }

    prepareChatMessage(json) {
        const message = new ChatMessage(json.id, this.platform, this.channel);
        message.sent_at = Date.parse(json.created_at);
        message.username = json.sender.username;
        message.message = json.content;

        if ((json.gift?.amount ?? 0) > 0) {
            message.amount = json.gift.amount / 100;
            message.currency = 'USD';
        }

        // Emotes are supplied as bbcode: [emote:37221:EZ]
        for (const match of message.message.matchAll(/\[emote:(\d+):([^\]]+)\]/g)) {
            message.emojis.push([match[0], `https://files.kick.com/emotes/${match[1]}/fullsize`, match[2]]);
        }

        json.sender.identity.badges.forEach((badge) => {
            switch (badge.type) {
                case 'vip':
                case 'og':
                case 'founder':
                    break;
                case 'verified':
                    message.is_verified = true;
                    break;
                case 'broadcaster':
                    message.is_owner = true;
                    break;
                case 'moderator':
                    message.is_mod = true;
                    break;
                case 'subscriber':
                case 'sub_gifter':
                    message.is_sub = true;
                    break;
                default:
                    this.log(`Unknown badge type: ${badge.type}`);
                    break;
            }
        });

        return message;
    }

    onWebSocketMessage(ws, event) {
        const json = JSON.parse(event.data);
        if (json.event === undefined) {
            switch (json.type) {
                case 'ping':
                case 'pong':
                    return;
                default:
                    this.log('WebSocket received data with no event.', event);
            }
        }

        const subValue = 5;

        switch (json.event) {
            case 'App\\Events\\ChatMessageEvent':
                this.receiveChatMessage(JSON.parse(json.data));
                break;

            case 'KicksGifted':
                console.log('KicksGifted', JSON.parse(json.data));
                this.receiveChatMessage(JSON.parse(json.data));
                break;

            case 'App\\Events\\GiftedSubscriptionsEvent':
                const giftData = JSON.parse(json.data);
                this.receiveSubscriptions({
                    id: `${Date.now()}_${giftData.username}`,
                    gifted: true,
                    buyer: giftData.gifter_username,
                    count: giftData.gifted_usernames.length,
                    value: subValue,
                });
                break;

            case 'App\\Events\\SubscriptionEvent':
                const subData = JSON.parse(json.data);
                this.receiveSubscriptions({
                    id: `${Date.now()}_${subData.username}`,
                    gifted: false,
                    buyer: subData.username,
                    count: subData.months,
                    value: subValue,
                });
                break;

            case 'App\\Events\\MessageDeletedEvent':
                const delData = JSON.parse(json.data);
                if (delData.aiModerated) {
                    this.log('AI Moderated message ID:', delData.message.id, 'Rules:', delData.violatedRules);
                } else {
                    this.log('Deleting message ID:', delData.message.id);
                    this.sendRemoveMessages([delData.message.id]);
                }
                break;

            case 'App\\Events\\LivestreamUpdated':
            case 'App\\Events\\UpdatedLiveStreamEvent':
                let viewers = parseInt(json.data.viewers, 10);
                if (!isNaN(viewers)) {
                    this.sendViewerCount(viewers);
                }
                break;

            // Ignored events
            case 'KicksLeaderboardUpdated':
            case 'App\\Events\\GiftsLeaderboardUpdated':
            case 'App\\Events\\LuckyUsersWhoGotGiftSubscriptionsEvent':
            case 'App\\Events\\ChannelSubscriptionEvent':
            case 'App\\Events\\UserBannedEvent':
            case 'App\\Events\\UserUnbannedEvent':
            case 'App\\Events\\PinnedMessageCreatedEvent':
            case 'App\\Events\\PinnedMessageDeletedEvent':
            case 'App\\Events\\FollowersUpdated':
            case 'GoalProgressUpdateEvent':
            case 'PointsUpdated':
            case 'RewardRedeemedEvent':
            case 'pusher_internal:subscription_succeeded':
            case 'pusher:connection_established':
            case 'pusher:pong':
                break;

            default:
                this.log('WebSocket received data with unknown event.', json.event);
                break;
        }
    }

    onWebSocketSend(ws, data) {
        const json = JSON.parse(data);
        if (json.event === undefined) {
            switch (json.type) {
                case 'user_event':
                case 'channel_handshake':
                case 'channel_disconnect':
                case 'ping':
                case 'pong':
                    return;
                default:
                    this.log('WebSocket sent data with no event.', json);
            }
        }

        switch (json.event) {
            case 'pusher:subscribe':
            case 'pusher:ping':
                break;
            default:
                this.log('WebSocket sent data with unknown event.', data);
                break;
        }
    }

    async onFetchResponse(response) {
        if (response.url.indexOf('/current-viewers') >= 0) {
            await response.json().then((json) => {
                for (const channel of json) {
                    this.sendViewerCount(channel.viewers);
                }
            });
        }
    }

    onXhrOpen(xhr, method, url, async, user, password) {
        if (url.startsWith('https://kick.com/api/v2/messages/send/')) {
            xhr.addEventListener('readystatechange', (event) => this.onXhrSendMessageReadyStateChange(xhr, event));
        } else if (url.startsWith('https://kick.com/api/v1/channels/')) {
            xhr.addEventListener('readystatechange', (event) => this.onXhrChannelReadyStateChange(xhr, event));
        } else if (url.startsWith('https://kick.com/current-viewers')) {
            xhr.addEventListener('readystatechange', (event) => this.onXhrViewersReadyStateChange(xhr, event));
        } else if (url.match(/https:\/\/kick\.com\/api\/v2\/channels\/.+\/livestream/) !== null) {
            xhr.addEventListener('readystatechange', (event) => this.onXhrLivestreamReadyStateChange(xhr, event));
        }
    }

    onXhrChannelReadyStateChange(xhr, event) {
        if (xhr.readyState !== XMLHttpRequest.DONE) return;

        const json = JSON.parse(xhr.responseText);
        const viewers = parseInt(json.livestream?.viewers, 10);
        if (!isNaN(viewers)) {
            this.sendViewerCount(viewers);
        }
    }

    onXhrLivestreamReadyStateChange(xhr, event) {
        if (xhr.readyState !== XMLHttpRequest.DONE) return;

        const json = JSON.parse(xhr.responseText);
        if (json.data?.id !== undefined) {
            this.livestream_id = json.data.id;
        }
    }

    onXhrSendMessageReadyStateChange(xhr, event) {
        if (xhr.readyState !== XMLHttpRequest.DONE) return;

        const json = JSON.parse(xhr.responseText);
        if (json.status === undefined || json.data === undefined) {
            this.log('XHR sent message with no status or data.', json);
            return;
        }

        if (json.status.code === 200 && json.data.id !== undefined) {
            this.log('XHR sent message is ready.', json);
            this.receiveChatMessage(json.data);
        }
    }

    onXhrViewersReadyStateChange(xhr, event) {
        if (xhr.readyState !== XMLHttpRequest.DONE) return;
        if (this.channel_id === null) {
            this.warn('XHR received viewers with no channel ID.');
            return;
        }

        const json = JSON.parse(xhr.responseText);
        for (const channel of json) {
            if (channel.livestream_id === this.livestream_id) {
                this.sendViewerCount(channel.viewers);
                return;
            } else {
                this.log('XHR received viewers for unknown livestream.', channel);
            }
        }
    }
}

export default Kick;
