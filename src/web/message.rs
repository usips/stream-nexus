use crate::layout::Layout;
use crate::message::Message as ChatMessage;
use actix::{Message, Recipient};
use serde::{Deserialize, Serialize};

/// Client hello message.
pub struct Connect {
    pub recipient: Recipient<Reply>,
}

impl Message for Connect {
    type Result = usize;
}

/// Announce disconnect
pub struct Disconnect {
    pub id: usize,
}

impl Message for Disconnect {
    type Result = ();
}

/// Server response to clients listening to the WebSocket.
/// Usually a serialized JSON string.
pub struct Reply(pub String);

impl Message for Reply {
    type Result = ();
}

#[derive(Deserialize, Serialize, Debug)]
pub struct ReplyInner {
    pub tag: String,
    pub message: String,
}

/// Content message.
pub struct Content {
    pub chat_message: ChatMessage,
}

impl Message for Content {
    type Result = ();
}

/// Feature/Unfeature message.
pub struct FeatureMessage {
    pub id: Option<uuid::Uuid>,
}

impl Message for FeatureMessage {
    type Result = ();
}

/// Request for paid messages.
pub struct PaidMessages;

impl Message for PaidMessages {
    type Result = Vec<ChatMessage>;
}

/// Request for recent chat messages.
pub struct RecentMessages;

impl Message for RecentMessages {
    type Result = Vec<ChatMessage>;
}

/// Remove message
pub struct RemoveMessage {
    pub id: uuid::Uuid,
}

impl Message for RemoveMessage {
    type Result = ();
}

/// Request for view counts.
#[derive(Deserialize, Serialize, Debug)]
pub struct ViewCount {
    pub platform: String,
    //pub channel: String,
    pub viewers: usize,
}

impl Message for ViewCount {
    type Result = ();
}

// ============================================================================
// Layout Messages
// ============================================================================

/// Broadcast a layout update to all connected clients
pub struct LayoutUpdate {
    pub layout: Layout,
}

impl Message for LayoutUpdate {
    type Result = ();
}

/// Switch the active layout (broadcasts to all clients)
pub struct SwitchLayout {
    pub name: String,
}

impl Message for SwitchLayout {
    type Result = Result<(), String>;
}

/// Save a layout to disk
pub struct SaveLayout {
    pub layout: Layout,
}

impl Message for SaveLayout {
    type Result = Result<(), String>;
}

/// Delete a layout from disk
pub struct DeleteLayout {
    pub name: String,
}

impl Message for DeleteLayout {
    type Result = Result<(), String>;
}

/// Request the current active layout
pub struct RequestLayout;

impl Message for RequestLayout {
    type Result = Layout;
}

/// Request list of all available layouts
pub struct RequestLayoutList;

/// Response for layout list request
#[derive(Serialize, Clone)]
pub struct LayoutListResponse {
    pub layouts: Vec<String>,
    pub active: String,
}

impl Message for RequestLayoutList {
    type Result = LayoutListResponse;
}
