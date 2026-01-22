import type { ChatMessage, WebSocketMessage, ViewerCounts } from '../types';

// ============================================================================
// DOM Elements
// ============================================================================

const chatHistory = document.querySelector<HTMLElement>("#chat-history");
const donationHistory = document.querySelector<HTMLElement>("#donation-history");
const connectionStatus = document.querySelector<HTMLElement>("#connection-status");

// ============================================================================
// State
// ============================================================================

// Track if user has scrolled up (disable auto-scroll)
let chatAutoScroll = true;
let donationAutoScroll = true;

// Track featured message IDs
const featuredMessageIds = new Set<string>();

// ============================================================================
// Auto-scroll Management
// ============================================================================

function setupScrollListener(container: HTMLElement | null, setAutoScroll: (val: boolean) => void): void {
    if (!container) return;

    container.addEventListener('scroll', () => {
        const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 50;
        setAutoScroll(isAtBottom);
    });
}

function scrollToBottom(container: HTMLElement | null, autoScroll: boolean): void {
    if (!container || !autoScroll) return;
    container.scrollTop = container.scrollHeight;
}

// Initialize scroll listeners
setupScrollListener(chatHistory, (val) => { chatAutoScroll = val; });
setupScrollListener(donationHistory, (val) => { donationAutoScroll = val; });

// ============================================================================
// Relative Time Formatting
// ============================================================================

function formatRelativeTime(timestamp: number): string {
    const now = Math.floor(Date.now() / 1000);
    const diff = now - timestamp;

    if (diff < 60) {
        return 'just now';
    } else if (diff < 3600) {
        const mins = Math.floor(diff / 60);
        return `${mins}m ago`;
    } else if (diff < 86400) {
        const hours = Math.floor(diff / 3600);
        const mins = Math.floor((diff % 3600) / 60);
        return mins > 0 ? `${hours}h ${mins}m ago` : `${hours}h ago`;
    } else {
        const days = Math.floor(diff / 86400);
        const hours = Math.floor((diff % 86400) / 3600);
        return hours > 0 ? `${days}d ${hours}h ago` : `${days}d ago`;
    }
}

function updateRelativeTimes(): void {
    document.querySelectorAll<HTMLElement>('[data-timestamp]').forEach((el) => {
        const timestamp = parseInt(el.dataset.timestamp || '0', 10);
        if (timestamp > 0) {
            el.textContent = formatRelativeTime(timestamp);
        }
    });
}

// Update relative times every 30 seconds
setInterval(updateRelativeTimes, 30000);

// ============================================================================
// Chat Message Class
// ============================================================================

class DashboardChatMessage implements ChatMessage {
    id: string;
    platform: string;
    channel: string;
    sent_at: number;
    received_at: number;
    message: string;
    html: string;
    emojis: string[];
    username: string;
    avatar: string;
    amount: number;
    currency: string;
    is_placeholder: boolean;
    is_verified: boolean;
    is_sub: boolean;
    is_mod: boolean;
    is_owner: boolean;
    is_staff: boolean;

    constructor(id: string, platform: string, channel: string) {
        this.id = id;
        this.platform = platform;
        this.channel = channel;
        this.sent_at = Math.round(Date.now() / 1000);
        this.received_at = Math.round(Date.now() / 1000);
        this.message = "";
        this.html = "";
        this.emojis = [];
        this.username = "DUMMY_USER";
        this.avatar = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
        this.amount = 0;
        this.currency = "ZWL";
        this.is_placeholder = false;
        this.is_verified = false;
        this.is_sub = false;
        this.is_mod = false;
        this.is_owner = false;
        this.is_staff = false;
    }
}

// ============================================================================
// WebSocket Connection
// ============================================================================

const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${wsProtocol}//${window.location.host}/chat.ws`;

let socket: WebSocket | null = null;

function updateConnectionStatus(connected: boolean): void {
    if (connectionStatus) {
        connectionStatus.classList.toggle('connected', connected);
        connectionStatus.textContent = connected ? 'Connected' : 'Disconnected';
    }
}

(function () {
    socket = new WebSocket(wsUrl);

    const reconnect = (): boolean => {
        if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
            return true;
        }
        socket = new WebSocket(wsUrl);
        bindEvents();
        return false;
    };

    const bindEvents = (): void => {
        if (!socket) return;

        socket.addEventListener("open", () => {
            console.log("[Dashboard] Connection established.");
            updateConnectionStatus(true);
        });

        socket.addEventListener("message", (event: MessageEvent) => {
            const data: WebSocketMessage = JSON.parse(event.data);
            const message = JSON.parse(data.message);

            switch (data.tag) {
                case "chat_message":
                    handleMessage(message as ChatMessage);
                    break;
                case "feature_message":
                    handleFeatureMessage(message as string | null);
                    break;
                case "viewers":
                    handleViewers(message as ViewerCounts);
                    break;
                default:
                    console.log("Unknown tag:", data.tag);
                    break;
            }
        });

        socket.addEventListener("close", (event: CloseEvent) => {
            console.log("[Dashboard] Socket closed. Attempting reconnect.", event.reason);
            updateConnectionStatus(false);
            setTimeout(() => { reconnect(); }, 3000);
        });

        socket.addEventListener("error", () => {
            socket?.close();
            updateConnectionStatus(false);
            setTimeout(() => { reconnect(); }, 3000);
        });
    };

    bindEvents();
})();

