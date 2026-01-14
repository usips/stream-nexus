use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

/// Position configuration for an element
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Position {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub x: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub y: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub right: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bottom: Option<f64>,
}

/// Size configuration for an element
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Size {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<SizeValue>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub height: Option<SizeValue>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_width: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_height: Option<String>,
}

/// Size value can be a number (pixels) or a string (CSS value like "100%" or "auto")
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum SizeValue {
    Pixels(f64),
    Css(String),
}

/// Style properties for an element
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Style {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub background_color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font_size: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font_family: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font_weight: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font_style: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub padding: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub margin: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub border_radius: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub opacity: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transform: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub z_index: Option<i32>,
}

/// Configuration for an individual overlay element
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementConfig {
    pub enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    #[serde(default)]
    pub position: Position,
    #[serde(default)]
    pub size: Size,
    #[serde(default)]
    pub style: Style,
    /// Element-specific options (e.g., Live Badge platform filtering)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub options: Option<serde_json::Value>,
}

impl Default for ElementConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            display_name: None,
            position: Position::default(),
            size: Size::default(),
            style: Style::default(),
            options: None,
        }
    }
}

/// Message styling configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageStyle {
    #[serde(default = "default_avatar_size")]
    pub avatar_size: String,
    #[serde(default = "default_max_height")]
    pub max_height: String,
    #[serde(default = "default_border_radius")]
    pub border_radius: String,
    #[serde(default = "default_font_size")]
    pub font_size: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub background_color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text_color: Option<String>,
}

fn default_avatar_size() -> String {
    "2em".to_string()
}
fn default_max_height() -> String {
    "10em".to_string()
}
fn default_border_radius() -> String {
    "2em 0 0 2em".to_string()
}
fn default_font_size() -> String {
    "16px".to_string()
}

impl Default for MessageStyle {
    fn default() -> Self {
        Self {
            avatar_size: default_avatar_size(),
            max_height: default_max_height(),
            border_radius: default_border_radius(),
            font_size: default_font_size(),
            background_color: None,
            text_color: None,
        }
    }
}

/// Complete layout configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Layout {
    pub name: String,
    #[serde(default = "default_version")]
    pub version: u32,
    #[serde(default)]
    pub elements: HashMap<String, ElementConfig>,
    #[serde(default)]
    pub message_style: MessageStyle,
}

fn default_version() -> u32 {
    1
}

impl Layout {
    /// Create a default layout matching the current hardcoded overlay style
    pub fn default_layout() -> Self {
        let mut elements = HashMap::new();

        // Chat panel - right side, full height
        elements.insert(
            "chat".to_string(),
            ElementConfig {
                enabled: true,
                display_name: None,
                position: Position {
                    x: None,
                    y: Some(0.0),
                    right: Some(0.0),
                    bottom: None,
                },
                size: Size {
                    width: Some(SizeValue::Pixels(300.0)),
                    height: Some(SizeValue::Css("100%".to_string())),
                    max_width: None,
                    max_height: None,
                },
                style: Style {
                    background_color: Some("transparent".to_string()),
                    ..Default::default()
                },
                options: None,
            },
        );

        // Live badge - top left
        elements.insert(
            "live".to_string(),
            ElementConfig {
                enabled: true,
                display_name: None,
                position: Position {
                    x: Some(0.0),
                    y: Some(0.0),
                    right: None,
                    bottom: None,
                },
                size: Size::default(),
                style: Style::default(),
                options: None,
            },
        );

        // Attribution - bottom left
        elements.insert(
            "attribution".to_string(),
            ElementConfig {
                enabled: true,
                display_name: None,
                position: Position {
                    x: Some(15.0),
                    y: None,
                    right: None,
                    bottom: Some(7.0),
                },
                size: Size::default(),
                style: Style {
                    font_size: Some("3.5vw".to_string()),
                    font_style: Some("italic".to_string()),
                    font_weight: Some("bold".to_string()),
                    ..Default::default()
                },
                options: None,
            },
        );

        // Featured message - bottom left, above attribution
        elements.insert(
            "featured".to_string(),
            ElementConfig {
                enabled: true,
                display_name: None,
                position: Position {
                    x: Some(0.0),
                    y: None,
                    right: None,
                    bottom: Some(512.0),
                },
                size: Size {
                    width: None,
                    height: None,
                    max_width: Some("calc(100% - 315px)".to_string()),
                    max_height: None,
                },
                style: Style {
                    font_size: Some("32px".to_string()),
                    ..Default::default()
                },
                options: None,
            },
        );

        // Poll UI - top center
        elements.insert(
            "poll".to_string(),
            ElementConfig {
                enabled: true,
                display_name: None,
                position: Position {
                    x: None,
                    y: Some(0.0),
                    right: None,
                    bottom: None,
                },
                size: Size::default(),
                style: Style::default(),
                options: None,
            },
        );

        // Superchat UI - top right
        elements.insert(
            "superchat".to_string(),
            ElementConfig {
                enabled: true,
                display_name: None,
                position: Position {
                    x: None,
                    y: Some(0.0),
                    right: None,
                    bottom: None,
                },
                size: Size::default(),
                style: Style::default(),
                options: None,
            },
        );

        Layout {
            name: "default".to_string(),
            version: 1,
            elements,
            message_style: MessageStyle::default(),
        }
    }
}

