# SNEED - Copilot Instructions

SNEED (Stream Nexus for Enhanced Entertainment and Discourse) is a multi-platform livestream chat aggregator backend. It receives chat messages from CHUCK scrapers via WebSocket and provides unified dashboard/overlay views for streamers.

## Architecture

**Stack:** Rust (Actix-web + Actix actors) backend, Askama templates, vanilla JS frontends, React/Craft.js layout editor

### Actor-Based Message System

```
CHUCK (external) → WebSocket → ChatClient → ChatServer → All Dashboard/Overlay Clients
```

- **ChatServer** ([src/web/server.rs](src/web/server.rs)): Central hub maintaining client connections, chat history, paid message persistence (`super_chats.json`), viewer counts, and currency exchange rates
- **ChatClient** ([src/web/client.rs](src/web/client.rs)): Individual WebSocket connections with heartbeat (1s ping, 5s timeout)

### Key Directories

- `src/` - Rust backend source
- `src/frontend/overlay/` and `src/frontend/dashboard/` - **Edit source JS/CSS here** (copied to `public/` on build)
- `public/` - Static assets served by backend (generated, don't edit JS/CSS)
- `templates/` - Askama HTML templates (`chat.html`, `dashboard.html`, `overlay.html`, `message.html`)
- `layouts/` - Layout JSON files for overlay customization
- `editor/` - React/Craft.js layout editor (separate npm project)

## Build & Run

```bash
cargo run                     # Run Rust backend (requires .env with SERVER_IP/PORT)
npm run build:frontend        # Copy src/frontend/* → public/
npm run build:editor          # Build React layout editor
npm run build:all             # Everything (webpack + frontend + editor)
npm run watch:frontend        # Auto-rebuild frontend on changes (uses inotifywait)
```

## WebSocket Protocol

**Inbound** (`LivestreamUpdate` from CHUCK):
```json
{"platform": "Kick", "channel": "user", "messages": [...], "removals": ["uuid"], "viewers": 1234}
```

**Outbound** (`ReplyInner` to clients):
- Tags: `chat_message`, `feature_message`, `remove_message`, `viewers`, `layout_update`

## Key Implementation Details

- **Currency Exchange**: Fetched from ECB on startup, cached to `exchange_rates.xml` ([src/exchange.rs](src/exchange.rs))
- **Paid Messages**: Persisted to `super_chats.json`, reloaded if <15 min old on restart
- **Emoji Replacement**: Token-based approach in server.rs to avoid double-replacement issues
- **HTML Rendering**: Messages rendered via Askama `message.html` template, then sanitized
- **Layout System**: JSON-based layouts in `layouts/`, managed via REST API and WebSocket commands

## Routes

| Path | Purpose |
|------|---------|
| `/chat` | Chat overlay for OBS (CSP-restricted) |
| `/dashboard` | Admin dashboard with featured message control |
| `/overlay` | Alternative overlay view |
| `/background` | Physics background (Matter.js) |
| `/editor` | React layout editor |
| `/chat.ws` | WebSocket endpoint |

## Configuration

Environment variables (`.env`):
- `SERVER_IP` (default: 127.0.0.1)
- `SERVER_PORT` (default: 1350)
- `RUST_LOG` (debug/info)
- `SSL_ENABLE`, `SSL_CERT`, `SSL_KEY` for HTTPS
