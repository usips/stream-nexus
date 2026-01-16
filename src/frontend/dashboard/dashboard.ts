import type { ChatMessage, WebSocketMessage, ViewerCounts } from '../types';

// ============================================================================
// DOM Elements
// ============================================================================

const chat_history = document.querySelector<HTMLElement>("#chat-history");
const donation_history = document.querySelector<HTMLElement>("#donation-history");

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
            console.log("[SNEED] Connection established.");
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
                default:
                    console.log("Unknown tag:", data.tag);
                    break;
            }
        });

        socket.addEventListener("close", (event: CloseEvent) => {
            console.log("[SNEED] Socket has closed. Attempting reconnect.", event.reason);
            setTimeout(() => { reconnect(); }, 3000);
        });

        socket.addEventListener("error", () => {
            socket?.close();
            setTimeout(() => { reconnect(); }, 3000);
        });
    };

    bindEvents();
})();

// ============================================================================
// Poll UI Functions
// ============================================================================

function new_poll_option(count = 1): void {
    const poll_options = document.querySelector<HTMLElement>("#poll-options");
    if (!poll_options) return;

    for (let i = 0; i < count; i++) {
        const opt = document.createElement("input");
        opt.setAttribute("type", "text");
        opt.setAttribute("placeholder", "Poll option");
        opt.setAttribute("class", "poll-option");
        opt.setAttribute("onkeydown", "on_poll_option_type(event)");
        opt.setAttribute("onblur", "on_poll_option_change(event)");
        poll_options.appendChild(opt);
    }
}

function on_poll_option_type(_event: KeyboardEvent): void {
    const poll_options = document.querySelectorAll<HTMLInputElement>(".poll-option");

    if (poll_options.length >= 15) {
        return;
    }

    const last_option = poll_options[poll_options.length - 1];
    if (last_option && last_option.value !== "") {
        new_poll_option();
    }
}

function on_poll_option_change(event: FocusEvent): void {
    const poll_options = document.querySelectorAll<HTMLInputElement>(".poll-option");

    if (poll_options.length <= 2) {
        return;
    }

    const target = event.target as HTMLInputElement;
    if (target.value === "") {
        target.remove();
    }
}

function clear_poll(): void {
    const pollquestion = document.getElementById("pollquestion") as HTMLInputElement | null;
    if (pollquestion) {
        pollquestion.value = "";
    }

    document.querySelectorAll(".poll-option").forEach((opt) => {
        opt.remove();
    });
    new_poll_option(2);
}

function on_poll_create(): void {
    const multiplechoice = document.getElementById("multiplechoice") as HTMLInputElement | null;
    const pollquestion = document.getElementById("pollquestion") as HTMLInputElement | null;

    const poll_type = multiplechoice?.checked ? "multipoll" : "poll";
    const poll_options = document.querySelectorAll<HTMLInputElement>(".poll-option");
    const options: string[] = [];
    const poll_question = pollquestion?.value || "";

    poll_options.forEach((option) => {
        if (option.value !== "") {
            options.push(option.value);
        }
    });

    if (options.length < 2) {
        alert("You need at least two poll options.");
        return;
    }

    if (poll_question === "") {
        alert("You need a poll question.");
        return;
    }

    const poll_command = `!${poll_type} ${poll_question}; ${options.join("; ")}`;
    send_simple_message(poll_command);

    clear_poll();
}

function on_poll_end(): void {
    send_simple_message("!endpoll", true);
}

// ============================================================================
// Message Handling
// ============================================================================

function on_click_message(this: HTMLElement): void {
    if (this.classList.contains("msg--sticky")) {
        send_feature_message(null);
    } else {
        send_feature_message(this.id);
    }
}

function send_feature_message(id: string | null): void {
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

function send_message(msg: ChatMessage): void {
    const data = { "platform": "none", "messages": [msg] };
    socket?.send(JSON.stringify(data));
}

function send_paid_message(): void {
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

    send_message(msg);
}

function send_simple_message(text: string, is_owner = false): void {
    const msg = new DashboardChatMessage(uuidv4(), "none", "none");
    msg.message = text;
    msg.is_owner = is_owner;
    send_message(msg);
}

function handle_feature_message(id: string | null): void {
    const sticky_messages = document.querySelectorAll(".msg--sticky");
    sticky_messages.forEach((msg) => {
        msg.classList.remove("msg--sticky");
    });

    if (id) {
        const featured_message = document.getElementById(id);
        if (featured_message !== null) {
            featured_message.classList.add("msg--sticky");
        }
    }
}

function handle_message(message: ChatMessage): HTMLElement | null {
    if (message.is_placeholder) {
        return null;
    }

    const existingEl = document.getElementById(message.id);
    if (existingEl !== null) {
        return existingEl;
    }

    let el: HTMLElement = document.createElement("div");

    if (message.amount > 0) {
        if (donation_history) {
            donation_history.appendChild(el);
            el.outerHTML = message.html;
        }
    } else {
        if (chat_history) {
            chat_history.appendChild(el);
            el.outerHTML = message.html;

            while (chat_history.children.length > 1000) {
                for (let i = 0; i < chat_history.children.length; i++) {
                    const child = chat_history.childNodes[i] as HTMLElement;
                    if (!child.classList.contains("msg--sticky")) {
                        child.remove();
                        break;
                    }
                }
            }
        }
    }

    const newEl = document.getElementById(message.id);
    if (newEl) {
        newEl.addEventListener("click", on_click_message);
    }

    return newEl;
}

function handle_viewers(_message: ViewerCounts): void {
    // Do nothing in dashboard
}

// ============================================================================
// Initialize Event Listeners
// ============================================================================

document.querySelectorAll<HTMLElement>(".msg").forEach((el) => {
    el.addEventListener("click", on_click_message);
});

// Export functions for HTML onclick handlers
declare global {
    interface Window {
        new_poll_option: typeof new_poll_option;
        on_poll_option_type: typeof on_poll_option_type;
        on_poll_option_change: typeof on_poll_option_change;
        on_poll_create: typeof on_poll_create;
        on_poll_end: typeof on_poll_end;
        send_paid_message: typeof send_paid_message;
        send_simple_message: typeof send_simple_message;
    }
}

window.new_poll_option = new_poll_option;
window.on_poll_option_type = on_poll_option_type;
window.on_poll_option_change = on_poll_option_change;
window.on_poll_create = on_poll_create;
window.on_poll_end = on_poll_end;
window.send_paid_message = send_paid_message;
window.send_simple_message = send_simple_message;
