import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
    Layout,
    ElementConfig,
    Position,
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
    pxToVw,
    pxToVh,
    positionToPx,
    sizeToPx,
    defaultFrames,
} from '../types/layout';
import { resolveTokens } from '../utils/tokens';

interface EditorCanvasProps {
    layout: Layout;
    onLayoutChange: (layout: Layout) => void;
    selectedElement: string;
    onSelectElement: (elementId: string) => void;
    onDeleteElement: () => void;
    onUndo: () => void;
    onRedo: () => void;
    canUndo: boolean;
    canRedo: boolean;
    selectedFrame: string | null;
}

interface DragState {
    elementId: string;
    startMouseX: number;
    startMouseY: number;
    // Starting position in pixels
    startLeft: number | null;
    startTop: number | null;
    startRight: number | null;
    startBottom: number | null;
    // Element dimensions in pixels (for edge calculation)
    elementWidth: number;
    elementHeight: number;
}

interface ResizeState {
    elementId: string;
    handle: 'e' | 'w' | 's' | 'n' | 'se' | 'sw' | 'ne' | 'nw';
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    startPosX: number | null;
    startPosY: number | null;
    startPosRight: number | null;
    startPosBottom: number | null;
}

// Mock data for live preview
interface MockChatMessage {
    id: number;
    user: string;
    message: string;
    platform: string;
    roles: string[];  // 'owner', 'staff', 'mod', 'verified', 'sub'
}

interface MockData {
    viewerCount: number;
    chatMessages: MockChatMessage[];
    featuredMessage: string | null;
    pollVotes: number[];
    superchatAmount: number;
    currentTime: Date;
}

// Platform brand colors for usernames
const PLATFORM_COLORS: Record<string, string> = {
    'YouTube': '#ff0000',
    'Kick': '#53fc18',
    'Twitch': '#9146ff',
    'Rumble': '#85c742',
    'Odysee': '#a60a43',
    'X': '#1da1f2',
    'VK': '#0077ff',
    'XMRChat': '#ff7f0a',
};

const MOCK_PLATFORMS = ['YouTube', 'Kick', 'Twitch', 'Rumble'];
const MOCK_ROLES: string[][] = [
    [],           // Regular user
    [],           // Regular user
    [],           // Regular user
    ['sub'],      // Subscriber
    ['sub'],      // Subscriber
    ['mod'],      // Mod
    ['verified'], // Verified
    ['owner'],    // Owner
    ['mod', 'sub'], // Mod + Sub
];

const MOCK_USERNAMES = ['Viewer123', 'ChatFan', 'StreamLover', 'CoolGuy99', 'NightOwl', 'GameMaster', 'TechWiz', 'MusicFan', 'LoyalSub', 'BigDonator', 'xX_Pro_Xx', 'ChillVibes', 'HypeTrain', 'FirstTimer'];
const MOCK_MESSAGES = [
    // Very short messages
    'W', 'L', 'F', 'GG', 'lol', 'no', 'yes', 'hi', 'bye', 'rip', 'gg', 'ez', 'wow',
    'POG', 'kek', 'lmao', 'nice', 'true', 'real', 'based', 'cope', 'ratio',
    // Short messages
    'Hello!', 'Let\'s go!', 'Hype!', 'So good', 'W stream', 'Love this',
    'First time here', 'Just subbed!', 'GG well played', 'This is fire',
    // Medium messages
    'Great stream as always!', 'Can\'t wait for the next segment',
    'Anyone else watching from work?', 'Chat is moving so fast',
    'Been following for over a year now', 'This is why I always tune in',
    'Hello everyone! So excited to be here today!',
    // Spam/numbers
    '111111111111111111111111', '7777777777777777777777777777',
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW', 'LLLLLLLLLLLLLLLLLLLLL',
    'POGPOGPOGPOGPOGPOGPOGPOGPOG', '!!!!!!!!!!!!!!!!!!!!',
    // Long messages
    'This is absolutely amazing, I can\'t believe what I\'m seeing right now!',
    'The hype is real! Can\'t wait to see what happens next in this stream!',
    'Anyone else watching from work? Don\'t tell my boss lol, I should be doing spreadsheets',
    'Chat is moving so fast nobody will see this message but I love you all',
    'I\'ve been watching this channel for years and it just keeps getting better and better, thanks for everything!',
    'Sending love from across the pond! It\'s 3am here but totally worth staying up for this content!',
    'This stream is absolutely incredible, I can\'t believe how much effort goes into making this content for us every single day',
];

// Maximum messages to keep in chat history
const MAX_CHAT_MESSAGES = 100;

// ============================================================================
// Alignment Icons - SVG components matching the alignment toolbar style
// ============================================================================

const AlignLeftIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="4" y1="4" x2="4" y2="20" />
        <rect x="7" y="6" width="10" height="4" fill="currentColor" stroke="none" />
        <rect x="7" y="14" width="6" height="4" fill="currentColor" stroke="none" />
    </svg>
);

const AlignCenterHIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="12" y1="4" x2="12" y2="20" />
        <rect x="5" y="6" width="14" height="4" fill="currentColor" stroke="none" />
        <rect x="7" y="14" width="10" height="4" fill="currentColor" stroke="none" />
    </svg>
);

const AlignRightIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="20" y1="4" x2="20" y2="20" />
        <rect x="7" y="6" width="10" height="4" fill="currentColor" stroke="none" />
        <rect x="11" y="14" width="6" height="4" fill="currentColor" stroke="none" />
    </svg>
);

const AlignTopIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="4" y1="4" x2="20" y2="4" />
        <rect x="6" y="7" width="4" height="10" fill="currentColor" stroke="none" />
        <rect x="14" y="7" width="4" height="6" fill="currentColor" stroke="none" />
    </svg>
);

const AlignCenterVIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="4" y1="12" x2="20" y2="12" />
        <rect x="6" y="5" width="4" height="14" fill="currentColor" stroke="none" />
        <rect x="14" y="7" width="4" height="10" fill="currentColor" stroke="none" />
    </svg>
);

const AlignBottomIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="4" y1="20" x2="20" y2="20" />
        <rect x="6" y="7" width="4" height="10" fill="currentColor" stroke="none" />
        <rect x="14" y="11" width="4" height="6" fill="currentColor" stroke="none" />
    </svg>
);

const DistributeHIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="4" y1="4" x2="4" y2="20" />
        <line x1="20" y1="4" x2="20" y2="20" />
        <rect x="7" y="8" width="3" height="8" fill="currentColor" stroke="none" />
        <rect x="14" y="8" width="3" height="8" fill="currentColor" stroke="none" />
    </svg>
);

const DistributeVIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="4" y1="4" x2="20" y2="4" />
        <line x1="4" y1="20" x2="20" y2="20" />
        <rect x="8" y="7" width="8" height="3" fill="currentColor" stroke="none" />
        <rect x="8" y="14" width="8" height="3" fill="currentColor" stroke="none" />
    </svg>
);

export function EditorCanvas({
    layout,
    onLayoutChange,
    selectedElement,
    onSelectElement,
    onDeleteElement,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
    selectedFrame,
}: EditorCanvasProps) {
    const [scale, setScale] = useState(0.5);
    const [autoScale, setAutoScale] = useState(true);
    const [dragState, setDragState] = useState<DragState | null>(null);
    const [resizeState, setResizeState] = useState<ResizeState | null>(null);
    const [mockData, setMockData] = useState<MockData>({
        viewerCount: 1234,
        chatMessages: [
            { id: 1, user: 'User123', message: 'Hello everyone! So excited to be here today!', platform: 'YouTube', roles: [] },
            { id: 2, user: 'Viewer', message: 'Great stream as always, keep up the amazing work!', platform: 'Kick', roles: ['sub'] },
            { id: 3, user: 'ChatFan', message: 'LET\'S GOOOOO! This is gonna be epic!', platform: 'Twitch', roles: ['mod'] },
        ],
        featuredMessage: null,
        pollVotes: [50, 50],
        superchatAmount: 10,
        currentTime: new Date(),
    });
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLDivElement>(null);
    const messageIdRef = useRef(4);

    // Auto-scale to fit container
    useEffect(() => {
        if (!autoScale || !containerRef.current) return;

        const calculateScale = () => {
            if (!containerRef.current) return;
            const container = containerRef.current;
            // Use minimal padding (16px) to maximize canvas usage
            // Handles extend ~5px outside so 16px gives comfortable margin
            const padding = 16;
            const containerWidth = container.clientWidth - padding * 2;
            const containerHeight = container.clientHeight - padding * 2;

            const scaleX = containerWidth / CANVAS_WIDTH;
            const scaleY = containerHeight / CANVAS_HEIGHT;
            // Use 0.98 max to ensure slight margin, don't scale above 100%
            const newScale = Math.min(scaleX, scaleY, 0.98);

            setScale(Math.max(0.1, newScale));
        };

        calculateScale();

        const resizeObserver = new ResizeObserver(calculateScale);
        resizeObserver.observe(containerRef.current);

        return () => resizeObserver.disconnect();
    }, [autoScale]);

    // Simulate live data updates
    useEffect(() => {
        const interval = setInterval(() => {
            setMockData(prev => {
                // Random viewer count fluctuation
                const viewerDelta = Math.floor(Math.random() * 21) - 10;
                const newViewerCount = Math.max(100, prev.viewerCount + viewerDelta);

                // Add new chat messages (sometimes multiple at once for realism)
                const newMessages = [...prev.chatMessages];
                const messagesToAdd = Math.random() > 0.7 ? Math.floor(Math.random() * 3) + 1 : 1;
                for (let i = 0; i < messagesToAdd; i++) {
                    if (Math.random() > 0.2) {
                        const newMessage: MockChatMessage = {
                            id: messageIdRef.current++,
                            user: MOCK_USERNAMES[Math.floor(Math.random() * MOCK_USERNAMES.length)],
                            message: MOCK_MESSAGES[Math.floor(Math.random() * MOCK_MESSAGES.length)],
                            platform: MOCK_PLATFORMS[Math.floor(Math.random() * MOCK_PLATFORMS.length)],
                            roles: MOCK_ROLES[Math.floor(Math.random() * MOCK_ROLES.length)],
                        };
                        newMessages.push(newMessage);
                    }
                }
                // Keep message history limited
                while (newMessages.length > MAX_CHAT_MESSAGES) {
                    newMessages.shift();
                }

                // Random poll vote changes
                const pollVotes = prev.pollVotes.map(v =>
                    Math.max(0, v + Math.floor(Math.random() * 5) - 2)
                );

                // Occasionally toggle featured message
                let featuredMessage = prev.featuredMessage;
                if (Math.random() > 0.95) {
                    featuredMessage = featuredMessage
                        ? null
                        : `${MOCK_USERNAMES[Math.floor(Math.random() * MOCK_USERNAMES.length)]}: ${MOCK_MESSAGES[Math.floor(Math.random() * MOCK_MESSAGES.length)]}`;
                }

                return {
                    viewerCount: newViewerCount,
                    chatMessages: newMessages,
                    featuredMessage,
                    pollVotes,
                    superchatAmount: prev.superchatAmount,
                    currentTime: new Date(),
                };
            });
        }, 1000); // Update every second for smooth token updates

        return () => clearInterval(interval);
    }, []);

    const updateElementConfig = useCallback((elementId: string, updates: Partial<ElementConfig>) => {
        const currentElement = layout.elements[elementId];

        // For position updates, we REPLACE rather than merge to allow clearing anchors
        // The caller should provide the complete new position state
        const newPosition = updates.position !== undefined
            ? updates.position
            : currentElement?.position;

        const newLayout = {
            ...layout,
            elements: {
                ...layout.elements,
                [elementId]: {
                    ...currentElement,
                    ...updates,
                    position: newPosition,
                    size: {
                        ...currentElement?.size,
                        ...updates.size,
                    },
                    style: {
                        ...currentElement?.style,
                        ...updates.style,
                    },
                },
            },
        };
        onLayoutChange(newLayout);
    }, [layout, onLayoutChange]);

    // Alignment handler for toolbar buttons
    const handleAlign = useCallback((alignment: 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom' | 'distribute-h' | 'distribute-v') => {
        if (!selectedElement || !layout.elements[selectedElement]) return;

        const element = layout.elements[selectedElement];
        const baseId = selectedElement.replace(/-\d+$/, '');

        // Default sizes for elements (same as used elsewhere in the component)
        const defaultSizesMap: Record<string, { width: number | string; height: number | string }> = {
            chat: { width: 300, height: CANVAS_HEIGHT },
            live: { width: 200, height: 40 },
            text: { width: 400, height: 60 },
            featured: { width: 600, height: 150 },
            poll: { width: 300, height: 200 },
            superchat: { width: 300, height: 150 },
        };

        const defaults = defaultSizesMap[baseId] || { width: 200, height: 100 };
        const widthPx = sizeToPx(element.size.width ?? defaults.width, true);
        const heightPx = sizeToPx(element.size.height ?? defaults.height, false);

        const newPosition: Position = {};

        switch (alignment) {
            case 'left':
                newPosition.x = pxToVw(0);
                // Preserve vertical position
                if (element.position.bottom !== null && element.position.bottom !== undefined) {
                    newPosition.bottom = element.position.bottom;
                } else {
                    newPosition.y = element.position.y ?? pxToVh(0);
                }
                break;

            case 'center-h':
                newPosition.x = pxToVw((CANVAS_WIDTH - widthPx) / 2);
                // Preserve vertical position
                if (element.position.bottom !== null && element.position.bottom !== undefined) {
                    newPosition.bottom = element.position.bottom;
                } else {
                    newPosition.y = element.position.y ?? pxToVh(0);
                }
                break;

            case 'right':
                newPosition.right = pxToVw(0);
                // Preserve vertical position
                if (element.position.bottom !== null && element.position.bottom !== undefined) {
                    newPosition.bottom = element.position.bottom;
                } else {
                    newPosition.y = element.position.y ?? pxToVh(0);
                }
                break;

            case 'top':
                newPosition.y = pxToVh(0);
                // Preserve horizontal position
                if (element.position.right !== null && element.position.right !== undefined) {
                    newPosition.right = element.position.right;
                } else {
                    newPosition.x = element.position.x ?? pxToVw(0);
                }
                break;

            case 'center-v':
                newPosition.y = pxToVh((CANVAS_HEIGHT - heightPx) / 2);
                // Preserve horizontal position
                if (element.position.right !== null && element.position.right !== undefined) {
                    newPosition.right = element.position.right;
                } else {
                    newPosition.x = element.position.x ?? pxToVw(0);
                }
                break;

            case 'bottom':
                newPosition.bottom = pxToVh(0);
                // Preserve horizontal position
                if (element.position.right !== null && element.position.right !== undefined) {
                    newPosition.right = element.position.right;
                } else {
                    newPosition.x = element.position.x ?? pxToVw(0);
                }
                break;

            case 'distribute-h':
                // Center horizontally with left anchor
                newPosition.x = pxToVw((CANVAS_WIDTH - widthPx) / 2);
                // Preserve vertical position
                if (element.position.bottom !== null && element.position.bottom !== undefined) {
                    newPosition.bottom = element.position.bottom;
                } else {
                    newPosition.y = element.position.y ?? pxToVh(0);
                }
                break;

            case 'distribute-v':
                // Center vertically with top anchor
                newPosition.y = pxToVh((CANVAS_HEIGHT - heightPx) / 2);
                // Preserve horizontal position
                if (element.position.right !== null && element.position.right !== undefined) {
                    newPosition.right = element.position.right;
                } else {
                    newPosition.x = element.position.x ?? pxToVw(0);
                }
                break;
        }

        // Preserve z-index
        if (element.position.zIndex !== undefined) {
            newPosition.zIndex = element.position.zIndex;
        }

        updateElementConfig(selectedElement, { position: newPosition });
    }, [selectedElement, layout.elements, updateElementConfig]);

    const handleMouseDown = useCallback((e: React.MouseEvent, elementId: string) => {
        e.preventDefault();
        e.stopPropagation();
        onSelectElement(elementId);

        const element = layout.elements[elementId];
        if (!element) return;

        // Get current position in pixels
        const pos = element.position;
        const hasLeft = pos.x !== null && pos.x !== undefined;
        const hasTop = pos.y !== null && pos.y !== undefined;
        const hasRight = pos.right !== null && pos.right !== undefined;
        const hasBottom = pos.bottom !== null && pos.bottom !== undefined;

        // Get element dimensions first (needed for position calculations)
        const defaults = defaultSizes[elementId.replace(/-\d+$/, '')] || { width: 200, height: 100 };
        const widthPx = sizeToPx(element.size.width ?? defaults.width, true);
        const heightPx = sizeToPx(element.size.height ?? defaults.height, false);

        // Convert current positions to pixels
        // If both left and right are set, pick one (prefer left for consistency)
        let leftPx: number | null = null;
        let rightPx: number | null = null;
        if (hasLeft) {
            leftPx = positionToPx(pos.x, true);
        } else if (hasRight) {
            rightPx = positionToPx(pos.right, true);
            leftPx = CANVAS_WIDTH - rightPx - widthPx; // Calculate left for drag math
        }

        // If both top and bottom are set, pick one (prefer top for consistency)
        let topPx: number | null = null;
        let bottomPx: number | null = null;
        if (hasTop) {
            topPx = positionToPx(pos.y, false);
        } else if (hasBottom) {
            bottomPx = positionToPx(pos.bottom, false);
            topPx = CANVAS_HEIGHT - bottomPx - heightPx; // Calculate top for drag math
        }

        setDragState({
            elementId,
            startMouseX: e.clientX,
            startMouseY: e.clientY,
            startLeft: hasLeft ? leftPx : null,
            startTop: hasTop ? topPx : null,
            startRight: hasRight && !hasLeft ? rightPx : null,
            startBottom: hasBottom && !hasTop ? bottomPx : null,
            elementWidth: widthPx,
            elementHeight: heightPx,
        });
    }, [layout.elements, onSelectElement]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!dragState) return;

        const dx = (e.clientX - dragState.startMouseX) / scale;
        const dy = (e.clientY - dragState.startMouseY) / scale;

        const element = layout.elements[dragState.elementId];
        if (!element) return;

        // Calculate new position in pixels based on which edges were set
        let newLeftPx: number;
        let newTopPx: number;

        // Handle horizontal position
        if (dragState.startLeft !== null) {
            newLeftPx = Math.max(0, Math.min(CANVAS_WIDTH - dragState.elementWidth, dragState.startLeft + dx));
        } else if (dragState.startRight !== null) {
            const newRight = Math.max(0, dragState.startRight - dx);
            newLeftPx = CANVAS_WIDTH - dragState.elementWidth - newRight;
            newLeftPx = Math.max(0, Math.min(CANVAS_WIDTH - dragState.elementWidth, newLeftPx));
        } else {
            newLeftPx = Math.max(0, Math.min(CANVAS_WIDTH - dragState.elementWidth, dx));
        }

        // Handle vertical position
        if (dragState.startTop !== null) {
            newTopPx = Math.max(0, Math.min(CANVAS_HEIGHT - dragState.elementHeight, dragState.startTop + dy));
        } else if (dragState.startBottom !== null) {
            const newBottom = Math.max(0, dragState.startBottom - dy);
            newTopPx = CANVAS_HEIGHT - dragState.elementHeight - newBottom;
            newTopPx = Math.max(0, Math.min(CANVAS_HEIGHT - dragState.elementHeight, newTopPx));
        } else {
            newTopPx = Math.max(0, Math.min(CANVAS_HEIGHT - dragState.elementHeight, dy));
        }

        // Keep the same anchor type during drag to prevent flicker
        // We'll switch anchors only on mouse up based on final position
        const useRight = dragState.startRight !== null;
        const useBottom = dragState.startBottom !== null;

        // Build new position with vw/vh units, keeping original anchor
        const newPosition: Position = {};

        if (useRight) {
            const rightPx = CANVAS_WIDTH - newLeftPx - dragState.elementWidth;
            newPosition.right = pxToVw(Math.max(0, rightPx));
        } else {
            newPosition.x = pxToVw(newLeftPx);
        }

        if (useBottom) {
            const bottomPx = CANVAS_HEIGHT - newTopPx - dragState.elementHeight;
            newPosition.bottom = pxToVh(Math.max(0, bottomPx));
        } else {
            newPosition.y = pxToVh(newTopPx);
        }

        updateElementConfig(dragState.elementId, { position: newPosition });
    }, [dragState, scale, layout.elements, updateElementConfig]);

    const handleMouseUp = useCallback(() => {
        // On drag end, switch anchors based on final position
        if (dragState) {
            const element = layout.elements[dragState.elementId];
            if (element) {
                const pos = element.position;
                const defaults = defaultSizes[dragState.elementId.replace(/-\d+$/, '')] || { width: 200, height: 100 };
                const widthPx = sizeToPx(element.size.width ?? defaults.width, true);
                const heightPx = sizeToPx(element.size.height ?? defaults.height, false);

                // Calculate current position in pixels
                let leftPx: number;
                let topPx: number;

                if (pos.x !== null && pos.x !== undefined) {
                    leftPx = positionToPx(pos.x, true);
                } else if (pos.right !== null && pos.right !== undefined) {
                    leftPx = CANVAS_WIDTH - positionToPx(pos.right, true) - widthPx;
                } else {
                    leftPx = 0;
                }

                if (pos.y !== null && pos.y !== undefined) {
                    topPx = positionToPx(pos.y, false);
                } else if (pos.bottom !== null && pos.bottom !== undefined) {
                    topPx = CANVAS_HEIGHT - positionToPx(pos.bottom, false) - heightPx;
                } else {
                    topPx = 0;
                }

                // Calculate element center
                const centerX = leftPx + widthPx / 2;
                const centerY = topPx + heightPx / 2;

                // Determine optimal anchor based on center position
                const useRight = centerX > CANVAS_WIDTH / 2;
                const useBottom = centerY > CANVAS_HEIGHT / 2;

                // Build final position with optimal anchors
                const newPosition: Position = {};

                if (useRight) {
                    const rightPx = CANVAS_WIDTH - leftPx - widthPx;
                    newPosition.right = pxToVw(Math.max(0, rightPx));
                } else {
                    newPosition.x = pxToVw(leftPx);
                }

                if (useBottom) {
                    const bottomPx = CANVAS_HEIGHT - topPx - heightPx;
                    newPosition.bottom = pxToVh(Math.max(0, bottomPx));
                } else {
                    newPosition.y = pxToVh(topPx);
                }

                updateElementConfig(dragState.elementId, { position: newPosition });
            }
        }

        setDragState(null);
        setResizeState(null);
    }, [dragState, layout.elements, updateElementConfig]);

    // Resize handlers
    const handleResizeStart = useCallback((e: React.MouseEvent, elementId: string, handle: ResizeState['handle']) => {
        e.preventDefault();
        e.stopPropagation();
        onSelectElement(elementId);

        const element = layout.elements[elementId];
        if (!element) return;

        const defaults = defaultSizes[elementId.replace(/-\d+$/, '')] || { width: 200, height: 100 };
        const widthPx = sizeToPx(element.size.width ?? defaults.width, true);
        const heightPx = sizeToPx(element.size.height ?? defaults.height, false);

        // Convert positions to pixels
        // If both anchors are set on same axis, prefer left/top
        const pos = element.position;
        const hasLeft = pos.x !== null && pos.x !== undefined;
        const hasTop = pos.y !== null && pos.y !== undefined;
        const hasRight = pos.right !== null && pos.right !== undefined;
        const hasBottom = pos.bottom !== null && pos.bottom !== undefined;

        let leftPx: number | null = null;
        let rightPx: number | null = null;
        if (hasLeft) {
            leftPx = positionToPx(pos.x, true);
        } else if (hasRight) {
            rightPx = positionToPx(pos.right, true);
        }

        let topPx: number | null = null;
        let bottomPx: number | null = null;
        if (hasTop) {
            topPx = positionToPx(pos.y, false);
        } else if (hasBottom) {
            bottomPx = positionToPx(pos.bottom, false);
        }

        setResizeState({
            elementId,
            handle,
            startX: e.clientX,
            startY: e.clientY,
            startWidth: widthPx,
            startHeight: heightPx,
            startPosX: leftPx,
            startPosY: topPx,
            startPosRight: rightPx,
            startPosBottom: bottomPx,
        });
    }, [layout.elements, onSelectElement]);

    const handleResizeMove = useCallback((e: React.MouseEvent) => {
        if (!resizeState) return;

        const dx = (e.clientX - resizeState.startX) / scale;
        const dy = (e.clientY - resizeState.startY) / scale;

        const element = layout.elements[resizeState.elementId];
        if (!element) return;

        let newWidthPx = resizeState.startWidth;
        let newHeightPx = resizeState.startHeight;
        let newLeftPx = resizeState.startPosX;
        let newTopPx = resizeState.startPosY;
        let newRightPx = resizeState.startPosRight;
        let newBottomPx = resizeState.startPosBottom;

        const handle = resizeState.handle;
        const usesRight = resizeState.startPosRight !== null;
        const usesBottom = resizeState.startPosBottom !== null;

        // Width changes
        if (handle.includes('e')) {
            if (usesRight) {
                // Right-anchored: east handle moves anchor
                newRightPx = Math.max(0, resizeState.startPosRight! - dx);
            } else {
                // Left-anchored: east handle resizes
                const proposedWidth = resizeState.startWidth + dx;
                const startX = resizeState.startPosX ?? 0;
                const maxWidth = CANVAS_WIDTH - startX;
                newWidthPx = Math.max(50, Math.min(proposedWidth, maxWidth));
            }
        }
        if (handle.includes('w')) {
            if (usesRight) {
                // Right-anchored: west handle resizes
                const proposedWidth = resizeState.startWidth - dx;
                const maxWidth = CANVAS_WIDTH - resizeState.startPosRight!;
                newWidthPx = Math.max(50, Math.min(proposedWidth, maxWidth));
            } else {
                // Left-anchored: west handle resizes AND moves
                const proposedWidth = resizeState.startWidth - dx;
                const proposedX = (resizeState.startPosX ?? 0) + dx;
                if (proposedX >= 0) {
                    newWidthPx = Math.max(50, proposedWidth);
                    newLeftPx = proposedX;
                } else {
                    newLeftPx = 0;
                    newWidthPx = Math.max(50, resizeState.startWidth + (resizeState.startPosX ?? 0));
                }
            }
        }

        // Height changes
        if (handle.includes('s')) {
            if (usesBottom) {
                // Bottom-anchored: south handle moves anchor
                newBottomPx = Math.max(0, resizeState.startPosBottom! - dy);
            } else {
                // Top-anchored: south handle resizes
                const proposedHeight = resizeState.startHeight + dy;
                const startY = resizeState.startPosY ?? 0;
                const maxHeight = CANVAS_HEIGHT - startY;
                newHeightPx = Math.max(30, Math.min(proposedHeight, maxHeight));
            }
        }
        if (handle.includes('n')) {
            if (usesBottom) {
                // Bottom-anchored: north handle resizes
                const proposedHeight = resizeState.startHeight - dy;
                const maxHeight = CANVAS_HEIGHT - resizeState.startPosBottom!;
                newHeightPx = Math.max(30, Math.min(proposedHeight, maxHeight));
            } else {
                // Top-anchored: north handle resizes AND moves
                const proposedHeight = resizeState.startHeight - dy;
                const proposedY = (resizeState.startPosY ?? 0) + dy;
                if (proposedY >= 0) {
                    newHeightPx = Math.max(30, proposedHeight);
                    newTopPx = proposedY;
                } else {
                    newTopPx = 0;
                    newHeightPx = Math.max(30, resizeState.startHeight + (resizeState.startPosY ?? 0));
                }
            }
        }

        // Build position with vw/vh units, preserving which edges are used
        const newPosition: Position = {};
        if (newRightPx !== null) {
            newPosition.right = pxToVw(newRightPx);
        } else if (newLeftPx !== null) {
            newPosition.x = pxToVw(newLeftPx);
        }
        if (newBottomPx !== null) {
            newPosition.bottom = pxToVh(newBottomPx);
        } else if (newTopPx !== null) {
            newPosition.y = pxToVh(newTopPx);
        }

        // Convert size to vw/vh
        updateElementConfig(resizeState.elementId, {
            size: {
                width: pxToVw(Math.round(newWidthPx)),
                height: pxToVh(Math.round(newHeightPx)),
            },
            ...(Object.keys(newPosition).length > 0 ? { position: newPosition } : {}),
        });
    }, [resizeState, scale, layout.elements, updateElementConfig]);

    // Default sizes for each element type
    const defaultSizes: Record<string, { width: number | string; height: number | string }> = {
        chat: { width: 300, height: '100%' },
        live: { width: 150, height: 40 },
        text: { width: 400, height: 60 },
        attribution: { width: 400, height: 60 }, // Backward compatibility
        featured: { width: 600, height: 100 },
        poll: { width: 300, height: 150 },
        superchat: { width: 300, height: 100 },
    };

    // Parse CSS string into style object
    // Note: SCSS is compiled server-side; compiledCss contains the result
    const parseCustomCss = (css: string): React.CSSProperties => {
        const style: Record<string, string> = {};
        if (!css) return style;

        // Split by semicolons and parse each property
        const rules = css.split(';').map(r => r.trim()).filter(r => r && !r.startsWith('/*') && !r.startsWith('//'));
        for (const rule of rules) {
            const colonIndex = rule.indexOf(':');
            if (colonIndex > 0) {
                const prop = rule.slice(0, colonIndex).trim();
                const value = rule.slice(colonIndex + 1).trim();
                // Convert kebab-case to camelCase for React
                const camelProp = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
                style[camelProp] = value;
            }
        }
        return style as React.CSSProperties;
    };

    const getElementStyle = (elementId: string, config: ElementConfig): React.CSSProperties => {
        const style: React.CSSProperties = {
            position: 'absolute',
        };

        const baseId = elementId.replace(/-\d+$/, '');
        const defaults = defaultSizes[baseId] || { width: 200, height: 100 };

        // Position - convert vw/vh to pixels for canvas display
        // Only use one anchor per axis (prefer left/top over right/bottom)
        const hasLeft = config.position.x !== null && config.position.x !== undefined;
        const hasTop = config.position.y !== null && config.position.y !== undefined;
        const hasRight = config.position.right !== null && config.position.right !== undefined;
        const hasBottom = config.position.bottom !== null && config.position.bottom !== undefined;

        if (hasLeft) {
            style.left = positionToPx(config.position.x, true);
        } else if (hasRight) {
            style.right = positionToPx(config.position.right, true);
        }

        if (hasTop) {
            style.top = positionToPx(config.position.y, false);
        } else if (hasBottom) {
            style.bottom = positionToPx(config.position.bottom, false);
        }

        // Size - convert to pixels for canvas display
        const widthValue = config.size.width ?? defaults.width;
        const heightValue = config.size.height ?? defaults.height;
        style.width = sizeToPx(widthValue, true);
        style.height = sizeToPx(heightValue, false);

        // Z-index
        if (config.position.zIndex !== undefined) {
            style.zIndex = config.position.zIndex;
        }

        // Apply custom CSS (use compiledCss if available, otherwise parse customCss)
        const cssToApply = config.style.compiledCss || config.style.customCss;
        if (cssToApply) {
            Object.assign(style, parseCustomCss(cssToApply));
        }

        return style;
    };

    // Get display name for element label
    const getDisplayName = (elementId: string, config: ElementConfig) => {
        if (config.displayName) return config.displayName;
        const baseId = elementId.replace(/-\d+$/, '');
        const names: Record<string, string> = {
            chat: 'Chat',
            live: 'Live',
            text: 'Text',
            attribution: 'Text', // Backward compatibility
            featured: 'Featured',
            poll: 'Poll',
            superchat: 'Superchat',
        };
        return names[baseId] || elementId;
    };

    const renderElement = (elementId: string, config: ElementConfig) => {
        if (!config.enabled) {
            return null;
        }

        const isSelected = selectedElement === elementId;
        const style = getElementStyle(elementId, config);
        const baseElementType = elementId.replace(/-\d+$/, '');

        // Get actual computed dimensions for the element
        const elementWidth = typeof style.width === 'number' ? style.width : 300;
        const elementHeight = typeof style.height === 'number' ? style.height : (style.height === '100%' ? CANVAS_HEIGHT : 200);

        let content: React.ReactNode;
        switch (baseElementType) {
            case 'chat': {
                // Calculate how many messages can fit based on element height
                const messageHeight = 42; // Approximate height per message
                const availableHeight = typeof elementHeight === 'number' ? elementHeight : 400;
                const maxMessages = Math.max(1, Math.floor(availableHeight / messageHeight));
                const visibleMessages = mockData.chatMessages.slice(-maxMessages);

                // Get display options from messageStyle
                const showAvatars = layout.messageStyle?.showAvatars !== false;
                const condensedMode = layout.messageStyle?.condensedMode === true;

                // Badge visibility settings
                const showOwnerBadge = layout.messageStyle?.showOwnerBadge !== false;
                const showStaffBadge = layout.messageStyle?.showStaffBadge !== false;
                const showModBadge = layout.messageStyle?.showModBadge !== false;
                const showVerifiedBadge = layout.messageStyle?.showVerifiedBadge !== false;
                const showSubBadge = layout.messageStyle?.showSubBadge !== false;

                // Build chat container classes
                const chatClasses = [
                    'preview-chat',
                    condensedMode && 'preview-chat--condensed',
                    !showAvatars && 'preview-chat--no-avatars',
                ].filter(Boolean).join(' ');

                // Apply message style settings as CSS custom properties
                const chatStyle: React.CSSProperties & Record<string, string> = {
                    width: '100%',
                    height: '100%',
                };
                if (layout.messageStyle?.fontSize) {
                    chatStyle['--message-font-size'] = layout.messageStyle.fontSize;
                }
                if (layout.messageStyle?.avatarSize) {
                    chatStyle['--avatar-size'] = layout.messageStyle.avatarSize;
                }

                // SVG icons for badges
                const CrownIcon = () => (
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z"/>
                    </svg>
                );
                const StarIcon = () => (
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2L9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2z"/>
                    </svg>
                );
                const ShieldIcon = () => (
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 4l4 2v3c0 2.97-1.67 5.68-4 7-2.33-1.32-4-4.03-4-7V7l4-2z"/>
                    </svg>
                );
                const CheckIcon = () => (
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                    </svg>
                );

                // Helper to render badges for a message
                const renderBadges = (roles: string[]) => {
                    const badges: React.ReactNode[] = [];
                    if (roles.includes('owner') && showOwnerBadge) {
                        badges.push(<span key="owner" className="msg-badge msg-badge--owner" title="Owner"><CrownIcon /></span>);
                    }
                    if (roles.includes('staff') && showStaffBadge) {
                        badges.push(<span key="staff" className="msg-badge msg-badge--staff" title="Staff"><StarIcon /></span>);
                    }
                    if (roles.includes('mod') && showModBadge) {
                        badges.push(<span key="mod" className="msg-badge msg-badge--mod" title="Moderator"><ShieldIcon /></span>);
                    }
                    if (roles.includes('verified') && showVerifiedBadge) {
                        badges.push(<span key="verified" className="msg-badge msg-badge--verified" title="Verified"><CheckIcon /></span>);
                    }
                    if (roles.includes('sub') && showSubBadge) {
                        badges.push(<span key="sub" className="msg-badge msg-badge--sub" title="Subscriber"><StarIcon /></span>);
                    }
                    return badges.length > 0 ? <span className="msg-badges">{badges}</span> : null;
                };

                content = (
                    <div className={chatClasses} style={chatStyle}>
                        {visibleMessages.map((msg) => {
                            const platformColor = PLATFORM_COLORS[msg.platform] || '#ffffff';
                            // Build message classes for platform
                            const msgClasses = [
                                'msg',
                                `msg--p-${msg.platform}`,
                            ].join(' ');

                            return (
                                <div key={msg.id} className={msgClasses}>
                                    <div className="msg-avatar-border" style={{ borderColor: platformColor }}>
                                        <span className="msg-letter" style={{ color: platformColor }}>
                                            {msg.user.charAt(0).toUpperCase()}
                                        </span>
                                    </div>
                                    <div className="msg-container">
                                        <div className="msg-user">
                                            <span className="msg-username" style={{ color: platformColor }}>
                                                {msg.user}
                                            </span>
                                            {renderBadges(msg.roles)}
                                        </div>
                                        <div className="msg-text">{msg.message}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                );
                break;
            }
            case 'live': {
                const options = config.options || {};
                const showIcon = options.showIcon === true;
                const showLabel = options.showLabel !== false;
                const showCount = options.showCount !== false;
                content = (
                    <div className="preview-live">
                        {showIcon && <span className="preview-live-icon">📺</span>}
                        {showLabel && <span className="preview-live-badge live">LIVE</span>}
                        {showCount && <span className="preview-live-badge">{mockData.viewerCount.toLocaleString()}</span>}
                        {!showIcon && !showLabel && !showCount && (
                            <span className="preview-live-badge" style={{ opacity: 0.5 }}>No display options</span>
                        )}
                    </div>
                );
                break;
            }
            case 'text':
            case 'attribution': { // Backward compatibility
                const options = config.options || {};
                const textContent = (options.content as string) || 'Text Element';
                // Resolve any tokens in the content
                const resolvedContent = resolveTokens(textContent);
                content = (
                    <div className="preview-text" style={{
                        ...config.style,
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                    }}>
                        {resolvedContent}
                    </div>
                );
                break;
            }
            case 'featured':
                content = (
                    <div className="preview-featured" style={{ opacity: mockData.featuredMessage ? 1 : 0.5 }}>
                        {mockData.featuredMessage || 'Featured message appears here...'}
                    </div>
                );
                break;
            case 'poll': {
                const totalVotes = mockData.pollVotes.reduce((a, b) => a + b, 0);
                content = (
                    <div className="preview-poll">
                        <strong>Which is better?</strong>
                        <div>Option A - {totalVotes ? Math.round(mockData.pollVotes[0] / totalVotes * 100) : 50}%</div>
                        <div>Option B - {totalVotes ? Math.round(mockData.pollVotes[1] / totalVotes * 100) : 50}%</div>
                        <small>{totalVotes} votes</small>
                    </div>
                );
                break;
            }
            case 'superchat':
                content = (
                    <div className="preview-superchat">
                        <strong>${mockData.superchatAmount} Superchat</strong>
                        <div>Thank you for the stream!</div>
                    </div>
                );
                break;
            default:
                content = <div>Unknown element: {elementId}</div>;
        }

        return (
            <div
                key={elementId}
                className={`element-wrapper ${isSelected ? 'selected' : ''}`}
                style={style}
                onMouseDown={(e) => handleMouseDown(e, elementId)}
            >
                <span className="element-label">{getDisplayName(elementId, config)}</span>
                {content}
                {/* Resize handles - only show when selected */}
                {isSelected && (
                    <>
                        <div className="resize-handle resize-n" onMouseDown={(e) => handleResizeStart(e, elementId, 'n')} />
                        <div className="resize-handle resize-s" onMouseDown={(e) => handleResizeStart(e, elementId, 's')} />
                        <div className="resize-handle resize-e" onMouseDown={(e) => handleResizeStart(e, elementId, 'e')} />
                        <div className="resize-handle resize-w" onMouseDown={(e) => handleResizeStart(e, elementId, 'w')} />
                        <div className="resize-handle resize-ne" onMouseDown={(e) => handleResizeStart(e, elementId, 'ne')} />
                        <div className="resize-handle resize-nw" onMouseDown={(e) => handleResizeStart(e, elementId, 'nw')} />
                        <div className="resize-handle resize-se" onMouseDown={(e) => handleResizeStart(e, elementId, 'se')} />
                        <div className="resize-handle resize-sw" onMouseDown={(e) => handleResizeStart(e, elementId, 'sw')} />
                    </>
                )}
            </div>
        );
    };

    const canDelete = Object.keys(layout.elements).length > 1;

    return (
        <div className="editor-canvas">
            <div className="canvas-toolbar">
                {/* Undo/Redo buttons */}
                <button
                    className="toolbar-btn"
                    onClick={onUndo}
                    disabled={!canUndo}
                    title="Undo (Ctrl+Z)"
                >
                    ↶ Undo
                </button>
                <button
                    className="toolbar-btn"
                    onClick={onRedo}
                    disabled={!canRedo}
                    title="Redo (Ctrl+Y)"
                >
                    ↷ Redo
                </button>

                <div className="toolbar-separator" />

                {/* Delete button */}
                <button
                    className="toolbar-btn toolbar-btn-danger"
                    onClick={onDeleteElement}
                    disabled={!canDelete}
                    title="Delete selected element (Del)"
                >
                    🗑 Delete
                </button>

                <div className="toolbar-separator" />

                {/* Alignment buttons */}
                <div className="toolbar-align-group">
                    <span className="toolbar-label">Align:</span>
                    <button
                        className="toolbar-btn toolbar-btn-icon"
                        onClick={() => handleAlign('left')}
                        disabled={!selectedElement}
                        title="Align Left"
                    >
                        <AlignLeftIcon />
                    </button>
                    <button
                        className="toolbar-btn toolbar-btn-icon"
                        onClick={() => handleAlign('center-h')}
                        disabled={!selectedElement}
                        title="Align Center Horizontal"
                    >
                        <AlignCenterHIcon />
                    </button>
                    <button
                        className="toolbar-btn toolbar-btn-icon"
                        onClick={() => handleAlign('right')}
                        disabled={!selectedElement}
                        title="Align Right"
                    >
                        <AlignRightIcon />
                    </button>
                    <button
                        className="toolbar-btn toolbar-btn-icon"
                        onClick={() => handleAlign('top')}
                        disabled={!selectedElement}
                        title="Align Top"
                    >
                        <AlignTopIcon />
                    </button>
                    <button
                        className="toolbar-btn toolbar-btn-icon"
                        onClick={() => handleAlign('center-v')}
                        disabled={!selectedElement}
                        title="Align Center Vertical"
                    >
                        <AlignCenterVIcon />
                    </button>
                    <button
                        className="toolbar-btn toolbar-btn-icon"
                        onClick={() => handleAlign('bottom')}
                        disabled={!selectedElement}
                        title="Align Bottom"
                    >
                        <AlignBottomIcon />
                    </button>
                </div>

                <div className="toolbar-separator" />

                {/* Zoom controls */}
                <label className="auto-scale-toggle" style={{ marginRight: '16px' }}>
                    <input
                        type="checkbox"
                        checked={autoScale}
                        onChange={(e) => setAutoScale(e.target.checked)}
                    />
                    <span>Auto-fit</span>
                </label>
                <label style={{ fontSize: '12px', marginRight: '8px', opacity: autoScale ? 0.5 : 1 }}>Zoom:</label>
                <input
                    type="range"
                    min="0.25"
                    max="1"
                    step="0.05"
                    value={scale}
                    onChange={(e) => {
                        setAutoScale(false);
                        setScale(parseFloat(e.target.value));
                    }}
                    style={{ width: '100px' }}
                    disabled={autoScale}
                />
                <span style={{ fontSize: '12px', marginLeft: '8px' }}>
                    {Math.round(scale * 100)}%
                </span>
            </div>

            <div
                ref={containerRef}
                className="canvas-container"
                onMouseMove={(e) => {
                    handleMouseMove(e);
                    handleResizeMove(e);
                }}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            >
                <div
                    ref={canvasRef}
                    className="canvas-viewport"
                    style={{
                        width: CANVAS_WIDTH,
                        height: CANVAS_HEIGHT,
                        transform: `scale(${scale})`,
                        transformOrigin: 'center center',
                    }}
                    onClick={(e) => {
                        // Only deselect if clicking on the canvas itself, not an element
                        if (e.target === e.currentTarget) {
                            // Keep current selection - don't clear it
                        }
                    }}
                >
                    {Object.entries(layout.elements).map(([id, config]) => {
                        // Filter by frame if one is selected
                        if (selectedFrame) {
                            const frames = layout.frames || defaultFrames();
                            const frame = frames[selectedFrame];
                            if (frame) {
                                // Empty elements array means show all
                                if (frame.elements && frame.elements.length > 0) {
                                    if (!frame.elements.includes(id)) {
                                        return null;
                                    }
                                }
                            }
                        }
                        return renderElement(id, config);
                    })}
                </div>
            </div>
        </div>
    );
}
