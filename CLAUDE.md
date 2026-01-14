# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Stream Nexus (S.N.E.E.D.) is a multi-platform livestream chat aggregator that unifies chat from Twitch, YouTube, Kick, Rumble, Odysee, X/Twitter, VK, and XMRchat into a single dashboard and overlay.

## Build Commands

```bash
# Build Rust backend (development)
cargo build

# Build Rust backend (release)
cargo build --release

# Run the server
cargo run

# Build JavaScript userscripts with webpack
npm run webpack
```

## Architecture

### Technology Stack
- **Backend**: Rust with Actix-web 4.3 and Actix actors
- **Templates**: Askama for server-side HTML rendering
- **Frontend**: Vanilla JavaScript, Matter.js for physics background
- **Bundling**: Webpack 5 for userscripts

### Actor-Based Message System
The backend uses Actix's actor model for real-time chat:
- `ChatServer` (`src/web/server.rs`) - Central message hub that broadcasts to all connected clients
- `ChatClient` (`src/web/client.rs`) - Handles individual WebSocket connections with heartbeat (1s interval, 5s timeout)

### Message Flow
```
Platform Chat → Userscript → WebSocket → ChatClient → ChatServer → All Clients
```

### Key Directories
- `src/` - Rust backend (server, WebSocket handling, currency exchange)
- `js/feed/` - Platform-specific userscripts that intercept chat events
- `public/` - Static assets and frontend JavaScript
- `templates/` - Askama HTML templates

### Userscript Integration
Each platform has a dedicated userscript in `js/feed/` that:
1. Monkeypatches native WebSocket/Fetch APIs to intercept chat events
2. Normalizes messages to a common format
3. Sends to the local SNEED server via WebSocket

## Configuration

Environment variables (see `.env.example`):
- `SERVER_IP` (default: 127.0.0.1)
- `SERVER_PORT` (default: 1350)
- `RUST_LOG` (debug/info)
- `SSL_ENABLE`, `SSL_CERT`, `SSL_KEY` for HTTPS

## Key Implementation Details

- **Currency Exchange**: Fetches rates from ECB daily, caches to `exchange_rates.xml` as fallback
- **HTML Sanitization**: Uses `ammonia` crate to prevent XSS
- **Paid Messages**: Persisted to `super_chats.json` for crash recovery
- **Emoji Replacement**: Uses token-based approach to avoid double-replacement issues

## Routes

- `/chat` - Chat overlay view
- `/dashboard` - Administrative dashboard
- `/overlay` - Alternative overlay view
- `/background` - Physics background overlay
- `/chat.ws` - WebSocket endpoint for real-time chat
- `/static/*` - Static file serving
