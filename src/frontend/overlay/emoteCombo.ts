// ============================================================================
// Emote Combos
//
// When chat spams the same emote, collapse those messages into one "combo" entry
// ("[emote] x 12") that drops authorship and grows a little with each hit.
//
// Platforms name the same emote differently, so names are normalised before
// comparing:
//   Twitch  "KEKW"        Kick "KEKW"         YouTube ":_kekw:" -> "_kekw"
//   Rumble  ":r+kekw:"    unicode "😂️" (with variation selector / skin tone)
// All of the above reduce to the same key. The alias table maps a few common
// emote names and text emoticons onto unicode emoji so those can combine too.
// ============================================================================

/** A piece of a chat message: plain text, or an emote image. */
export type ComboToken =
    | { kind: 'text'; text: string }
    | { kind: 'emote'; name: string; html: string }
    | { kind: 'other' };

/** How a message would display as a combo, if it qualifies as one. */
export interface ComboCandidate {
    /** Normalised identity shared by every message that joins this combo. */
    key: string;
    /** HTML for the emote shown in the combo entry. */
    displayHtml: string;
}

// Emote names (normalised) or text emoticons (lowercased) that mean a unicode emoji.
// This is the fudge table: extend it when two platforms' emotes should combine.
const EMOTE_ALIASES: Record<string, string> = {
    // Text emoticons (Twitch's global smileys, typed shortcuts)
    ':)': '🙂', ':-)': '🙂', ':(': '🙁', ':-(': '🙁', ':d': '😃', ':-d': '😃',
    ';)': '😉', ';-)': '😉', ':p': '😛', ':-p': '😛', ';p': '😜', ':o': '😮',
    ':-o': '😮', '<3': '❤', 'b)': '😎', 'b-)': '😎', ':/': '😕', ':\\': '😕',
    ':|': '😐', 'r)': '🏴‍☠️', 'o_o': '😳', '>(': '😠',
    // Emote names that are just a named emoji
    heart: '❤', redheart: '❤', fire: '🔥', joy: '😂', laughing: '😆',
    skull: '💀', clap: '👏', pray: '🙏', thumbsup: '👍', thumbsdown: '👎',
    hundred: '💯', '100': '💯', eyes: '👀', sob: '😭', crying: '😭',
    partypopper: '🎉', tada: '🎉', rocket: '🚀', goat: '🐐', cap: '🧢',
    smile: '😄', grin: '😁', wave: '👋', salute: '🫡', thinking: '🤔',
};

// Variation selectors and skin-tone modifiers don't change which emoji it is.
const EMOJI_NOISE = /[︎️\u{1F3FB}-\u{1F3FF}]/gu;

// One emoji: a flag pair, a keycap, or a pictograph with optional modifiers and ZWJ parts.
const EMOJI_SEQUENCE = new RegExp(
    '\\p{Regional_Indicator}{2}' +
    '|[0-9#*]\\uFE0F?\\u20E3' +
    '|\\p{Extended_Pictographic}[\\uFE0E\\uFE0F]?\\p{Emoji_Modifier}?' +
    '(?:\\u200D\\p{Extended_Pictographic}[\\uFE0E\\uFE0F]?\\p{Emoji_Modifier}?)*',
    'gu',
);

/** Reduce a unicode emoji to its base form (no variation selectors or skin tones). */
export function normalize_unicode_emoji(emoji: string): string {
    return emoji.replace(EMOJI_NOISE, '');
}

/**
 * Reduce a platform emote name to a key that matches the same emote elsewhere.
 * Returns a "u:" key when the name aliases a unicode emoji, else an "e:" key.
 */
export function normalize_emote_name(name: string): string {
    const raw = name.trim().toLowerCase();
    if (EMOTE_ALIASES[raw] !== undefined) {
        return `u:${normalize_unicode_emoji(EMOTE_ALIASES[raw])}`;
    }

    let n = raw.replace(/^:+|:+$/g, '');               // ":r+kekw:" -> "r+kekw"
    n = n.slice(Math.max(n.lastIndexOf('+'), n.lastIndexOf('.')) + 1); // Rumble "r+" / "chan." prefix
    n = n.replace(/[^\p{L}\p{N}]/gu, '');              // "_kekw", "face-blue-smiling"
    if (n.length === 0) {
        // All punctuation (an emoticon not in the table): compare it as typed.
        return `e:${raw}`;
    }
    if (EMOTE_ALIASES[n] !== undefined) {
        return `u:${normalize_unicode_emoji(EMOTE_ALIASES[n])}`;
    }
    return `e:${n}`;
}

