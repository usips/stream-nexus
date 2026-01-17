import type {
    Layout,
    ElementConfig,
    ChatMessage,
    WebSocketMessage,
    ViewerCounts,
    BadgeSettings,
    LiveBadgeOptions,
} from '../types';

// ============================================================================
// DOM Elements
// ============================================================================

const chat_history = document.querySelector<HTMLElement>("#chat-messages");
const feature_message = document.querySelector<HTMLElement>("#show-message");

// Current layout state
let current_layout: Layout | null = null;

// ============================================================================
// Message Buffer System
// Smooths out message delivery to prevent jarring bursts from platforms like
// YouTube and Twitch that send messages in batches.
// ============================================================================

interface BufferedMessage {
    message: ChatMessage;
    timestamp: number;
}

const messageBuffer = {
    queue: [] as BufferedMessage[],
    maxWaitTime: 1000, // Maximum time any message can wait (ms) - 1 second
    minInterval: 50,   // Minimum interval between messages (ms)
    intervalId: null as ReturnType<typeof setTimeout> | null,
    lastProcessTime: 0,

    // Add a message to the buffer
    push(message: ChatMessage): void {
        this.queue.push({
            message,
            timestamp: Date.now()
        });
        this.ensureProcessing();
    },

    // Start processing if not already running
    ensureProcessing(): void {
        if (this.intervalId === null && this.queue.length > 0) {
            this.scheduleNext();
        }
    },

    // Calculate how many messages should be processed right now
    getProcessCount(): number {
        if (this.queue.length === 0) return 0;

        const now = Date.now();
        let count = 0;

        // Count messages that have exceeded their max wait time (must process immediately)
        for (const item of this.queue) {
            if (now - item.timestamp >= this.maxWaitTime) {
                count++;
            } else {
                break; // Queue is ordered by time, so we can stop here
            }
        }

        // Always process at least one if we have messages and enough time has passed
        if (count === 0 && this.queue.length > 0) {
            const timeSinceLastProcess = now - this.lastProcessTime;
            if (timeSinceLastProcess >= this.minInterval) {
                count = 1;
            }
        }

        return count;
    },

    // Calculate delay until next processing
    getDelay(): number {
        if (this.queue.length === 0) return this.minInterval;

        // How long has the oldest message been waiting?
        const oldestAge = Date.now() - this.queue[0].timestamp;
        const remainingTime = this.maxWaitTime - oldestAge;

        // If oldest message has expired, process immediately
        if (remainingTime <= 0) {
            return 0;
        }

        // Spread remaining messages over remaining time
        const calculatedDelay = Math.floor(remainingTime / this.queue.length);
        return Math.max(this.minInterval, calculatedDelay);
    },

    // Schedule the next processing cycle
    scheduleNext(): void {
        if (this.queue.length === 0) {
            this.intervalId = null;
            return;
        }

        const delay = this.getDelay();
        this.intervalId = setTimeout(() => {
            this.processBatch();
            this.scheduleNext();
        }, delay);
    },

    // Process messages - handles both normal flow and catch-up after tab becomes active
    processBatch(): void {
        if (this.queue.length === 0) return;

        const count = this.getProcessCount();
        for (let i = 0; i < count && this.queue.length > 0; i++) {
            const item = this.queue.shift();
            if (item) {
                processMessageImmediate(item.message);
            }
        }
        this.lastProcessTime = Date.now();
    },

    // Called when tab visibility changes - process all overdue messages immediately
    onVisibilityChange(): void {
        if (document.visibilityState === 'visible' && this.queue.length > 0) {
            this.processBatch();
            // Restart the timer if there are more messages
            if (this.intervalId !== null) {
                clearTimeout(this.intervalId);
                this.intervalId = null;
            }
            this.ensureProcessing();
        }
    }
};

// Handle tab visibility changes to catch up on messages when tab becomes active
document.addEventListener('visibilitychange', () => {
    messageBuffer.onVisibilityChange();
});

// ============================================================================
// WebSocket Connection
// ============================================================================

const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${wsProtocol}//${window.location.host}/chat.ws`;

let socket = new WebSocket(wsUrl);

