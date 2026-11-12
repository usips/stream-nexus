use actix::{Actor, AsyncContext, Context, Handler, MessageResult, Recipient};
use std::collections::{BTreeMap, HashMap, HashSet, VecDeque};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tracing::{debug, info, warn};
use uuid::Uuid;

use super::message;
use crate::database::Database;
use crate::exchange::ExchangeRates;
use crate::layout::{Layout, LayoutManager};
use crate::message::Message as ChatMessage;

pub struct Connection {
    #[allow(dead_code)] // Stored in HashMap key; field useful for debugging
    pub id: usize,
    pub recipient: Recipient<message::Reply>,
    /// If set, this client only receives updates for this specific layout.
    /// If None, the client receives updates for any layout (e.g., editor clients).
    pub subscribed_layout: Option<String>,
}

/// Define HTTP actor
pub struct ChatServer {
    pub clients: HashMap<usize, Connection>,
    pub chat_messages: HashMap<Uuid, ChatMessage>,
    pub exchange_rates: ExchangeRates,
    /// Viewer counts per (platform, channel) with the time they were last reported.
    /// A missing channel is stored as "".
    pub viewer_counts: HashMap<(String, String), (usize, Instant)>,
    /// Per-platform totals most recently broadcast to clients.
    pub viewer_totals: BTreeMap<String, usize>,
    pub layout_manager: Arc<Mutex<LayoutManager>>,
    pub active_layout: String,
    /// Currently featured message (full data for decoupled rendering)
    pub featured_message: Option<ChatMessage>,
    /// SQLite database for persistent paid message storage
    pub database: Database,
    /// Ids removed by a platform or moderator, so a re-sent copy isn't resurrected.
    pub removed_ids: BoundedIdSet,
    /// Messages inserted since `chat_messages` was last pruned.
    inserts_since_prune: usize,
}

/// How many removed ids are remembered.
const REMOVED_IDS_CAP: usize = 10_000;
/// How many unpaid messages are kept in memory.
const UNPAID_MESSAGES_CAP: usize = 5_000;
/// How long paid messages are kept in memory (matches the 24 h startup seed).
const PAID_MESSAGES_MAX_AGE_MS: i64 = 24 * 60 * 60 * 1000;
/// Prune `chat_messages` after this many inserts.
const PRUNE_EVERY_INSERTS: usize = 500;

/// A set of ids that forgets the oldest once it holds `cap` entries.
pub struct BoundedIdSet {
    cap: usize,
    ids: HashSet<Uuid>,
    order: VecDeque<Uuid>,
}

impl BoundedIdSet {
    pub fn new(cap: usize) -> Self {
        Self {
            cap,
            ids: HashSet::with_capacity(cap),
            order: VecDeque::with_capacity(cap),
        }
    }

    pub fn insert(&mut self, id: Uuid) {
        if !self.ids.insert(id) {
            return;
        }
        self.order.push_back(id);
        while self.order.len() > self.cap {
            if let Some(old) = self.order.pop_front() {
                self.ids.remove(&old);
            }
        }
    }

    pub fn contains(&self, id: &Uuid) -> bool {
        self.ids.contains(id)
    }
}

/// Whether a re-sent message carries nothing new compared with the stored copy. Both
/// must already be normalised (escaped, emojis replaced, amount in USD). Timestamps are
/// ignored: a scraper re-sending after a reload stamps a fresh `received_at`.
pub fn same_content(a: &ChatMessage, b: &ChatMessage) -> bool {
    a.message == b.message
        && a.emojis == b.emojis
        && a.amount == b.amount
        && a.currency == b.currency
        && a.username == b.username
        && a.avatar == b.avatar
        && a.is_placeholder == b.is_placeholder
        && a.is_verified == b.is_verified
        && a.is_sub == b.is_sub
        && a.is_mod == b.is_mod
        && a.is_owner == b.is_owner
        && a.is_staff == b.is_staff
        && a.is_subscription == b.is_subscription
}