function escape_html(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Decide whether a message is a single emote repeated (or alone), with only
 * whitespace around it. Returns its combo key and display HTML, or null.
 */
export function classify_tokens(tokens: ComboToken[]): ComboCandidate | null {
    let key: string | null = null;
    let displayHtml = '';

    const accept = (k: string, html: string): boolean => {
        if (key === null) {
            key = k;
            displayHtml = html;
            return true;
        }
        return key === k;
    };

    for (const token of tokens) {
        if (token.kind === 'other') {
            return null;
        }
        if (token.kind === 'emote') {
            if (!accept(normalize_emote_name(token.name), token.html)) return null;
            continue;
        }

        // Text: whitespace and emoji only.
        const leftover = token.text.replace(EMOJI_SEQUENCE, ' ');
        if (leftover.trim().length > 0) {
            return null;
        }
        for (const match of token.text.matchAll(EMOJI_SEQUENCE)) {
            const emoji = match[0];
            const html = `<span class="emoji emoji--unicode">${escape_html(emoji)}</span>`;
            if (!accept(`u:${normalize_unicode_emoji(emoji)}`, html)) return null;
        }
    }

    return key === null ? null : { key, displayHtml };
}

/** Split rendered message HTML (server output) into combo tokens. Browser only. */
export function tokenize_message_html(html: string): ComboToken[] {
    const template = document.createElement('template');
    template.innerHTML = html;

    const tokens: ComboToken[] = [];
    for (const node of Array.from(template.content.childNodes)) {
        if (node.nodeType === Node.TEXT_NODE) {
            tokens.push({ kind: 'text', text: node.textContent || '' });
        } else if (node instanceof HTMLImageElement && node.classList.contains('emoji')) {
            const name = node.dataset.emoji || node.alt || node.src;
            tokens.push({ kind: 'emote', name, html: node.outerHTML });
        } else {
            tokens.push({ kind: 'other' });
        }
    }
    return tokens;
}

// ============================================================================
// Per-container combo tracking
// ============================================================================

export interface ComboSettings {
    /** Matching messages needed before they collapse into a combo. */
    threshold: number;
    /** A combo ends after this long without another matching message (ms). */
    timeoutMs: number;
}

interface ComboState {
    key: string;
    count: number;
    /** Ids of messages counted, so a removal can take them back out. */
    ids: Set<string>;
    /** Messages shown normally while under the threshold; removed when the combo forms. */
    pending: HTMLElement[];
    /** The combo entry, once the threshold is reached. */
    el: HTMLElement | null;
    displayHtml: string;
    timer: ReturnType<typeof setTimeout> | null;
}

/** Scale for a combo of `count`: grows quickly at first, then slowly, capped at 2.5x. */
export function combo_scale(count: number): number {
    return Math.min(2.5, 1 + Math.log2(Math.max(1, count)) * 0.15);
}

let comboSequence = 0;

export class ComboTracker {
    private combos = new Map<string, ComboState>();
    private container: HTMLElement;
    settings: ComboSettings;

    // (No parameter properties: Node's type stripping, used by the tests, rejects them.)
    constructor(container: HTMLElement, settings: ComboSettings) {
        this.container = container;
        this.settings = settings;
    }

    /**
     * Count a qualifying message. Returns true if it was absorbed into a combo (the
     * caller must not insert it); false if the caller should insert it normally and
     * then call `registerPending` with the inserted element.
     */
    handle(id: string, candidate: ComboCandidate, order: number): boolean {
        let state = this.combos.get(candidate.key);
        if (!state) {
            state = {
                key: candidate.key,
                count: 0,
                ids: new Set(),
                pending: [],
                el: null,
                displayHtml: candidate.displayHtml,
                timer: null,
            };
            this.combos.set(candidate.key, state);
        }

        state.count++;
        state.ids.add(id);
        this.restartTimer(state);

        if (state.el === null && state.count >= Math.max(2, this.settings.threshold)) {
            for (const el of state.pending) el.remove();
            state.pending = [];
            state.el = this.createComboElement(state);
        }

        if (state.el === null) {
            return false;
        }

        this.render(state, order, true);
        return true;
    }

    /** Remember a message that was inserted normally while its combo was building. */
    registerPending(key: string, el: HTMLElement): void {
        this.combos.get(key)?.pending.push(el);
    }

    /** A message was deleted: take it back out of whichever combo counted it. */
    remove(id: string): void {
        for (const state of this.combos.values()) {
            if (!state.ids.delete(id)) continue;
            state.count--;
            state.pending = state.pending.filter(el => el.isConnected);
            if (state.count <= 0) {
                state.el?.remove();
                this.end(state);
            } else if (state.el) {
                this.render(state, null, false);
            }
            return;
        }
    }

    /** End every combo (layout removed this chat, or combos switched off). */
    clear(): void {
        for (const state of Array.from(this.combos.values())) {
            this.end(state);
        }
    }

    private end(state: ComboState): void {
        if (state.timer !== null) clearTimeout(state.timer);
        state.el?.classList.remove('msg--combo-active');
        if (this.combos.get(state.key) === state) {
            this.combos.delete(state.key);
        }
    }

    private restartTimer(state: ComboState): void {
        if (state.timer !== null) clearTimeout(state.timer);
        state.timer = setTimeout(() => this.end(state), this.settings.timeoutMs);
    }

    private createComboElement(state: ComboState): HTMLElement {
        const el = document.createElement('div');
        el.id = `combo-${++comboSequence}`;
        el.className = 'msg msg--combo msg--combo-active';
        el.innerHTML = `
            <div class="msg-combo-emote">${state.displayHtml}</div>
            <div class="msg-combo-count"><span class="msg-combo-x">x</span><span class="msg-combo-n"></span></div>
        `;
        return el;
    }

    private render(state: ComboState, order: number | null, bump: boolean): void {
        const el = state.el;
        if (!el) return;

        el.querySelector('.msg-combo-n')!.textContent = state.count.toString();
        el.style.setProperty('--combo-scale', combo_scale(state.count).toFixed(3));

        if (order !== null) {
            el.style.order = order.toString();
        }
        // Move to the newest position (also re-attaches it if old-message trimming removed it).
        if (bump) {
            this.container.appendChild(el);
            el.classList.remove('msg--combo-pop');
            void el.offsetWidth; // restart the animation
            el.classList.add('msg--combo-pop');
        }
    }
}
