// ============================================================================
// Shared Types for Stream Nexus Frontend
// ============================================================================

// Position values can be numbers (pixels) or strings (vw/vh units)
export interface Position {
    x?: number | string | null;
    y?: number | string | null;
    right?: number | string | null;
    bottom?: number | string | null;
    zIndex?: number;
}

export interface Size {
    width?: number | string | null;
    height?: number | string | null;
    maxWidth?: string | null;
    maxHeight?: string | null;
}

export interface Style {
    backgroundColor?: string;
    fontSize?: string;
    fontFamily?: string;
    fontWeight?: string;
    fontStyle?: string;
    color?: string;
    padding?: string;
    margin?: string;
    borderRadius?: string;
    opacity?: number;
    transform?: string;
    zIndex?: number;
    customCss?: string;
    compiledCss?: string;
}

export interface ElementConfig {
    enabled: boolean;
    displayName?: string;
    position: Position;
    size: Size;
    style: Style;
    options?: Record<string, unknown>;
}

export interface LiveBadgeOptions {
    platformMode?: 'all' | 'include' | 'exclude';
    platforms?: string[];
    showIcon?: boolean;
    showLabel?: boolean;
    showCount?: boolean;
}

export interface TextOptions {
    content?: string;
}

export interface MessageStyle {
    avatarSize: string;
    maxHeight: string;
    borderRadius: string;
    fontSize: string;
    backgroundColor?: string;
    textColor?: string;
    showAvatars?: boolean;
    condensedMode?: boolean;
    showOwnerBadge?: boolean;
    showStaffBadge?: boolean;
    showModBadge?: boolean;
    showVerifiedBadge?: boolean;
    showSubBadge?: boolean;
}

// DonationMatter configuration options
export interface DonationMatterOptions {
    // Object appearance
    objectType?: 'ammo' | 'coin' | 'custom';
    objectScale?: number;
    objectSprites?: string[];

    // Physics properties
    restitution?: number;            // Bounciness (0-1)
    friction?: number;               // Surface friction (0-1)
    frictionAir?: number;            // Air resistance (0-0.1)
    density?: number;                // Mass per unit area

    // Label display
    showLabels?: boolean;
    labelColor?: string;
    labelFont?: string;
    labelSize?: number;

    // Spawn behavior
    spawnRate?: number;              // Objects per dollar
    spawnDelay?: number;             // Delay between spawns (ms)
    maxObjects?: number;             // Maximum objects before cleanup

    // Renderer options
    showAngleIndicator?: boolean;
    wireframes?: boolean;
}

export interface Layout {
    name: string;
    version: number;
    elements: Record<string, ElementConfig>;
    messageStyle: MessageStyle;
    background?: string;             // Special background type (e.g., "physics")
    donationMatter?: DonationMatterOptions;  // Configuration for physics background
}

// ============================================================================
// Chat Message Types
// ============================================================================

export interface ChatMessage {
    id: string;
    platform: string;
    channel: string;
    sent_at: number;
    received_at: number;
    message: string;
    html: string;
    emojis: string[];
    username: string;
    avatar: string;
    amount: number;
    currency: string;
    is_placeholder: boolean;
    is_verified: boolean;
    is_sub: boolean;
    is_mod: boolean;
    is_owner: boolean;
    is_staff: boolean;
}

// ============================================================================
// WebSocket Message Types
// ============================================================================

export type WebSocketMessageTag =
    | 'chat_message'
    | 'feature_message'
    | 'viewers'
    | 'layout_update'
    | 'layout_list';

export interface WebSocketMessage {
    tag: WebSocketMessageTag;
    message: string;
}

export interface ViewerCounts {
    [platform: string]: number;
}

export interface LayoutListResponse {
    layouts: string[];
    active: string;
}

// ============================================================================
// Badge Settings
// ============================================================================

export interface BadgeSettings {
    owner: boolean;
    staff: boolean;
    mod: boolean;
    verified: boolean;
    sub: boolean;
}

// Global window extensions
declare global {
    interface Window {
        badgeSettings?: BadgeSettings;
        livestream_viewers: ViewerCounts;
        FRAME_CONFIG?: {
            layoutName: string;
            background: string | null;
            donationMatter?: Record<string, unknown> | null;
        };
    }
}