/// Ids to drop from memory: paid messages older than `paid_max_age_ms` before `now_ms`,
/// and the oldest unpaid messages beyond `unpaid_cap`.
pub fn messages_to_evict<'a>(
    messages: impl Iterator<Item = &'a ChatMessage>,
    unpaid_cap: usize,
    paid_max_age_ms: i64,
    now_ms: i64,
) -> Vec<Uuid> {
    let mut evict = Vec::new();
    let mut unpaid: Vec<(i64, Uuid)> = Vec::new();
    for msg in messages {
        if msg.amount > 0.0 {
            if now_ms - msg.received_at > paid_max_age_ms {
                evict.push(msg.id);
            }
        } else {
            unpaid.push((msg.received_at, msg.id));
        }
    }
    if unpaid.len() > unpaid_cap {
        unpaid.sort_unstable();
        let excess = unpaid.len() - unpaid_cap;
        evict.extend(unpaid.into_iter().take(excess).map(|(_, id)| id));
    }
    evict
}

/// The newest `max` messages by `received_at`, oldest first.
pub fn newest_messages<'a>(
    messages: impl Iterator<Item = &'a ChatMessage>,
    max: usize,
) -> Vec<ChatMessage> {
    let mut all: Vec<&ChatMessage> = messages.collect();
    all.sort_by_key(|msg| msg.received_at);
    let skip = all.len().saturating_sub(max);
    all.into_iter().skip(skip).cloned().collect()
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::SystemTime::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

impl ChatServer {
    pub fn new(exchange_rates: ExchangeRates, layout_manager: Arc<Mutex<LayoutManager>>) -> Self {
        info!("Chat actor starting up.");

        // Initialize SQLite database
        let database = Database::new().expect("Failed to initialize database");

        // Clean up messages older than 48 hours on startup
        if let Err(e) = database.cleanup_old_messages(48) {
            warn!("Failed to cleanup old messages: {}", e);
        }

        // Determine active layout (use "default" if it exists)
        let active_layout = {
            let lm = layout_manager.lock().unwrap();
            if lm.exists("default") {
                "default".to_string()
            } else {
                lm.list().unwrap_or_default().first().cloned().unwrap_or_else(|| "default".to_string())
            }
        };

        // Load paid messages from database into chat_messages for recent message history
        let chat_messages: HashMap<Uuid, ChatMessage> = database
            .get_paid_messages_since_hours(24)
            .unwrap_or_default()
            .into_iter()
            .map(|msg| (msg.id, msg))
            .collect();

        info!("Loaded {} paid messages from database", chat_messages.len());

        Self {
            clients: HashMap::with_capacity(100),
            chat_messages,
            exchange_rates,
            viewer_counts: HashMap::with_capacity(100),
            viewer_totals: BTreeMap::new(),
            layout_manager,
            active_layout,
            featured_message: None,
            database,
            removed_ids: BoundedIdSet::new(REMOVED_IDS_CAP),
            inserts_since_prune: 0,
        }
    }

    /// Broadcast a layout update to relevant connected clients.
    /// - Clients with no subscription (None) receive all layout updates (e.g., editor)
    /// - Clients subscribed to a specific layout only receive updates for that layout
    fn broadcast_layout(&self, layout: &Layout) {
        let reply = serde_json::to_string(&message::ReplyInner {
            tag: "layout_update".to_owned(),
            message: serde_json::to_string(layout).expect("Failed to serialize layout"),
        })
        .expect("Failed to serialize layout ReplyInner");

        for (_, conn) in &self.clients {
            // Send to clients that:
            // 1. Have no subscription (editor clients want all updates)
            // 2. Are subscribed to this specific layout
            let should_send = match &conn.subscribed_layout {
                None => true, // No subscription = receive all updates
                Some(subscribed) => subscribed == &layout.name,
            };

            if should_send {
                conn.recipient.do_send(message::Reply(reply.clone()));
            }
        }
    }

    fn viewers_reply(totals: &BTreeMap<String, usize>) -> message::Reply {
        message::Reply(
            serde_json::to_string(&message::ReplyInner {
                tag: "viewers".to_owned(),
                message: serde_json::to_string(totals).expect("Failed to serialize viewers."),
            })
            .expect("Failed to serialize viewers replyinner"),
        )
    }

    /// Recompute per-platform totals and broadcast them if they changed.
    fn broadcast_viewers_if_changed(&mut self) {
        let now = Instant::now();
        let totals = platform_totals(&self.viewer_counts, now, VIEWER_TTL);
        if let Some(update) = viewer_update(&self.viewer_totals, &totals) {
            for conn in self.clients.values() {
                conn.recipient.do_send(Self::viewers_reply(&update));
            }
        }
        self.viewer_totals = totals;
    }
}

/// How long a (platform, channel) viewer count stays valid without a fresh report.
/// CHUCK reports at least once a minute while a tab is open.
pub const VIEWER_TTL: Duration = Duration::from_secs(180);
/// How often stale viewer counts are pruned.
const VIEWER_PRUNE_INTERVAL: Duration = Duration::from_secs(30);

/// Store one viewer report. A report of 0 (stream ended, tab closing) withdraws that
/// (platform, channel) entry instead of storing 0, so it can't zero other tabs' counts.
pub fn record_viewers(
    counts: &mut HashMap<(String, String), (usize, Instant)>,
    report: message::ViewCount,
    now: Instant,
) {
    let key = (report.platform, report.channel.unwrap_or_default());
    if report.viewers == 0 {
        counts.remove(&key);
    } else {
        counts.insert(key, (report.viewers, now));
    }
}

/// Sum the non-expired viewer counts of every channel, per platform.
pub fn platform_totals(
    counts: &HashMap<(String, String), (usize, Instant)>,
    now: Instant,
    ttl: Duration,
) -> BTreeMap<String, usize> {
    let mut totals = BTreeMap::new();
    for ((platform, _channel), (viewers, updated)) in counts {
        if now.saturating_duration_since(*updated) <= ttl {
            *totals.entry(platform.clone()).or_insert(0) += viewers;
        }
    }
    totals
}

/// The `viewers` payload to broadcast when totals go from `prev` to `next`, or None if
/// nothing changed. Platforms that disappeared are sent once as 0, because overlays merge
/// keys into their state and never delete them.
pub fn viewer_update(
    prev: &BTreeMap<String, usize>,
    next: &BTreeMap<String, usize>,
) -> Option<BTreeMap<String, usize>> {
    if prev == next {
        return None;
    }
    let mut update = next.clone();
    for platform in prev.keys() {
        update.entry(platform.clone()).or_insert(0);
    }
    Some(update)
}

/// Make actor from `ChatServer`
impl Actor for ChatServer {
    /// We are going to use simple Context, we just need ability to communicate with other actors.
    type Context = Context<Self>;

    fn started(&mut self, ctx: &mut Self::Context) {
        ctx.set_mailbox_capacity(256);

        // Drop viewer counts from tabs that stopped reporting (closed without an
        // unload message, crashed, lost their socket) and tell clients.
        ctx.run_interval(VIEWER_PRUNE_INTERVAL, |act, _| {
            let now = Instant::now();
            act.viewer_counts
                .retain(|_, (_, updated)| now.saturating_duration_since(*updated) <= VIEWER_TTL);
            act.broadcast_viewers_if_changed();
        });
    }
}

/// Handler for Connect message.
impl Handler<message::Connect> for ChatServer {
    type Result = usize;

    fn handle(&mut self, msg: message::Connect, _: &mut Context<Self>) -> Self::Result {
        debug!("New client connected to chat.");
        // random usize
        let id: usize = rand::random();
        if !self.viewer_totals.is_empty() {
            msg.recipient.do_send(Self::viewers_reply(&self.viewer_totals));
        }
        self.clients.insert(
            id,
            Connection {
                id,
                recipient: msg.recipient,
                subscribed_layout: None,
            },
        );
        id
    }
}

/// Handler for a new Chat Message from the browser.
impl Handler<message::Content> for ChatServer {
    type Result = ();

    fn handle(&mut self, mut msg: message::Content, _: &mut Context<Self>) -> Self::Result {
        info!("{}", msg.chat_message.to_console_msg());

        let usd = if msg.chat_message.amount > 0.0 {
            self.exchange_rates
                .get_usd(&msg.chat_message.currency, &msg.chat_message.amount)
        } else {
            0.0
        };

        msg.chat_message.username = msg
            .chat_message
            .username
            .replace("&", "&amp;")
            .replace("\"", "&quot")
            .replace("'", "&#039;")
            .replace("<", "&lt;")
            .replace(">", "&gt;");
        msg.chat_message.message = msg
            .chat_message
            .message
            .replace("&", "&amp;")
            .replace("\"", "&quot")
            .replace("'", "&#039;")
            .replace("<", "&lt;")
            .replace(">", "&gt;");

        // emojis = Vec<(String, String, String) where names are (find, replace, name)
        let mut replacements: HashMap<usize, String> =
            HashMap::with_capacity(msg.chat_message.emojis.len());
        let mut replacement_string = msg.chat_message.message.to_owned();

        // First, replace all instances with tokens.
        for (find, replace, name) in &msg.chat_message.emojis {
            let url = replace
                .replace("&", "&amp;")
                .replace("\"", "&quot")
                .replace("'", "&#039;")
                .replace("<", "&lt;")
                .replace(">", "&gt;");
            let key: usize = rand::random();
            let value: String = format!(
                "<img class=\"emoji\" src=\"{}\" data-emoji=\"{}\" alt=\"{}\" />",
                url, name, name
            );
            replacement_string = replacement_string.replace(find, &format!("<{}>", key));
            replacements.insert(key, value);
        }

        // Replace tokens with real replacements.
        for (key, value) in replacements {
            replacement_string = replacement_string.replace(&format!("<{}>", key), &value);
        }

        // Finally, set new string.
        // This stops double replacements.
        msg.chat_message.message = replacement_string;

        let mut chat_msg = msg.chat_message;
        let id = chat_msg.id.to_owned();
        chat_msg.amount = usd;
        chat_msg.currency = "USD".to_string();

        // Scrapers re-send messages they have already sent (page reloads, several tabs on
        // one channel, pinned gifts replayed on load). Only broadcast what is new.
        if self.removed_ids.contains(&id) {
            debug!("[ChatServer] Ignoring re-sent removed message {}", id);
            return;
        }
        if let Some(stored) = self.chat_messages.get(&id) {
            if same_content(stored, &chat_msg) {
                debug!("[ChatServer] Ignoring duplicate message {}", id);
                return;
            }
            // An edit: keep the original arrival time so ordering is stable.
            chat_msg.received_at = stored.received_at;
        }

        // Send message to all clients.
        for (_, conn) in &self.clients {
            conn.recipient.do_send(message::Reply(
                serde_json::to_string(&message::ReplyInner {
                    tag: "chat_message".to_owned(),
                    message: chat_msg.to_json(),
                })
                .expect("Failed to serialize chat message reply_inner."),
            ));
        }

        if self.chat_messages.len() + 1 >= self.chat_messages.capacity() {
            self.chat_messages.reserve(100);
        }
        self.chat_messages.insert(id.to_owned(), chat_msg.clone());

        self.inserts_since_prune += 1;
        if self.inserts_since_prune >= PRUNE_EVERY_INSERTS {
            self.inserts_since_prune = 0;
            let evict = messages_to_evict(
                self.chat_messages.values(),
                UNPAID_MESSAGES_CAP,
                PAID_MESSAGES_MAX_AGE_MS,
                now_ms(),
            );
            for id in &evict {
                self.chat_messages.remove(id);
            }
            if !evict.is_empty() {
                debug!("[ChatServer] Evicted {} old messages from memory", evict.len());
            }
        }

        // Save paid messages to SQLite database
        if usd > 0.0 {
            if let Err(e) = self.database.upsert_paid_message(&chat_msg) {
                warn!("Failed to save paid message to database: {}", e);
            }
        }
    }
}

/// Handler for Disconnect message.
impl Handler<message::Disconnect> for ChatServer {
    type Result = ();

    fn handle(&mut self, msg: message::Disconnect, _: &mut Context<Self>) {
        // Remove Client from HashMap.
        self.clients.remove(&msg.id);
    }
}

/// Handler for feature/unfeature message.
/// Now looks up full message data and broadcasts it for decoupled rendering.
impl<'a> Handler<message::FeatureMessage> for ChatServer {
    type Result = Option<ChatMessage>;

    fn handle(&mut self, msg: message::FeatureMessage, _: &mut Context<Self>) -> Self::Result {
        // Handle unfeaturing
        let featured_msg = if let Some(id) = msg.id {
            // Try to find the message in memory first, then database
            let found_msg = self.chat_messages.get(&id).cloned()
                .or_else(|| {
                    self.database.get_paid_message(&id)
                        .ok()
                        .flatten()
                });

            if found_msg.is_none() {
                warn!("[ChatServer] Featured message {} not found in memory or database", id);
            }
            found_msg
        } else {
            None
        };

        // Store the full featured message
        self.featured_message = featured_msg.clone();
        debug!("[ChatServer] Featured message set to: {:?}", self.featured_message.as_ref().map(|m| m.id));

        // Broadcast to all clients - send full message JSON if featuring, null if unfeaturing
        let reply_message = match &featured_msg {
            Some(chat_msg) => chat_msg.to_json(),
            None => "null".to_string(),
        };

        for (_, conn) in &self.clients {
            conn.recipient.do_send(message::Reply(
                serde_json::to_string(&message::ReplyInner {
                    tag: "feature_message".to_owned(),
                    message: reply_message.clone(),
                })
                .expect("Failed to serialize feature ReplyInner"),
            ));
        }

        featured_msg
    }
}

