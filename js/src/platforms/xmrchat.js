/**
 * CHUCK - Chat Harvesting Universal Connection Kit
 * XMRChat platform scraper
 *
 * Features:
 * - Capture new messages (tips)
 * - Convert XMR amounts to USD
 */

import { Seed, ChatMessage, uuidv5, EventStatus } from '../core/index.js';

export class XMRChat extends Seed {
    static hostname = 'xmrchat.com';
    static namespace = '806b15e6-d8fe-4344-b66d-9604b5d60241';

    messagesRead = [];
    xmrPrice = 200;

    constructor() {
        const channel = 'xmrchat';

        // Fetch current XMR price
        fetch('https://nest.xmrchat.com/prices/xmr')
            .then(response => response.text())
            .then(text => {
                this.xmrPrice = parseFloat(text);
                this.log('Fetched XMR price:', this.xmrPrice);
            })
            .catch(error => {
                this.warn('Failed to fetch XMR price.', error);
            });

        super(XMRChat.namespace, 'XMRChat', channel);
    }

    prepareChatMessage(tip) {
        const message = new ChatMessage(
            uuidv5(`XMRCHAT-${tip.id}`, this.namespace),
            this.platform,
            this.channel
        );
        message.username = tip.name;
        message.message = tip.message;
        message.sent_at = Math.floor((new Date(tip.createdAt)).getTime() / 1000);
        message.amount = this.xmrPrice * (parseFloat(tip.payment.amount) / 1e12);
        message.currency = 'USD';

        return message;
    }

    onXhrReadyStateChange(xhr, event) {
        if (xhr.readyState === XMLHttpRequest.DONE) {
            if (xhr.responseURL.indexOf('/tips/page/') > 0) {
                const json = JSON.parse(xhr.response);
                let processedCount = 0;
                let skippedOld = 0;
                let skippedPrivate = 0;
                let skippedDuplicate = 0;

                json.forEach((tip) => {
                    // Deduplicate
                    if (this.messagesRead.indexOf(tip.id) > -1) {
                        skippedDuplicate++;
                        return;
                    }
                    this.messagesRead.push(tip.id);

                    // Last 6 days only
                    const createdAt = new Date(tip.createdAt);
                    const sixDaysAgo = new Date();
                    sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);

                    if (createdAt < sixDaysAgo) {
                        this.warn('Skipping message older than 6 days.');
                        skippedOld++;
                        return;
                    }

                    // Skip private messages
                    if (tip.private === true) {
                        this.warn('Skipping private message.');
                        skippedPrivate++;
                        return;
                    }

                    const message = this.prepareChatMessage(tip);
                    this.sendChatMessages([message]);
                    processedCount++;
                });

                this.recorder.recordXhr(xhr.responseURL, 'GET', xhr.status, json, EventStatus.HANDLED, {
                    totalTips: json.length,
                    processed: processedCount,
                    skippedOld,
                    skippedPrivate,
                    skippedDuplicate
                });
            } else {
                this.recorder.recordXhr(xhr.responseURL, 'GET', xhr.status, null, EventStatus.IGNORED, null, 'Not tips endpoint');
            }
        }
    }
}

export default XMRChat;