const reconnect = (): boolean => {
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        return true;
    }
    socket = new WebSocket(wsUrl);
    bindWebsocketEvents();
    return false;
};

const bindWebsocketEvents = (): void => {
    socket.addEventListener("open", () => {
        console.log("[SNEED] Connection established.");
        socket.send(JSON.stringify({ request_layout: true }));
    });

    socket.addEventListener("message", (event: MessageEvent) => {
        const data: WebSocketMessage = JSON.parse(event.data);
        const message = JSON.parse(data.message);

        switch (data.tag) {
            case "chat_message":
                handle_message(message as ChatMessage);
                break;
            case "feature_message":
                handle_feature_message(message as string | null);
                break;
            case "viewers":
                handle_viewers(message as ViewerCounts);
                break;
            case "layout_update":
                apply_layout(message as Layout);
                break;
            case "layout_list":
                console.log("[SNEED] Available layouts:", message);
                break;
            default:
                console.log("Unknown tag:", data.tag);
                break;
        }
    });

    socket.addEventListener("close", (event: CloseEvent) => {
        console.log("[SNEED] Socket has closed. Attempting reconnect.", event.reason);
        setTimeout(() => { reconnect(); }, 1000);
    });

    socket.addEventListener("error", () => {
        socket.close();
        setTimeout(() => { reconnect(); }, 1000);
    });
};

bindWebsocketEvents();

// ============================================================================
// Layout Application
// ============================================================================

let textUpdateInterval: ReturnType<typeof setInterval> | null = null;

function start_text_updates(): void {
    if (textUpdateInterval) clearInterval(textUpdateInterval);
    textUpdateInterval = setInterval(() => {
        if (!current_layout) return;
        const textConfig = current_layout.elements?.text || current_layout.elements?.attribution;
        if (textConfig && textConfig.enabled !== false && textConfig.options?.content) {
            const el = document.getElementById("attribution");
            if (el) {
                el.innerHTML = resolve_tokens(textConfig.options.content as string);
            }
        }
    }, 1000);
}
start_text_updates();

function apply_layout(layout: Layout): void {
    console.log("[SNEED] Applying layout:", layout.name);
    current_layout = layout;

    const elements = layout.elements || {};

    // Apply each element's configuration
    apply_element_config(document.getElementById("chat"), elements.chat);
    apply_element_config(document.getElementById("live"), elements.live);
    // Support both "text" (new) and "attribution" (legacy) element names
    const textConfig = elements.text || elements.attribution;
    apply_element_config(document.getElementById("attribution"), textConfig, true);
    apply_element_config(document.getElementById("show-message"), elements.featured);
    apply_element_config(document.getElementById("poll-ui"), elements.poll);
    apply_element_config(document.getElementById("superchat-ui"), elements.superchat);

    // Apply message styling via CSS custom properties
    if (layout.messageStyle) {
        const ms = layout.messageStyle;
        const root = document.documentElement;

        if (ms.avatarSize) root.style.setProperty('--avatar-size', ms.avatarSize);
        if (ms.maxHeight) root.style.setProperty('--message-max-height', ms.maxHeight);
        if (ms.borderRadius) root.style.setProperty('--message-border-radius', ms.borderRadius);
        if (ms.fontSize) root.style.setProperty('--message-font-size', ms.fontSize);
        if (ms.backgroundColor) root.style.setProperty('--message-bg', ms.backgroundColor);
        if (ms.textColor) root.style.setProperty('--message-color', ms.textColor);

        // Apply display mode classes to chat
        const chatEl = document.getElementById('chat');
        if (chatEl) {
            chatEl.classList.toggle('chat--condensed', ms.condensedMode === true);
            chatEl.classList.toggle('chat--no-avatars', ms.showAvatars === false);
        }

        // Store badge visibility settings for message rendering
        window.badgeSettings = {
            owner: ms.showOwnerBadge !== false,
            staff: ms.showStaffBadge !== false,
            mod: ms.showModBadge !== false,
            verified: ms.showVerifiedBadge !== false,
            sub: ms.showSubBadge !== false,
        };
    }

    // Update chat width CSS variable from chat element config
    if (elements.chat?.size?.width) {
        const width = elements.chat.size.width;
        const widthStr = typeof width === 'number' ? `${width}px` : width;
        document.documentElement.style.setProperty('--chat-width', widthStr as string);
    }
}