/// Handler for requesting current featured message (returns full message data)
impl Handler<message::RequestFeaturedMessage> for ChatServer {
    type Result = MessageResult<message::RequestFeaturedMessage>;

    fn handle(&mut self, _: message::RequestFeaturedMessage, _: &mut Context<Self>) -> Self::Result {
        MessageResult(self.featured_message.clone())
    }
}

/// Handler for recent chat messages.
impl<'a> Handler<message::RecentMessages> for ChatServer {
    type Result = MessageResult<message::RecentMessages>;

    fn handle(&mut self, _: message::RecentMessages, _: &mut Context<Self>) -> Self::Result {
        const MAX_MESSAGES: usize = 100;

        let last_messages = newest_messages(self.chat_messages.values(), MAX_MESSAGES);

        debug!("Sending {} recent messages.", last_messages.len());
        MessageResult(last_messages)
    }
}

/// Handler for remove a message.
impl Handler<message::RemoveMessage> for ChatServer {
    type Result = ();

    fn handle(&mut self, msg: message::RemoveMessage, _: &mut Context<Self>) -> Self::Result {
        debug!("[ChatServer] Removing message with ID {}", msg.id);
        self.chat_messages.remove(&msg.id);
        self.removed_ids.insert(msg.id);

        // Also remove from database
        if let Err(e) = self.database.delete_paid_message(&msg.id) {
            warn!("Failed to delete paid message from database: {}", e);
        }

        // Clear featured message if it's being removed
        if self.featured_message.as_ref().map(|m| m.id) == Some(msg.id) {
            self.featured_message = None;
        }

        // Notify all clients to remove the message.
        for (_, conn) in &self.clients {
            conn.recipient.do_send(message::Reply(
                serde_json::to_string(&message::ReplyInner {
                    tag: "remove_message".to_owned(),
                    message: serde_json::to_string(&msg.id)
                        .expect("Failed to serialize remove string."),
                })
                .expect("Failed to serialize remove ReplyInner"),
            ));
        }
    }
}