// ============================================================================
// Poll UI Functions
// ============================================================================

function newPollOption(count = 1): void {
    const pollOptions = document.querySelector<HTMLElement>("#poll-options");
    if (!pollOptions) return;

    for (let i = 0; i < count; i++) {
        const opt = document.createElement("input");
        opt.setAttribute("type", "text");
        opt.setAttribute("placeholder", "Poll option");
        opt.setAttribute("class", "poll-option");
        opt.addEventListener("keydown", onPollOptionType);
        opt.addEventListener("blur", onPollOptionChange);
        pollOptions.appendChild(opt);
    }
}

function onPollOptionType(_event: KeyboardEvent): void {
    const pollOptions = document.querySelectorAll<HTMLInputElement>(".poll-option");

    if (pollOptions.length >= 15) {
        return;
    }

    const lastOption = pollOptions[pollOptions.length - 1];
    if (lastOption && lastOption.value !== "") {
        newPollOption();
    }
}

function onPollOptionChange(event: FocusEvent): void {
    const pollOptions = document.querySelectorAll<HTMLInputElement>(".poll-option");

    if (pollOptions.length <= 2) {
        return;
    }

    const target = event.target as HTMLInputElement;
    if (target.value === "") {
        target.remove();
    }
}

function clearPoll(): void {
    const pollQuestion = document.getElementById("pollquestion") as HTMLInputElement | null;
    if (pollQuestion) {
        pollQuestion.value = "";
    }

    document.querySelectorAll(".poll-option").forEach((opt) => {
        opt.remove();
    });
    newPollOption(2);
}

function onPollCreate(): void {
    const multipleChoice = document.getElementById("multiplechoice") as HTMLInputElement | null;
    const pollQuestion = document.getElementById("pollquestion") as HTMLInputElement | null;

    const pollType = multipleChoice?.checked ? "multipoll" : "poll";
    const pollOptions = document.querySelectorAll<HTMLInputElement>(".poll-option");
    const options: string[] = [];
    const questionText = pollQuestion?.value || "";

    pollOptions.forEach((option) => {
        if (option.value !== "") {
            options.push(option.value);
        }
    });

    if (options.length < 2) {
        alert("You need at least two poll options.");
        return;
    }

    if (questionText === "") {
        alert("You need a poll question.");
        return;
    }

    const pollCommand = `!${pollType} ${questionText}; ${options.join("; ")}`;
    sendSimpleMessage(pollCommand);

    clearPoll();
}

function onPollEnd(): void {
    sendSimpleMessage("!endpoll", true);
}

// ============================================================================
// Message Handling
// ============================================================================

function onClickMessage(this: HTMLElement): void {
    const id = this.id;

    if (this.classList.contains("msg--sticky")) {
        // Unfeature
        sendFeatureMessage(null);
    } else {
        // Feature this message
        sendFeatureMessage(id);
        // Track that this message was featured
        featuredMessageIds.add(id);
        this.classList.add("msg--was-featured");
    }
}

function sendFeatureMessage(id: string | null): void {
    console.log("Featuring message:", id);
    const message = { "feature_message": id };
    socket?.send(JSON.stringify(message));
}