// ============================================================================
// Token Resolver
// ============================================================================

function resolve_tokens(text: string): string {
    if (!text) return text;

    return text.replace(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)(?::([^}]*))?\}\}/g, (match, tokenName, params) => {
        if (tokenName === 'datetime' || tokenName === 'date' || tokenName === 'time') {
            return format_datetime(new Date(), params || get_default_format(tokenName));
        }
        if (tokenName === 'year') {
            return new Date().getFullYear().toString();
        }
        return match;
    });
}

function get_default_format(tokenName: string): string {
    switch (tokenName) {
        case 'date': return 'MMMM d, yyyy';
        case 'time': return 'HH:mm:ss';
        default: return 'yyyy-MM-dd HH:mm:ss';
    }
}

function format_datetime(date: Date, format: string): string {
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const weekdaysShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const pad = (n: number, len = 2): string => n.toString().padStart(len, '0');
    const ordinal = (n: number): string => {
        const s = ['th', 'st', 'nd', 'rd'];
        const v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };

    const replacements: Record<string, string> = {
        'yyyy': date.getFullYear().toString(),
        'yy': date.getFullYear().toString().slice(-2),
        'MMMM': months[date.getMonth()],
        'MMM': monthsShort[date.getMonth()],
        'MM': pad(date.getMonth() + 1),
        'M': (date.getMonth() + 1).toString(),
        'do': ordinal(date.getDate()),
        'dd': pad(date.getDate()),
        'd': date.getDate().toString(),
        'EEEE': weekdays[date.getDay()],
        'EEE': weekdaysShort[date.getDay()],
        'HH': pad(date.getHours()),
        'H': date.getHours().toString(),
        'hh': pad(date.getHours() % 12 || 12),
        'h': (date.getHours() % 12 || 12).toString(),
        'mm': pad(date.getMinutes()),
        'm': date.getMinutes().toString(),
        'ss': pad(date.getSeconds()),
        's': date.getSeconds().toString(),
        'a': date.getHours() < 12 ? 'AM' : 'PM',
    };

    const sortedKeys = Object.keys(replacements).sort((a, b) => b.length - a.length);

    let result = '';
    let i = 0;
    while (i < format.length) {
        let matched = false;
        for (const key of sortedKeys) {
            if (format.substring(i, i + key.length) === key) {
                result += replacements[key];
                i += key.length;
                matched = true;
                break;
            }
        }
        if (!matched) {
            result += format[i];
            i++;
        }
    }
    return result;
}

// ============================================================================
// Element Configuration
// ============================================================================

function apply_element_config(el: HTMLElement | null, config: ElementConfig | undefined, isTextElement = false): void {
    if (!el) {
        return;
    }

    // If no config exists for this element, hide it
    if (!config) {
        el.style.display = 'none';
        return;
    }

    console.log("[SNEED] Applying config to element:", el.id, config);

    // Handle visibility
    if (config.enabled === false) {
        el.style.display = 'none';
        return;
    } else {
        el.style.display = '';
    }

    // Handle text content for text elements
    if (isTextElement && config.options?.content !== undefined) {
        const content = resolve_tokens(config.options.content as string);
        el.innerHTML = content;
    }

    // Handle positioning
    if (config.position) {
        const pos = config.position;
        const formatPos = (val: number | string | null | undefined): string =>
            typeof val === 'number' ? `${val}px` : (val as string);

        el.style.left = 'auto';
        el.style.right = 'auto';
        el.style.top = 'auto';
        el.style.bottom = 'auto';

        if (pos.x !== null && pos.x !== undefined) {
            el.style.left = formatPos(pos.x);
        }
        if (pos.y !== null && pos.y !== undefined) {
            el.style.top = formatPos(pos.y);
        }
        if (pos.right !== null && pos.right !== undefined) {
            el.style.right = formatPos(pos.right);
        }
        if (pos.bottom !== null && pos.bottom !== undefined) {
            el.style.bottom = formatPos(pos.bottom);
        }
    }

    // Handle sizing
    if (config.size) {
        const size = config.size;

        if (size.width !== null && size.width !== undefined) {
            el.style.width = typeof size.width === 'number' ? `${size.width}px` : size.width as string;
        }
        if (size.height !== null && size.height !== undefined) {
            el.style.height = typeof size.height === 'number' ? `${size.height}px` : size.height as string;
        }
        if (size.maxWidth) {
            el.style.maxWidth = size.maxWidth;
        }
        if (size.maxHeight) {
            el.style.maxHeight = size.maxHeight;
        }
    }

    // Handle custom styles
    if (config.style) {
        const style = config.style;

        if (style.backgroundColor) el.style.backgroundColor = style.backgroundColor;
        if (style.fontSize) el.style.fontSize = style.fontSize;
        if (style.fontFamily) el.style.fontFamily = style.fontFamily;
        if (style.fontWeight) el.style.fontWeight = style.fontWeight;
        if (style.fontStyle) el.style.fontStyle = style.fontStyle;
        if (style.color) el.style.color = style.color;
        if (style.padding) el.style.padding = style.padding;
        if (style.margin) el.style.margin = style.margin;
        if (style.borderRadius) el.style.borderRadius = style.borderRadius;
        if (style.opacity !== null && style.opacity !== undefined) el.style.opacity = style.opacity.toString();
        if (style.transform) el.style.transform = style.transform;
        if (style.zIndex !== null && style.zIndex !== undefined) el.style.zIndex = style.zIndex.toString();
    }
}