/// Handler for all stored Superchats (from database, last 24 hours for dashboard)
impl<'a> Handler<message::PaidMessages> for ChatServer {
    type Result = MessageResult<message::PaidMessages>;

    fn handle(&mut self, _: message::PaidMessages, _: &mut Context<Self>) -> Self::Result {
        // Get paid messages from the last 24 hours
        let super_chats = self.database
            .get_paid_messages_since_hours(24)
            .unwrap_or_default();
        debug!("Sending {} superchats from last 24 hours.", super_chats.len());
        MessageResult(super_chats)
    }
}

/// Handler for paid messages with custom time filter
impl<'a> Handler<message::PaidMessagesSince> for ChatServer {
    type Result = MessageResult<message::PaidMessagesSince>;

    fn handle(&mut self, msg: message::PaidMessagesSince, _: &mut Context<Self>) -> Self::Result {
        let super_chats = self.database
            .get_paid_messages_since_hours(msg.hours)
            .unwrap_or_default();
        debug!("Sending {} superchats from last {} hours.", super_chats.len(), msg.hours);
        MessageResult(super_chats)
    }
}

/// Handler for viewer counts.
impl Handler<message::ViewCount> for ChatServer {
    type Result = ();

    fn handle(&mut self, viewers: message::ViewCount, _: &mut Context<Self>) -> Self::Result {
        record_viewers(&mut self.viewer_counts, viewers, Instant::now());
        self.broadcast_viewers_if_changed();
    }
}

