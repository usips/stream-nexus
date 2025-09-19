use actix::{Actor, Context, Handler, MessageResult, Recipient};
use std::collections::HashMap;
use uuid::Uuid;

use super::message;
use crate::exchange::ExchangeRates;
use crate::message::Message as ChatMessage;

pub struct Connection {
    pub id: usize,
    pub recipient: Recipient<message::Reply>,
}

/// Define HTTP actor
pub struct ChatServer {
    pub clients: HashMap<usize, Connection>,
    pub chat_messages: HashMap<Uuid, ChatMessage>,
    pub paid_messages: Vec<Uuid>,
    pub exchange_rates: ExchangeRates,
    pub viewer_counts: HashMap<String, usize>,
}

impl ChatServer {
    pub fn new(exchange_rates: ExchangeRates) -> Self {
        log::info!("Chat actor starting up.");

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
                    log::info!("Loading superchats from disk.");
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
        log::debug!("New client connected to chat.");
        // random usize
        let id: usize = rand::random();
        self.clients.insert(
            id,
            Connection {
                id,
                recipient: msg.recipient,
            },
        );
        id
    }
}

/// Handler for a new Chat Message from the browser.
impl Handler<message::Content> for ChatServer {
    type Result = ();

    fn handle(&mut self, mut msg: message::Content, _: &mut Context<Self>) -> Self::Result {
        log::debug!("[ChatServer] {}", msg.chat_message.to_console_msg());

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

        log::debug!("Sending {} recent messages.", last_messages.len());
        MessageResult(last_messages)
    }
}

/// Handler for remove a message.
impl Handler<message::RemoveMessage> for ChatServer {
    type Result = ();

    fn handle(&mut self, msg: message::RemoveMessage, _: &mut Context<Self>) -> Self::Result {
        log::debug!("[ChatServer] Removing message with ID {}", msg.id);
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
        log::debug!("Sending {} superchats.", super_chats.len());
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
