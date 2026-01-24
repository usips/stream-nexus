use actix::{Actor, Context, Handler, MessageResult, Recipient};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
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
    pub viewer_counts: HashMap<String, usize>,
    pub layout_manager: Arc<Mutex<LayoutManager>>,
    pub active_layout: String,
    /// Currently featured message (full data for decoupled rendering)
    pub featured_message: Option<ChatMessage>,
    /// SQLite database for persistent paid message storage
    pub database: Database,
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
            layout_manager,
            active_layout,
            featured_message: None,
            database,
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
}

// conn.recipient.do_send(message::Reply(message.to_owned()));

/// Make actor from `ChatServer`
impl Actor for ChatServer {
    /// We are going to use simple Context, we just need ability to communicate with other actors.
    type Context = Context<Self>;

    fn started(&mut self, ctx: &mut Self::Context) {
        ctx.set_mailbox_capacity(256);
    }
}

/// Handler for Connect message.
impl Handler<message::Connect> for ChatServer {
    type Result = usize;

    fn handle(&mut self, msg: message::Connect, _: &mut Context<Self>) -> Self::Result {
        debug!("New client connected to chat.");
        // random usize
        let id: usize = rand::random();
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

        if self.chat_messages.len() >= self.chat_messages.capacity() - 1 {
            self.chat_messages.reserve(100);
        }
        self.chat_messages.insert(id.to_owned(), chat_msg.clone());

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

        let mut last_messages: Vec<ChatMessage> = if self.chat_messages.len() >= MAX_MESSAGES {
            self.chat_messages
                .keys()
                .cloned()
                .skip(self.chat_messages.len() - MAX_MESSAGES)
                .filter_map(|id| self.chat_messages.get(&id).cloned())
                .collect()
        } else {
            self.chat_messages.values().cloned().collect()
        };
        last_messages.sort_by_key(|msg| msg.received_at);

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
        if let Some(old) = self.viewer_counts.insert(viewers.platform, viewers.viewers) {
            if old == viewers.viewers {
                return;
            }
        }

        for (_, conn) in &self.clients {
            let new_viewers = self.viewer_counts.clone();
            conn.recipient.do_send(message::Reply(
                serde_json::to_string(&message::ReplyInner {
                    tag: "viewers".to_owned(),
                    message: serde_json::to_string(&new_viewers)
                        .expect("Failed to serialize viewers."),
                })
                .expect("Failed to serialize viewers replyinner"),
            ));
        }
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