/// Handler for requesting current viewer totals.
impl Handler<message::RequestViewers> for ChatServer {
    type Result = MessageResult<message::RequestViewers>;

    fn handle(&mut self, _: message::RequestViewers, _: &mut Context<Self>) -> Self::Result {
        MessageResult(self.viewer_totals.clone())
    }
}

// ============================================================================
// Layout Handlers
// ============================================================================

/// Handler for layout update broadcast
impl Handler<message::LayoutUpdate> for ChatServer {
    type Result = ();

    fn handle(&mut self, msg: message::LayoutUpdate, _: &mut Context<Self>) -> Self::Result {
        debug!("[ChatServer] Broadcasting layout update: {}", msg.layout.name);
        self.broadcast_layout(&msg.layout);
    }
}

/// Handler for switching active layout
impl Handler<message::SwitchLayout> for ChatServer {
    type Result = Result<(), String>;

    fn handle(&mut self, msg: message::SwitchLayout, _: &mut Context<Self>) -> Self::Result {
        info!("[ChatServer] Switching to layout: {}", msg.name);

        let layout = {
            let lm = self.layout_manager.lock().map_err(|e| e.to_string())?;
            lm.load(&msg.name).map_err(|e| e.to_string())?
        };

        self.active_layout = msg.name;
        self.broadcast_layout(&layout);
        Ok(())
    }
}

