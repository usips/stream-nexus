use actix::*;
use actix_web_actors::ws;
use serde::Deserialize;
use std::time::Instant;

use super::message;
use super::ChatMessage;
use super::ChatServer;
use super::CLIENT_TIMEOUT;
use super::HEARTBEAT_INTERVAL;
use crate::layout::Layout;
use crate::message::{CommandFeatureMessage, LivestreamUpdate};

/// Layout-related commands from WebSocket clients
#[derive(Deserialize, Debug)]
struct LayoutCommand {
    #[serde(default)]
    layout_update: Option<Layout>,
    #[serde(default)]
    switch_layout: Option<String>,
    #[serde(default)]
    save_layout: Option<SaveLayoutCommand>,
    #[serde(default)]
    delete_layout: Option<String>,
    #[serde(default)]
    request_layout: Option<bool>,
    #[serde(default)]
    request_layouts: Option<bool>,
    /// Subscribe to a specific layout by name (used by overlay views)
    #[serde(default)]
    subscribe_layout: Option<String>,
}

#[derive(Deserialize, Debug)]
struct SaveLayoutCommand {
    name: String,
    layout: Layout,
}

pub struct ChatClient {
    /// Connection ID
    pub id: usize,
    /// Chat server
    pub server: Addr<ChatServer>,
    /// Last Heartbeat
    /// Client must send ping at least once per 10 seconds (CLIENT_TIMEOUT), otherwise we drop connection.
    pub last_heartbeat_at: Instant,
}

impl ChatClient {
    /// helper method that sends ping to client every second.
    ///
    /// also this method checks heartbeats from client
    fn heartbeat(&self, ctx: &mut ws::WebsocketContext<Self>) {
        ctx.run_interval(HEARTBEAT_INTERVAL, |act, ctx| {
            // check client heartbeats
            if Instant::now().duration_since(act.last_heartbeat_at) > CLIENT_TIMEOUT {
                // heartbeat timed out

                // notify chat server
                act.send_or_reply(ctx, message::Disconnect { id: act.id });

                // stop actor
                ctx.stop();

                // don't try to send a ping
                return;
            }

            ctx.ping(b"");
        });
    }

    /// Try to send message
    ///
    /// This method fails if actor's mailbox is full or closed. This method
    /// register current task in receivers queue.
    fn send_or_reply<M>(&self, _: &mut ws::WebsocketContext<Self>, msg: M)
    where
        M: actix::Message + std::marker::Send + 'static,
        M::Result: Send,
        ChatServer: Handler<M>,
    {
        if let Err(err) = self.server.try_send(msg) {
            log::error!("Error sending message to server: {:?}", err);
        }
    }

    fn start_heartbeat(&self, ctx: &mut ws::WebsocketContext<Self>) {
        // start heartbeat process on session start.
        self.heartbeat(ctx);

        // register self in chat server. `AsyncContext::wait` register
        // future within context, but context waits until this future resolves
        // before processing any other events.
        // HttpContext::state() is instance of WsConnectionState, state is shared
        // across all routes within application
        self.server
            .send(message::Connect {
                recipient: ctx.address().recipient(),
            })
            .into_actor(self)
            .then(|res, act, ctx| {
                match res {
                    Ok(res) => act.id = res,
                    Err(err) => {
                        // something is wrong with chat server
                        log::warn!("Failed to assign conection id: {:?}", err);
                        ctx.stop();
                    }
                }
                fut::ready(())
            })
            .wait(ctx);
    }
}

impl Actor for ChatClient {
    type Context = ws::WebsocketContext<Self>;

    /// Method is called on actor start.
    /// We register ws session with ChatServer
    fn started(&mut self, ctx: &mut Self::Context) {
        self.start_heartbeat(ctx);
    }

    fn stopping(&mut self, ctx: &mut Self::Context) -> Running {
        // notify chat server
        self.send_or_reply(ctx, message::Disconnect { id: self.id });
        Running::Stop
    }
}

/// Handle messages from chat server, we simply send it to peer websocket
impl Handler<message::Reply> for ChatClient {
    type Result = ();

    fn handle(&mut self, msg: message::Reply, ctx: &mut Self::Context) {
        ctx.text(msg.0);
    }
}

