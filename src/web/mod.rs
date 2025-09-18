mod client;
mod message;
mod server;

pub use client::ChatClient;
pub use message::Content as ChatMessage;
pub use message::PaidMessages;
pub use server::ChatServer;

use actix::Addr;
use actix_web::HttpResponseBuilder;
use actix_web::{http::header, web, Error, HttpRequest, HttpResponse, Responder};
use actix_web_actors::ws;
use askama_actix::Template;
use askama_actix::TemplateToResponse;
use std::time::{Duration, Instant};

const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(1);
const CLIENT_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Template)]
#[template(path = "background.html")]
struct BackgroundTemplate {
    super_chats: Vec<crate::message::Message>,
}
#[derive(Template)]
#[template(path = "chat.html")]
struct ChatTemplate {}

#[derive(Template)]
#[template(path = "dashboard.html")]
struct DashboardTemplate {
    super_chats: Vec<crate::message::Message>,
}

#[derive(Template)]
#[template(path = "overlay.html")]
struct OverlayTemplate {
    super_chats: Vec<crate::message::Message>,
}

#[actix_web::get("/background")]
pub async fn background(req: HttpRequest) -> impl Responder {
    let chat_server = req
        .app_data::<Addr<ChatServer>>()
        .expect("ChatServer missing in app data!")
        .clone();
    BackgroundTemplate {
        super_chats: chat_server.send(PaidMessages).await.unwrap(),
    }
}

#[actix_web::get("/chat")]
pub async fn chat() -> impl Responder {
    HttpResponse::Ok()
        .insert_header((
            header::CONTENT_SECURITY_POLICY,
            "default-src 'self'; img-src * 'self' data:; font-src *; style-src * 'unsafe-inline';",
        ))
        .body(ChatTemplate {}.to_string())
}

#[actix_web::get("/dashboard")]
pub async fn dashboard(req: HttpRequest) -> impl Responder {
    let chat_server = req
        .app_data::<Addr<ChatServer>>()
        .expect("ChatServer missing in app data!")
        .clone();
    DashboardTemplate {
        super_chats: chat_server.send(PaidMessages).await.unwrap(),
    }
}

#[actix_web::get("/overlay")]
pub async fn overlay(req: HttpRequest) -> impl Responder {
    let chat_server = req
        .app_data::<Addr<ChatServer>>()
        .expect("ChatServer missing in app data!")
        .clone();
    OverlayTemplate {
        super_chats: chat_server.send(PaidMessages).await.unwrap(),
    }
}

#[actix_web::get("/static/{filename:.*}")]
pub async fn static_files(path: web::Path<String>) -> impl Responder {
    let filename = path.into_inner();

    // Prevent directory traversal
    if filename.contains("..") || filename.starts_with('/') {
        return HttpResponse::BadRequest().body("Invalid path");
    }

    let file_path = format!("public/{}", filename);

    match std::fs::read(&file_path) {
        Ok(contents) => {
            let content_type = match std::path::Path::new(&filename)
                .extension()
                .and_then(|ext| ext.to_str())
            {
                Some("js") => "text/javascript",
                Some("css") => "text/css",
                Some("html") => "text/html",
                Some("png") => "image/png",
                Some("jpg") | Some("jpeg") => "image/jpeg",
                Some("svg") => "image/svg+xml",
                Some("gif") => "image/gif",
                Some("ico") => "image/x-icon",
                Some("json") => "application/json",
                Some("txt") => "text/plain",
                _ => "application/octet-stream",
            };

            HttpResponse::Ok()
                .append_header((header::CONTENT_TYPE, content_type))
                .body(contents)
        }
        Err(_) => HttpResponse::NotFound().body("File not found"),
    }
}

#[actix_web::get("/chat.ws")]
async fn websocket(req: HttpRequest, stream: web::Payload) -> Result<HttpResponse, Error> {
    let server = req
        .app_data::<Addr<ChatServer>>()
        .expect("ChatServer missing in app data!")
        .clone();
    let client = ChatClient {
        id: rand::random(),
        server,
        last_heartbeat_at: Instant::now(),
        last_command_at: Instant::now(),
    };

    let resp = ws::start(client, &req, stream);
    println!("{:?}", resp);
    resp
}