/// Handler for saving a layout
impl Handler<message::SaveLayout> for ChatServer {
    type Result = Result<(), String>;

    fn handle(&mut self, msg: message::SaveLayout, _: &mut Context<Self>) -> Self::Result {
        info!("[ChatServer] Saving layout: {}", msg.layout.name);

        let lm = self.layout_manager.lock().map_err(|e| e.to_string())?;
        lm.save(&msg.layout).map_err(|e| e.to_string())?;

        // Broadcast to clients subscribed to this layout (and unsubscribed clients like editors)
        self.broadcast_layout(&msg.layout);

        Ok(())
    }
}

/// Handler for deleting a layout
impl Handler<message::DeleteLayout> for ChatServer {
    type Result = Result<(), String>;

    fn handle(&mut self, msg: message::DeleteLayout, _: &mut Context<Self>) -> Self::Result {
        info!("[ChatServer] Deleting layout: {}", msg.name);

        // Don't allow deleting the active layout
        if msg.name == self.active_layout {
            return Err("Cannot delete the active layout".to_string());
        }

        let lm = self.layout_manager.lock().map_err(|e| e.to_string())?;
        lm.delete(&msg.name).map_err(|e| e.to_string())?;
        Ok(())
    }
}

/// Handler for requesting current layout
impl Handler<message::RequestLayout> for ChatServer {
    type Result = MessageResult<message::RequestLayout>;

    fn handle(&mut self, _: message::RequestLayout, _: &mut Context<Self>) -> Self::Result {
        let lm = self.layout_manager.lock().unwrap();
        match lm.load(&self.active_layout) {
            Ok(layout) => MessageResult(layout),
            Err(_) => MessageResult(Layout::default_layout()),
        }
    }
}

/// Handler for requesting a specific layout by name
impl Handler<message::RequestLayoutByName> for ChatServer {
    type Result = MessageResult<message::RequestLayoutByName>;