/// WebSocket message handler
impl StreamHandler<Result<ws::Message, ws::ProtocolError>> for ChatClient {
    fn handle(&mut self, msg: Result<ws::Message, ws::ProtocolError>, ctx: &mut Self::Context) {
        let msg = match msg {
            Err(_) => {
                ctx.stop();
                return;
            }
            Ok(msg) => msg,
        };

        match msg {
            ws::Message::Ping(msg) => {
                self.last_heartbeat_at = Instant::now();
                ctx.pong(&msg);
            }
            ws::Message::Pong(_) => {
                self.last_heartbeat_at = Instant::now();
            }
            ws::Message::Text(text) => {
                // Try parsing as LivestreamUpdate first
                if let Ok(update) = serde_json::from_str::<LivestreamUpdate>(&text) {
                    let mut handled = false;
                    // Send Chat Messages
                    if let Some(messages) = update.messages {
                        handled = true;
                        for message in messages {
                            self.send_or_reply(
                                ctx,
                                ChatMessage {
                                    chat_message: message,
                                },
                            );
                        }
                    }
                    // Send Removals
                    if let Some(removals) = update.removals {
                        handled = true;
                        for id in removals {
                            self.send_or_reply(ctx, message::RemoveMessage { id });
                        }
                    }
                    // Send Viewer Counts
                    if let Some(viewers) = update.viewers {
                        handled = true;
                        self.send_or_reply(
                            ctx,
                            message::ViewCount {
                                platform: update.platform,
                                viewers,
                            },
                        );
                    }
                    if handled {
                        return;
                    }
                }

                // Try parsing as FeatureMessage (only if it actually has a feature_message field)
                if let Ok(cmd) = serde_json::from_str::<CommandFeatureMessage>(&text) {
                    if cmd.feature_message.is_some() || text.contains("feature_message") {
                        self.send_or_reply(
                            ctx,
                            message::FeatureMessage {
                                id: cmd.feature_message,
                            },
                        );
                        return;
                    }
                }

                // Try parsing as LayoutCommand
                if let Ok(cmd) = serde_json::from_str::<LayoutCommand>(&text) {
                    log::debug!("[ChatClient] Parsed LayoutCommand: {:?}", cmd);

                    // Handle layout update broadcast
                    if let Some(layout) = cmd.layout_update {
                        log::info!("[ChatClient] Broadcasting layout update: {}", layout.name);
                        self.send_or_reply(ctx, message::LayoutUpdate { layout });
                        return;
                    }

                    // Handle switch layout
                    if let Some(name) = cmd.switch_layout {
                        self.send_or_reply(ctx, message::SwitchLayout { name });
                        return;
                    }

                    // Handle save layout
                    if let Some(save_cmd) = cmd.save_layout {
                        log::info!("[ChatClient] Saving layout: {}", save_cmd.name);
                        let mut layout = save_cmd.layout;
                        layout.name = save_cmd.name.clone();
                        self.send_or_reply(ctx, message::SaveLayout { layout });
                        return;
                    }

                    // Handle delete layout
                    if let Some(name) = cmd.delete_layout {
                        self.send_or_reply(ctx, message::DeleteLayout { name });
                        return;
                    }

                    // Handle request layout
                    if cmd.request_layout.unwrap_or(false) {
                        log::info!("[ChatClient] Client requesting current layout");
                        self.server
                            .send(message::RequestLayout)
                            .into_actor(self)
                            .then(|res, _, ctx| {
                                if let Ok(layout) = res {
                                    let reply = serde_json::to_string(&message::ReplyInner {
                                        tag: "layout_update".to_owned(),
                                        message: serde_json::to_string(&layout).unwrap(),
                                    })
                                    .unwrap();
                                    ctx.text(reply);
                                }
                                fut::ready(())
                            })
                            .wait(ctx);
                        return;
                    }

                    // Handle subscribe to specific layout
                    if let Some(name) = cmd.subscribe_layout {
                        log::info!("[ChatClient] Client subscribing to layout: {}", name);
                        self.server
                            .send(message::RequestLayoutByName { name: name.clone() })
                            .into_actor(self)
                            .then(move |res, _, ctx| {
                                match res {
                                    Ok(Some(layout)) => {
                                        let reply = serde_json::to_string(&message::ReplyInner {
                                            tag: "layout_update".to_owned(),
                                            message: serde_json::to_string(&layout).unwrap(),
                                        })
                                        .unwrap();
                                        ctx.text(reply);
                                    }
                                    Ok(None) => {
                                        log::warn!("[ChatClient] Layout not found: {}", name);
                                    }
                                    Err(e) => {
                                        log::error!("[ChatClient] Error fetching layout: {:?}", e);
                                    }
                                }
                                fut::ready(())
                            })
                            .wait(ctx);
                        return;
                    }

                    // Handle request layouts list
                    if cmd.request_layouts.unwrap_or(false) {
                        self.server
                            .send(message::RequestLayoutList)
                            .into_actor(self)
                            .then(|res, _, ctx| {
                                if let Ok(list) = res {
                                    let reply = serde_json::to_string(&message::ReplyInner {
                                        tag: "layout_list".to_owned(),
                                        message: serde_json::to_string(&list).unwrap(),
                                    })
                                    .unwrap();
                                    ctx.text(reply);
                                }
                                fut::ready(())
                            })
                            .wait(ctx);
                        return;
                    }
                }

                log::warn!("Unrecognized WebSocket message: {}", text);
            }
            ws::Message::Binary(_) => log::warn!("Unexpected ChatClient binary."),
            ws::Message::Close(reason) => {
                log::debug!("Client {} disconnecting with reason: {:?}", self.id, reason);
                ctx.close(reason);
                ctx.stop();
            }
            ws::Message::Continuation(_) => {
                ctx.stop();
            }
            ws::Message::Nop => (),
        }
    }
}
