/**
 * CHUCK - Chat Harvesting Universal Connection Kit
 * YouTube platform scraper
 *
 * Features:
 * - Capture new messages
 * - Capture sent messages
 * - Capture emotes
 * - Capture view counts
 * - Capture SuperChats with currency parsing
 * - Capture membership gifts
 */

import { Seed, ChatMessage, uuidv5, WINDOW } from '../core/index.js';

export class YouTube extends Seed {
    static hostname = 'youtube.com';
    static altHostname = 'www.youtube.com';
    static namespace = 'fd60ac36-d6b5-49dc-aee6-b0d87d130582';

    constructor() {
        const channel = null; // Cannot be determined before DOM is ready
        super(YouTube.namespace, 'YouTube', channel);
    }

    prepareChatMessages(actions) {
        function hasBadge(badges, iconType) {
            return badges?.some(badge =>
                badge.liveChatAuthorBadgeRenderer?.icon?.iconType === iconType
            ) ?? false;
        }

        function isMember(badges) {
            return badges?.some(badge => {
                return badge.liveChatAuthorBadgeRenderer?.customThumbnail !== undefined;
            }) ?? false;
        }

        function paymentValue(paymentText) {
            const currencyData = {
                'us$': 'USD', 'a$': 'AUD', 'c$': 'CAD', 'clp$': 'CLP', 'cop$': 'COP',
                'hk$': 'HKD', 'mx$': 'MXN', 'nt$': 'TWD', 'nz$': 'NZD', 'r$': 'BRL',
                'rd$': 'DOP', 's$': 'SGD', 's/': 'PEN', 'b/.': 'PAB', 'bs.': 'BOB',
                'лв': 'BGN', 'ден': 'MKD', 'дин.': 'RSD', 'ر.س': 'SAR', 'د.إ': 'AED',
                'br': 'BYN', 'kn': 'HRK', 'kč': 'CZK', 'kr': 'SEK', 'ft': 'HUF',
                'zł': 'PLN', 'cfa': 'XOF', 'ush': 'UGX', 'lei': 'RON', 'chf': 'CHF',
                '€': 'EUR', '£': 'GBP', '¥': 'JPY', '₩': 'KRW', '₹': 'INR', '₪': 'ILS',
                '₱': 'PHP', '₽': 'RUB', '₺': 'TRY', '₦': 'NGN', '₲': 'PYG', '₡': 'CRC',
                'q': 'GTQ', 'l': 'HNL', '$': 'USD', 'r': 'ZAR',
                'aed': 'AED', 'ars': 'ARS', 'aud': 'AUD', 'bgn': 'BGN', 'bob': 'BOB',
                'brl': 'BRL', 'byn': 'BYN', 'cad': 'CAD', 'chf': 'CHF', 'clp': 'CLP',
                'cop': 'COP', 'crc': 'CRC', 'czk': 'CZK', 'dkk': 'DKK', 'dop': 'DOP',
                'eur': 'EUR', 'gbp': 'GBP', 'gtq': 'GTQ', 'hkd': 'HKD', 'hnl': 'HNL',
                'hrk': 'HRK', 'huf': 'HUF', 'ils': 'ILS', 'inr': 'INR', 'isk': 'ISK',
                'jpy': 'JPY', 'krw': 'KRW', 'mkd': 'MKD', 'mxn': 'MXN', 'ngn': 'NGN',
                'nio': 'NIO', 'nok': 'NOK', 'nzd': 'NZD', 'pab': 'PAB', 'pen': 'PEN',
                'php': 'PHP', 'pln': 'PLN', 'pyg': 'PYG', 'ron': 'RON', 'rsd': 'RSD',
                'rub': 'RUB', 'sar': 'SAR', 'sek': 'SEK', 'sgd': 'SGD', 'twd': 'TWD',
                'try': 'TRY', 'ugx': 'UGX', 'usd': 'USD', 'xof': 'XOF', 'zar': 'ZAR'
            };

            const symbols = Object.keys(currencyData)
                .sort((a, b) => b.length - a.length)
                .map(s => s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'))
                .join('|');

            const paymentRegex = new RegExp(
                `^\\s*(?:(${symbols})\\s*([\\d,]+(?:\\.\\d{1,2})?)|([\\d,]+(?:\\.\\d{1,2})?)\\s*(${symbols}))\\s*$`,
                'i'
            );

            const match = paymentText.match(paymentRegex);
            if (!match) return [null, null];

            const currencySymbol = (match[1] || match[4] || '').toLowerCase();
            const amountString = match[2] || match[3];
            const amount = parseFloat(amountString.replace(/,/g, ''));
            const currencyCode = currencyData[currencySymbol] || null;

            return [currencyCode, amount];
        }

        return Promise.all(actions.map(async (action) => {
            if (action.item.liveChatTextMessageRenderer !== undefined || action.item.liveChatPaidMessageRenderer !== undefined) {
                const renderer = action.item.liveChatTextMessageRenderer || action.item.liveChatPaidMessageRenderer;
                const message = new ChatMessage(
                    uuidv5(renderer.id, this.namespace),
                    this.platform,
                    this.channel
                );
                message.username = renderer.authorName.simpleText;
                message.avatar = renderer.authorPhoto.thumbnails.at(-1).url;
                message.sent_at = parseInt(renderer.timestampUsec / 1000);

                const badges = renderer.authorBadges;
                message.is_verified = hasBadge(badges, 'VERIFIED');
                message.is_sub = isMember(badges);
                message.is_mod = hasBadge(badges, 'MODERATOR');
                message.is_owner = hasBadge(badges, 'OWNER');

                if (action.item.liveChatPaidMessageRenderer !== undefined) {
                    const [currency, amount] = paymentValue(renderer.purchaseAmountText.simpleText);
                    if (currency === null || amount === null) {
                        this.warn('Could not parse SuperChat currency or amount.', renderer.purchaseAmountText.simpleText);
                    } else {
                        message.amount = amount;
                        message.currency = currency;
                    }
                }

                if (renderer.message && renderer.message.runs) {
                    renderer.message.runs.forEach((run) => {
                        if (run.text !== undefined) {
                            message.message += run.text;
                        } else if (run.emoji !== undefined) {
                            message.message += `:${run.emoji.emojiId}: `;
                            message.emojis.push([`:${run.emoji.emojiId}:`, run.emoji.image.thumbnails.at(-1).url, `${run.emoji.emojiId}`]);
                        } else {
                            this.log('[CHUCK::YouTube] Unknown run.', run);
                        }
                    });
                }

                return message;
            } else if (action.item.liveChatMembershipGiftingEventRenderer !== undefined) {
                const giftingEvent = action.item.liveChatMembershipGiftingEventRenderer;
                const message = new ChatMessage(
                    uuidv5(giftingEvent.id, this.namespace),
                    this.platform,
                    this.channel
                );
                message.username = giftingEvent.authorName.simpleText;
                message.avatar = giftingEvent.authorPhoto.thumbnails.at(-1).url;
                message.sent_at = parseInt(giftingEvent.timestampUsec / 1000);
                message.message = `${giftingEvent.authorName.simpleText} gifted ${giftingEvent.numGiftedMembers} memberships!`;
                message.currency = 'USD';
                message.amount = 5.00;

                return message;
            } else if (action.item.liveChatGiftMembershipReceivedEventRenderer !== undefined) {
                const giftReceivedEvent = action.item.liveChatGiftMembershipReceivedEventRenderer;
                const message = new ChatMessage(
                    uuidv5(giftReceivedEvent.id, this.namespace),
                    this.platform,
                    this.channel
                );
                message.username = giftReceivedEvent.authorName.simpleText;
                message.avatar = giftReceivedEvent.authorPhoto.thumbnails.at(-1).url;
                message.sent_at = parseInt(giftReceivedEvent.timestampUsec / 1000);
                message.message = `${giftReceivedEvent.authorName.simpleText} received a gifted membership!`;
                message.currency = 'USD';
                message.amount = giftReceivedEvent.numGiftedMembers * 5.00;

                return message;
            } else if (typeof action.item.liveChatPlaceholderItemRenderer !== undefined) {
                if (action.item.liveChatPlaceholderItemRenderer !== undefined) {
                    const message = new ChatMessage(
                        uuidv5(action.item.liveChatPlaceholderItemRenderer.id, this.namespace),
                        this.platform,
                        this.channel
                    );
                    message.sent_at = parseInt(action.item.liveChatPlaceholderItemRenderer.timestampUsec / 1000);
                    message.is_placeholder = true;
                    return message;
                } else {
                    return null;
                }
            } else {
                return null;
            }
        })).then((messages) => messages.filter((message) => message !== null));
    }

    receiveChatMessages(json) {
        return this.prepareChatMessages(json).then((data) => {
            this.sendChatMessages(data);
        });
    }

    async onDocumentReady(event) {
        this.log('Document ready, preparing to load channel information.');

        const url = new URL(window.location.href);
        const yt = WINDOW.ytInitialData;
        let video_id = null;
        let is_chat_only = false;

        if (url.pathname.includes('/live_chat') || url.pathname.includes('/live_chat_replay')) {
            is_chat_only = true;
            video_id = url.searchParams.get('v');

            if (!video_id && yt?.continuationContents?.liveChatContinuation) {
                const chatContinuation = yt.continuationContents.liveChatContinuation;
                const menuItems = chatContinuation.header?.liveChatHeaderRenderer?.overflowMenu?.menuRenderer?.items || [];
                for (const item of menuItems) {
                    const endpoint = item.menuServiceItemRenderer?.serviceEndpoint?.popoutLiveChatEndpoint;
                    if (endpoint?.url) {
                        const popoutUrl = new URL(endpoint.url);
                        video_id = popoutUrl.searchParams.get('v');
                        if (video_id) break;
                    }
                }

                if (!video_id) {
                    const topic = chatContinuation.continuations?.[0]?.invalidationContinuationData?.invalidationId?.topic;
                    if (topic) video_id = topic.split('~')[1];
                }
            } else if (!video_id && yt?.contents?.liveChatRenderer) {
                const topic = yt.contents.liveChatRenderer.continuations?.[0]?.invalidationContinuationData?.invalidationId?.topic;
                if (topic) video_id = topic.split('~')[1];
            }
        } else {
            if (url.pathname.startsWith('/watch')) {
                video_id = url.searchParams.get('v');
            } else if (url.pathname.startsWith('/live/')) {
                video_id = url.pathname.split('/live/')[1];
            }
        }

        if (!video_id) {
            this.log('Cannot identify video ID.', { url: url.href, pathname: url.pathname });
            return;
        }

        this.log('Video ID:', video_id, 'Chat only:', is_chat_only);

        const author_url = await fetch(`https://www.youtube.com/oembed?url=http%3A//youtube.com/watch%3Fv%3D${video_id}&format=json`)
            .then(response => response.json())
            .then(json => json.author_url);

        this.log('Author URL:', author_url);

        const channel_match = author_url.match(/(?:\/channel\/|@)([^\/]+)/);
        if (channel_match && channel_match[1]) {
            this.channel = channel_match[1];
        } else {
            this.log('Could not find a channel ID in the URL. URL:', author_url);
        }

        this.log('Received channel info.', video_id, author_url, this.channel);

        if (!is_chat_only) {
            const checkForViewCount = () => {
                const viewCountElem = document.querySelector('#view-count');
                if (viewCountElem) {
                    const observer = new MutationObserver(this.onViewCountChange.bind(this));
                    observer.observe(viewCountElem, {
                        attributes: true,
                        attributeFilter: ['aria-label'],
                        characterData: false,
                        childList: false,
                        subtree: false
                    });
                    return true;
                }
                return false;
            };

            if (!checkForViewCount()) {
                const intervalId = setInterval(() => {
                    if (checkForViewCount()) clearInterval(intervalId);
                }, 1000);
            }
        }
    }

    async onFetchResponse(response) {
        if (!response.url.includes('/get_live_chat')) return;

        try {
            const json = await response.json();
            const actions = json?.continuationContents?.liveChatContinuation?.actions;

            if (!actions) return;

            const messagesToAdd = actions
                .map(action => {
                    if (action.addChatItemAction) return action.addChatItemAction;
                    if (action.addLiveChatMembershipItemAction) return action.addLiveChatMembershipItemAction;
                    if (action.removeChatItemAction) {
                        this.sendRemoveMessages([uuidv5(action.removeChatItemAction.targetItemId, this.namespace)]);
                        return null;
                    }
                    if (action.addLiveChatTickerItemAction) return null;
                    if (action.updateLiveChatPollAction) return null;
                    this.log('Unknown get_live_chat action.', action);
                    return null;
                })
                .filter(Boolean);

            if (messagesToAdd.length > 0) {
                this.receiveChatMessages(messagesToAdd);
            }
        } catch (error) {
            this.warn('Failed to process live chat response:', error);
        }
    }

    onViewCountChange(mutationsList, observer) {
        for (const mutation of mutationsList) {
            if (mutation.type === 'childList' || mutation.type === 'characterData' || mutation.type === 'attributes') {
                const viewCountElem = document.querySelector('#view-count');
                if (viewCountElem) {
                    const ariaLabel = viewCountElem.getAttribute('aria-label');
                    if (ariaLabel) {
                        const numericOnly = ariaLabel.replace(/[^\d]/g, '');
                        if (numericOnly) {
                            const viewers = parseInt(numericOnly, 10);
                            if (!isNaN(viewers)) {
                                this.sendViewerCount(viewers);
                                continue;
                            }
                        }
                    }

                    const text = viewCountElem.textContent || '';
                    const match = text.replace(/,/g, '').match(/([\d,]+)\s+views/);
                    if (match && match[1]) {
                        const viewers = parseInt(match[1], 10);
                        if (!isNaN(viewers)) {
                            this.sendViewerCount(viewers);
                        }
                    }
                }
            }
        }
    }
}

export default YouTube;
