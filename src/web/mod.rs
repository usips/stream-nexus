mod client;
mod message;
mod server;

pub use client::ChatClient;
pub use message::Content as ChatMessage;
pub use message::PaidMessages;
pub use server::ChatServer;

use actix::Addr;
use actix_web::{http::header, web, Error, HttpRequest, HttpResponse, Responder};
use actix_web_actors::ws;
use askama::Template;
use std::time::{Duration, Instant};
use tracing::debug;

use crate::layout::Layout;

const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(1);
const CLIENT_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Template)]
#[template(path = "home.html")]
struct HomeTemplate {}

#[derive(Template)]
#[template(path = "chat.html")]
struct ChatTemplate {}

#[derive(Template)]
#[template(path = "dashboard.html")]
struct DashboardTemplate {
    super_chats: Vec<crate::message::Message>,
}

#[actix_web::get("/")]
pub async fn home() -> impl Responder {
    HomeTemplate {}
}

#[derive(Template)]
#[template(path = "frame.html")]
struct LayoutTemplate {
    layout_name: String,
}

/// Query parameters for /layout endpoint
#[derive(serde::Deserialize)]
pub struct LayoutQuery {
    name: Option<String>,
}

/// GET /layout?name= - Load a specific layout by name
#[actix_web::get("/layout")]
pub async fn layout_view(req: HttpRequest, query: web::Query<LayoutQuery>) -> impl Responder {
    let chat_server = req
        .app_data::<Addr<ChatServer>>()
        .expect("ChatServer missing in app data!")
        .clone();

    // If name is provided, try to load that layout; otherwise use active layout
    let layout_name = if let Some(name) = &query.name {
        // Verify the layout exists
        match chat_server
            .send(message::RequestLayoutByName {
                name: name.clone(),
            })
            .await
        {
            Ok(Some(_)) => name.clone(),
            Ok(None) => {
                return HttpResponse::NotFound().body(format!("Layout '{}' not found", name));
            }
            Err(e) => {
                return HttpResponse::InternalServerError().body(format!("Error: {}", e));
            }
        }
    } else {
        // No name provided, use active layout
        let layout = chat_server.send(message::RequestLayout).await.unwrap();
        layout.name.clone()
    };

    HttpResponse::Ok()
        .content_type("text/html; charset=utf-8")
        .body(
            LayoutTemplate {
                layout_name,
            }
            .to_string(),
        )
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
pub async fn websocket(req: HttpRequest, stream: web::Payload) -> Result<HttpResponse, Error> {
    let server = req
        .app_data::<Addr<ChatServer>>()
        .expect("ChatServer missing in app data!")
        .clone();
    let client = ChatClient {
        id: rand::random(),
        server,
        last_heartbeat_at: Instant::now(),
    };

    let resp = ws::start(client, &req, stream);
    debug!("WebSocket client connected");
    resp
}

// ============================================================================
// Layout REST API
// ============================================================================

/// GET /api/layouts - List all available layouts
#[actix_web::get("/api/layouts")]
pub async fn list_layouts(req: HttpRequest) -> impl Responder {
    let chat_server = req
        .app_data::<Addr<ChatServer>>()
        .expect("ChatServer missing in app data!")
        .clone();

    match chat_server.send(message::RequestLayoutList).await {
        Ok(list) => HttpResponse::Ok().json(list),
        Err(e) => HttpResponse::InternalServerError().body(format!("Error: {}", e)),
    }
}

/// GET /api/layouts/{name} - Get a specific layout
#[actix_web::get("/api/layouts/{name}")]
pub async fn get_layout(req: HttpRequest, name: web::Path<String>) -> impl Responder {
    let chat_server = req
        .app_data::<Addr<ChatServer>>()
        .expect("ChatServer missing in app data!")
        .clone();

    // We need to get the layout manager from the ChatServer
    // For now, we'll use RequestLayout for the active layout and handle others via WebSocket
    // A proper implementation would require exposing LayoutManager via app_data

    // For simplicity, only support getting the active layout via REST
    // Full layout operations go through WebSocket
    match chat_server.send(message::RequestLayout).await {
        Ok(layout) => {
            if layout.name == name.into_inner() {
                HttpResponse::Ok().json(layout)
            } else {
                HttpResponse::NotFound()
                    .body("Layout not found (use WebSocket for non-active layouts)")
            }
        }
        Err(e) => HttpResponse::InternalServerError().body(format!("Error: {}", e)),
    }
}

/// POST /api/layouts/{name} - Save a layout
#[actix_web::post("/api/layouts/{name}")]
pub async fn save_layout(
    req: HttpRequest,
    name: web::Path<String>,
    body: web::Json<Layout>,
) -> impl Responder {
    let chat_server = req
        .app_data::<Addr<ChatServer>>()
        .expect("ChatServer missing in app data!")
        .clone();

    let mut layout = body.into_inner();
    layout.name = name.into_inner();

    match chat_server.send(message::SaveLayout { layout }).await {
        Ok(Ok(())) => HttpResponse::Ok().body("Layout saved"),
        Ok(Err(e)) => HttpResponse::BadRequest().body(e),
        Err(e) => HttpResponse::InternalServerError().body(format!("Error: {}", e)),
    }
}

/// DELETE /api/layouts/{name} - Delete a layout
#[actix_web::delete("/api/layouts/{name}")]
pub async fn delete_layout(req: HttpRequest, name: web::Path<String>) -> impl Responder {
    let chat_server = req
        .app_data::<Addr<ChatServer>>()
        .expect("ChatServer missing in app data!")
        .clone();

    match chat_server
        .send(message::DeleteLayout {
            name: name.into_inner(),
        })
        .await
    {
        Ok(Ok(())) => HttpResponse::Ok().body("Layout deleted"),
        Ok(Err(e)) => HttpResponse::BadRequest().body(e),
        Err(e) => HttpResponse::InternalServerError().body(format!("Error: {}", e)),
    }
}

/// POST /api/layouts/{name}/activate - Switch to a layout
#[actix_web::post("/api/layouts/{name}/activate")]
pub async fn activate_layout(req: HttpRequest, name: web::Path<String>) -> impl Responder {
    let chat_server = req
        .app_data::<Addr<ChatServer>>()
        .expect("ChatServer missing in app data!")
        .clone();

    match chat_server
        .send(message::SwitchLayout {
            name: name.into_inner(),
        })
        .await
    {
        Ok(Ok(())) => HttpResponse::Ok().body("Layout activated"),
        Ok(Err(e)) => HttpResponse::BadRequest().body(e),
        Err(e) => HttpResponse::InternalServerError().body(format!("Error: {}", e)),
    }
}

/// GET /editor - Serve the React editor SPA
#[actix_web::get("/editor")]
pub async fn editor() -> impl Responder {
    // Serve the editor index.html
    match std::fs::read_to_string("public/editor/index.html") {
        Ok(content) => HttpResponse::Ok()
            .content_type("text/html; charset=utf-8")
            .body(content),
        Err(_) => HttpResponse::NotFound()
            .body("Editor not built. Run 'npm run build:editor' to build the editor."),
    }
}

/// GET /editor/{filename} - Serve editor static files
#[actix_web::get("/editor/{filename:.*}")]
pub async fn editor_static(path: web::Path<String>) -> impl Responder {
    let filename = path.into_inner();

    // Prevent directory traversal
    if filename.contains("..") || filename.starts_with('/') {
        return HttpResponse::BadRequest().body("Invalid path");
    }

    let file_path = format!("public/editor/{}", filename);

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
                Some("map") => "application/json",
                _ => "application/octet-stream",
            };

            HttpResponse::Ok()
                .append_header((header::CONTENT_TYPE, content_type))
                .body(contents)
        }
        Err(_) => HttpResponse::NotFound().body("File not found"),
    }
}
