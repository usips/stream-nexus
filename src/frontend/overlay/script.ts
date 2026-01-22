import type {
    Layout,
    ElementConfig,
    ChatMessage,
    WebSocketMessage,
    ViewerCounts,
    BadgeSettings,
    LiveBadgeOptions,
    ChatOptions,
} from '../types';
import { DonationMatter, DonationMatterConfig } from '../background/DonationMatter';

// Matter.js is loaded as an external via script tag
declare const Matter: typeof import('matter-js') | undefined;

// ============================================================================
// DOM Elements
// ============================================================================

const elements_container = document.querySelector<HTMLElement>("#elements-container");

// Track chat containers with their per-element options
interface ChatContainerInfo {
    container: HTMLElement;
    elementId: string;
    options: ChatOptions;
}
let chat_containers: ChatContainerInfo[] = [];

// Track DonationMatter instances
interface MatterInfo {
    instance: DonationMatter;
    elementId: string;
}
let matter_instances: MatterInfo[] = [];

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

        // Check if a pending feature request can now be fulfilled
        checkPendingFeature();
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
        // Subscribe to specific layout if set, otherwise request active layout
        const layoutName = window.LAYOUT_NAME;
        if (layoutName) {
            console.log("[SNEED] Subscribing to layout:", layoutName);
            socket.send(JSON.stringify({ subscribe_layout: layoutName }));
        } else {
            socket.send(JSON.stringify({ request_layout: true }));
        }

        // Request recent messages to sync state (for featuring messages that arrived before we connected)
        console.log("[SNEED] Requesting recent messages");
        socket.send(JSON.stringify({ request_messages: true }));
    });

    socket.addEventListener("message", (event: MessageEvent) => {
        const data: WebSocketMessage = JSON.parse(event.data);
        const message = JSON.parse(data.message);

        switch (data.tag) {
            case "chat_message":
                const chatMsg = message as ChatMessage;
                console.log("[SNEED] Received message:", chatMsg.id, "containers:", chat_containers.length);
                handle_message(chatMsg);
                break;
            case "feature_message":
                console.log("[SNEED] Received feature_message event:", message);
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

        // Update all text/attribution elements
        for (const [elementId, config] of Object.entries(current_layout.elements || {})) {
            const baseType = elementId.replace(/-\d+$/, '');
            if ((baseType === 'text' || baseType === 'attribution') && config.enabled !== false && config.options?.content) {
                const el = document.getElementById(elementId);
                if (el) {
                    el.innerHTML = resolve_tokens(config.options.content as string);
                }
            }
        }
    }, 1000);
}
start_text_updates();