function uuidv4(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function sendMessage(msg: ChatMessage): void {
    const data = { "platform": "none", "messages": [msg] };
    socket?.send(JSON.stringify(data));
}

function sendPaidMessage(): void {
    const msg = new DashboardChatMessage(uuidv4(), "none", "none");
    const platformEl = document.getElementById("donation-platform") as HTMLSelectElement | null;
    const usernameEl = document.getElementById("donation-username") as HTMLInputElement | null;
    const amountEl = document.getElementById("donation-amount") as HTMLInputElement | null;
    const currencyEl = document.getElementById("donation-currency") as HTMLSelectElement | null;
    const messageEl = document.getElementById("donation-message") as HTMLInputElement | null;

    msg.platform = platformEl?.value || "none";
    msg.username = usernameEl?.value || "Anonymous";
    msg.amount = parseFloat(amountEl?.value || "0");
    msg.currency = currencyEl?.value || "USD";
    msg.message = messageEl?.value || "";

    switch (msg.platform) {
        case "mail":
        case "usps":
            msg.avatar = "/static/logo/usps.png";
            break;
    }

    sendMessage(msg);
}

function sendSimpleMessage(text: string, isOwner = false): void {
    const msg = new DashboardChatMessage(uuidv4(), "none", "none");
    msg.message = text;
    msg.is_owner = isOwner;
    sendMessage(msg);
}

function handleFeatureMessage(id: string | null): void {
    // Remove sticky from all messages
    document.querySelectorAll(".msg--sticky").forEach((msg) => {
        msg.classList.remove("msg--sticky");
    });

    if (id) {
        const featuredMessage = document.getElementById(id);
        if (featuredMessage !== null) {
            featuredMessage.classList.add("msg--sticky");
            // Track as featured
            featuredMessageIds.add(id);
            featuredMessage.classList.add("msg--was-featured");
        }
    }
}

function handleMessage(message: ChatMessage): HTMLElement | null {
    if (message.is_placeholder) {
        return null;
    }

    const existingEl = document.getElementById(message.id);
    if (existingEl !== null) {
        return existingEl;
    }

    const el: HTMLElement = document.createElement("div");

    if (message.amount > 0) {
        // Superchat/donation
        if (donationHistory) {
            donationHistory.appendChild(el);
            el.outerHTML = message.html;

            // Add relative timestamp to the new element
            const newEl = document.getElementById(message.id);
            if (newEl) {
                addTimestampToSuperchat(newEl, message.sent_at);
                newEl.addEventListener("click", onClickMessage);

                // Check if this was previously featured
                if (featuredMessageIds.has(message.id)) {
                    newEl.classList.add("msg--was-featured");
                }
            }

            // Scroll to bottom if auto-scroll is enabled
            scrollToBottom(donationHistory, donationAutoScroll);

            return newEl || null;
        }
    } else {
        // Regular chat message
        if (chatHistory) {
            chatHistory.appendChild(el);
            el.outerHTML = message.html;

            // Limit chat history
            while (chatHistory.children.length > 500) {
                const child = chatHistory.firstElementChild;
                if (child && !child.classList.contains("msg--sticky")) {
                    child.remove();
                } else {
                    break;
                }
            }

            const newEl = document.getElementById(message.id);
            if (newEl) {
                newEl.addEventListener("click", onClickMessage);

                // Check if this was previously featured
                if (featuredMessageIds.has(message.id)) {
                    newEl.classList.add("msg--was-featured");
                }
            }

            // Scroll to bottom if auto-scroll is enabled
            scrollToBottom(chatHistory, chatAutoScroll);

            return newEl || null;
        }
    }

    return null;
}

function addTimestampToSuperchat(el: HTMLElement, timestamp: number): void {
    // Create timestamp element
    const timeEl = document.createElement("span");
    timeEl.className = "superchat-time";
    timeEl.dataset.timestamp = timestamp.toString();
    timeEl.textContent = formatRelativeTime(timestamp);

    // Insert after the amount element (on the second row)
    const amountEl = el.querySelector(".msg-amount");
    if (amountEl) {
        amountEl.appendChild(timeEl);
    } else {
        // Fallback: insert at start of container
        const container = el.querySelector(".msg-container") || el;
        container.insertBefore(timeEl, container.firstChild);
    }
}

function handleViewers(_message: ViewerCounts): void {
    // Could display viewer counts in dashboard header
}

// ============================================================================
// Initialize Event Listeners
// ============================================================================

// Add click listeners to any existing messages
document.querySelectorAll<HTMLElement>(".msg").forEach((el) => {
    el.addEventListener("click", onClickMessage);

    // Add timestamps to existing superchats
    if (el.closest("#donation-history")) {
        const timestamp = parseInt(el.dataset.sentAt || '0', 10) || Math.floor(Date.now() / 1000);
        addTimestampToSuperchat(el, timestamp);
    }
});

// Initialize poll options
document.querySelectorAll<HTMLInputElement>(".poll-option").forEach((opt) => {
    opt.addEventListener("keydown", onPollOptionType);
    opt.addEventListener("blur", onPollOptionChange);
});

// ============================================================================
// Export functions for HTML onclick handlers
// ============================================================================

declare global {
    interface Window {
        newPollOption: typeof newPollOption;
        onPollOptionType: typeof onPollOptionType;
        onPollOptionChange: typeof onPollOptionChange;
        onPollCreate: typeof onPollCreate;
        onPollEnd: typeof onPollEnd;
        sendPaidMessage: typeof sendPaidMessage;
        sendSimpleMessage: typeof sendSimpleMessage;
    }
}

window.newPollOption = newPollOption;
window.onPollOptionType = onPollOptionType;
window.onPollOptionChange = onPollOptionChange;
window.onPollCreate = onPollCreate;
window.onPollEnd = onPollEnd;
window.sendPaidMessage = sendPaidMessage;
window.sendSimpleMessage = sendSimpleMessage;