    fn handle(&mut self, msg: message::RequestLayoutByName, _: &mut Context<Self>) -> Self::Result {
        let lm = self.layout_manager.lock().unwrap();
        match lm.load(&msg.name) {
            Ok(layout) => MessageResult(Some(layout)),
            Err(_) => MessageResult(None),
        }
    }
}

/// Handler for requesting layout list
impl Handler<message::RequestLayoutList> for ChatServer {
    type Result = MessageResult<message::RequestLayoutList>;

    fn handle(&mut self, _: message::RequestLayoutList, _: &mut Context<Self>) -> Self::Result {
        let lm = self.layout_manager.lock().unwrap();
        let layouts = lm.list().unwrap_or_default();
        MessageResult(message::LayoutListResponse {
            layouts,
            active: self.active_layout.clone(),
        })
    }
}

/// Handler for subscribing a client to a specific layout
impl Handler<message::SubscribeLayout> for ChatServer {
    type Result = ();

    fn handle(&mut self, msg: message::SubscribeLayout, _: &mut Context<Self>) -> Self::Result {
        info!(
            "[ChatServer] Client {} subscribing to layout: {}",
            msg.client_id,
            msg.layout_name
        );
        if let Some(conn) = self.clients.get_mut(&msg.client_id) {
            conn.subscribed_layout = Some(msg.layout_name);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn chat(received_at: i64, amount: f64) -> ChatMessage {
        ChatMessage {
            received_at,
            sent_at: received_at,
            amount,
            currency: "USD".to_string(),
            ..ChatMessage::default()
        }
    }

    #[test]
    fn same_content_ignores_timestamps() {
        let a = chat(1_000, 5.0);
        let mut b = a.clone();
        b.received_at = 9_000;
        b.sent_at = 9_000;
        assert!(same_content(&a, &b));
    }

    #[test]
    fn same_content_detects_changes() {
        let a = chat(1_000, 5.0);
        let changes: Vec<fn(&mut ChatMessage)> = vec![
            |m| m.message.push('!'),
            |m| m.emojis.push(("a".into(), "b".into(), "c".into())),
            |m| m.amount = 10.0,
            |m| m.username.push('x'),
            |m| m.avatar.push('x'),
            |m| m.is_placeholder = true,
            |m| m.is_sub = true,
            |m| m.is_mod = true,
            |m| m.is_owner = true,
            |m| m.is_staff = true,
            |m| m.is_verified = true,
            |m| m.is_subscription = true,
        ];
        for change in changes {
            let mut b = a.clone();
            change(&mut b);
            assert!(!same_content(&a, &b), "change not detected: {:?}", b);
        }
    }

    #[test]
    fn bounded_id_set_forgets_oldest() {
        let mut set = BoundedIdSet::new(2);
        let (a, b, c) = (Uuid::new_v4(), Uuid::new_v4(), Uuid::new_v4());
        set.insert(a);
        set.insert(b);
        set.insert(a); // duplicate doesn't refresh or grow
        set.insert(c);
        assert!(!set.contains(&a));
        assert!(set.contains(&b));
        assert!(set.contains(&c));
    }

    #[test]
    fn messages_to_evict_caps_unpaid_oldest_first() {
        let msgs: Vec<ChatMessage> = (0..5).map(|i| chat(i * 10, 0.0)).collect();
        let evict = messages_to_evict(msgs.iter(), 3, PAID_MESSAGES_MAX_AGE_MS, 100);
        assert_eq!(evict.len(), 2);
        assert!(evict.contains(&msgs[0].id));
        assert!(evict.contains(&msgs[1].id));
    }

    #[test]
    fn messages_to_evict_keeps_recent_paid_and_drops_old_paid() {
        let now = PAID_MESSAGES_MAX_AGE_MS * 2;
        let old_paid = chat(0, 5.0);
        let new_paid = chat(now - 1_000, 5.0);
        let unpaid = chat(0, 0.0);
        let msgs = vec![old_paid.clone(), new_paid, unpaid];
        let evict = messages_to_evict(msgs.iter(), 0, PAID_MESSAGES_MAX_AGE_MS, now);
        assert_eq!(evict.len(), 2);
        assert!(evict.contains(&old_paid.id));
        assert!(evict.contains(&msgs[2].id));
    }

    #[test]
    fn newest_messages_takes_latest_in_order() {
        let msgs: Vec<ChatMessage> = [50, 10, 40, 20, 30].iter().map(|&t| chat(t, 0.0)).collect();
        let newest = newest_messages(msgs.iter(), 3);
        let times: Vec<i64> = newest.iter().map(|m| m.received_at).collect();
        assert_eq!(times, vec![30, 40, 50]);
        assert_eq!(newest_messages(msgs.iter(), 100).len(), 5);
    }

    fn key(platform: &str, channel: &str) -> (String, String) {
        (platform.to_string(), channel.to_string())
    }

    #[test]
    fn platform_totals_sums_channels_per_platform() {
        let now = Instant::now();
        let mut counts = HashMap::new();
        counts.insert(key("Kick", "absi"), (100, now));
        counts.insert(key("Kick", "other"), (25, now));
        counts.insert(key("YouTube", ""), (7, now));

        let totals = platform_totals(&counts, now, VIEWER_TTL);
        assert_eq!(totals.get("Kick"), Some(&125));
        assert_eq!(totals.get("YouTube"), Some(&7));
        assert_eq!(totals.len(), 2);
    }

    #[test]
    fn platform_totals_ignores_expired_entries() {
        let start = Instant::now();
        let later = start + VIEWER_TTL + Duration::from_secs(1);
        let mut counts = HashMap::new();
        counts.insert(key("Kick", "stale"), (100, start));
        counts.insert(key("Kick", "fresh"), (10, later));
        counts.insert(key("Rumble", "gone"), (5, start));

        let totals = platform_totals(&counts, later, VIEWER_TTL);
        assert_eq!(totals.get("Kick"), Some(&10));
        assert_eq!(totals.get("Rumble"), None);
    }

    #[test]
    fn viewer_update_skips_unchanged_totals() {
        let totals: BTreeMap<String, usize> = [("Kick".to_string(), 5)].into();
        assert_eq!(viewer_update(&totals, &totals.clone()), None);
        assert_eq!(viewer_update(&BTreeMap::new(), &BTreeMap::new()), None);
    }

    #[test]
    fn viewer_update_sends_dropped_platforms_as_zero_once() {
        let prev: BTreeMap<String, usize> =
            [("Kick".to_string(), 5), ("Rumble".to_string(), 3)].into();
        let next: BTreeMap<String, usize> = [("Kick".to_string(), 6)].into();

        let update = viewer_update(&prev, &next).expect("totals changed");
        assert_eq!(update.get("Kick"), Some(&6));
        assert_eq!(update.get("Rumble"), Some(&0));

        // Once broadcast, `next` becomes the new baseline and Rumble isn't repeated.
        assert_eq!(viewer_update(&next, &next.clone()), None);
    }

    fn report(platform: &str, channel: Option<&str>, viewers: usize) -> message::ViewCount {
        message::ViewCount {
            platform: platform.to_string(),
            channel: channel.map(str::to_string),
            viewers,
        }
    }

    #[test]
    fn record_viewers_zero_removes_only_that_channel() {
        let now = Instant::now();
        let mut counts = HashMap::new();
        record_viewers(&mut counts, report("Kick", Some("main"), 100), now);
        record_viewers(&mut counts, report("Kick", Some("popout"), 40), now);
        assert_eq!(platform_totals(&counts, now, VIEWER_TTL).get("Kick"), Some(&140));

        record_viewers(&mut counts, report("Kick", Some("popout"), 0), now);
        assert_eq!(counts.len(), 1);
        assert_eq!(platform_totals(&counts, now, VIEWER_TTL).get("Kick"), Some(&100));
    }

    #[test]
    fn record_viewers_replaces_same_channel_and_keys_missing_channel_as_empty() {
        let now = Instant::now();
        let mut counts = HashMap::new();
        record_viewers(&mut counts, report("YouTube", None, 10), now);
        record_viewers(&mut counts, report("YouTube", None, 12), now);
        assert_eq!(counts.get(&key("YouTube", "")).map(|v| v.0), Some(12));
        assert_eq!(platform_totals(&counts, now, VIEWER_TTL).get("YouTube"), Some(&12));
    }
}
