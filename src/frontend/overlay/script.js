const chat_history = document.querySelector("#chat-messages");
const feature_message = document.querySelector("#show-message");

// Current layout state
let current_layout = null;

// ============================================================================
// Message Buffer System
// Smooths out message delivery to prevent jarring bursts from platforms like
// YouTube and Twitch that send messages in batches.
// ============================================================================

const messageBuffer = {
    queue: [],
    maxWaitTime: 1000, // Maximum time any message can wait (ms) - 1 second
    minInterval: 50,   // Minimum interval between messages (ms)
    intervalId: null,
    lastProcessTime: 0,

    // Add a message to the buffer
    push(message) {
        this.queue.push({
            message,
            timestamp: Date.now()
        });
        this.ensureProcessing();
    },

    // Start processing if not already running
    ensureProcessing() {
        if (this.intervalId === null && this.queue.length > 0) {
            this.scheduleNext();
        }
    },

    // Calculate how many messages should be processed right now
    getProcessCount() {
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
    getDelay() {
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
    scheduleNext() {
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
    processBatch() {
        if (this.queue.length === 0) return;

        const count = this.getProcessCount();
        for (let i = 0; i < count && this.queue.length > 0; i++) {
            const item = this.queue.shift();
            processMessageImmediate(item.message);
        }
        this.lastProcessTime = Date.now();
    },

    // Called when tab visibility changes - process all overdue messages immediately
    onVisibilityChange() {
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

// Create WebSocket connection using current host
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${wsProtocol}//${window.location.host}/chat.ws`;

let socket = new WebSocket(wsUrl);
const reconnect = () => {
    // check if socket is connected
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        return true;
    }
    // attempt to connect
    socket = new WebSocket(wsUrl);
    bindWebsocketEvents(socket);
};

// Connection opened
const bindWebsocketEvents = () => {
    socket.addEventListener("open", (event) => {
        console.log("[SNEED] Connection established.");
        // Request current layout on connection
        socket.send(JSON.stringify({ request_layout: true }));
    });

    // Listen for messages
    socket.addEventListener("message", (event) => {
        const data = JSON.parse(event.data);
        const message = JSON.parse(data.message);
        switch (data.tag) {
            case "chat_message":
                handle_message(message);
                break;
            case "feature_message":
                handle_feature_message(message);
                break;
            case "viewers":
                handle_viewers(message);
                break;
            case "layout_update":
                apply_layout(message);
                break;
            case "layout_list":
                console.log("[SNEED] Available layouts:", message);
                break;
            default:
                console.log("Unknown tag:", data.tag);
                break;

        }
    });

    socket.addEventListener("close", (event) => {
        console.log("[SNEED] Socket has closed. Attempting reconnect.", event.reason);
        setTimeout(function () { reconnect(); }, 1000);
    });

    socket.addEventListener("error", (event) => {
        socket.close();
        setTimeout(function () { reconnect(); }, 1000);
    });
};

bindWebsocketEvents(socket);

// ============================================================================
// Layout Application
// ============================================================================

function apply_layout(layout) {
    console.log("[SNEED] Applying layout:", layout.name);
    current_layout = layout;

    const elements = layout.elements || {};

    // Apply each element's configuration
    apply_element_config(document.getElementById("chat"), elements.chat);
    apply_element_config(document.getElementById("live"), elements.live);
    apply_element_config(document.getElementById("attribution"), elements.attribution);
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
    }

    // Update chat width CSS variable from chat element config
    if (elements.chat && elements.chat.size && elements.chat.size.width) {
        const width = elements.chat.size.width;
        const widthStr = typeof width === 'number' ? `${width}px` : width;
        document.documentElement.style.setProperty('--chat-width', widthStr);
    }
}

function apply_element_config(el, config) {
    if (!el || !config) {
        console.log("[SNEED] apply_element_config: missing el or config", el?.id, config);
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

    // Handle positioning
    if (config.position) {
        const pos = config.position;

        // Reset positioning first - use 'auto' to override CSS defaults
        el.style.left = 'auto';
        el.style.right = 'auto';
        el.style.top = 'auto';
        el.style.bottom = 'auto';

        // Helper to format position value (preserve vw/vh/% units, add px to numbers)
        const formatPos = (val) => typeof val === 'number' ? `${val}px` : val;

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
            el.style.width = typeof size.width === 'number' ? `${size.width}px` : size.width;
        }
        if (size.height !== null && size.height !== undefined) {
            el.style.height = typeof size.height === 'number' ? `${size.height}px` : size.height;
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
        if (style.opacity !== null && style.opacity !== undefined) el.style.opacity = style.opacity;
        if (style.transform) el.style.transform = style.transform;
        if (style.zIndex !== null && style.zIndex !== undefined) el.style.zIndex = style.zIndex;
    }
}

function handle_emote(node, message) {
    const innerEl = node.getElementsByClassName("msg-text")[0];
    let allImages = false;

    innerEl.children.forEach(el => {
        if (el.tagName !== "IMG") {
            allImages = false;
            return false;
        }
    });

    if (allImages) {
        node.classList.add("msg--emote");
    }


}

function handle_feature_message(id) {
    // Check if message is a set or unset.
    if (id === null) {
        feature_message.innerHTML = "";
    }
    else {
        let el = document.getElementById(id);
        if (el !== null) {
            let fel = el.cloneNode(true);
            fel.id = `feature-${id}`;
            feature_message.innerHTML = fel.outerHTML;
            console.log("SET!!!");
        }
        else {
            console.log("Featured chat message not found:", id);
        }
    }
}

function handle_message(message) {
    // check if element already exists
    const existingEl = document.getElementById(message.id);
    if (existingEl !== null) {
        return existingEl;
    }

    // check if message is a command
    if (handle_command(message)) {
        // consume message if it is a command.
        return null;
    }

    // Premium messages (superchats) bypass the buffer for immediate display
    if (message.amount > 0) {
        processMessageImmediate(message);
        return;
    }

    // Regular messages go through the buffer for smooth flow
    messageBuffer.push(message);
}

// Actually process and display a message (called by buffer or directly for premium)
function processMessageImmediate(message) {
    // Double-check it wasn't already added while in buffer
    const existingEl = document.getElementById(message.id);
    if (existingEl !== null) {
        return existingEl;
    }

    // create message el
    let el = document.createElement("div");
    chat_history.appendChild(el);
    el.outerHTML = message.html;
    el = document.getElementById(message.id);

    // apply premium style
    if (message.amount > 0)
        handle_premium(el, message);
    // crush standard emote replies
    //else
    //    handle_emote(el, message);

    // remove first old message that is not sticky.
    while (chat_history.children.length > 1000) {
        for (let i = 0; i < chat_history.children.length; i++) {
            let classes = chat_history.childNodes[i].classList;
            if (!classes.contains("msg--sticky") && !classes.contains("msg--t")) {
                chat_history.childNodes[i].remove();
                break;
            }
        }
    }

    // Auto-scroll to bottom to show newest messages
    const chatSection = chat_history.parentElement;
    if (chatSection) {
        chatSection.scrollTop = chatSection.scrollHeight;
    }
}

function handle_premium(node, message) {
    if (message.currency == 'USD') {
        node.classList.add("msg--sticky");
        recalculate_premium_positions();

        // 6 seconds for every dollar, 10 minutes for $100, caps 10 minutes.
        let time = Math.min(600, message.amount * 6);
        //console.log(message.amount, time);
        setTimeout(() => {
            node.classList.remove("msg--sticky");
            recalculate_premium_positions();
        }, time * 1000);
    }
}

window.livestream_viewers = {};

// Calculate viewer count based on live badge options
function calculate_viewer_count(viewers, options) {
    const mode = options?.platformMode || 'all';
    const platforms = options?.platforms || [];

    let total = 0;
    for (const [platform, count] of Object.entries(viewers)) {
        const platformCount = parseInt(count, 10) || 0;
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

function handle_viewers(message) {
    console.log("VIEWERS", message);

    // Update global viewer state
    for (const [key, value] of Object.entries(message)) {
        window.livestream_viewers[key] = parseInt(value, 10);
    }

    // Find all live badge elements in the layout
    const elements = current_layout?.elements || {};

    // Update all live badge elements
    for (const [id, config] of Object.entries(elements)) {
        // Match 'live' or 'live-N' elements
        if (id === 'live' || id.startsWith('live-')) {
            const el = document.getElementById(id);
            const totalsEl = el?.querySelector('#live-totals') || document.getElementById('live-totals');

            if (totalsEl && config.enabled !== false) {
                const options = config.options || {};
                const count = calculate_viewer_count(window.livestream_viewers, options);
                totalsEl.innerHTML = count;
            }
        }
    }

    // Fallback: update default live-totals if no layout or 'live' element found
    if (!current_layout || !elements.live) {
        const total = calculate_viewer_count(window.livestream_viewers, {});
        const totalsEl = document.getElementById("live-totals");
        if (totalsEl) {
            totalsEl.innerHTML = total;
        }
    }
}

function recalculate_premium_positions() {
    let premium_messages = document.getElementsByClassName("msg--sticky");
    let top = 5;
    for (let i = 0; i < premium_messages.length; i++) {
        top += premium_messages[i].offsetHeight + 5;
    }

    let space = document.documentElement.clientHeight / 2;
    if (top > space) {
        console.log(space, top, space - top);
        top = space - top;
    }
    else {
        top = 5;
    }

    for (let i = 0; i < premium_messages.length; i++) {
        premium_messages[i].style.top = `${top}px`;
        top += premium_messages[i].scrollHeight + 5;
    }
}

//
// Polls
//

var active_poll = null;
const poll_ui = document.getElementById("poll-ui");
const superchat_ui = document.getElementById("superchat-ui");

class poll {
    constructor(question, multi_vote, options) {
        this.question = question;
        this.options = options;
        this.votes = [];
        this.voters = [];
        this.multi_vote = multi_vote;
        this.total_votes = 0;

        for (let i = 0; i < this.options.length; i++) {
            this.votes.push(0);
        }

        this.update();
        poll_ui.style.display = "block";
        poll_ui.classList.remove("fade-out");
        poll_ui.classList.add("fade-in");
        superchat_ui.classList.add("slide-down");
    }

    end_poll() {
        let participants = this.voters.length;
        let html = `<strong>${this.question}</strong><br><small>${participants} participants</small><ul>`;
        let winning_option = 0;

        for (let i = 0; i < this.options.length; i++) {
            if (this.votes[i] > this.votes[winning_option])
                winning_option = i;
        }

        for (let i = 0; i < this.options.length; i++) {
            let percentage = 0;
            if (this.total_votes > 0) {
                percentage = (this.votes[i] / this.total_votes) * 100;
                percentage = percentage.toFixed(2);
            }
            if (i == winning_option)
                html += `<li><strong>!vote ${i + 1}: ${this.options[i]} - ${this.votes[i]} (${percentage}%)</strong></li>`;
            else
                html += `<li>!vote ${i + 1}: ${this.options[i]} - ${this.votes[i]} (${percentage}%)</li>`;
        }

        poll_ui.innerHTML = html;

        setTimeout(() => {
            poll_ui.classList.remove("fade-in");
            poll_ui.classList.add("fade-out");
            setTimeout(() => { poll_ui.style.display = "none"; }, 500);
        }, 10000);
        active_poll = null;
    }

    update() {
        let participants = this.voters.length;
        let html = `<strong>${this.question}</strong><br><small>${participants} participants</small><ul>`;
        for (let i = 0; i < this.options.length; i++) {
            let percentage = 0;
            if (this.total_votes > 0) {
                percentage = (this.votes[i] / this.total_votes) * 100;
                percentage = percentage.toFixed(2);
            }
            html += `<li>!vote ${i + 1}: ${this.options[i]} - ${this.votes[i]} (${percentage}%)</li>`;
        }

        html += "</ul><small>use !vote [number] to vote</small>";

        poll_ui.innerHTML = html;
    }

    handle_vote_message(data) {
        // check if user has already voted
        if (active_poll.voters.includes(data.username))
            return;

        let args = data.message.replace("!vote", "").replace("!", "").trim();
        let result = false;
        if (this.multi_vote) {
            let votes = args.split(" ");
            // remove duplicates
            votes = [...new Set(votes)];

            for (let i = 0; i < votes.length; i++)
                result |= this.handle_vote(votes[i]);
        } else {
            result = this.handle_vote(args);
        }

        if (result) {
            this.voters.push(data.username);
            this.update();
        }
    }

    handle_vote(vote_index) {
        if (isNaN(vote_index))
            return false;

        let i = parseInt(vote_index) - 1;

        if (i < 0 || i >= this.options.length)
            return false;

        this.votes[i]++;
        this.total_votes++;
        return true;
    }

    is_valid_vote(message) {
        // Allow "!vote 1"
        if (message.startsWith("!vote"))
            return true;
        // Allow "1"
        if (message.length == 1 && !isNaN(message[0]))
            return true;
        // Allow "!2"
        if (message.startsWith("!") && !isNaN(message[1]))
            return true;
        return false;
    }
}

function handle_command(message) {
    function unescape(escaped_string) {
        const tmp_div = document.createElement("div");
        tmp_div.innerHTML = escaped_string;
        return tmp_div.textContent || tmp_div.innerText || "";
    }

    // ignore non-commands, except if a vote is running so we can allow messages like "1" or "!2" to be counted as votes
    if (!message.message.startsWith("!") && active_poll === null)
        return false;

    // html escape codes use semicolons, so we need to unescape them otherwise the splitting will break
    let msg = unescape(message.message);
    const is_admin = message.is_owner;

    if (msg.startsWith("!poll") && is_admin) {
        msg = msg.replace("!poll", "").trim();
        let parts = msg.split(";");
        parts = parts.filter(el => el.length != 0);
        if (parts.length >= 3)
            active_poll = new poll(parts[0], false, parts.slice(1));
        return true;
    }
    else if (msg.startsWith("!multipoll") && is_admin) {
        msg = msg.replace("!multipoll", "").trim();
        let parts = msg.split(";");
        parts = parts.filter(el => el.length != 0);
        if (parts.length >= 3)
            active_poll = new poll(parts[0], true, parts.slice(1));
        return true;
    }
    else if (msg.startsWith("!endpoll") && is_admin) {
        if (active_poll !== null)
            active_poll.end_poll();
        return true;
    }
    else if (active_poll !== null && active_poll.is_valid_vote(message.message)) {
        active_poll.handle_vote_message(message);
        return true;
    }

    return false;
}

function set_date(dateObj) {
    const day = dateObj.getDate();
    const month = dateObj.toLocaleString("default", { month: "long" });
    const year = dateObj.getFullYear();

    const nthNumber = (number) => {
        if (number > 3 && number < 21) return "th";
        switch (number % 10) {
            case 1:
                return "st";
            case 2:
                return "nd";
            case 3:
                return "rd";
            default:
                return "th";
        }
    };

    const date = `${month} ${day}${nthNumber(day)}, ${year}`;
    document.getElementById("date").innerHTML = date;
}
set_date(new Date());