// ============================================================================
// Message Handling
// ============================================================================

function filter_badges(messageEl: HTMLElement): void {
    if (!window.badgeSettings) return;

    const badges = messageEl.querySelectorAll('.msg-badge');
    badges.forEach(badge => {
        const match = badge.className.match(/msg-badge--(\w+)/);
        if (match) {
            const type = match[1] as keyof BadgeSettings;
            if (!window.badgeSettings![type]) {
                (badge as HTMLElement).style.display = 'none';
            }
        }
    });
}

function handle_feature_message(id: string | null): void {
    if (!feature_message) return;

    if (id === null) {
        feature_message.innerHTML = "";
    } else {
        const el = document.getElementById(id);
        if (el !== null) {
            const fel = el.cloneNode(true) as HTMLElement;
            fel.id = `feature-${id}`;
            feature_message.innerHTML = fel.outerHTML;
        } else {
            console.log("Featured chat message not found:", id);
        }
    }
}

function handle_message(message: ChatMessage): HTMLElement | null {
    const existingEl = document.getElementById(message.id);
    if (existingEl !== null) {
        return existingEl;
    }

    if (handle_command(message)) {
        return null;
    }

    // Premium messages (superchats) bypass the buffer for immediate display
    if (message.amount > 0) {
        processMessageImmediate(message);
        return null;
    }

    // Regular messages go through the buffer for smooth flow
    messageBuffer.push(message);
    return null;
}

function processMessageImmediate(message: ChatMessage): HTMLElement | null {
    if (!chat_history) return null;

    const existingEl = document.getElementById(message.id);
    if (existingEl !== null) {
        return existingEl;
    }

    let el: HTMLElement = document.createElement("div");
    chat_history.appendChild(el);
    el.outerHTML = message.html;
    el = document.getElementById(message.id) as HTMLElement;

    filter_badges(el);

    if (message.amount > 0) {
        handle_premium(el, message);
    }

    // Remove old messages
    while (chat_history.children.length > 1000) {
        for (let i = 0; i < chat_history.children.length; i++) {
            const child = chat_history.childNodes[i] as HTMLElement;
            if (!child.classList.contains("msg--sticky") && !child.classList.contains("msg--t")) {
                child.remove();
                break;
            }
        }
    }

    // Auto-scroll
    const chatSection = chat_history.parentElement;
    if (chatSection) {
        chatSection.scrollTop = chatSection.scrollHeight;
    }

    return el;
}

function handle_premium(node: HTMLElement, message: ChatMessage): void {
    if (message.currency === 'USD') {
        node.classList.add("msg--sticky");
        recalculate_premium_positions();

        const time = Math.min(600, message.amount * 6);
        setTimeout(() => {
            node.classList.remove("msg--sticky");
            recalculate_premium_positions();
        }, time * 1000);
    }
}

