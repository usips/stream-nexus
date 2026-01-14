# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Stream Nexus is a multi-platform livestream chat aggregator that unifies chat from Twitch, YouTube, Kick, Rumble, Odysee, X/Twitter, VK, and XMRchat into a single dashboard and overlay.

**CHUCK** (Chat Harvesting Universal Connection Kit) is the client-side chat scraper component, available as:
- Userscript for Violentmonkey/Greasemonkey
- Browser extension for Chrome and Firefox

## Build Commands

```bash
# Build Rust backend
cargo build
cargo build --release
cargo run

# Build CHUCK userscript
npm run build:userscript    # Output: js/dist/chuck.user.js

# Build browser extensions
npm run build:extension:chrome   # Output: js/dist/chrome/
npm run build:extension:firefox  # Output: js/dist/firefox/

# Build all
npm run build

# Watch mode for development
npm run watch:userscript
```

## Architecture

### Technology Stack
- **Backend**: Rust with Actix-web 4.3 and Actix actors
- **Templates**: Askama for server-side HTML rendering
- **Frontend**: Vanilla JavaScript, Matter.js for physics background
- **CHUCK**: Modular ES6 JavaScript, bundled with Webpack 5

### Actor-Based Message System
The backend uses Actix's actor model for real-time chat:
- `ChatServer` (`src/web/server.rs`) - Central message hub that broadcasts to all connected clients
- `ChatClient` (`src/web/client.rs`) - Handles individual WebSocket connections with heartbeat (1s interval, 5s timeout)

### Message Flow
```
Platform Chat → CHUCK (userscript/extension) → WebSocket → ChatClient → ChatServer → All Clients
```

### Key Directories
- `src/` - Rust backend (server, WebSocket handling, currency exchange)
- `js/src/core/` - CHUCK core classes (Seed base, message types, config, UUID)
- `js/src/platforms/` - Platform-specific scrapers (kick.js, youtube.js, etc.)
- `js/extension/` - Browser extension files (manifest, popup, background)
- `js/dist/` - Build output (gitignored)
- `public/` - Static assets and frontend JavaScript
- `templates/` - Askama HTML templates

### CHUCK Architecture
The `Seed` base class (`js/src/core/seed.js`) provides:
- WebSocket/Fetch/XHR/EventSource patching to intercept platform traffic
- Connection to backend server with auto-reconnect
- Standardized message format (`ChatMessage` class)

Each platform extends `Seed` and overrides hooks like `onWebSocketMessage()` to parse platform-specific data. Platforms are registered in `js/src/platforms/index.js`

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
