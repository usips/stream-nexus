// ==UserScript==
// @name S.N.E.E.D.
// @version 1.2.1
// @description Stream Nexus userscript.
// @license BSD-3-Clause
// @author Joshua Moon <josh@josh.rs>
// @downloadURL https://raw.githubusercontent.com/jaw-sh/stream-nexus/master/js/seed.js
// @updateURL https://raw.githubusercontent.com/jaw-sh/stream-nexus/master/js/seed.js
// @homepageURL https://github.com/jaw-sh/stream-nexus
// @supportURL https://github.com/jaw-sh/stream-nexus/issues
// @match https://kick.com/*
// @match https://kick.com/*/chatroom
// @match https://odysee.com/*
// @match https://odysee.com/$/popout/*
// @match https://rumble.com/v*.html
// @match https://rumble.com/c/*/live
// @match https://rumble.com/chat/popup/*
// @match https://twitch.tv/*
// @match https://twitch.tv/popout/*/chat
// @match https://www.youtube.com/live_chat?*
// @match https://youtube.com/live_chat?*
// @match https://vk.com/video/lives?z=*
// @match https://twitter.com/i/broadcasts/*
// @match https://x.com/i/broadcasts/*
// @match https://xmrchat.com/streamer
// @connect *
// @grant unsafeWindow
// @run-at document-start
// ==/UserScript==

//
// CONTENT-SECURITY-POLICY (CSP) NOTICE
// X blocks outbound connections via connect-src, including to local servers.
// You have to run another extension to edit the policy.
//
// https://chromewebstore.google.com/detail/content-security-policy-o/lhieoncdgamiiogcllfmboilhgoknmpi?hl=en
// ["https://twitter\\.com", [["connect-src", "connect-src ws://127.0.0.2:1350"]]]
//

