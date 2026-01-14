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

import { Seed, ChatMessage, uuidv5, EventStatus } from '../core/index.js';

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
        message.sent_at = json.created_at ? Date.parse(json.created_at) : Date.now();
        message.username = json.sender?.username ?? 'Unknown';
        message.message = json.content ?? '';

        if ((json.gift?.amount ?? 0) > 0) {
            message.amount = json.gift.amount / 100;
            message.currency = 'USD';
        }

        // Emotes are supplied as bbcode: [emote:37221:EZ]
        for (const match of message.message.matchAll(/\[emote:(\d+):([^\]]+)\]/g)) {
            message.emojis.push([match[0], `https://files.kick.com/emotes/${match[1]}/fullsize`, match[2]]);
        }

        // Handle badges if present (may be missing in some event types like KicksGifted)
        const badges = json.sender?.identity?.badges ?? [];
        badges.forEach((badge) => {
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

    /**
     * Prepare a KicksGifted message (platform currency gift)
     * KicksGifted has a different structure than regular chat messages
     *
     * Two known formats:
     * - BASIC tier: No created_at, no gift_transaction_id
     * - LEVEL_UP tier: Has created_at, expires_at, gift_transaction_id, profile_picture
     */
    prepareKicksGiftedMessage(json) {
        // Use gift_transaction_id if available, otherwise generate from sender + timestamp
        const messageId = json.gift_transaction_id ?? `kicks_${json.sender?.id ?? 'unknown'}_${Date.now()}`;
        const message = new ChatMessage(messageId, this.platform, this.channel);

        // Use created_at if available (newer LEVEL_UP format), otherwise use current time
        message.sent_at = json.created_at ? Date.parse(json.created_at) : Date.now();
        message.username = json.sender?.username ?? 'Unknown';
        message.avatar = json.sender?.profile_picture ?? message.avatar;

        // Use the message if provided, otherwise generate one from gift name
        message.message = json.message || `Sent a ${json.gift?.name ?? 'Kick'}!`;

        // KicksGifted has gift data with amount representing Kicks value
        if (json.gift) {
            // Kicks are platform currency - amount varies by tier
            // BASIC: 1 Kick, LEVEL_UP/MID: 1000 Kicks, etc.
            message.amount = json.gift.amount ?? 0;
            message.currency = 'KICKS'; // Platform currency, not real money
        }

        return message;
    }

    onWebSocketMessage(ws, event) {
        const json = JSON.parse(event.data);
        if (json.event === undefined) {
            switch (json.type) {
                case 'ping':
                case 'pong':
                    this.recordWebSocketIgnored(ws, 'in', event.data, json.type, 'Heartbeat');
                    return;
                default:
                    this.log('WebSocket received data with no event.', event);
                    this.recordWebSocketUnhandled(ws, 'in', event.data, json.type);
            }
        }

        const subValue = 5;

        switch (json.event) {
            case 'App\\Events\\ChatMessageEvent':
                const chatData = JSON.parse(json.data);
                this.receiveChatMessage(chatData);
                this.recordWebSocketHandled(ws, 'in', event.data, chatData, json.event);
                break;

            case 'KicksGifted':
                const kicksData = JSON.parse(json.data);
                const kicksMessage = this.prepareKicksGiftedMessage(kicksData);
                this.sendChatMessages([kicksMessage]);
                this.recordWebSocketHandled(ws, 'in', event.data, kicksData, json.event);
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
                this.recordWebSocketHandled(ws, 'in', event.data, giftData, json.event);
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
                this.recordWebSocketHandled(ws, 'in', event.data, subData, json.event);
                break;

            case 'App\\Events\\MessageDeletedEvent':
                const delData = JSON.parse(json.data);
                if (delData.aiModerated) {
                    this.log('AI Moderated message ID:', delData.message.id, 'Rules:', delData.violatedRules);
                    this.recordWebSocketIgnored(ws, 'in', event.data, json.event, 'AI moderated - not user deletion');
                } else {
                    this.log('Deleting message ID:', delData.message.id);
                    this.sendRemoveMessages([delData.message.id]);
                    this.recordWebSocketHandled(ws, 'in', event.data, delData, json.event);
                }
                break;

            case 'App\\Events\\LivestreamUpdated':
            case 'App\\Events\\UpdatedLiveStreamEvent':
                let viewers = parseInt(json.data.viewers, 10);
                if (!isNaN(viewers)) {
                    this.sendViewerCount(viewers);
                    this.recordWebSocketHandled(ws, 'in', event.data, { viewers }, json.event);
                }
                break;

            // Ignored events - recorded but intentionally not processed
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
                this.recordWebSocketIgnored(ws, 'in', event.data, json.event, 'Known event - intentionally ignored');
                break;

            default:
                this.log('WebSocket received data with unknown event.', json.event);
                this.recordWebSocketUnhandled(ws, 'in', event.data, json.event);
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
                    this.recordWebSocketIgnored(ws, 'out', data, json.type, 'Protocol message');
                    return;
                default:
                    this.log('WebSocket sent data with no event.', json);
                    this.recordWebSocketUnhandled(ws, 'out', data, json.type);
            }
        }

        switch (json.event) {
            case 'pusher:subscribe':
            case 'pusher:ping':
                this.recordWebSocketIgnored(ws, 'out', data, json.event, 'Pusher protocol');
                break;
            default:
                this.log('WebSocket sent data with unknown event.', data);
                this.recordWebSocketUnhandled(ws, 'out', data, json.event);
                break;
        }
    }

    async onFetchResponse(response) {
        if (response.url.indexOf('/current-viewers') >= 0) {
            const cloned = response.clone();
            await cloned.json().then((json) => {
                for (const channel of json) {
                    this.sendViewerCount(channel.viewers);
                }
                this.recordFetchHandled(response.url, 'GET', response.status, json, { viewers: json });
            });
        } else {
            this.recordFetchIgnored(response.url, 'GET', response.status, 'Not monitored endpoint');
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
