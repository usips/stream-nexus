/**
 * CHUCK - Kick Platform Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import kickEvents from '../fixtures/kick-events.json';

// Mock browser globals before importing Kick
vi.stubGlobal('window', {
    location: { href: 'https://kick.com/testchannel' },
    WebSocket: class MockWebSocket {
        static OPEN = 1;
        static oldWebSocket = class {};
        addEventListener() {}
        send() {}
    },
    fetch: vi.fn(() => Promise.resolve({ json: () => Promise.resolve({}) })),
    EventSource: class MockEventSource {},
    XMLHttpRequest: class MockXHR {
        prototype = { open: vi.fn(), send: vi.fn() };
    },
});

vi.stubGlobal('document', {
    addEventListener: vi.fn(),
});

vi.stubGlobal('unsafeWindow', undefined);

// Import after mocks are set up
const { ChatMessage } = await import('../../src/core/message.js');
const { Kick } = await import('../../src/platforms/kick.js');

describe('Kick Platform', () => {
    describe('prepareChatMessage', () => {
        let kick;

        beforeEach(() => {
            // Create a minimal Kick instance for testing parser functions
            kick = Object.create(Kick.prototype);
            kick.platform = 'Kick';
            kick.channel = 'testchannel';
            kick.namespace = Kick.namespace;
            kick.log = vi.fn();
            kick.warn = vi.fn();
        });

        it('should parse a standard chat message', () => {
            const event = kickEvents.ChatMessageEvent;
            const data = JSON.parse(event.data);

            const message = kick.prepareChatMessage(data);

            expect(message).toBeInstanceOf(ChatMessage);
            expect(message.username).toBe('TestUser');
            expect(message.message).toBe('Hello world!');
            expect(message.is_sub).toBe(true);
            expect(message.amount).toBe(0); // No gift = 0 amount
        });

        it('should parse a chat message with gift (paid message)', () => {
            const event = kickEvents.ChatMessageWithGift;
            const data = JSON.parse(event.data);

            const message = kick.prepareChatMessage(data);

            expect(message.username).toBe('BigDonor');
            expect(message.message).toBe('Thanks for the stream!');
            expect(message.amount).toBe(5); // 500 cents = $5
            expect(message.currency).toBe('USD');
        });

        it('should handle emotes in messages', () => {
            const data = {
                id: 'emote-test',
                content: 'Hello [emote:37221:EZ] world [emote:12345:Kappa]',
                created_at: '2024-01-15T12:00:00.000000Z',
                sender: {
                    username: 'EmoteUser',
                    identity: { badges: [] }
                }
            };

            const message = kick.prepareChatMessage(data);

            expect(message.emojis).toHaveLength(2);
            expect(message.emojis[0][0]).toBe('[emote:37221:EZ]');
            expect(message.emojis[0][1]).toBe('https://files.kick.com/emotes/37221/fullsize');
            expect(message.emojis[0][2]).toBe('EZ');
        });

        it('should identify broadcaster badge', () => {
            const data = {
                id: 'broadcaster-test',
                content: 'Hello',
                created_at: '2024-01-15T12:00:00.000000Z',
                sender: {
                    username: 'Broadcaster',
                    identity: { badges: [{ type: 'broadcaster' }] }
                }
            };

            const message = kick.prepareChatMessage(data);

            expect(message.is_owner).toBe(true);
        });

        it('should identify moderator badge', () => {
            const data = {
                id: 'mod-test',
                content: 'Hello',
                created_at: '2024-01-15T12:00:00.000000Z',
                sender: {
                    username: 'Moderator',
                    identity: { badges: [{ type: 'moderator' }] }
                }
            };

            const message = kick.prepareChatMessage(data);

            expect(message.is_mod).toBe(true);
        });

        it('should identify verified badge', () => {
            const data = {
                id: 'verified-test',
                content: 'Hello',
                created_at: '2024-01-15T12:00:00.000000Z',
                sender: {
                    username: 'VerifiedUser',
                    identity: { badges: [{ type: 'verified' }] }
                }
            };

            const message = kick.prepareChatMessage(data);

            expect(message.is_verified).toBe(true);
        });
    });

    describe('KicksGifted event', () => {
        let kick;

        beforeEach(() => {
            kick = Object.create(Kick.prototype);
            kick.platform = 'Kick';
            kick.channel = 'testchannel';
            kick.namespace = Kick.namespace;
            kick.log = vi.fn();
            kick.warn = vi.fn();
        });

        it('should parse KicksGifted with dedicated method', () => {
            const event = kickEvents.KicksGifted;
            const data = JSON.parse(event.data);

            const message = kick.prepareKicksGiftedMessage(data);

            expect(message).toBeInstanceOf(ChatMessage);
            expect(message.username).toBe('Reds_cat');
            expect(message.amount).toBe(1);
            expect(message.currency).toBe('KICKS');
            expect(message.message).toContain('Hell Yeah');
        });

        it('should generate ID with sender info for KicksGifted messages', () => {
            const event = kickEvents.KicksGifted;
            const data = JSON.parse(event.data);

            const message = kick.prepareKicksGiftedMessage(data);

            // ID should contain sender ID and timestamp
            expect(message.id).toContain('kicks_57598142_');
        });

        it('should have gift data that can be extracted', () => {
            const event = kickEvents.KicksGifted;
            const data = JSON.parse(event.data);

            // Document what we extract:
            expect(data.gift).toBeDefined();
            expect(data.gift.gift_id).toBe('hell_yeah');
            expect(data.gift.name).toBe('Hell Yeah');
            expect(data.gift.amount).toBe(1);
            expect(data.gift.type).toBe('BASIC');
            expect(data.gift.tier).toBe('BASIC');
        });

        it('should parse LEVEL_UP tier KicksGifted with all fields', () => {
            const event = kickEvents.KicksGiftedLevelUp;
            const data = JSON.parse(event.data);

            const message = kick.prepareKicksGiftedMessage(data);

            expect(message).toBeInstanceOf(ChatMessage);
            expect(message.id).toBe('c3aad5e3-688d-413a-9f93-4834413f750c'); // Uses gift_transaction_id
            expect(message.username).toBe('alalisa11');
            expect(message.message).toBe('لازم يكون فقرة تنظيف الغرفة شطف ومسح');
            expect(message.amount).toBe(1000);
            expect(message.currency).toBe('KICKS');
            expect(message.avatar).toBe('https://kick.com/img/default-profile-pictures/default-avatar-4.webp');
            // Verify timestamp was parsed from created_at
            expect(message.sent_at).toBe(Date.parse('2026-01-14T17:58:57.996338008Z'));
        });

        it('should handle LEVEL_UP tier gift data', () => {
            const event = kickEvents.KicksGiftedLevelUp;
            const data = JSON.parse(event.data);

            expect(data.gift.gift_id).toBe('pack_it_up');
            expect(data.gift.name).toBe('Pack It Up');
            expect(data.gift.amount).toBe(1000);
            expect(data.gift.type).toBe('LEVEL_UP');
            expect(data.gift.tier).toBe('MID');
            expect(data.created_at).toBeDefined();
            expect(data.expires_at).toBeDefined();
            expect(data.gift_transaction_id).toBeDefined();
        });
    });

    describe('Fuzzing: prepareChatMessage robustness', () => {
        let kick;

        beforeEach(() => {
            kick = Object.create(Kick.prototype);
            kick.platform = 'Kick';
            kick.channel = 'testchannel';
            kick.namespace = Kick.namespace;
            kick.log = vi.fn();
            kick.warn = vi.fn();
        });

        it('should not crash on malformed message data', () => {
            fc.assert(
                fc.property(
                    fc.record({
                        id: fc.oneof(fc.string(), fc.constant(undefined)),
                        content: fc.oneof(fc.string(), fc.constant(undefined)),
                        created_at: fc.oneof(fc.string(), fc.constant(undefined)),
                        sender: fc.oneof(
                            fc.record({
                                username: fc.oneof(fc.string(), fc.constant(undefined)),
                                identity: fc.oneof(
                                    fc.record({
                                        badges: fc.oneof(
                                            fc.array(fc.record({ type: fc.string() })),
                                            fc.constant(undefined)
                                        )
                                    }),
                                    fc.constant(undefined)
                                )
                            }),
                            fc.constant(undefined)
                        ),
                        gift: fc.oneof(
                            fc.record({
                                amount: fc.oneof(fc.integer(), fc.constant(undefined))
                            }),
                            fc.constant(undefined)
                        )
                    }),
                    (data) => {
                        // Should not throw
                        try {
                            kick.prepareChatMessage(data);
                            return true;
                        } catch (e) {
                            // Document what input caused the crash
                            console.error('Crash on input:', JSON.stringify(data));
                            return false;
                        }
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should handle random string content without crashing', () => {
            fc.assert(
                fc.property(fc.string(), (content) => {
                    const data = {
                        id: 'fuzz-test',
                        content: content,
                        created_at: '2024-01-15T12:00:00.000000Z',
                        sender: {
                            username: 'FuzzUser',
                            identity: { badges: [] }
                        }
                    };

                    const message = kick.prepareChatMessage(data);
                    expect(message.message).toBe(content);
                    return true;
                }),
                { numRuns: 100 }
            );
        });

        it('should handle various badge types without crashing', () => {
            fc.assert(
                fc.property(fc.array(fc.string()), (badgeTypes) => {
                    const data = {
                        id: 'badge-fuzz',
                        content: 'Test',
                        created_at: '2024-01-15T12:00:00.000000Z',
                        sender: {
                            username: 'BadgeUser',
                            identity: { badges: badgeTypes.map(t => ({ type: t })) }
                        }
                    };

                    // Should not throw
                    kick.prepareChatMessage(data);
                    return true;
                }),
                { numRuns: 50 }
            );
        });
    });
});
