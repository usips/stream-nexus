use actix::{Actor, Context, Handler, MessageResult, Recipient};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tracing::{debug, info};
use uuid::Uuid;

use super::message;
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
    pub paid_messages: Vec<Uuid>,
    pub exchange_rates: ExchangeRates,
    pub viewer_counts: HashMap<String, usize>,
    pub layout_manager: Arc<Mutex<LayoutManager>>,
    pub active_layout: String,
}

impl ChatServer {
    pub fn new(exchange_rates: ExchangeRates, layout_manager: Arc<Mutex<LayoutManager>>) -> Self {
        info!("Chat actor starting up.");

        // Determine active layout (use "default" if it exists)
        let active_layout = {
            let lm = layout_manager.lock().unwrap();
            if lm.exists("default") {
                "default".to_string()
            } else {
                lm.list().unwrap_or_default().first().cloned().unwrap_or_else(|| "default".to_string())
            }
        };

        // get last modified time of superchats.json
        let super_chats_last_modified = std::fs::metadata("super_chats.json")
            .map(|meta| meta.modified().unwrap())
            .ok();

        // if superchats.json exists and was modified in the last 15 minutes, load it
        if let Some(super_chats_last_modified) = super_chats_last_modified {
            let now = std::time::SystemTime::now();
            let duration = now.duration_since(super_chats_last_modified).unwrap();
            if duration.as_secs() < 900 {
                // Load superchats from disk.
                let super_chats_json = std::fs::read_to_string("super_chats.json");
                if let Ok(super_chats_json) = super_chats_json {
                    info!("Loading superchats from disk.");
                    let super_chats: Vec<ChatMessage> =
                        serde_json::from_str(&super_chats_json).unwrap();
                    let paid_messages: Vec<Uuid> = super_chats.iter().map(|msg| msg.id).collect();

                    // convert to hashmap
                    let chat_messages: HashMap<Uuid, ChatMessage> = super_chats
                        .iter()
                        .map(|msg| (msg.id, msg.clone()))
                        .collect();
                    return Self {
                        clients: HashMap::with_capacity(100),
                        chat_messages,
                        paid_messages,
                        exchange_rates,
                        viewer_counts: Default::default(),
                        layout_manager,
                        active_layout,
                    };
                }
            }
        }

        Self {
            clients: HashMap::with_capacity(100),
            chat_messages: HashMap::with_capacity(100),
            paid_messages: Vec::with_capacity(100),
            exchange_rates,
            viewer_counts: HashMap::with_capacity(100),
            layout_manager,
            active_layout,
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
        self.chat_messages.insert(id.to_owned(), chat_msg);

        // Backup premium chats to a vector.
        // Performed at the end to avoid having to copy.
        if usd > 0.0 {
            if self.paid_messages.len() >= self.paid_messages.capacity() - 1 {
                self.paid_messages.reserve(100);
            }
            self.paid_messages.push(id);

            // Save all messages with amount > 0 to disk in case of a crash
            let mut super_chats: Vec<ChatMessage> = self
                .paid_messages
                .iter()
                .filter_map(|id| self.chat_messages.get(id).cloned())
                .collect();

            super_chats.sort_by_key(|msg| msg.received_at);

            let super_chats_json = serde_json::to_string(&super_chats).unwrap();
            std::fs::write("super_chats.json", super_chats_json).unwrap();
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
impl<'a> Handler<message::FeatureMessage> for ChatServer {
    type Result = ();

    fn handle(&mut self, msg: message::FeatureMessage, _: &mut Context<Self>) -> Self::Result {
        for (_, conn) in &self.clients {
            conn.recipient.do_send(message::Reply(
                serde_json::to_string(&message::ReplyInner {
                    tag: "feature_message".to_owned(),
                    message: serde_json::to_string(&msg.id)
                        .expect("Failed to serialize feature string."),
                })
                .expect("Failed to serialize feature ReplyInner"),
            ));
        }
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
        self.paid_messages.retain(|&id| id != msg.id);

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

/// Handler for all stored Superchats.
impl<'a> Handler<message::PaidMessages> for ChatServer {
    type Result = MessageResult<message::PaidMessages>;

    fn handle(&mut self, _: message::PaidMessages, _: &mut Context<Self>) -> Self::Result {
        let mut super_chats: Vec<ChatMessage> = self
            .paid_messages
            .iter()
            .filter_map(|id| self.chat_messages.get(id).cloned())
            .collect();
        super_chats.sort_by_key(|msg| msg.received_at);
        debug!("Sending {} superchats.", super_chats.len());
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
