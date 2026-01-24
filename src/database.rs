use crate::message::Message;
use anyhow::{Context, Result};
use rusqlite::{params, Connection};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tracing::{debug, info, warn};
use uuid::Uuid;

/// Database wrapper for storing paid messages (superchats)
#[derive(Clone)]
pub struct Database {
    conn: Arc<Mutex<Connection>>,
}

impl Database {
    /// Create a new database connection with platform-agnostic path
    pub fn new() -> Result<Self> {
        let db_path = Self::get_database_path()?;

        // Ensure parent directory exists
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)
                .with_context(|| format!("Failed to create database directory: {:?}", parent))?;
        }

        info!("Opening database at: {:?}", db_path);
        let conn = Connection::open(&db_path)
            .with_context(|| format!("Failed to open database at {:?}", db_path))?;

        let db = Self {
            conn: Arc::new(Mutex::new(conn)),
        };

        db.initialize_schema()?;
        Ok(db)
    }

    /// Get platform-agnostic database path
    fn get_database_path() -> Result<PathBuf> {
        // Try to use platform-specific data directory
        let base_dir = if let Some(data_dir) = dirs::data_local_dir() {
            // Linux: ~/.local/share/stream-nexus
            // Windows: C:\Users\<User>\AppData\Local\stream-nexus
            // macOS: ~/Library/Application Support/stream-nexus
            data_dir.join("stream-nexus")
        } else {
            // Fallback to current directory
            warn!("Could not determine data directory, using current directory");
            PathBuf::from(".")
        };

        Ok(base_dir.join("paid_messages.db"))
    }

    /// Initialize database schema
    fn initialize_schema(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();

        conn.execute(
            "CREATE TABLE IF NOT EXISTS paid_messages (
                id TEXT PRIMARY KEY,
                platform TEXT NOT NULL,
                sent_at INTEGER NOT NULL,
                received_at INTEGER NOT NULL,
                message TEXT NOT NULL,
                emojis TEXT NOT NULL,
                username TEXT NOT NULL,
                avatar TEXT NOT NULL,
                amount REAL NOT NULL,
                currency TEXT NOT NULL,
                is_verified INTEGER NOT NULL DEFAULT 0,
                is_sub INTEGER NOT NULL DEFAULT 0,
                is_mod INTEGER NOT NULL DEFAULT 0,
                is_owner INTEGER NOT NULL DEFAULT 0,
                is_staff INTEGER NOT NULL DEFAULT 0
            )",
            [],
        )?;

        // Create index on received_at for efficient time-based queries
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_received_at ON paid_messages(received_at DESC)",
            [],
        )?;

        debug!("Database schema initialized");
        Ok(())
    }

    /// Insert or update a paid message
    pub fn upsert_paid_message(&self, msg: &Message) -> Result<()> {
        let conn = self.conn.lock().unwrap();

        let emojis_json = serde_json::to_string(&msg.emojis)?;

        conn.execute(
            "INSERT OR REPLACE INTO paid_messages
             (id, platform, sent_at, received_at, message, emojis, username, avatar,
              amount, currency, is_verified, is_sub, is_mod, is_owner, is_staff)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            params![
                msg.id.to_string(),
                msg.platform,
                msg.sent_at,
                msg.received_at,
                msg.message,
                emojis_json,
                msg.username,
                msg.avatar,
                msg.amount,
                msg.currency,
                msg.is_verified as i32,
                msg.is_sub as i32,
                msg.is_mod as i32,
                msg.is_owner as i32,
                msg.is_staff as i32,
            ],
        )?;

        debug!("Saved paid message {} to database", msg.id);
        Ok(())
    }

    /// Get a specific paid message by ID
    pub fn get_paid_message(&self, id: &Uuid) -> Result<Option<Message>> {
        let conn = self.conn.lock().unwrap();

        let mut stmt = conn.prepare(
            "SELECT id, platform, sent_at, received_at, message, emojis, username, avatar,
                    amount, currency, is_verified, is_sub, is_mod, is_owner, is_staff
             FROM paid_messages WHERE id = ?1"
        )?;

        let result = stmt.query_row(params![id.to_string()], |row| {
            Ok(Self::row_to_message(row)?)
        });

        match result {
            Ok(msg) => Ok(Some(msg)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    /// Get all paid messages from the last N hours
    pub fn get_paid_messages_since_hours(&self, hours: u32) -> Result<Vec<Message>> {
        let conn = self.conn.lock().unwrap();

        // Calculate cutoff time in milliseconds
        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64;
        let cutoff_ms = now_ms - (hours as i64 * 60 * 60 * 1000);

        let mut stmt = conn.prepare(
            "SELECT id, platform, sent_at, received_at, message, emojis, username, avatar,
                    amount, currency, is_verified, is_sub, is_mod, is_owner, is_staff
             FROM paid_messages
             WHERE received_at >= ?1
             ORDER BY received_at ASC"
        )?;

        let messages = stmt.query_map(params![cutoff_ms], |row| {
            Self::row_to_message(row)
        })?
        .filter_map(|r| r.ok())
        .collect();

        Ok(messages)
    }

    /// Get all paid messages (no time limit) - for overlay which shows current session
    pub fn get_all_paid_messages(&self) -> Result<Vec<Message>> {
        let conn = self.conn.lock().unwrap();

        let mut stmt = conn.prepare(
            "SELECT id, platform, sent_at, received_at, message, emojis, username, avatar,
                    amount, currency, is_verified, is_sub, is_mod, is_owner, is_staff
             FROM paid_messages
             ORDER BY received_at ASC"
        )?;

        let messages = stmt.query_map([], |row| {
            Self::row_to_message(row)
        })?
        .filter_map(|r| r.ok())
        .collect();

        Ok(messages)
    }

    /// Delete a paid message by ID
    pub fn delete_paid_message(&self, id: &Uuid) -> Result<bool> {
        let conn = self.conn.lock().unwrap();

        let rows_affected = conn.execute(
            "DELETE FROM paid_messages WHERE id = ?1",
            params![id.to_string()],
        )?;

        Ok(rows_affected > 0)
    }

    /// Delete paid messages older than N hours
    pub fn cleanup_old_messages(&self, hours: u32) -> Result<usize> {
        let conn = self.conn.lock().unwrap();

        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64;
        let cutoff_ms = now_ms - (hours as i64 * 60 * 60 * 1000);

        let rows_deleted = conn.execute(
            "DELETE FROM paid_messages WHERE received_at < ?1",
            params![cutoff_ms],
        )?;

        if rows_deleted > 0 {
            info!("Cleaned up {} old paid messages", rows_deleted);
        }

        Ok(rows_deleted)
    }

    /// Convert a database row to a Message
    fn row_to_message(row: &rusqlite::Row) -> rusqlite::Result<Message> {
        let id_str: String = row.get(0)?;
        let emojis_json: String = row.get(5)?;

        Ok(Message {
            id: Uuid::parse_str(&id_str).unwrap_or_else(|_| Uuid::new_v4()),
            platform: row.get(1)?,
            sent_at: row.get(2)?,
            received_at: row.get(3)?,
            is_placeholder: false,
            message: row.get(4)?,
            emojis: serde_json::from_str(&emojis_json).unwrap_or_default(),
            username: row.get(6)?,
            avatar: row.get(7)?,
            amount: row.get(8)?,
            currency: row.get(9)?,
            is_verified: row.get::<_, i32>(10)? != 0,
            is_sub: row.get::<_, i32>(11)? != 0,
            is_mod: row.get::<_, i32>(12)? != 0,
            is_owner: row.get::<_, i32>(13)? != 0,
            is_staff: row.get::<_, i32>(14)? != 0,
        })
    }
}
