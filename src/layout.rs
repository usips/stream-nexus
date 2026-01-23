use anyhow::{Context, Result};
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use tracing::{info, warn};

/// A dimension value with explicit unit type
#[derive(Debug, Clone, PartialEq)]
pub enum Dimension {
    /// Pixels (default for bare numbers)
    Px(f64),
    /// Viewport width percentage
    Vw(f64),
    /// Viewport height percentage
    Vh(f64),
    /// Percentage
    Percent(f64),
    /// CSS calc() expression or other complex value
    Calc(String),
}

impl Dimension {
    /// Parse a dimension from a string like "100vh", "50%", "calc(100% - 20px)"
    pub fn parse(s: &str) -> Option<Self> {
        let s = s.trim();

        if s.starts_with("calc(") {
            return Some(Dimension::Calc(s.to_string()));
        }

        if let Some(num_str) = s.strip_suffix("vw") {
            return num_str.trim().parse().ok().map(Dimension::Vw);
        }
        if let Some(num_str) = s.strip_suffix("vh") {
            return num_str.trim().parse().ok().map(Dimension::Vh);
        }
        if let Some(num_str) = s.strip_suffix('%') {
            return num_str.trim().parse().ok().map(Dimension::Percent);
        }
        if let Some(num_str) = s.strip_suffix("px") {
            return num_str.trim().parse().ok().map(Dimension::Px);
        }

        // Try parsing as bare number (pixels)
        s.parse().ok().map(Dimension::Px)
    }

    /// Convert to CSS string
    pub fn to_css(&self) -> String {
        match self {
            Dimension::Px(v) => format!("{}px", v),
            Dimension::Vw(v) => format!("{}vw", v),
            Dimension::Vh(v) => format!("{}vh", v),
            Dimension::Percent(v) => format!("{}%", v),
            Dimension::Calc(s) => s.clone(),
        }
    }
}

impl Serialize for Dimension {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match self {
            // Serialize pixels as bare numbers for backward compatibility
            Dimension::Px(v) => serializer.serialize_f64(*v),
            // Serialize others as strings with units
            _ => serializer.serialize_str(&self.to_css()),
        }
    }
}

impl<'de> Deserialize<'de> for Dimension {
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        use serde::de::{self, Visitor};

        struct DimensionVisitor;

        impl<'de> Visitor<'de> for DimensionVisitor {
            type Value = Dimension;

            fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                formatter.write_str("a number or a string with CSS units")
            }

            fn visit_i64<E>(self, v: i64) -> std::result::Result<Self::Value, E>
            where
                E: de::Error,
            {
                Ok(Dimension::Px(v as f64))
            }

            fn visit_u64<E>(self, v: u64) -> std::result::Result<Self::Value, E>
            where
                E: de::Error,
            {
                Ok(Dimension::Px(v as f64))
            }

            fn visit_f64<E>(self, v: f64) -> std::result::Result<Self::Value, E>
            where
                E: de::Error,
            {
                Ok(Dimension::Px(v))
            }

            fn visit_str<E>(self, v: &str) -> std::result::Result<Self::Value, E>
            where
                E: de::Error,
            {
                Dimension::parse(v)
                    .ok_or_else(|| de::Error::custom(format!("invalid dimension: {}", v)))
            }
        }

        deserializer.deserialize_any(DimensionVisitor)
    }
}

/// Position configuration for an element
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Position {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub x: Option<Dimension>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub y: Option<Dimension>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub right: Option<Dimension>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bottom: Option<Dimension>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub z_index: Option<i32>,
}

/// Size configuration for an element
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Size {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<Dimension>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub height: Option<Dimension>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_width: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_height: Option<String>,
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
    /// SCSS source to apply to the element
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_css: Option<String>,
    /// Compiled CSS (populated by server from custom_css)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub compiled_css: Option<String>,
}

/// Anchor point for auto-sized elements
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum AnchorPoint {
    TopLeft,
    Top,
    TopRight,
    Left,
    Center,
    Right,
    BottomLeft,
    Bottom,
    BottomRight,
}

