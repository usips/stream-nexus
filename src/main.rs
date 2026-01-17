mod exchange;
mod layout;
mod message;
mod sneed_env; // naming it "env" can be confusing.
mod web;

use crate::layout::LayoutManager;
use crate::web::ChatServer;

use actix::Actor;
use actix_web::{App, HttpServer};
use anyhow::Result;
use std::sync::{Arc, Mutex};

#[actix_web::main]
async fn main() -> Result<(), std::io::Error> {
    sneed_env::get_env();
    env_logger::init();

    // Initialize layout manager
    let layout_manager = Arc::new(Mutex::new(
        LayoutManager::new("layouts").expect("Failed to initialize layout manager"),
    ));

    let chat = ChatServer::new(
        exchange::fetch_exchange_rates()
            .await
            .expect("Failed to fetch exchange rates."),
        layout_manager,
    )
    .start();
    let chat_for_server = chat.clone();

    HttpServer::new(move || {
        App::new()
            .app_data(chat_for_server.clone())
            // Views
            .service(web::home)
            .service(web::overlay)
            .service(web::frame_redirect)
            .service(web::background_redirect)
            .service(web::chat)
            .service(web::dashboard)
            .service(web::editor)
            .service(web::editor_static)
            // Static files
            .service(web::static_files)
            // WebSocket
            .service(web::websocket)
            // Layout REST API
            .service(web::list_layouts)
            .service(web::get_layout)
            .service(web::save_layout)
            .service(web::delete_layout)
            .service(web::activate_layout)
    })
    //.workers(1)
    .bind(format!(
        "{}:{}",
        dotenvy::var("SERVER_IP").expect("SERVER_IP not defined."),
        dotenvy::var("SERVER_PORT").expect("SERVER_PORT not defined.")
    ))
    .expect("Could not bind requested address.")
    .run()
    .await
}