// ============================================================================
// Viewer Handling
// ============================================================================

window.livestream_viewers = {};

function calculate_viewer_count(viewers: ViewerCounts, options: LiveBadgeOptions | undefined): number {
    const mode = options?.platformMode || 'all';
    const platforms = options?.platforms || [];

    let total = 0;
    for (const [platform, count] of Object.entries(viewers)) {
        const platformCount = typeof count === 'number' ? count : parseInt(count as string, 10) || 0;
        if (mode === 'all') {
            total += platformCount;
        } else if (mode === 'include' && platforms.includes(platform)) {
            total += platformCount;
        } else if (mode === 'exclude' && !platforms.includes(platform)) {
            total += platformCount;
        }
    }
    return Math.max(0, total);
}

function handle_viewers(message: ViewerCounts): void {
    console.log("VIEWERS", message);

    for (const [key, value] of Object.entries(message)) {
        window.livestream_viewers[key] = typeof value === 'number' ? value : parseInt(value as string, 10);
    }

    const elements = current_layout?.elements || {};

    for (const [id, config] of Object.entries(elements)) {
        if (id === 'live' || id.startsWith('live-')) {
            const el = document.getElementById(id);
            const totalsEl = el?.querySelector('#live-totals') || document.getElementById('live-totals');

            if (totalsEl && config.enabled !== false) {
                const options = config.options as LiveBadgeOptions | undefined;
                const count = calculate_viewer_count(window.livestream_viewers, options);
                totalsEl.innerHTML = count.toString();
            }
        }
    }

    if (!current_layout || !elements.live) {
        const total = calculate_viewer_count(window.livestream_viewers, undefined);
        const totalsEl = document.getElementById("live-totals");
        if (totalsEl) {
            totalsEl.innerHTML = total.toString();
        }
    }
}

function recalculate_premium_positions(): void {
    const premium_messages = document.getElementsByClassName("msg--sticky");
    let top = 5;
    for (let i = 0; i < premium_messages.length; i++) {
        top += (premium_messages[i] as HTMLElement).offsetHeight + 5;
    }

    let space = document.documentElement.clientHeight / 2;
    if (top > space) {
        top = space - top;
    } else {
        top = 5;
    }

    for (let i = 0; i < premium_messages.length; i++) {
        (premium_messages[i] as HTMLElement).style.top = `${top}px`;
        top += (premium_messages[i] as HTMLElement).scrollHeight + 5;
    }
}

// ============================================================================
// Poll System
// ============================================================================

let active_poll: Poll | null = null;
const poll_ui = document.getElementById("poll-ui");
const superchat_ui = document.getElementById("superchat-ui");

class Poll {
    question: string;
    options: string[];
    votes: number[];
    voters: string[];
    multi_vote: boolean;
    total_votes: number;

    constructor(question: string, multi_vote: boolean, options: string[]) {
        this.question = question;
        this.options = options;
        this.votes = new Array(options.length).fill(0);
        this.voters = [];
        this.multi_vote = multi_vote;
        this.total_votes = 0;

        this.update();
        if (poll_ui) {
            poll_ui.style.display = "block";
            poll_ui.classList.remove("fade-out");
            poll_ui.classList.add("fade-in");
        }
        if (superchat_ui) {
            superchat_ui.classList.add("slide-down");
        }
    }

    end_poll(): void {
        const participants = this.voters.length;
        let html = `<strong>${this.question}</strong><br><small>${participants} participants</small><ul>`;
        let winning_option = 0;

        for (let i = 0; i < this.options.length; i++) {
            if (this.votes[i] > this.votes[winning_option]) {
                winning_option = i;
            }
        }

        for (let i = 0; i < this.options.length; i++) {
            let percentage = 0;
            if (this.total_votes > 0) {
                percentage = (this.votes[i] / this.total_votes) * 100;
            }
            const percentStr = percentage.toFixed(2);
            if (i === winning_option) {
                html += `<li><strong>!vote ${i + 1}: ${this.options[i]} - ${this.votes[i]} (${percentStr}%)</strong></li>`;
            } else {
                html += `<li>!vote ${i + 1}: ${this.options[i]} - ${this.votes[i]} (${percentStr}%)</li>`;
            }
        }

        if (poll_ui) {
            poll_ui.innerHTML = html;
            setTimeout(() => {
                poll_ui.classList.remove("fade-in");
                poll_ui.classList.add("fade-out");
                setTimeout(() => { poll_ui.style.display = "none"; }, 500);
            }, 10000);
        }
        active_poll = null;
    }

