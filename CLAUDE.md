# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Stream Nexus is a multi-platform livestream chat aggregator backend that receives chat messages from various platforms (Twitch, YouTube, Kick, Rumble, etc.) and unifies them into a single dashboard and overlay for streamers.

The client-side chat scraper (CHUCK) lives in a separate repository: `chat-harvester`.

## Build Commands

```bash
# Build and run Rust backend
cargo build
cargo run

# Build frontend JS (Matter.js physics background)
npm run build
```

## Architecture

### Technology Stack
- **Backend**: Rust with Actix-web 4.3 and Actix actors
- **Templates**: Askama for server-side HTML rendering
- **Frontend**: Vanilla JavaScript, Matter.js for physics background (bundled with Webpack 5)

### Actor-Based Message System
The backend uses Actix's actor model for real-time chat:
- `ChatServer` (`src/web/server.rs`) - Central hub maintaining client connections, chat history, paid message persistence, and viewer counts. Broadcasts messages to all connected dashboard/overlay clients.
- `ChatClient` (`src/web/client.rs`) - Handles individual WebSocket connections with heartbeat (1s interval, 5s timeout)

### Message Flow
```
Platform Chat → CHUCK (separate repo) → WebSocket → ChatClient → ChatServer → All Dashboard/Overlay Clients
```

### Key Files
- `src/main.rs` - Server startup, route configuration
- `src/web/server.rs` - ChatServer actor with message broadcasting logic
- `src/web/client.rs` - WebSocket client handling and heartbeat
- `src/message.rs` - Message struct with HTML rendering via Askama
- `src/exchange.rs` - ECB currency exchange rate fetching
- `public/` - Static assets (dashboard.js, script.js, styles)
- `templates/` - Askama HTML templates

### WebSocket Protocol
Clients send `LivestreamUpdate` JSON with:
- `platform`: Source platform name
- `messages`: Array of chat messages
- `removals`: Array of message UUIDs to remove
- `viewers`: Optional viewer count

Server broadcasts `ReplyInner` with tags: `chat_message`, `feature_message`, `remove_message`, `viewers`

## Configuration

Environment variables (`.env.example`):
- `SERVER_IP` (default: 127.0.0.1)
- `SERVER_PORT` (default: 1350)
- `RUST_LOG` (debug/info)
- `SSL_ENABLE`, `SSL_CERT`, `SSL_KEY` for HTTPS

## Key Implementation Details

- **Currency Exchange**: Fetches rates from ECB daily, caches to `exchange_rates.xml`
- **Paid Messages**: Persisted to `super_chats.json` (loaded on restart if <15 min old)
- **Emoji Replacement**: Token-based approach in server.rs to avoid double-replacement
- **HTML Escaping**: Manual escaping in ChatServer before broadcast (not ammonia)

## Routes

- `/chat` - Chat overlay view (for OBS)
- `/dashboard` - Administrative dashboard
- `/overlay` - Alternative overlay view
- `/background` - Physics background overlay
- `/chat.ws` - WebSocket endpoint for real-time chat
- `/static/*` - Static file serving