function apply_layout(layout: Layout): void {
    console.log("[SNEED] Applying layout:", layout.name);
    current_layout = layout;

    if (!elements_container) {
        console.error("[SNEED] Elements container not found!");
        return;
    }

    const elements = layout.elements || {};

    // Clean up existing matter instances
    for (const info of matter_instances) {
        info.instance.destroy();
    }
    matter_instances = [];

    // Clear old dynamic elements and reset chat containers
    elements_container.innerHTML = '';
    chat_containers = [];

    // Create/update elements dynamically based on layout config
    console.log("[SNEED] Layout elements:", Object.keys(elements));
    for (const [elementId, config] of Object.entries(elements)) {
        if (!config || config.enabled === false) continue;

        const baseType = elementId.replace(/-\d+$/, ''); // Remove -N suffix to get base type
        console.log("[SNEED] Creating element:", elementId, "type:", baseType);
        const el = create_element_for_type(elementId, baseType, config);
        if (el) {
            elements_container.appendChild(el);
            apply_element_config(el, config, baseType === 'text' || baseType === 'attribution');

            // Track chat containers with per-element options
            if (baseType === 'chat') {
                const messagesContainer = el.querySelector('.chat-messages') as HTMLElement;
                if (messagesContainer) {
                    // Get chat options from element config, falling back to messageStyle for backwards compat
                    const chatOpts = (config.options || {}) as ChatOptions;
                    const ms = layout.messageStyle || {};

                    const options: ChatOptions = {
                        showAvatars: chatOpts.showAvatars ?? ms.showAvatars ?? true,
                        showUsernames: chatOpts.showUsernames ?? ms.showUsernames ?? true,
                        condensedMode: chatOpts.condensedMode ?? ms.condensedMode ?? false,
                        direction: chatOpts.direction ?? ms.direction ?? 'bottom',
                        showOwnerBadge: chatOpts.showOwnerBadge ?? ms.showOwnerBadge ?? true,
                        showStaffBadge: chatOpts.showStaffBadge ?? ms.showStaffBadge ?? true,
                        showModBadge: chatOpts.showModBadge ?? ms.showModBadge ?? true,
                        showVerifiedBadge: chatOpts.showVerifiedBadge ?? ms.showVerifiedBadge ?? true,
                        showSubBadge: chatOpts.showSubBadge ?? ms.showSubBadge ?? true,
                    };

                    chat_containers.push({
                        container: messagesContainer,
                        elementId,
                        options,
                    });

                    // Apply per-element classes
                    el.classList.toggle('chat--condensed', options.condensedMode === true);
                    el.classList.toggle('chat--no-avatars', options.showAvatars === false);
                    el.classList.toggle('chat--no-usernames', options.showUsernames === false);
                    el.classList.toggle('chat--top-first', options.direction === 'top');
                }
            }

            // Initialize DonationMatter for matter elements
            if (baseType === 'matter') {
                // Check if Matter.js is available
                if (typeof Matter !== 'undefined') {
                    try {
                        const matterConfig = (config.options || {}) as Partial<DonationMatterConfig>;
                        const matterInstance = new DonationMatter(el, matterConfig);
                        matterInstance.start();
                        matter_instances.push({
                            instance: matterInstance,
                            elementId,
                        });
                        console.log('[SNEED] DonationMatter initialized for element:', elementId);
                    } catch (e) {
                        console.error('[SNEED] Failed to initialize DonationMatter:', e);
                    }
                } else {
                    console.warn('[SNEED] Matter.js not loaded, cannot initialize DonationMatter');
                }
            }
        }
    }

    // Apply global message styling via CSS custom properties (for sizing, etc.)
    if (layout.messageStyle) {
        const ms = layout.messageStyle;
        const root = document.documentElement;

        if (ms.avatarSize) root.style.setProperty('--avatar-size', ms.avatarSize);
        if (ms.maxHeight) root.style.setProperty('--message-max-height', ms.maxHeight);
        if (ms.borderRadius) root.style.setProperty('--message-border-radius', ms.borderRadius);
        if (ms.fontSize) root.style.setProperty('--message-font-size', ms.fontSize);
        if (ms.backgroundColor) root.style.setProperty('--message-bg', ms.backgroundColor);
        if (ms.textColor) root.style.setProperty('--message-color', ms.textColor);

        // Store default badge visibility settings (can be overridden per-element)
        window.badgeSettings = {
            owner: ms.showOwnerBadge !== false,
            staff: ms.showStaffBadge !== false,
            mod: ms.showModBadge !== false,
            verified: ms.showVerifiedBadge !== false,
            sub: ms.showSubBadge !== false,
        };
    }

    // Update chat width CSS variable from first chat element config
    const firstChatConfig = Object.entries(elements).find(([id]) => id === 'chat' || id.startsWith('chat-'))?.[1];
    if (firstChatConfig?.size?.width) {
        const width = firstChatConfig.size.width;
        const widthStr = typeof width === 'number' ? `${width}px` : width;
        document.documentElement.style.setProperty('--chat-width', widthStr as string);
    }
}

