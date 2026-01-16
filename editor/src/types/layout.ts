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

// Canvas dimensions for conversions
export const CANVAS_WIDTH = 1920;
export const CANVAS_HEIGHT = 1080;

// Convert pixel value to vw (viewport width percentage)
export function pxToVw(px: number): string {
    return `${((px / CANVAS_WIDTH) * 100).toFixed(2)}vw`;
}

// Convert pixel value to vh (viewport height percentage)
export function pxToVh(px: number): string {
    return `${((px / CANVAS_HEIGHT) * 100).toFixed(2)}vh`;
}

// Convert vw string to pixels
export function vwToPx(vw: string | number | null | undefined): number {
    if (vw === null || vw === undefined) return 0;
    if (typeof vw === 'number') return vw;
    const match = vw.match(/^([\d.]+)vw$/);
    if (match) {
        return (parseFloat(match[1]) / 100) * CANVAS_WIDTH;
    }
    return parseFloat(vw) || 0;
}

// Convert vh string to pixels
export function vhToPx(vh: string | number | null | undefined): number {
    if (vh === null || vh === undefined) return 0;
    if (typeof vh === 'number') return vh;
    const match = vh.match(/^([\d.]+)vh$/);
    if (match) {
        return (parseFloat(match[1]) / 100) * CANVAS_HEIGHT;
    }
    return parseFloat(vh) || 0;
}

// Get numeric pixel value from position (handles both px and vw/vh)
export function positionToPx(value: number | string | null | undefined, isHorizontal: boolean): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return value;
    if (value.endsWith('vw')) return vwToPx(value);
    if (value.endsWith('vh')) return vhToPx(value);
    if (value.endsWith('%')) {
        const percent = parseFloat(value) / 100;
        return isHorizontal ? percent * CANVAS_WIDTH : percent * CANVAS_HEIGHT;
    }
    return parseFloat(value) || 0;
}

// Get numeric pixel value from size (handles px, vw, vh, %)
export function sizeToPx(value: number | string | null | undefined, isWidth: boolean): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return value;
    if (value === '100%') return isWidth ? CANVAS_WIDTH : CANVAS_HEIGHT;
    if (value.endsWith('vw')) return vwToPx(value);
    if (value.endsWith('vh')) return vhToPx(value);
    if (value.endsWith('%')) {
        const percent = parseFloat(value) / 100;
        return isWidth ? percent * CANVAS_WIDTH : percent * CANVAS_HEIGHT;
    }
    return parseFloat(value) || 0;
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
    customCss?: string;      // SCSS source
    compiledCss?: string;    // Compiled CSS (set by server)
}

export interface ElementConfig {
    enabled: boolean;
    displayName?: string;
    position: Position;
    size: Size;
    style: Style;
    options?: Record<string, unknown>;
}

// Live Badge specific options
export interface LiveBadgeOptions {
    platformMode?: 'all' | 'include' | 'exclude';
    platforms?: string[];
    showIcon?: boolean;
    showLabel?: boolean;
    showCount?: boolean;
}

// Text element specific options
export interface TextOptions {
    // The text content - can include tokens like {{datetime:HH:mm:ss}}
    content?: string;
}

export interface MessageStyle {
    avatarSize: string;
    maxHeight: string;
    borderRadius: string;
    fontSize: string;
    backgroundColor?: string;
    textColor?: string;

    // Display options
    showAvatars?: boolean;       // Default: true
    condensedMode?: boolean;     // Default: false

    // Badge visibility
    showOwnerBadge?: boolean;    // Default: true
    showStaffBadge?: boolean;    // Default: true
    showModBadge?: boolean;      // Default: true
    showVerifiedBadge?: boolean; // Default: true
    showSubBadge?: boolean;      // Default: true
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

/// A frame is a named view that shows a subset of elements
export interface Frame {
    name: string;
    elements: string[];  // Element IDs to include (empty = all)
    background?: string; // Special background type (e.g., "physics")
    donationMatter?: DonationMatterOptions;  // Configuration for physics background
}

export interface Layout {
    name: string;
    version: number;
    elements: Record<string, ElementConfig>;
    messageStyle: MessageStyle;
    frames: Record<string, Frame>;
}

export interface LayoutListResponse {
    layouts: string[];
    active: string;
}

export const defaultElementConfig = (): ElementConfig => ({
    enabled: true,
    position: {},
    size: {},
    style: {},
});

export const defaultMessageStyle = (): MessageStyle => ({
    avatarSize: '2em',
    maxHeight: '10em',
    borderRadius: '2em 0 0 2em',
    fontSize: '16px',
    // Display options default to showing everything
    showAvatars: true,
    condensedMode: false,
    showOwnerBadge: true,
    showStaffBadge: true,
    showModBadge: true,
    showVerifiedBadge: true,
    showSubBadge: true,
});

// Default DonationMatter configuration
export const defaultDonationMatterOptions = (): DonationMatterOptions => ({
    objectType: 'ammo',
    objectScale: 0.1,
    objectSprites: [
        '/static/img/ammo_556_round_a.png',
        '/static/img/ammo_556_round_b.png',
        '/static/img/ammo_556_round_c.png',
        '/static/img/ammo_556_round_d.png',
    ],
    restitution: 0.1,
    friction: 0.8,
    frictionAir: 0.02,
    density: 0.008,
    showLabels: true,
    labelColor: '#ffff00',
    labelFont: 'Verlag',
    labelSize: 12,
    spawnRate: 2,
    spawnDelay: 50,
    maxObjects: 500,
    showAngleIndicator: false,
    wireframes: false,
});

export const defaultFrames = (): Record<string, Frame> => ({
    overlay: {
        name: 'Overlay',
        elements: [],  // Empty means all elements
        background: undefined,
    },
    background: {
        name: 'Background',
        elements: [],
        background: 'physics',
        donationMatter: defaultDonationMatterOptions(),
    },
});

export const defaultLayout = (): Layout => ({
    name: 'default',
    version: 1,
    elements: {
        chat: {
            enabled: true,
            position: { y: '0vh', right: '0vw' },
            size: { width: '15.63vw', height: '100vh' },
            style: { backgroundColor: 'transparent' },
        },
        live: {
            enabled: true,
            position: { x: '0vw', y: '0vh' },
            size: {},
            style: {},
        },
        text: {
            enabled: true,
            position: { x: '0.78vw', bottom: '0.65vh' },
            size: {},
            style: { fontSize: '3.5vw', fontStyle: 'italic', fontWeight: 'bold' },
            options: { content: 'Mad at the Internet' },
        },
        featured: {
            enabled: true,
            position: { x: '0vw', bottom: '47.41vh' },
            size: { maxWidth: 'calc(100vw - 16.41vw)' },
            style: { fontSize: '32px' },
        },
        poll: {
            enabled: true,
            position: { y: '0vh' },
            size: {},
            style: {},
        },
        superchat: {
            enabled: true,
            position: { y: '0vh' },
            size: {},
            style: {},
        },
    },
    messageStyle: defaultMessageStyle(),
    frames: defaultFrames(),
});
