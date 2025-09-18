mod exchange;
mod message;
mod sneed_env; // naming it "env" can be confusing.
mod web;

use crate::web::ChatServer;

use actix::Actor;
use actix_web::{App, HttpServer};
use anyhow::Result;

#[actix_web::main]
async fn main() -> Result<(), std::io::Error> {
    sneed_env::get_env();
    env_logger::init();

    let chat = ChatServer::new(
        exchange::fetch_exchange_rates()
            .await
            .expect("Failed to fetch exchange rates."),
    )
    .start();
    let chat_for_server = chat.clone();

    HttpServer::new(move || {
        App::new()
            .app_data(chat_for_server.clone())
            .service(web::background)
            .service(web::chat)
            .service(web::dashboard)
            .service(web::overlay)
            .service(web::static_files)
            .service(web::websocket)
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
