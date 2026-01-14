export interface Position {
    x?: number | null;
    y?: number | null;
    right?: number | null;
    bottom?: number | null;
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

export interface MessageStyle {
    avatarSize: string;
    maxHeight: string;
    borderRadius: string;
    fontSize: string;
    backgroundColor?: string;
    textColor?: string;
}

export interface Layout {
    name: string;
    version: number;
    elements: Record<string, ElementConfig>;
    messageStyle: MessageStyle;
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
});

export const defaultLayout = (): Layout => ({
    name: 'default',
    version: 1,
    elements: {
        chat: {
            enabled: true,
            position: { y: 0, right: 0 },
            size: { width: 300, height: '100%' },
            style: { backgroundColor: 'transparent' },
        },
        live: {
            enabled: true,
            position: { x: 0, y: 0 },
            size: {},
            style: {},
        },
        attribution: {
            enabled: true,
            position: { x: 15, bottom: 7 },
            size: {},
            style: { fontSize: '3.5vw', fontStyle: 'italic', fontWeight: 'bold' },
        },
        featured: {
            enabled: true,
            position: { x: 0, bottom: 512 },
            size: { maxWidth: 'calc(100% - 315px)' },
            style: { fontSize: '32px' },
        },
        poll: {
            enabled: true,
            position: { y: 0 },
            size: {},
            style: {},
        },
        superchat: {
            enabled: true,
            position: { y: 0 },
            size: {},
            style: {},
        },
    },
    messageStyle: defaultMessageStyle(),
});