// Create DOM element for a specific element type
function create_element_for_type(elementId: string, baseType: string, config: ElementConfig): HTMLElement | null {
    const el = document.createElement('section');
    el.id = elementId;
    el.className = `element element--${baseType}`;

    switch (baseType) {
        case 'chat':
            el.innerHTML = `
                <div class="chat-messages"></div>
                <div class="flyout">
                    <div class="poll-ui"></div>
                    <div class="superchat-ui"></div>
                </div>
            `;
            break;

        case 'live':
            const options = config.options as LiveBadgeOptions | undefined;
            const showIcon = options?.showIcon === true;
            const showLabel = options?.showLabel !== false;
            const showCount = options?.showCount !== false;
            el.innerHTML = `
                ${showIcon ? '<span class="live-icon live-badge">📺</span>' : ''}
                ${showLabel ? '<span class="live-label live-badge">LIVE</span>' : ''}
                ${showCount ? '<span class="live-totals live-badge">0</span>' : ''}
            `;
            break;

        case 'text':
        case 'attribution':
            const content = (config.options?.content as string) || '';
            el.innerHTML = resolve_tokens(content);
            break;

        case 'featured':
            // Featured message container - content is set dynamically
            el.className += ' show-message';
            break;

        case 'poll':
            el.className += ' poll-ui';
            break;

        case 'superchat':
            el.className += ' superchat-ui';
            break;

        case 'matter':
            // Matter element is a container for the physics canvas
            // DonationMatter will be initialized after the element is added to DOM
            el.style.overflow = 'hidden';
            break;

        default:
            console.warn(`[SNEED] Unknown element type: ${baseType}`);
            return null;
    }

    return el;
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

// Store pending feature request if message isn't in DOM yet
let pendingFeatureId: string | null = null;

function handle_feature_message(id: string | null): void {
    // Find all layout-created featured elements
    const featured_elements = document.querySelectorAll<HTMLElement>('.element--featured');
    console.log("[SNEED] handle_feature_message:", id, "featured_elements:", featured_elements.length);

    if (featured_elements.length === 0) {
        console.log("[SNEED] No .element--featured elements found in layout");
        // Log all elements to help debug
        const allElements = document.querySelectorAll('.element');
        console.log("[SNEED] All .element classes:", Array.from(allElements).map(e => e.className));
        return;
    }

    if (id === null) {
        // Clear all featured elements
        pendingFeatureId = null;
        featured_elements.forEach(el => el.innerHTML = "");
        console.log("[SNEED] Cleared featured message");
    } else {
        const sourceEl = document.getElementById(id);
        console.log("[SNEED] Looking for message ID:", id, "found:", sourceEl !== null);

        if (sourceEl !== null) {
            const cloned = sourceEl.cloneNode(true) as HTMLElement;
            cloned.id = `feature-${id}`;
            const content = cloned.outerHTML;
            // Update all featured elements with the same content
            featured_elements.forEach(el => {
                el.innerHTML = content;
                console.log("[SNEED] Set featured element content, innerHTML length:", el.innerHTML.length);
            });
            pendingFeatureId = null;
            console.log("[SNEED] Featured message:", id);
        } else {
            // Message might be in buffer, store for later
            pendingFeatureId = id;
            console.log("[SNEED] Featured message not found yet, waiting for buffer:", id);
            // Log existing message IDs to help debug
            const allMsgs = document.querySelectorAll('.msg');
            console.log("[SNEED] Existing message IDs:", Array.from(allMsgs).slice(0, 10).map(m => m.id));
        }
    }
}

// Check if a pending feature can be applied (called after processing buffered messages)
function checkPendingFeature(): void {
    if (pendingFeatureId) {
        const sourceEl = document.getElementById(pendingFeatureId);
        if (sourceEl) {
            handle_feature_message(pendingFeatureId);
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

// Filter badges based on per-element options
function filter_badges_with_options(messageEl: HTMLElement, options: ChatOptions): void {
    const badges = messageEl.querySelectorAll('.msg-badge');
    badges.forEach(badge => {
        const match = badge.className.match(/msg-badge--(\w+)/);
        if (match) {
            const type = match[1];
            let show = true;
            if (type === 'owner') show = options.showOwnerBadge !== false;
            else if (type === 'staff') show = options.showStaffBadge !== false;
            else if (type === 'mod') show = options.showModBadge !== false;
            else if (type === 'verified') show = options.showVerifiedBadge !== false;
            else if (type === 'sub') show = options.showSubBadge !== false;

            if (!show) {
                (badge as HTMLElement).style.display = 'none';
            }
        }
    });
}

function processMessageImmediate(message: ChatMessage): HTMLElement | null {
    // Check if message already exists anywhere
    const existingEl = document.getElementById(message.id);
    if (existingEl !== null) {
        return existingEl;
    }

    // If no chat containers, nothing to do
    if (chat_containers.length === 0) {
        return null;
    }

    let firstEl: HTMLElement | null = null;

    // Add message to each chat container with per-element options
    for (let i = 0; i < chat_containers.length; i++) {
        const { container, options } = chat_containers[i];

        // Per-element direction
        const isTopFirst = options.direction === 'top';

        // Process message HTML with per-element username visibility
        let messageHtml = message.html;
        if (options.showUsernames === false) {
            messageHtml = messageHtml.replace('class="msg', 'class="msg msg--hide-username');
        }

        const el = document.createElement("div");

        // Always append to end - CSS flex-direction handles visual order
        container.appendChild(el);

        // Use a unique ID for each instance (original ID for first, suffixed for others)
        const instanceId = i === 0 ? message.id : `${message.id}-${i}`;
        el.outerHTML = messageHtml.replace(`id="${message.id}"`, `id="${instanceId}"`);

        const insertedEl = document.getElementById(instanceId) as HTMLElement;
        if (insertedEl) {
            // Use per-element badge options
            filter_badges_with_options(insertedEl, options);

            if (i === 0) {
                firstEl = insertedEl;
                if (message.amount > 0) {
                    handle_premium(insertedEl, message);
                }
            }
        }

        // Remove old messages from beginning (oldest first in DOM)
        // Keep limit low (150) to prevent memory issues in long-running overlay tabs
        const maxMessages = 150;
        if (container.children.length > maxMessages) {
            const toRemove: HTMLElement[] = [];
            for (let i = 0; i < container.children.length - maxMessages; i++) {
                const child = container.children[i] as HTMLElement;
                // Don't remove sticky or premium messages
                if (!child.classList.contains("msg--sticky") && !child.classList.contains("msg--t")) {
                    toRemove.push(child);
                }
            }
            // Remove in batch to avoid live collection issues
            for (const el of toRemove) {
                el.remove();
            }
        }

        // Auto-scroll to show newest messages
        const chatSection = container.parentElement;
        if (chatSection) {
            if (isTopFirst) {
                // column-reverse: newest at top, scroll to top
                chatSection.scrollTop = 0;
            } else {
                // column: newest at bottom, scroll to bottom
                chatSection.scrollTop = chatSection.scrollHeight;
            }
        }
    }

    return firstEl;
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

        // Spawn objects in all matter instances for donations
        for (const info of matter_instances) {
            info.instance.handleDonation(message.amount, message.username);
        }
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

    // Update all live elements (live, live-1, live-2, etc.)
    for (const [id, config] of Object.entries(elements)) {
        const baseType = id.replace(/-\d+$/, '');
        if (baseType === 'live' && config.enabled !== false) {
            const el = document.getElementById(id);
            const totalsEl = el?.querySelector('.live-totals');

            if (totalsEl) {
                const options = config.options as LiveBadgeOptions | undefined;
                const count = calculate_viewer_count(window.livestream_viewers, options);
                totalsEl.innerHTML = count.toString();
            }
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