/// Manages layout storage and retrieval
pub struct LayoutManager {
    layouts_dir: String,
}

impl LayoutManager {
    pub fn new(layouts_dir: &str) -> Result<Self> {
        // Create layouts directory if it doesn't exist
        if !Path::new(layouts_dir).exists() {
            fs::create_dir_all(layouts_dir)
                .context(format!("Failed to create layouts directory: {}", layouts_dir))?;
        }

        let manager = Self {
            layouts_dir: layouts_dir.to_string(),
        };

        // Create default layout if no layouts exist
        if manager.list()?.is_empty() {
            let default = Layout::default_layout();
            manager.save(&default)?;
            log::info!("Created default layout");
        }

        Ok(manager)
    }

    /// List all available layout names
    pub fn list(&self) -> Result<Vec<String>> {
        let mut layouts = Vec::new();

        if let Ok(entries) = fs::read_dir(&self.layouts_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().map(|e| e == "json").unwrap_or(false) {
                    if let Some(stem) = path.file_stem() {
                        layouts.push(stem.to_string_lossy().to_string());
                    }
                }
            }
        }

        layouts.sort();
        Ok(layouts)
    }

    /// Load a layout by name
    pub fn load(&self, name: &str) -> Result<Layout> {
        let path = format!("{}/{}.json", self.layouts_dir, name);
        let content = fs::read_to_string(&path)
            .context(format!("Failed to read layout file: {}", path))?;
        let layout: Layout = serde_json::from_str(&content)
            .context(format!("Failed to parse layout file: {}", path))?;
        Ok(layout)
    }

    /// Save a layout
    pub fn save(&self, layout: &Layout) -> Result<()> {
        let path = format!("{}/{}.json", self.layouts_dir, layout.name);
        let content = serde_json::to_string_pretty(layout)
            .context("Failed to serialize layout")?;
        fs::write(&path, content)
            .context(format!("Failed to write layout file: {}", path))?;
        log::info!("Saved layout: {}", layout.name);
        Ok(())
    }

    /// Delete a layout
    pub fn delete(&self, name: &str) -> Result<()> {
        let path = format!("{}/{}.json", self.layouts_dir, name);
        fs::remove_file(&path)
            .context(format!("Failed to delete layout file: {}", path))?;
        log::info!("Deleted layout: {}", name);
        Ok(())
    }

    /// Check if a layout exists
    pub fn exists(&self, name: &str) -> bool {
        let path = format!("{}/{}.json", self.layouts_dir, name);
        Path::new(&path).exists()
    }
}