(async function () {
    'use strict';

    const SOCKET_URL = "ws://127.0.0.2:1350/chat.ws";
    const DEBUG = false;
    const WINDOW = unsafeWindow ?? window;

    //
    // Chat Message
    //
    class ChatMessage {
        constructor(id, platform, channel) {
            this.id = id;
            this.platform = platform;
            this.channel = channel;
            this.sent_at = Date.now(); // System timestamp for display ordering.
            this.received_at = Date.now(); // Local timestamp for management.

            this.message = "";
            this.emojis = [];

            this.username = "DUMMY_USER";
            this.avatar = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="; // Transparent pixel.

            this.amount = 0;
            this.currency = "ZWL";

            this.is_verified = false;
            this.is_sub = false;
            this.is_mod = false;
            this.is_owner = false;
            this.is_staff = false;
        }

    }

    //
    // Seed
    //
    /// Base class for all platforms.
    class Seed {
        /// Channel name used as a token and in messages.
        channel = null;
        /// Platform name used as a token and in messages.
        platform = null;
        /// UUID used for generating v5 UUIDs consistently to each platform.
        namespace = null;
        /// Current live viewers.
        viewers = 0;

        /// Messages waiting to be sent to the Rust backend.
        chatMessageQueue = [];
        /// Current connection to the Rust backend.
        chatSocket = null;
        /// Timeout for re-attempting socket.
        chatSocketTimeout = null;

        constructor(namespace, platform, channel) {
            this.namespace = namespace;
            this.platform = platform;
            this.channel = channel;

            this.log("Initializing.");
            this.eventSourcePatch();
            this.fetchPatch();
            this.webSocketPatch();
            this.xhrPatch();

            this.bindEvents();
            this.fetchDependencies();
        }

        debug(message, ...args) {
            if (DEBUG) {
                this.log(message, ...args);
            }
        }

        log(message, ...args) {
            if (args.length > 0) {
                console.log(`[SNEED::${this.platform}] ${message}`, ...args);
            }
            else {
                console.log(`[SNEED::${this.platform}] ${message}`);
            }
        }

        warn(message, ...args) {
            const f = console.warn ?? console.log;
            if (args.length > 0) {
                f(`[SNEED::${this.platform}] ${message}`, ...args);
            }
            else {
                f(`[SNEED::${this.platform}] ${message}`);
            }
        }

        async fetchDependencies() {
            // Need import for  UUIDv5 for deterministic UUIDs.
            // Deterministic UUIDs help deduplicate messages in anomalous events.
            try {
                window.UUID = await import('https://jspm.dev/uuid');
            }
            catch (e) {
                // TODO: There should be a better way to communicate critical errors to broadcaster.
                this.warn("Failed to load UUID library.", e);
            }
        }

        //
        // Page Events
        //
        /// Bind generic events.
        bindEvents() {
            document.addEventListener("DOMContentLoaded", (event) => this.onDocumentReady(event));
            document.addEventListener("DOMContentLoaded", (event) => this.createChatSocket());
        }

        onDocumentReady() {
            this.debug("Document ready.");
        }

        //
        // Chat Socket
        //
        // Creates a WebSocket to the Rust chat server.
        createChatSocket() {
            if (this.chatSocket !== null && this.chatSocket.readyState === WebSocket.OPEN) {
                this.log("Chat socket already exists and is open.");
            }
            else {
                this.log("Creating chat socket.");
                const ws = new WebSocket.oldWebSocket(SOCKET_URL);
                ws.addEventListener("open", (event) => this.onChatSocketOpen(ws, event));
                ws.addEventListener("message", (event) => this.onChatSocketMessage(ws, event));
                ws.addEventListener("close", (event) => this.onChatSocketClose(ws, event));
                ws.addEventListener("error", (event) => this.onChatSocketError(ws, event));

                ws.sneed_socket = true;
                this.chatSocket = ws;
            }

            //clearTimeout(this.chatSocketTimeout);
            return this.chatSocket;
        }

        // Called when the chat socket is opened.
        onChatSocketOpen(ws, event) {
            this.debug("Chat socket opened.");
            this.sendChatMessages(this.chatMessageQueue);
            this.chatMessageQueue = [];
        }

        // Called when the chat socket receives a message.
        onChatSocketMessage(ws, event) {
            this.debug("Chat socket received data.", event);
        }

        // Called when the chat socket is closed.
        onChatSocketClose(ws, event) {
            this.debug("Chat socket closed.", event);
            this.chatSocketTimeout = setTimeout(() => this.createChatSocket(), 3000);
        }

        // Called when the chat socket errors.
        onChatSocketError(ws, event) {
            this.debug("Chat socket errored.", event);
            ws.close();
            this.chatSocketTimeout = setTimeout(() => this.createChatSocket(), 3000);
        }

        /// Sends messages to the Rust backend, or adds them to the queue.
        sendChatMessages(messages) {
            // Check if the chat socket is open.
            const ws_open = this?.chatSocket?.readyState === WebSocket.OPEN;
            const seed_ready = this.channel !== null;
            if (ws_open && seed_ready) {
                // Send message queue to Rust backend.
                this.chatSocket.send(JSON.stringify({
                    platform: `${this.platform}`,
                    channel: `${this.channel}`,
                    messages: messages,
                    viewers: this.viewers
                }));
            }
            else {
                // Add messages to queue.
                this.warn("Forcing messages to queue. Socket open:", ws_open, "Seed ready:", seed_ready);
                this.chatMessageQueue.push(...messages);
            }
        }

        /// Sends live viewer counts to the Rust backend.
        sendViewerCount(count) {
            this.log("Updating viewer count. Current viewers:", count);
            this.viewers = count;
        }

        receiveSubscriptions(sub) {
            //{
            //    id: xxx,
            //    gifted: true,
            //    buyer: giftData.gifter_username,
            //    count: giftData.gifted_usernames.length,
            //    value: subValue
            //}
            const message = new ChatMessage(
                UUID.v5(sub.id, this.namespace),
                this.platform,
                this.channel
            );
            message.username = sub.username;
            message.amount = sub.value * sub.count;
            message.currency = "USD";

            if (sub.gifted) {
                if (sub.count > 1) {
                    message.message = `${sub.username} subscribed for ${sub.count} months!`;
                }
                else {
                    message.message = `${sub.username} subscribed for 1 month!`;
                }
            }
            else {
                if (sub.count > 1) {
                    message.message = `${sub.username} gifted ${count} subscriptions! 🎁`;
                }
                else {
                    message.message = `${sub.username} gifted a subscription! 🎁`;
                }
            }

            this.sendChatMessages([message]);
        }

        //
        // EventSource
        //
        // Patches the EventSource object to log all messages.
        eventSourcePatch() {
            const self = this;
            const oldEventSource = WINDOW.EventSource;
            const newEventSource = function (url, config) {
                const es = new oldEventSource(url, config);

                es.addEventListener('message', function (event) {
                    self.onEventSourceMessage(es, event);
                });

                return es;
            };
            newEventSource.sneed_patched = true;
            newEventSource.oldEventSource = oldEventSource;
            WINDOW.EventSource = Object.assign(newEventSource, oldEventSource);
            return WINDOW.EventSource;
        }

        // Called when an EventSource receives a message.
        onEventSourceMessage(es, event) {
            this.debug("EventSource received data.", event);
        }

        //
        // Fetch
        //
        fetchPatch() {
            const self = this;
            const oldFetch = WINDOW.fetch;
            const newFetch = function (...args) {
                let [resource, config] = args;
                const response = oldFetch(resource, config);
                response.then((data) => {
                    // Clone and return original response.
                    const newData = data.clone();
                    self.onFetchResponse(newData);
                    return data;
                });
                return response;
            };
            newFetch.sneed_patched = true;
            newFetch.oldFetch = oldFetch;
            WINDOW.fetch = Object.assign(newFetch, oldFetch);
            return WINDOW.fetch;
        }

        // Called when a fetch's promise is fulfilled.
        onFetchResponse(response) {
            this.debug("Fetch received data.", response);
        }

        //
        // WebSocket
        //
        // Patches the WebSocket object to log all inbound and outbound messages.
        webSocketPatch() {
            const self = this;
            const oldWebSocket = WINDOW.WebSocket;
            const newWebSocket = function (url, protocols) {
                const ws = new oldWebSocket(url, protocols);
                const oldWsSend = ws.send;
                ws.send = function (data) {
                    self.onWebSocketSend(ws, data);
                    return oldWsSend.apply(ws, arguments);
                };
                ws.addEventListener('message', (event) => self.onWebSocketMessage(ws, event));
                ws.send.sneed_patched = true;
                return ws;
            };
            newWebSocket.sneed_patched = true;
            newWebSocket.oldWebSocket = oldWebSocket;
            WINDOW.WebSocket = Object.assign(newWebSocket, oldWebSocket);
            return WINDOW.WebSocket;
        }

        // Called when a websocket receives a message.
        onWebSocketMessage(ws, event) {
            this.debug("WebSocket received data.", event);
        }

        // Called when a websocket sends a message.
        onWebSocketSend(ws, data) {
            this.debug("WebSocket sent data.", data);
        }

        //
        // XHR
        //
        // Patches the XHR object to log all inbound and outbound messages.
        xhrPatch() {
            const self = this;

            // XMLHttpRequest.open
            const oldXhrOpen = WINDOW.XMLHttpRequest.prototype.open;
            const newXhrOpen = function (method, url, async, user, password) {
                self.onXhrOpen(this, method, url, async, user, password);
                return oldXhrOpen.apply(this, arguments);
            };
            newXhrOpen.sneed_patched = true;
            WINDOW.XMLHttpRequest.prototype.open = Object.assign(newXhrOpen, oldXhrOpen);

            // XMLHttpRequest.send
            const oldXhrSend = WINDOW.XMLHttpRequest.prototype.send;
            const newXhrSend = function (body) {
                self.onXhrSend(this, body);
                return oldXhrSend.apply(this, arguments);
            };
            newXhrSend.sneed_patched = true;
            WINDOW.XMLHttpRequest.prototype.send = Object.assign(newXhrSend, oldXhrSend);

            console.log("XHR patching");
            return WINDOW.XMLHttpRequest;
        }

        onXhrOpen(xhr, method, url, async, user, password) {
            this.debug("XHR opened.", method, url, async, user, password);
            xhr.addEventListener("readystatechange", (event) => this.onXhrReadyStateChange(xhr, event));
        }

        onXhrReadyStateChange(xhr, event) {
            this.debug("XHR ready state changed.", event);
        }

        onXhrSend(xhr, body) {
            this.debug("XHR sent data.", body);
        }
    }


    //
    // Kick
    //
    // ✔️ Capture new messages.
    // ✔️ Capture sent messages.
    // ✔️ Capture existing messages.
    // ✔️ Capture emotes.
    // ❌ Capture moderator actions.
    // ✔️ Capture view counts.
    //
    class Kick extends Seed {
        channel_id = null;
        livestream_id = null;

        constructor() {
            const namespace = "6efe7271-da75-4c2f-93fc-ddf37d02b8a9";
            const platform = "Kick";
            const channel = window.location.href.split('/').filter(x => x)[2].toLowerCase();
            super(namespace, platform, channel);
            this.fetchChatHistory();
        }

        async fetchChatHistory() {
            // this can probably be offloaded to XHR requests.
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
            // WebSockets and XHR events in Kick only send one message at a time.
            const message = new ChatMessage(json.id, this.platform, this.channel);
            message.sent_at = Date.parse(json.created_at);
            message.username = json.sender.username;
            message.message = json.content;

            // Emotes are supplied as bbcode: [emote:37221:EZ]
            // Image file found at: https://files.kick.com/emotes/37221/fullsize
            // <img data-v-31c262c8="" data-emote-name="EZ" data-emote-id="37221" src="https://files.kick.com/emotes/37221/fullsize" alt="EZ" class="chat-emote">
            for (const match of message.message.matchAll(/\[emote:(\d+):([^\]]+)\]/g)) {
                message.emojis.push([match[0], `https://files.kick.com/emotes/${match[1]}/fullsize`, match[2]]);
            }

            json.sender.identity.badges.forEach((badge) => {
                switch (badge.type) {
                    // Fluff badges.
                    case "vip":
                    case "og":
                    case "founder":
                        break;
                    case "verified":
                        message.is_verified = true;
                        break;
                    case "broadcaster":
                        message.is_owner = true;
                        break;
                    case "moderator":
                        message.is_mod = true;
                        break;
                    case "subscriber":
                    case "sub_gifter":
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
                this.log("WebSocket received data with no event.", data);
            }

            const subValue = 5;

            switch (json.event) {
                //{"event":"App\\Events\\ChatMessageEvent","data":"{â€¦}","channel":"chatrooms.35535.v2"}
                case "App\\Events\\ChatMessageEvent":
                    this.receiveChatMessage(JSON.parse(json.data));
                    break;

                // {"event":"App\\Events\\GiftedSubscriptionsEvent","data":"{\"chatroom_id\":2507974,\"gifted_usernames\":[\"bigboss_23\"],\"gifter_username\":\"court\"}","channel":"chatrooms.2507974.v2"}
                case "App\\Events\\GiftedSubscriptionsEvent":
                    const giftData = JSON.parse(json.data);
                    this.receiveSubscriptions({
                        gifted: true,
                        buyer: giftData.gifter_username,
                        count: giftData.gifted_usernames.length,
                        value: subValue
                    });
                    break;
                // {"event":"App\\Events\\GiftsLeaderboardUpdated","data":"{\"channel\":{\"id\":2515504,\"user_id\":2570626,\"slug\":\"bossmanjack\",\"is_banned\":false,\"playback_url\":\"https:\\/\\/fa723fc1b171.us-west-2.playback.live-video.net\\/api\\/video\\/v1\\/us-west-2.196233775518.channel.oliV5X2XFvWn.m3u8\",\"name_updated_at\":null,\"vod_enabled\":true,\"subscription_enabled\":true,\"can_host\":true,\"chatroom\":{\"id\":2507974,\"chatable_type\":\"App\\\\Models\\\\Channel\",\"channel_id\":2515504,\"created_at\":\"2023-03-31T21:25:27.000000Z\",\"updated_at\":\"2024-02-06T05:35:31.000000Z\",\"chat_mode_old\":\"public\",\"chat_mode\":\"public\",\"slow_mode\":false,\"chatable_id\":2515504,\"followers_mode\":true,\"subscribers_mode\":false,\"emotes_mode\":false,\"message_interval\":6,\"following_min_duration\":180}},\"leaderboard\":[{\"user_id\":21118649,\"username\":\"feepsyy\",\"quantity\":401},{\"user_id\":278737,\"username\":\"SIGNALBOOT\",\"quantity\":392},{\"user_id\":634058,\"username\":\"diddy11\",\"quantity\":266},{\"user_id\":22,\"username\":\"Eddie\",\"quantity\":180},{\"user_id\":17038949,\"username\":\"buttgrabbin\",\"quantity\":166},{\"user_id\":18409771,\"username\":\"RambleGamble\",\"quantity\":145},{\"user_id\":61177,\"username\":\"court\",\"quantity\":142},{\"user_id\":14059354,\"username\":\"Bshirley\",\"quantity\":122},{\"user_id\":2698,\"username\":\"Drake\",\"quantity\":100},{\"user_id\":10399,\"username\":\"TheManRand\",\"quantity\":72}],\"weekly_leaderboard\":[{\"user_id\":26382996,\"username\":\"doubledub2001\",\"quantity\":11},{\"user_id\":26491265,\"username\":\"dr0ptacular\",\"quantity\":11},{\"user_id\":27202375,\"username\":\"DreDre111\",\"quantity\":10},{\"user_id\":36056,\"username\":\"Scuffed\",\"quantity\":7},{\"user_id\":5556104,\"username\":\"SausageGravy\",\"quantity\":6},{\"user_id\":3685974,\"username\":\"Botaccount\",\"quantity\":5},{\"user_id\":27202627,\"username\":\"DopeSoap\",\"quantity\":5},{\"user_id\":4641706,\"username\":\"Sweetsfeature\",\"quantity\":4},{\"user_id\":803074,\"username\":\"livenationwide\",\"quantity\":3},{\"user_id\":14059354,\"username\":\"Bshirley\",\"quantity\":3}],\"monthly_leaderboard\":[{\"user_id\":61177,\"username\":\"court\",\"quantity\":73},{\"user_id\":26491265,\"username\":\"dr0ptacular\",\"quantity\":37},{\"user_id\":23522308,\"username\":\"s7eezyy\",\"quantity\":24},{\"user_id\":26878626,\"username\":\"JuiceWorld420\",\"quantity\":20},{\"user_id\":9759163,\"username\":\"KoopaTroopaZ\",\"quantity\":20},{\"user_id\":26379129,\"username\":\"Bramstammer\",\"quantity\":14},{\"user_id\":26382996,\"username\":\"doubledub2001\",\"quantity\":12},{\"user_id\":5556104,\"username\":\"SausageGravy\",\"quantity\":11},{\"user_id\":17038949,\"username\":\"buttgrabbin\",\"quantity\":10},{\"user_id\":25663663,\"username\":\"Chaissxn\",\"quantity\":10}],\"gifter_id\":61177,\"gifted_quantity\":1}","channel":"channel.2515504"}
                case "App\\Events\\GiftsLeaderboardUpdated":
                    break;
                // {"event":"App\\Events\\LuckyUsersWhoGotGiftSubscriptionsEvent","data":"{\"channel\":{\"id\":2515504,\"user_id\":2570626,\"slug\":\"bossmanjack\",\"is_banned\":false,\"playback_url\":\"https:\\/\\/fa723fc1b171.us-west-2.playback.live-video.net\\/api\\/video\\/v1\\/us-west-2.196233775518.channel.oliV5X2XFvWn.m3u8\",\"name_updated_at\":null,\"vod_enabled\":true,\"subscription_enabled\":true,\"can_host\":true,\"chatroom\":{\"id\":2507974,\"chatable_type\":\"App\\\\Models\\\\Channel\",\"channel_id\":2515504,\"created_at\":\"2023-03-31T21:25:27.000000Z\",\"updated_at\":\"2024-02-06T05:35:31.000000Z\",\"chat_mode_old\":\"public\",\"chat_mode\":\"public\",\"slow_mode\":false,\"chatable_id\":2515504,\"followers_mode\":true,\"subscribers_mode\":false,\"emotes_mode\":false,\"message_interval\":6,\"following_min_duration\":180}},\"usernames\":[\"bigboss_23\"],\"gifter_username\":\"court\"}","channel":"channel.2515504"}
                case "App\\Events\\LuckyUsersWhoGotGiftSubscriptionsEvent":
                    break;

                // {"event":"App\\Events\\SubscriptionEvent","data":"{\"chatroom_id\":2507974,\"username\":\"feepsyy\",\"months\":2}","channel":"chatrooms.2507974.v2"}
                case "App\\Events\\SubscriptionEvent":
                    const subData = JSON.parse(json.data);
                    this.receiveSubscriptions({
                        gifted: false,
                        buyer: giftData.username,
                        count: giftData.months,
                        value: subValue
                    });
                    break;
                // {"event":"App\\Events\\ChannelSubscriptionEvent","data":"{\"user_ids\":[21118649],\"username\":\"feepsyy\",\"channel_id\":2515504}","channel":"channel.2515504"}
                case "App\\Events\\ChannelSubscriptionEvent":
                    break;

                // {"event":"App\\Events\\UserBannedEvent","data":"{\"id\":\"a3aadb10-22ae-4081-ba8f-46bb9a6c89ff\",\"user\":{\"id\":25556531,\"username\":\"JohnsonAndJohnson1\",\"slug\":\"johnsonandjohnson1\"},\"banned_by\":{\"id\":0,\"username\":\"covid1942\",\"slug\":\"covid1942\"}}","channel":"chatrooms.2507974.v2"}
                case "App\\Events\\UserBannedEvent":
                    break;
                // {"event":"App\\Events\\UserUnbannedEvent","data":"{\"id\":\"70e7e789-0b5e-498f-b475-ad6cd148abde\",\"user\":{\"id\":152392,\"username\":\"symbaz\",\"slug\":\"symbaz\"},\"unbanned_by\":{\"id\":9865,\"username\":\"gazdemic\",\"slug\":\"gazdemic\"}}","channel":"chatrooms.2507974.v2"}
                case "App\\Events\\UserUnbannedEvent":
                    break;

                // {"event":"App\\Events\\PinnedMessageCreatedEvent","data":"{\"message\":{\"id\":\"c898642d-5287-44d3-a3f6-bb196319ae96\",\"chatroom_id\":2507974,\"content\":\"0x634Bc72f1729115b743de6aA5dEA3260A5d4D7A9\",\"type\":\"message\",\"created_at\":\"2024-02-06T21:24:31+00:00\",\"sender\":{\"id\":245024,\"username\":\"Kevman95\",\"slug\":\"kevman95\",\"identity\":{\"color\":\"#31D6C2\",\"badges\":[{\"type\":\"subscriber\",\"text\":\"Subscriber\",\"count\":1}]}},\"metadata\":null},\"duration\":\"1200\"}","channel":"chatrooms.2507974.v2"}
                case "App\\Events\\PinnedMessageCreatedEvent":
                    break;
                // {"event":"App\\Events\\PinnedMessageDeletedEvent","data":"[]","channel":"chatrooms.2507974.v2"}
                case "App\\Events\\PinnedMessageDeletedEvent":
                    break;

                // {"event":"App\\Events\\LivestreamUpdated","data":"{\"livestream\":{\"id\":22976949,\"slug\":\"99850629-55-start\",\"channel_id\":2515504,\"created_at\":\"2024-02-06 19:10:40\",\"session_title\":\"$55 start\",\"is_live\":true,\"risk_level_id\":null,\"start_time\":\"2024-02-06 19:10:37\",\"source\":null,\"twitch_channel\":null,\"duration\":0,\"language\":\"English\",\"is_mature\":true,\"viewer_count\":949,\"category\":{\"id\":28,\"category_id\":4,\"name\":\"Slots & Casino\",\"slug\":\"slots\",\"tags\":[\"Gambling\"],\"description\":null,\"deleted_at\":null,\"viewers\":30897,\"banner\":\"https:\\/\\/files.kick.com\\/images\\/subcategories\\/28\\/banner\\/ca01a05f-f807-4fbf-8794-3d547b1bb7a6\",\"category\":{\"id\":4,\"name\":\"Gambling\",\"slug\":\"gambling\",\"icon\":\"\\ud83c\\udfb0\"}},\"categories\":[{\"id\":28,\"category_id\":4,\"name\":\"Slots & Casino\",\"slug\":\"slots\",\"tags\":[\"Gambling\"],\"description\":null,\"deleted_at\":null,\"viewers\":30897,\"banner\":\"https:\\/\\/files.kick.com\\/images\\/subcategories\\/28\\/banner\\/ca01a05f-f807-4fbf-8794-3d547b1bb7a6\",\"category\":{\"id\":4,\"name\":\"Gambling\",\"slug\":\"gambling\",\"icon\":\"\\ud83c\\udfb0\"}}]}}","channel":"private-livestream.22976949"}
                // {"event":"App\\Events\\LiveStream\\UpdatedLiveStreamEvent","data":"{\"id\":22976949,\"slug\":\"99850629-55-start\",\"session_title\":\"$55 start\",\"created_at\":\"2024-02-06T19:10:40.000000Z\",\"language\":\"English\",\"is_mature\":true,\"viewers\":949,\"category\":{\"id\":28,\"name\":\"Slots & Casino\",\"slug\":\"slots\",\"tags\":[\"Gambling\"],\"parent_category\":{\"id\":4,\"slug\":\"gambling\"}}}","channel":"private-livestream-updated.22976949"}
                case "App\\Events\\LivestreamUpdated":
                case "App\\Events\\UpdatedLiveStreamEvent":
                    let viewers = parseInt(json.data.viewers, 10);
                    if (!isNaN(viewers)) {
                        this.sendViewerCount(viewers);
                    }
                    break;
                // {"event":"App\\Events\\FollowersUpdated","data":"{\"followersCount\":20947,\"channel_id\":2515504,\"username\":null,\"created_at\":1707251975,\"followed\":true}","channel":"channel.2515504"}
                case "App\\Events\\FollowersUpdated":
                    break;

                //{"event":"pusher_internal:subscription_succeeded","data":"{}","channel":"chatrooms.14693568.v2"}
                //{"event":"pusher_internal:subscription_succeeded","data":"{}","channel":"private-userfeed.15671413"}
                //{"event":"pusher_internal:subscription_succeeded","data":"{}","channel":"private-App.User.15671413"}
                case "pusher_internal:subscription_succeeded":
                    break;
                case "pusher:connection_established":
                    break;
                case "pusher:pong":
                    break;
                default:
                    this.log("WebSocket received data with unknown event.", json.event);
                    break;
            }
        }

        onWebSocketSend(ws, data) {
            const json = JSON.parse(data);
            if (json.event === undefined) {
                this.log("WebSocket sent data with no event.", data);
            }

            switch (json.event) {
                case "pusher:subscribe":
                    // This will pass auth tokens and event subscriptions.
                    // {"event":"pusher:subscribe","data":{"auth":"","channel":"chatrooms.14693568.v2"}}
                    // {"event":"pusher:subscribe","data":{"auth":"","channel":"channel.14899489"}
                    // {"event":"pusher:subscribe","data":{"auth":"xxx:xxx","channel":"private-userfeed.15671413"}}
                    // {"event":"pusher:subscribe","data":{"auth":"xxx:xxx","channel":"private-App.User.15671413"}}
                    break;
                case "pusher:ping":
                    break;
                default:
                    this.log("WebSocket sent data with unknown event.", data);
                    break;
            }
        }

        // Called when a fetch's promise is fulfilled.
        async onFetchResponse(response) {
            if (response.url.indexOf("/current-viewers") >= 0) {
                await response.json().then((json) => {
                    for (const channel of json) {
                        //if (channel.livestream_id === this.channel_id) {
                        this.sendViewerCount(channel.viewers);
                        //}
                        //else {
                        //    this.log("Channel ID mismatch.", channel.livestream_id, this.channel_id);
                        //}
                    }
                });
            }
        }

        onXhrOpen(xhr, method, url, async, user, password) {
            if (url.startsWith("https://kick.com/api/v2/messages/send/")) {
                xhr.addEventListener("readystatechange", (event) => this.onXhrSendMessageReadyStateChange(xhr, event));
            }
            else if (url.startsWith("https://kick.com/api/v1/channels/")) {
                xhr.addEventListener("readystatechange", (event) => this.onXhrChannelReadyStateChange(xhr, event));
            }
            else if (url.startsWith("https://kick.com/current-viewers")) {
                xhr.addEventListener("readystatechange", (event) => this.onXhrViewersReadyStateChange(xhr, event));
            }
            else if (url.match(/https:\/\/kick\.com\/api\/v2\/channels\/.+\/livestream/) !== null) {
                xhr.addEventListener("readystatechange", (event) => this.onXhrLivestreamReadyStateChange(xhr, event));
            }
        }

        /// Initial channel information.
        onXhrChannelReadyStateChange(xhr, event) {
            if (xhr.readyState !== XMLHttpRequest.DONE) {
                return;
            }

            const json = JSON.parse(xhr.responseText);
            // This response has a ton of data.
            // Notable: id, livestream:{is_live,viewers},verified:{id,channel_id}
            const viewers = parseInt(json.livestream?.viewers, 10);
            if (!isNaN(viewers)) {
                this.sendViewerCount(viewers);
            }
        }

        // New livestream state
        onXhrLivestreamReadyStateChange(xhr, event) {
            if (xhr.readyState !== XMLHttpRequest.DONE) {
                return;
            }

            //{"data":{"id":23050089,"slug":"24043393-3000-subs-3000-giveaway","session_title":"3000 Subs = $3,000 Giveaway","created_at":"2024-02-08T02:07:41.000000Z","language":"English","is_mature":true,"viewers":0,"category":{"id":28,"name":"Slots & Casino","slug":"slots","tags":["Gambling"],"parent_category":{"id":4,"slug":"gambling"}},"playback_url":"https:\/\/fa723fc1b171.us-west-2.playback.live-video.net\/api\/video\/v1\/us-west-2.196233775518.channel.oliV5X2XFvWn.m3u8?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzM4NCJ9.eyJhd3M6Y2hhbm5lbC1hcm4iOiJhcm46YXdzOml2czp1cy13ZXN0LTI6MTk2MjMzNzc1NTE4OmNoYW5uZWwvb2xpVjVYMlhGdlduIiwiYXdzOmFjY2Vzcy1jb250cm9sLWFsbG93LW9yaWdpbiI6Imh0dHBzOi8va2ljay5jb20saHR0cHM6Ly9wbGF5ZXIua2ljay5jb20saHR0cHM6Ly9hZG1pbi5raWNrLmNvbSxodHRwczovL3d3dy5nc3RhdGljLmNvbSIsImF3czpzdHJpY3Qtb3JpZ2luLWVuZm9yY2VtZW50IjpmYWxzZSwiZXhwIjoxNzA3MzYxNjYyfQ.6OGQEGhnL--MKRHFkm72_ehVSuS5SM_ZpGdfAm-qZAS2R0nfh4pRoB399lSmahRd0FZVQd4_V05S4RwTPiGmcxAe82sL3KIQ9ZzoVYaS75Xu-swKEJrX-uFeoBmts2h_","thumbnail":{"src":"https:\/\/images.kick.com\/video_thumbnails\/oliV5X2XFvWn\/afEJHdmeKhoj\/720.webp","srcset":"https:\/\/images.kick.com\/video_thumbnails\/oliV5X2XFvWn\/afEJHdmeKhoj\/1080.webp 1920w, https:\/\/images.kick.com\/video_thumbnails\/oliV5X2XFvWn\/afEJHdmeKhoj\/720.webp 1280w, https:\/\/images.kick.com\/video_thumbnails\/oliV5X2XFvWn\/afEJHdmeKhoj\/360.webp 480w, https:\/\/images.kick.com\/video_thumbnails\/oliV5X2XFvWn\/afEJHdmeKhoj\/160.webp 284w, https:\/\/images.kick.com\/video_thumbnails\/oliV5X2XFvWn\/afEJHdmeKhoj\/480.webp 640w"}}}

            const json = JSON.parse(xhr.responseText);
            if (json.data?.id !== undefined) {
                this.livestream_id = json.data.id;
            }
        }

        /// After sending message, receive JSON for new message.
        onXhrSendMessageReadyStateChange(xhr, event) {
            if (xhr.readyState !== XMLHttpRequest.DONE) {
                return;
            }

            const json = JSON.parse(xhr.responseText);
            if (json.status === undefined || json.data === undefined) {
                this.log("XHR sent message with no status or data.", json);
                return;
            }

            if (json.status.code === 200 && json.data.id !== undefined) {
                this.log("XHR sent message is ready.", json);
                this.receiveChatMessage(json.data);
            }
        }

        /// After fetching viewer count.
        onXhrViewersReadyStateChange(xhr, event) {
            if (xhr.readyState !== XMLHttpRequest.DONE) {
                return;
            }
            if (this.channel_id === null) {
                this.warn("XHR received viewers with no channel ID.");
                return;
            }

            const json = JSON.parse(xhr.responseText);
            for (const channel of json) {
                if (channel.livestream_id === this.livestream_id) {
                    this.sendViewerCount(channel.viewers);
                    return;
                }
                else {
                    this.log("XHR received viewers for unknown livestream.", channel);
                }
            }
        }
    }


    //
    // Odysee
    //
    // ✔️ Capture new messages.
    // ✔️ Capture sent messages.
    // ✔️ Capture existing messages.
    // ❌ Capture emotes.
    // ❌ Capture moderator actions.
    // ✔️ Capture view counts.
    // ❌ Odysee: Stickers, images.
    // 
    class Odysee extends Seed {
        emojis = [];

        constructor() {
            const namespace = "d80f03bf-d30a-48e9-9e9f-81616366eefd";
            const platform = "Odysee";
            const channel = window.location.href.split('/').filter(x => x).at(-2);;
            super(namespace, platform, channel);
        }

        // Identify all emojis.
        onDocumentReady(event) {
            this.debug("Document ready.");
            // <button title=":confused_2:" aria-label=":confused_2:" class="button button--alt button--file-action" type="button">
            //   <span class="button__content">
            //     <img src="https://static.odycdn.com/emoticons/48%20px/confused%402x.png" loading="lazy">
            //   </span>
            // </button>
            for (const button of document.querySelectorAll(".button.button--alt.button--file-action")) {
                const emoji = button.title;
                const url = button.querySelector("img")?.src;
                if (emoji !== undefined && url !== undefined) {
                    this.emojis[emoji] = url;
                }
                else {
                    this.warn("Unknown emoji button.", button);
                }
            }

            this.debug("Emojis found.", this.emojis.length);
        }

        receiveChatMessages(json) {
            return this.prepareChatMessages(json).then((data) => {
                this.sendChatMessages(data);
            });
        }

        prepareChatMessages(json) {
            return Promise.all(json.map(async (item) => {
                const message = new ChatMessage(
                    UUID.v5(item.comment_id, this.namespace),
                    this.platform,
                    this.channel
                );
                message.avatar = "https://thumbnails.odycdn.com/optimize/s:160:160/quality:85/plain/https://spee.ch/spaceman-png:2.png";
                message.username = item.channel_name;
                message.message = item.comment;
                message.sent_at = ((item.timestamp - 1) * 1000); // Odysee timestamps to round up, which causes messages to appear out of order.

                if (item.is_fiat === true) {
                    message.amount = item.support_amount;
                    message.currency = "USD";
                }

                message.is_owner = item.is_creator ?? false;

                return message;
            }));
        }

        /// Accepts chat histories and outbound messages.
        async onFetchResponse(response) {
            const url = new URL(response.url);
            switch (url.searchParams.get('m')) {
                case "comment.List":
                case "comment.SuperChatList":
                    await response.json().then(async (data) => {
                        if (data.result !== undefined && data.result.items !== undefined) {
                            this.receiveChatMessages(data.result.items);
                        }
                    });
                    break;
                case "comment.Create":
                    await response.json().then(async (data) => {
                        if (data.result !== undefined && data.result.comment_id !== undefined) {
                            this.receiveChatMessages([data.result]);
                        }
                        return data;
                    });
                    break;
                default:
                    break;
            }
        }

        // Called when a websocket receives a message.
        onWebSocketMessage(ws, event) {
            const json = JSON.parse(event.data);
            switch (json.type) {
                case "delta":
                    this.receiveChatMessages([json.data.comment]);
                    break;
                case "removed":
                    //{"type":"removed","data":{"comment":{"channel_id":"6956205bc194579e1a7c134e62355b80bf175843","channel_name":"@TheRedBaron","channel_url":"lbry://@TheRedBaron#6956205bc194579e1a7c134e62355b80bf175843","claim_id":"d826937ad9bf3b7991eada5034c4612389583bc1","comment":"@mati:c Yo, Cool stream the other night btw","comment_id":"be44038f7905fb006c25beecb89818f54064d476234c7f637241eab40c48526f","currency":"","is_fiat":false,"is_hidden":false,"is_pinned":false,"is_protected":false,"signature":"6e839ae4378de454de96d597332ff05ad09133348bbd1e77d7b055c184ba34bd609976e18968fa537a49078eeb8bef3a9243211ba9ca5ed345603687945ab891","signing_ts":"1703974695","support_amount":0,"timestamp":1703974696}}}
                    break;
                case "viewers":
                    this.sendViewerCount(json.data.connected);
                    break;
                default:
                    this.log(`Unknown update type.`, json);
                    break;
            }
        }
    }


    //
    // Rumble
    //
    // ✔️ Capture new messages.
    // ✔️ Capture sent messages.
    // ✔️ Capture existing messages.
    // ✔️ Capture emotes.
    // ❌ Capture moderator actions.
    // ✔️ Capture view counts.
    //
    class Rumble extends Seed {
        // Rumble emotes must be sideloaded from another request.
        emotes = [];

        constructor() {
            const namespace = "5ceefcfb-4aa5-443a-bea6-1f8590231471";
            const platform = "Rumble";
            const channel = null; // Cannot be determined before DOM is ready.
            super(namespace, platform, channel);
        }

        /// Fetches the channel ID from the DOM.
        onDocumentReady() {
            // Pop-out chat contains the channel ID in the URL.
            if (window.location.href.indexOf('/chat/popup/') >= 0) {
                this.channel = parseInt(window.location.href.split('/').filter(x => x)[4], 10);
            }
            // Otherwise, we need to find the channel ID in the DOM.
            else {
                // Yes, the only place in the DOM the channel ID exists is the upvote button.
                this.channel = parseInt(document.querySelector('.rumbles-vote-pill').dataset.id, 10);
            }

            if (this.channel !== null) {
                this.fetchEmotes();
            }

        }

        fetchEmotes() {
            const init = document.querySelector('body > script:not([src])');
            const code = init.textContent;

            // yes, really.
            const regex = /{items:(\[[^\(\)]*\]}\])}\);/;
            const match = code.match(regex);
            if (match) {
                // yes. really.
                const itemsObj = eval(`"use strict";(${match[1]})`);
                itemsObj.forEach((channel) => {
                    if (channel.emotes !== undefined && channel.emotes.length > 0) {
                        channel.emotes.forEach((emote) => {
                            // emotes_pack_id: 1881816
                            // file: "https://ak2.rmbl.ws/z12/F/3/4/s/F34si.aaa.png"
                            // id: 139169247
                            // is_subs_only: false
                            // moderation_status: "NOT_MODERATED"
                            // name: "r+rumblecandy"
                            // pack_id: 1881816
                            // position: 0
                            this.emotes[emote.name] = emote.file;
                        });
                    }
                });
            }
        }

        receiveChatPairs(messages, users) {
            this.prepareSubscriptions(messages, users).then((data) => {
                data.forEach((datum) => {
                    this.receiveSubscriptions(datum);
                });
            });

            this.prepareChatMessages(messages, users).then((data) => {
                this.sendChatMessages(data);
            });
        }

        prepareChatMessages(messages, users) {
            return Promise.all(messages
                .filter(async (messageData) => {
                    messageData.text.trim() !== "";
                })
                .map(async (messageData, index) => {
                    const message = new ChatMessage(
                        UUID.v5(messageData.id, this.namespace),
                        this.platform,
                        this.channel
                    );

                    const user = users.find((user) => user.id === messageData.user_id);
                    if (user === undefined) {
                        this.log("User not found:", messageData.user_id);
                        return;
                    }

                    message.sent_at = Date.parse(messageData.time);
                    message.message = messageData.text;
                    // replace :r+rumbleemoji: with <img> tags
                    for (const match of message.message.matchAll(/\:([a-zA-Z0-9_\.\+\-]+)\:/g)) {
                        const id = match[1];
                        // {"request_id":"dT+js0Ay7a7e2ZeUi1GyzB7MoWCmLBp/e7jHzPKXXUs","type":"messages","data":{"messages":[{"id":"1346698824721596624","time":"2023-12-30T21:00:58+00:00","user_id":"88707682","text":":r+smh:","blocks":[{"type":"text.1","data":{"text":":r+smh:"}}]}],"users":[{"id":"88707682","username":"madattheinternet","link":"/user/madattheinternet","is_follower":false,"image.1":"https://ak2.rmbl.ws/z0/I/j/z/s/Ijzsf.asF-1gtbaa-rpmd6x.jpeg","color":"#f54fd1","badges":["premium","whale-gray"]}],"channels":[[]]}}
                        if (this.emotes[id] !== undefined) {
                            message.emojis.push([match[0], this.emotes[id], `:${id}:`]);
                        }
                        else {
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
                                case "admin":
                                    message.is_owner = true;
                                    break;
                                case "moderator":
                                    message.is_mod = true;
                                    break;
                                case "whale-gray":
                                case "whale-blue":
                                case "whale-yellow":
                                case "locals":
                                case "locals_supporter":
                                case "recurring_subscription":
                                    message.is_sub = true;
                                    break;
                                case "premium":
                                    break;
                                case "verified":
                                    message.is_verified = true;
                                    break;
                                default:
                                    this.log(`Unknown badge type: ${badge.type} `);
                                    break;
                            }
                        });
                    }

                    if (messageData.rant !== undefined) {
                        message.amount = messageData.rant.price_cents / 100;
                        message.currency = "USD";
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
                        this.log("User not found:", messageData.user_id);
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

        // Called when an EventSource receives a message.
        onEventSourceMessage(es, event) {
            try {
                const json = JSON.parse(event.data);
                switch (json.type) {
                    case "init":
                    case "messages":
                        this.receiveChatPairs(json.data.messages, json.data.users);
                        // Messages sent to Rumble are also received as a message in the EventStream.
                        break;
                    default:
                        this.debug("EventSource received data with unknown type.", json);
                        break;
                }
            }
            catch (e) {
                this.log("EventSource received data with invalid JSON.", e, event.data);
            }
        }

        async onFetchResponse(response) {
            const url = new URL(response.url);
            if (url.searchParams.get('name') == "emote.list") {
                await response.json().then((json) => {
                    json.data.items.forEach((channel) => {
                        if (channel.emotes !== undefined && channel.emotes.length > 0) {
                            channel.emotes.forEach((emote) => {
                                // emotes_pack_id: 1881816
                                // file: "https://ak2.rmbl.ws/z12/F/3/4/s/F34si.aaa.png"
                                // id: 139169247
                                // is_subs_only: false
                                // moderation_status: "NOT_MODERATED"
                                // name: "r+rumblecandy"
                                // pack_id: 1881816
                                // position: 0
                                this.emotes[emote.name] = emote.file;
                            });
                        }
                    });
                });
            }
        }

        onXhrOpen(xhr, method, url, async, user, password) {
            if (url.startsWith("https://wn0.rumble.com/service.php")) {
                xhr.addEventListener("readystatechange", (event) => this.onXhrServiceReadyStateChange(xhr, event));
            }
        }

        onXhrServiceReadyStateChange(xhr, event) {
            if (xhr.readyState !== XMLHttpRequest.DONE) {
                return;
            }

            // This one request returns a lot of different kinds of data. This is the one we want.
            // {
            //     "data": {
            //         "video_id": 226626835,
            //         "num_watching_now": 6920,
            //         "viewer_count": 6920,
            //         "livestream_status": 2,
            //         "scheduled_on_ts": null
            //     }
            // }
            if (xhr.responseType === "json") {
                const json = xhr.response;
                const viewers = parseInt(json?.data?.viewer_count || json?.data?.num_watching_now, 10);
                if (!isNaN(viewers)) {
                    this.sendViewerCount(viewers);
                }
            }
        }
    }

    //
    // Twitch
    //
    class Twitch extends Seed {

        constructor() {
            const namespace = "4a342b79-e302-403a-99be-669b5f27b152";
            const platform = "Twitch";
            const is_popout = window.location.href.indexOf('/popout/') >= 0;
            const channel = window.location.href.split('/').filter(x => x).at(is_popout ? 3 : 2);

            if (channel === "p") {
                this.log("Within Twitch static /p/ directory: terminating.");
                return null;
            }
            else {
                return super(namespace, platform, channel);
            }
        }

        // Twitch messages are encoded in a strange way because it is a WebSocket to IRC bridge.
        // It is split into 3 parts by : and the first segment is delineated by ;
        // @
        //   badge-info=;
        //   badges=rplace-2023/1;
        //   color=#FF0000;
        //   display-name=dragogamer48;
        //   emotes=;
        //   first-msg=0;
        //   flags=;
        //   id=b7ce49cb-7b3d-485e-8e54-233b77ac8d91;
        //   mod=0;
        //   returning-chatter=0;
        //   room-id=90075649;
        //   subscriber=0;
        //   tmi-sent-ts=1704653293738;
        //   turbo=0;
        //   user-id=709862804;
        //   user-type=
        // :dragogamer48!dragogamer48@dragogamer48.tmi.twitch.tv PRIVMSG #illojuan
        // :KEK

        // https://dev.twitch.tv/docs/irc/tags/
        parseIrcMessageToJson(message) {
            // const test = {
            //     channel: "#ourchickenlife",
            //     command: "PRIVMSG",
            //     author: "Username",
            //     message: "Hello, world.",
            //     meta: { key: "value" }
            // };

            const json = {};
            const parts = message.split(" :");

            if (parts[0][0] === '@') {
                json.meta = {};
                const pairs = message.split(";");
                pairs.forEach((pair) => {
                    const [key, value] = part.split("=");
                    json.meta[key.trim()] = value.trim();
                });
            }

            return json;
        }


        // Called when a websocket receives a message.
        onWebSocketMessage(ws, event) {
            this.parseWebSocketMessage(data);
        }

        // Called when a websocket sends a message.
        onWebSocketSend(ws, message) {
            // @client-nonce=alphanumericstring PRIVMSG #ourchickenlife :chickem

            this.parseWebSocketMessage(data);
        }
        // Room Joins
        // @badge-info=;badges=bits/100;color=#BE2E34;display-name=MadAtTheInternet;emote-sets=0,19194,1512303,300374282,1374614720,dff88e48-2d6b-4dbe-8b21-61b577987772;mod=0;subscriber=0;user-type= :tmi.twitch.tv USERSTATE #ourchickenlife @emote-only=0;followers-only=0;r9k=0;room-id=269099597;slow=0;subs-only=0 :tmi.twitch.tv ROOMSTATE #ourchickenlife	
        // Oubound message

    }

    //
    // YouTube
    //
    // ✔️ Capture new messages.{"event":"App\\Events\\UserBannedEvent","data":"{\"id\":\"0c50401f-adb4-4acf-929a-b04176900b99\",\"user\":{\"id\":27215345,\"username\":\"GoonAllday420\",\"slug\":\"goonallday420\"},\"banned_by\":{\"id\":0,\"username\":\"dispensary\",\"slug\":\"dispensary\"}}","channel":"chatrooms.2507974.v2"}
    // ✔️ Capture emotes.
    // ❌ Capture moderator actions.
    // ❌ Capture view counts.
    //
    class YouTube extends Seed {
        constructor() {
            const namespace = "fd60ac36-d6b5-49dc-aee6-b0d87d130582";
            const platform = "YouTube";
            const channel = null; // Cannot be determined before DOM is ready.
            super(namespace, platform, channel);
        }

        prepareChatMessages(actions) {
            return Promise.all(actions.map(async (action) => {
                const message = new ChatMessage(
                    UUID.v5(action.item.liveChatTextMessageRenderer.id, this.namespace),
                    this.platform,
                    this.channel
                );
                message.username = action.item.liveChatTextMessageRenderer.authorName.simpleText;
                message.avatar = action.item.liveChatTextMessageRenderer.authorPhoto.thumbnails.at(-1).url;
                message.sent_at = parseInt(action.item.liveChatTextMessageRenderer.timestampUsec / 1000);

                action.item.liveChatTextMessageRenderer.message.runs.forEach((run) => {
                    if (run.text !== undefined) {
                        message.message += run.text;
                    }
                    else if (run.emoji !== undefined) {
                        message.message += `<img class="emoji" data-emote="${run.emoji.emojiId}" src="${run.emoji.image.thumbnails.at(-1).url}" alt="${run.emoji.emojiId}" /> `;
                    }
                    else {
                        this.log("[SNEED::YouTube] Unknown run.", run);
                    }
                });

                return message;
            }));
        }

        receiveChatMessages(json) {
            return this.prepareChatMessages(json).then((data) => {
                this.sendChatMessages(data);
            });
        }

        async onDocumentReady(event) {
            this.log("Document ready, preparing to load channel information.");
            const yt = WINDOW.ytInitialData;
            let video_id = new URL(window.location.href).searchParams.get("v");
            if (video_id === null) {
                if (yt.continuationContents !== undefined && yt.continuationContents.liveChatContinuation !== undefined) {
                    video_id = yt.continuationContents.liveChatContinuation.continuations[0].invalidationContinuationData.invalidationId.topic.split("~")[1];
                }
                else if (yt.contents.liveChatRenderer !== undefined) {
                    video_id = yt.contents.liveChatRenderer.continuations[0].invalidationContinuationData.invalidationId.topic.split("~")[1];
                }
                else {
                    this.log("Cannot identify video ID.", JSON.parse(JSON.stringify(contents)));
                }
            }
            this.log("Video ID:", video_id);

            const author_url = await fetch(`https://www.youtube.com/oembed?url=http%3A//youtube.com/watch%3Fv%3D${video_id}&format=json`)
                .then(response => response.json())
                .then(json => json.author_url);
            this.log("Author URL:", author_url);
            this.channel = await fetch(author_url)
                .then(response => response.text())
                .then(text => {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(text, "text/html");
                    return doc.querySelector('meta[itemprop="identifier"]').content;
                });
            this.log("Received channel info.", video_id, author_url, this.channel);
        }

        // Called when a fetch's promise is fulfilled.
        async onFetchResponse(response) {
            if (response.url.indexOf("/get_live_chat") >= 0) {
                await response.json().then((json) => {
                    if (
                        json.continuationContents !== undefined &&
                        json.continuationContents.liveChatContinuation !== undefined &&
                        json.continuationContents.liveChatContinuation.actions !== undefined
                    ) {
                        json.continuationContents.liveChatContinuation.actions.forEach((action) => {
                            if (action.addChatItemAction !== undefined) {
                                this.receiveChatMessages([action.addChatItemAction]);
                            }
                            else {
                                this.log("Unknown action.", action);
                            }
                        });
                    }
                });
            }
        }
    }

    //
    // VK
    //
    // ❌ Capture new messages.
    // ✔️ Capture sent messages.
    // ❌ Capture existing messages.
    // ❌ Capture emotes.
    // ❌ Capture moderator actions.
    // ❌ Capture view counts.
    //
    class VK extends Seed {
        constructor() {
            const namespace = "a59f077b-d072-41c0-976e-22c7e4ebf6f8";
            const platform = "VK";
            const channel = window.location.href.split('/').filter(x => x).at(-1); // Broadcast ID, not channel name.
            super(namespace, platform, channel);
        }

        prepareChatMessages(json) {
            var messages = [];

            json.forEach((pair) => {
                const message = new ChatMessage(UUID.v5(pair.body.uuid, this.namespace), this.platform, this.channel);

                message.username = pair.sender.username;
                message.message = pair.body.body;
                message.sent_at = pair.body.timestamp;
                // TODO: Sender avatars not present.
                message.avatar = pair.sender.profile_image_url ?? "https://abs.twimg.com/sticky/default_profile_images/default_profile_400x400.png";
                message.is_verified = pair.sender.verified ?? false;

                messages.push(message);
            });

            return messages;
        }

        // {
        //     "payload": [
        //         0,
        //         [
        //             "<div class=\"mv_chat_message \" id=\"mv_chat_msg-25924859_9887\" data-msg-id=\"9887\">\n  <a class=\"mv_chat_message_author_thumb\" href=\"\/madattheinternet\" target=\"_blank\">\n    <img loading=\"lazy\" class=\"mv_chat_message_author_thumb_img\" src=\"https:\/\/sun6-23.userapi.com\/s\/v1\/if2\/pl-0Ti7w_2Q1yTTYwYaLTmVnUq0rCCizszrHJpzskeIg75nSirIKf24MvTWx6QzK47iXlWaVRdkpaeLhee76wIrr.jpg?size=50x50&quality=96&crop=8,0,248,248&ava=1\"\/>\n  <\/a>\n  <div class=\"mv_chat_message_content\">\n    <a class=\"mv_chat_message_author_name\" href=\"\/madattheinternet\" target=\"_blank\"><div class=\"mv_chat_message_author_name_text\">Dzhoshua Mun<\/div><\/a>\n    <div class=\"mv_chat_message_text\">test<\/div>\n  <\/div>\n  <div class=\"mv_chat_message_actions\"><a class=\"mv_chat_message_action\"\n  onclick=\"VideoChat.deleteMessage('-25924859_9887', '1704819918_b9150b027078ca02bb')\"\n  aria-label=\"Delete\"\n  onmouseover=\"showTooltip(this, {text:  'Delete', black: 1, shift: [0, 8, 0], center: 1})\"\n  >\n  <svg fill=\"none\" height=\"20\" viewBox=\"0 0 20 20\" width=\"20\" xmlns=\"http:\/\/www.w3.org\/2000\/svg\"><path clip-rule=\"evenodd\" d=\"M4.72 4.72c.3-.3.77-.3 1.06 0L10 8.94l4.22-4.22a.75.75 0 1 1 1.06 1.06L11.06 10l4.22 4.22a.75.75 0 1 1-1.06 1.06L10 11.06l-4.22 4.22a.75.75 0 0 1-1.06-1.06L8.94 10 4.72 5.78a.75.75 0 0 1 0-1.06z\" fill=\"currentColor\" fill-rule=\"evenodd\"\/><\/svg>\n<\/a><\/div>\n<\/div>",
        //             9887,
        //             []
        //         ]
        //     ],
        //     "statsMeta": {
        //         "platform": "web2",
        //         "st": false,
        //         "time": 1704819918,
        //         "hash": "qs0awBYZDkNrIqEqLNKNoEq0qTowlBb308vx3kqZoRo",
        //         "reloadVersion": 13
        //     },
        //     "loaderVersion": "20829863990",
        //     "langPack": 3,
        //     "langVersion": "7201"
        // }

        onXhrReadyStateChange(xhr, event) {
            if (xhr.readyState === XMLHttpRequest.DONE) {
                if (xhr.response.url.indexOf("act=post_comment") > 0) {

                }
            }
        }
    }

    //
    // 𝕏
    //
    // ✔️ Capture new messages.
    // ✔️ Capture sent messages.
    // ⭕ Capture existing messages.
    // ⭕ Capture emotes.
    // ⭕ Capture moderator actions.
    // ✔️ Capture view counts.
    //
    // Protip: Use this query to find Livestreams.
    // https://twitter.com/search?f=live&q=twitter.com%2Fi%2Fbroadcasts%20filter%3Alinks%20-filter%3Areplies&src=typed_query
    //
    class X extends Seed {
        constructor() {
            const namespace = "0abb36b8-43ab-40b5-be61-4f2c32a75890";
            const platform = "X";
            const channel = window.location.href.split('/').filter(x => x).at(-1); // Broadcast ID, not channel name.
            super(namespace, platform, channel);
        }

        async fetchDependencies() {
            // X provides UUIDs for messages, and its CSP blocks the import.
        }

        prepareChatMessages(pairs) {
            return Promise.all(pairs.map(async (pair) => {
                const message = new ChatMessage(pair.body.uuid, this.platform, this.channel);

                message.username = pair.sender.username;
                message.message = pair.body.body;
                // There is a very strange issue with X where messages are sometimes received with dates in the future.
                // In these instances, we will want to instead use the current date.
                if (pair.body.timestamp <= new Date) {
                    message.sent_at = pair.body.timestamp;
                    console.warn("Received message with future timestamp:", pair.body.timestamp);
                }
                else {
                    message.sent_at = (new Date) / 1;
                }
                // TODO: Sender avatars not present.
                message.avatar = pair.sender.profile_image_url ?? "https://abs.twimg.com/sticky/default_profile_images/default_profile_400x400.png";
                message.is_verified = pair.sender.verified ?? false;

                return message;
            }));
        }

        parseWebSocketMessage(data) {
            switch (data.kind) {
                // chat messages and random junk
                case 1:
                    const payload = JSON.parse(data.payload);
                    if (payload.sender !== undefined && payload.body !== undefined) {
                        const body = JSON.parse(payload.body);
                        // Filter updates that do not include text.
                        if (body.body !== undefined) {
                            return this.prepareChatMessages([{
                                sender: payload.sender,
                                body: body
                            }]).then((data) => {
                                this.sendChatMessages(data);
                            });
                        }
                    }

                    this.debug("Unknown message type:", data);
                    break;
                // ???
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
                default:
                    break;
            }
        }

        // Called when a websocket receives a message.
        onWebSocketMessage(ws, event) {
            const data = JSON.parse(event.data);
            this.parseWebSocketMessage(data);
        }

        // Called when a websocket sends a message.
        onWebSocketSend(ws, message) {
            const data = JSON.parse(message);
            this.parseWebSocketMessage(data);
        }
    }

    //
    // XMR
    //
    // ✔️ Capture new messages.
    // ➖ Capture sent messages.
    // ⭕ Capture existing messages.
    // ➖ Capture emotes.
    // ➖ Capture moderator actions.
    // ➖ Capture view counts.
    //
    // Protip: Use this query to find Livestreams.
    // https://twitter.com/search?f=live&q=twitter.com%2Fi%2Fbroadcasts%20filter%3Alinks%20-filter%3Areplies&src=typed_query
    //
    class XMRChat extends Seed {
        messagesRead = [];
        xmrPrice = 200;

        constructor() {
            const namespace = "806b15e6-d8fe-4344-b66d-9604b5d60241";
            const platform = "XMRChat";
            const channel = "xmrchat";//window.location.href.split('/').filter(x => x).at(4);

            // TODO: Push this to the backend.
            fetch('https://nest.xmrchat.com/prices/xmr')
                .then(response => response.text())
                .then(text => {
                    this.xmrPrice = parseFloat(text);
                    this.log("Fetched XMR price:", this.xmrPrice);
                })
                .catch(error => {
                    this.warn("Failed to fetch XMR price.", error);
                });

            super(namespace, platform, channel);
        }

        //{
        //    "id": 2843,
        //    "name": "Josh",
        //    "message": "Test",
        //    "private": false,
        //    "createdAt": "2025-01-09T17:38:30.094Z",
        //    "expiresAt": null,
        //    "payment": {
        //      "id": 2911,
        //      "pageSlug": null,
        //      "amount": "10267470000",
        //      "paidAmount": "10267470000",
        //      "createdAt": "2025-01-09T17:38:30.097Z",
        //      "paidAt": "2025-01-09T17:39:12.480Z"
        //    },
        //    "swap": null
        //}

        prepareChatMessage(tip) {
            WINDOW.console.log(tip);
            const message = new ChatMessage(
                UUID.v5(`XMRCHAT-${tip.id}`, this.namespace),
                this.platform,
                this.channel
            );
            message.username = tip.name;
            message.message = tip.message;
            message.sent_at = Math.floor((new Date(tip.createdAt)).getTime() / 1000);
            message.amount = this.xmrPrice * (parseFloat(tip.payment.amount) / 1e12);
            message.currency = "USD";


            return message;
        }

        onXhrReadyStateChange(xhr, event) {
            if (xhr.readyState === XMLHttpRequest.DONE) {
                if (xhr.responseURL.indexOf("/tips/page/") > 0) {
                    const json = JSON.parse(xhr.response);
                    json.forEach((tip) => {
                        // Deduplicate
                        if (this.messagesRead.indexOf(tip.id) > -1) {
                            return;
                        }
                        this.messagesRead.push(tip.id);

                        // Last week only
                        // TODO: Make this check flexible?
                        const createdAt = new Date(tip.createdAt);
                        const sixDaysAgo = new Date();
                        sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);

                        if (createdAt < sixDaysAgo) {
                            this.warn("Skipping message older than 6 days.");
                            return;
                        }

                        // XMRChat allows private messages to be sent, which should not appear on HUD.
                        // TODO: Show private messages on Dashboard still? Would need backend end.
                        if (tip.private === true) {
                            this.warn("Skipping private message.");
                        }

                        // Submit
                        const message = this.prepareChatMessage(tip);
                        this.sendChatMessages([message]);
                    });
                }
            }
        }
    }

    //
    // Seed Selection
    //
    switch (window.location.hostname) {
        case 'kick.com':
            WINDOW.SNEEDER = new Kick;
            break;
        case 'odysee.com':
            WINDOW.SNEEDER = new Odysee;
            break;
        case 'rumble.com':
            WINDOW.SNEEDER = new Rumble;
            break;
        case 'twitch':
            WINDOW.SNEEDER = new Twitch;
        case "vk.com":
            WINDOW.SNEEDER = new VK;
            break;
        case 'www.youtube.com':
        case 'youtube.com':
            WINDOW.SNEEDER = new YouTube;
            break;
        case "twitter.com":
        case "x.com":
            WINDOW.SNEEDER = new X;
            break;
        case "xmrchat.com":
            WINDOW.SNEEDER = new XMRChat;
            break;
        default:
            WINDOW.SNEEDER = null;
            console.log(`[SNEED] No platform detected for ${window.location.hostname}.`);
            break;
    }
})();