    update(): void {
        if (!poll_ui) return;

        const participants = this.voters.length;
        let html = `<strong>${this.question}</strong><br><small>${participants} participants</small><ul>`;
        for (let i = 0; i < this.options.length; i++) {
            let percentage = 0;
            if (this.total_votes > 0) {
                percentage = (this.votes[i] / this.total_votes) * 100;
            }
            html += `<li>!vote ${i + 1}: ${this.options[i]} - ${this.votes[i]} (${percentage.toFixed(2)}%)</li>`;
        }
        html += "</ul><small>use !vote [number] to vote</small>";
        poll_ui.innerHTML = html;
    }

    handle_vote_message(data: ChatMessage): void {
        if (this.voters.includes(data.username)) {
            return;
        }

        const args = data.message.replace("!vote", "").replace("!", "").trim();
        let result = false;

        if (this.multi_vote) {
            let votes = args.split(" ");
            votes = [...new Set(votes)];
            for (const vote of votes) {
                result = this.handle_vote(vote) || result;
            }
        } else {
            result = this.handle_vote(args);
        }

        if (result) {
            this.voters.push(data.username);
            this.update();
        }
    }

    handle_vote(vote_index: string): boolean {
        if (isNaN(parseInt(vote_index))) {
            return false;
        }

        const i = parseInt(vote_index) - 1;
        if (i < 0 || i >= this.options.length) {
            return false;
        }

        this.votes[i]++;
        this.total_votes++;
        return true;
    }

    is_valid_vote(message: string): boolean {
        if (message.startsWith("!vote")) return true;
        if (message.length === 1 && !isNaN(parseInt(message[0]))) return true;
        if (message.startsWith("!") && !isNaN(parseInt(message[1]))) return true;
        return false;
    }
}

// ============================================================================
// Command Handling
// ============================================================================

function handle_command(message: ChatMessage): boolean {
    function unescape(escaped_string: string): string {
        const tmp_div = document.createElement("div");
        tmp_div.innerHTML = escaped_string;
        return tmp_div.textContent || tmp_div.innerText || "";
    }

    if (!message.message.startsWith("!") && active_poll === null) {
        return false;
    }

    let msg = unescape(message.message);
    const is_admin = message.is_owner;

    if (msg.startsWith("!poll") && is_admin) {
        msg = msg.replace("!poll", "").trim();
        let parts = msg.split(";");
        parts = parts.filter(el => el.length !== 0);
        if (parts.length >= 3) {
            active_poll = new Poll(parts[0], false, parts.slice(1));
        }
        return true;
    } else if (msg.startsWith("!multipoll") && is_admin) {
        msg = msg.replace("!multipoll", "").trim();
        let parts = msg.split(";");
        parts = parts.filter(el => el.length !== 0);
        if (parts.length >= 3) {
            active_poll = new Poll(parts[0], true, parts.slice(1));
        }
        return true;
    } else if (msg.startsWith("!endpoll") && is_admin) {
        if (active_poll !== null) {
            active_poll.end_poll();
        }
        return true;
    } else if (active_poll !== null && active_poll.is_valid_vote(message.message)) {
        active_poll.handle_vote_message(message);
        return true;
    }

    return false;
}

// ============================================================================
// Date Display
// ============================================================================

function set_date(dateObj: Date): void {
    const day = dateObj.getDate();
    const month = dateObj.toLocaleString("default", { month: "long" });
    const year = dateObj.getFullYear();

    const nthNumber = (number: number): string => {
        if (number > 3 && number < 21) return "th";
        switch (number % 10) {
            case 1: return "st";
            case 2: return "nd";
            case 3: return "rd";
            default: return "th";
        }
    };

    const date = `${month} ${day}${nthNumber(day)}, ${year}`;
    const el = document.getElementById("date");
    if (el) {
        el.innerHTML = date;
    }
}

set_date(new Date());