/// Configuration for an individual overlay element
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementConfig {
    pub enabled: bool,
    /// Prevents selection/manipulation in editor (editor-only, not used by overlay)
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub locked: bool,
    /// Content-sized element: draggable but not resizable
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub auto_size: bool,
    /// Anchor point for positioning auto-sized elements
    #[serde(skip_serializing_if = "Option::is_none")]
    pub anchor: Option<AnchorPoint>,
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
            locked: false,
            auto_size: false,
            anchor: None,
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

    // Display options
    #[serde(default = "default_true")]
    pub show_avatars: bool,
    #[serde(default = "default_true")]
    pub show_usernames: bool,
    #[serde(default)]
    pub condensed_mode: bool,
    #[serde(default = "default_direction")]
    pub direction: String,

    // Badge visibility
    #[serde(default = "default_true")]
    pub show_owner_badge: bool,
    #[serde(default = "default_true")]
    pub show_staff_badge: bool,
    #[serde(default = "default_true")]
    pub show_mod_badge: bool,
    #[serde(default = "default_true")]
    pub show_verified_badge: bool,
    #[serde(default = "default_true")]
    pub show_sub_badge: bool,
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
fn default_true() -> bool {
    true
}
fn default_direction() -> String {
    "bottom".to_string()
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
            show_avatars: true,
            show_usernames: true,
            condensed_mode: false,
            direction: default_direction(),
            show_owner_badge: true,
            show_staff_badge: true,
            show_mod_badge: true,
            show_verified_badge: true,
            show_sub_badge: true,
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

        // Chat panel - right side, full height (not auto-sized, has explicit dimensions)
        elements.insert(
            "chat".to_string(),
            ElementConfig {
                enabled: true,
                locked: false,
                auto_size: false,
                anchor: None,
                display_name: None,
                position: Position {
                    x: None,
                    y: Some(Dimension::Vh(0.0)),
                    right: Some(Dimension::Vw(0.0)),
                    bottom: None,
                    z_index: None,
                },
                size: Size {
                    width: Some(Dimension::Vw(15.63)),
                    height: Some(Dimension::Vh(100.0)),
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

        // Live badge - top left (auto-sized, content determines size)
        elements.insert(
            "live".to_string(),
            ElementConfig {
                enabled: true,
                locked: false,
                auto_size: true,
                anchor: Some(AnchorPoint::TopLeft),
                display_name: None,
                position: Position {
                    x: Some(Dimension::Vw(0.0)),
                    y: Some(Dimension::Vh(0.0)),
                    right: None,
                    bottom: None,
                    z_index: None,
                },
                size: Size::default(),
                style: Style::default(),
                options: None,
            },
        );

        // Text element - bottom left (auto-sized)
        elements.insert(
            "text".to_string(),
            ElementConfig {
                enabled: true,
                locked: false,
                auto_size: true,
                anchor: Some(AnchorPoint::BottomLeft),
                display_name: None,
                position: Position {
                    x: Some(Dimension::Vw(0.78)),
                    y: None,
                    right: None,
                    bottom: Some(Dimension::Vh(0.65)),
                    z_index: None,
                },
                size: Size::default(),
                style: Style {
                    font_size: Some("3.5vw".to_string()),
                    font_style: Some("italic".to_string()),
                    font_weight: Some("bold".to_string()),
                    ..Default::default()
                },
                options: Some(serde_json::json!({
                    "content": "Mad at the Internet"
                })),
            },
        );

        // Featured message - bottom left (auto-sized with maxWidth constraint)
        elements.insert(
            "featured".to_string(),
            ElementConfig {
                enabled: true,
                locked: false,
                auto_size: true,
                anchor: Some(AnchorPoint::BottomLeft),
                display_name: None,
                position: Position {
                    x: Some(Dimension::Vw(0.0)),
                    y: None,
                    right: None,
                    bottom: Some(Dimension::Vh(47.41)),
                    z_index: None,
                },
                size: Size {
                    width: None,
                    height: None,
                    max_width: Some("calc(100vw - 16.41vw)".to_string()),
                    max_height: None,
                },
                style: Style {
                    font_size: Some("32px".to_string()),
                    ..Default::default()
                },
                options: None,
            },
        );

        // Poll UI - top (auto-sized)
        elements.insert(
            "poll".to_string(),
            ElementConfig {
                enabled: true,
                locked: false,
                auto_size: true,
                anchor: Some(AnchorPoint::TopLeft),
                display_name: None,
                position: Position {
                    x: None,
                    y: Some(Dimension::Vh(0.0)),
                    right: None,
                    bottom: None,
                    z_index: None,
                },
                size: Size::default(),
                style: Style::default(),
                options: None,
            },
        );

        // Superchat UI - top (auto-sized)
        elements.insert(
            "superchat".to_string(),
            ElementConfig {
                enabled: true,
                locked: false,
                auto_size: true,
                anchor: Some(AnchorPoint::TopLeft),
                display_name: None,
                position: Position {
                    x: None,
                    y: Some(Dimension::Vh(0.0)),
                    right: None,
                    bottom: None,
                    z_index: None,
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

    /// Compile SCSS in all elements' custom_css fields
    pub fn compile_scss(&mut self) {
        for (_id, config) in self.elements.iter_mut() {
            if let Some(scss) = &config.style.custom_css {
                if !scss.trim().is_empty() {
                    match compile_scss_to_css(scss) {
                        Ok(css) => {
                            config.style.compiled_css = Some(css);
                        }
                        Err(e) => {
                            warn!("Failed to compile SCSS: {}", e);
                            // Fall back to using the source as-is
                            config.style.compiled_css = Some(scss.clone());
                        }
                    }
                }
            }
        }
    }
}

/// Compile SCSS source to CSS
fn compile_scss_to_css(scss: &str) -> Result<String> {
    // Wrap in a dummy selector so grass can parse it
    let wrapped = format!(".element {{ {} }}", scss);

    let options = grass::Options::default().style(grass::OutputStyle::Expanded);
    let compiled = grass::from_string(wrapped, &options)
        .map_err(|e| anyhow::anyhow!("SCSS compilation error: {}", e))?;

    // Extract just the properties from inside .element { }
    // The compiled CSS will be like: .element {\n  property: value;\n}\n
    if let Some(start) = compiled.find('{') {
        if let Some(end) = compiled.rfind('}') {
            let inner = &compiled[start + 1..end];
            // Clean up the extracted CSS
            let css = inner
                .lines()
                .map(|line| line.trim())
                .filter(|line| !line.is_empty())
                .collect::<Vec<_>>()
                .join(" ");
            return Ok(css);
        }
    }

    Ok(scss.to_string())
}

/// Manages layout storage and retrieval
pub struct LayoutManager {
    layouts_dir: String,
}

impl LayoutManager {
    pub fn new(layouts_dir: &str) -> Result<Self> {
        // Create layouts directory if it doesn't exist
        if !Path::new(layouts_dir).exists() {
            fs::create_dir_all(layouts_dir).context(format!(
                "Failed to create layouts directory: {}",
                layouts_dir
            ))?;
        }

        let manager = Self {
            layouts_dir: layouts_dir.to_string(),
        };

        // Create default layout if no layouts exist
        if manager.list()?.is_empty() {
            let default = Layout::default_layout();
            manager.save(&default)?;
            info!("Created default layout");
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
        let content =
            fs::read_to_string(&path).context(format!("Failed to read layout file: {}", path))?;
        let layout: Layout = serde_json::from_str(&content)
            .context(format!("Failed to parse layout file: {}", path))?;
        Ok(layout)
    }

    /// Save a layout (compiles SCSS before saving)
    pub fn save(&self, layout: &Layout) -> Result<()> {
        // Clone and compile SCSS
        let mut layout = layout.clone();
        layout.compile_scss();

        let path = format!("{}/{}.json", self.layouts_dir, layout.name);
        let content =
            serde_json::to_string_pretty(&layout).context("Failed to serialize layout")?;
        fs::write(&path, content).context(format!("Failed to write layout file: {}", path))?;
        info!("Saved layout: {}", layout.name);
        Ok(())
    }

    /// Delete a layout
    pub fn delete(&self, name: &str) -> Result<()> {
        let path = format!("{}/{}.json", self.layouts_dir, name);
        fs::remove_file(&path).context(format!("Failed to delete layout file: {}", path))?;
        info!("Deleted layout: {}", name);
        Ok(())
    }

    /// Check if a layout exists
    pub fn exists(&self, name: &str) -> bool {
        let path = format!("{}/{}.json", self.layouts_dir, name);
        Path::new(&path).exists()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dimension_parse() {
        assert_eq!(Dimension::parse("100"), Some(Dimension::Px(100.0)));
        assert_eq!(Dimension::parse("100px"), Some(Dimension::Px(100.0)));
        assert_eq!(Dimension::parse("50vw"), Some(Dimension::Vw(50.0)));
        assert_eq!(Dimension::parse("100vh"), Some(Dimension::Vh(100.0)));
        assert_eq!(Dimension::parse("75%"), Some(Dimension::Percent(75.0)));
        assert_eq!(
            Dimension::parse("calc(100% - 20px)"),
            Some(Dimension::Calc("calc(100% - 20px)".to_string()))
        );
        assert_eq!(Dimension::parse("15.63vw"), Some(Dimension::Vw(15.63)));
    }

    #[test]
    fn test_dimension_to_css() {
        assert_eq!(Dimension::Px(100.0).to_css(), "100px");
        assert_eq!(Dimension::Vw(50.0).to_css(), "50vw");
        assert_eq!(Dimension::Vh(100.0).to_css(), "100vh");
        assert_eq!(Dimension::Percent(75.0).to_css(), "75%");
        assert_eq!(
            Dimension::Calc("calc(100% - 20px)".to_string()).to_css(),
            "calc(100% - 20px)"
        );
    }

    #[test]
    fn test_dimension_serialize() {
        // Pixels serialize as bare numbers
        let px = Dimension::Px(100.0);
        assert_eq!(serde_json::to_string(&px).unwrap(), "100.0");

        // Others serialize as strings with units
        let vw = Dimension::Vw(50.0);
        assert_eq!(serde_json::to_string(&vw).unwrap(), "\"50vw\"");

        let vh = Dimension::Vh(100.0);
        assert_eq!(serde_json::to_string(&vh).unwrap(), "\"100vh\"");

        let pct = Dimension::Percent(75.0);
        assert_eq!(serde_json::to_string(&pct).unwrap(), "\"75%\"");
    }

    #[test]
    fn test_dimension_deserialize() {
        // Numbers deserialize as pixels
        let px: Dimension = serde_json::from_str("100").unwrap();
        assert_eq!(px, Dimension::Px(100.0));

        let px_float: Dimension = serde_json::from_str("100.5").unwrap();
        assert_eq!(px_float, Dimension::Px(100.5));

        // Strings with units deserialize correctly
        let vw: Dimension = serde_json::from_str("\"50vw\"").unwrap();
        assert_eq!(vw, Dimension::Vw(50.0));

        let vh: Dimension = serde_json::from_str("\"100vh\"").unwrap();
        assert_eq!(vh, Dimension::Vh(100.0));

        let pct: Dimension = serde_json::from_str("\"75%\"").unwrap();
        assert_eq!(pct, Dimension::Percent(75.0));

        let calc: Dimension = serde_json::from_str("\"calc(100% - 20px)\"").unwrap();
        assert_eq!(calc, Dimension::Calc("calc(100% - 20px)".to_string()));
    }

    #[test]
    fn test_position_roundtrip() {
        let pos = Position {
            x: Some(Dimension::Vw(10.0)),
            y: Some(Dimension::Vh(20.0)),
            right: None,
            bottom: Some(Dimension::Px(50.0)),
            z_index: None,
        };

        let json = serde_json::to_string(&pos).unwrap();
        let parsed: Position = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.x, Some(Dimension::Vw(10.0)));
        assert_eq!(parsed.y, Some(Dimension::Vh(20.0)));
        assert_eq!(parsed.right, None);
        assert_eq!(parsed.bottom, Some(Dimension::Px(50.0)));
    }

    #[test]
    fn test_scss_compilation() {
        // Test basic SCSS with variables
        let scss = "$color: #ff0000; background: $color;";
        let result = super::compile_scss_to_css(scss).unwrap();
        assert!(result.contains("background:"));
        assert!(result.contains("#ff0000") || result.contains("red"));

        // Test color functions
        let scss_color = "color: lighten(#000, 50%);";
        let result = super::compile_scss_to_css(scss_color).unwrap();
        assert!(result.contains("color:"));

        // Test plain CSS passthrough
        let plain_css = "margin: 10px; padding: 5px;";
        let result = super::compile_scss_to_css(plain_css).unwrap();
        assert!(result.contains("margin:"));
        assert!(result.contains("padding:"));
    }
}
