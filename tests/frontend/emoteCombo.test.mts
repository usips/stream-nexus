// Run with: npm run test:frontend   (node's built-in runner; Node 23+ strips the types)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    classify_tokens,
    combo_scale,
    normalize_emote_name,
    normalize_unicode_emoji,
    type ComboToken,
} from '../../src/frontend/overlay/emoteCombo.ts';

const emote = (name: string): ComboToken => ({ kind: 'emote', name, html: `<img data-emoji="${name}">` });
const text = (t: string): ComboToken => ({ kind: 'text', text: t });

test('same emote from different platforms normalises to one key', () => {
    const twitch = normalize_emote_name('KEKW');
    assert.equal(twitch, 'e:kekw');
    assert.equal(normalize_emote_name('KEKW'), twitch);        // Kick
    assert.equal(normalize_emote_name('_kekw'), twitch);       // YouTube ":_kekw:" stored as "_kekw"
    assert.equal(normalize_emote_name(':r+kekw:'), twitch);    // Rumble
    assert.equal(normalize_emote_name(':chan.kekw:'), twitch); // Rumble channel emote
});

test('aliases map emote names and emoticons onto unicode emoji', () => {
    assert.equal(normalize_emote_name('<3'), 'u:❤');
    assert.equal(normalize_emote_name(':r+heart:'), 'u:❤');
    assert.equal(normalize_emote_name(':)'), 'u:🙂');
    // Unknown all-punctuation emoticons compare as typed instead of collapsing to "".
    assert.equal(normalize_emote_name('>_<'), 'e:>_<');
});

test('unicode emoji ignore variation selectors and skin tones', () => {
    assert.equal(normalize_unicode_emoji('❤️'), '❤');
    assert.equal(normalize_unicode_emoji('👍🏽'), '👍');
});

test('a message of one repeated emote is a candidate', () => {
    const c = classify_tokens([emote('KEKW'), text(' '), emote('KEKW'), text(' ')]);
    assert.equal(c?.key, 'e:kekw');
    assert.equal(c?.displayHtml, '<img data-emoji="KEKW">');
});

test('unicode-only messages are candidates, and combine with aliased emotes', () => {
    assert.equal(classify_tokens([text('😂 😂😂')])?.key, 'u:😂');
    assert.equal(classify_tokens([text('❤️')])?.key, classify_tokens([emote('<3')])?.key);
    assert.equal(classify_tokens([text('👍🏻 👍🏿')])?.key, 'u:👍');
    assert.equal(classify_tokens([text('👨‍👩‍👧')])?.key, 'u:👨‍👩‍👧');
    assert.equal(classify_tokens([text('🇺🇸')])?.key, 'u:🇺🇸');
});

test('messages with text, mixed emotes, or other markup are not candidates', () => {
    assert.equal(classify_tokens([text('lol '), emote('KEKW')]), null);
    assert.equal(classify_tokens([emote('KEKW'), emote('LUL')]), null);
    assert.equal(classify_tokens([text('😂 🔥')]), null);
    assert.equal(classify_tokens([emote('KEKW'), { kind: 'other' }]), null);
    assert.equal(classify_tokens([text('   ')]), null);
    assert.equal(classify_tokens([text('1 2 3')]), null);
    assert.equal(classify_tokens([]), null);
});

test('combo scale grows and caps', () => {
    assert.equal(combo_scale(1), 1);
    assert.ok(combo_scale(3) > combo_scale(2));
    assert.ok(combo_scale(100) > combo_scale(10));
    assert.equal(combo_scale(1_000_000), 2.5);
});
