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
interface MockData {
    viewerCount: number;
    chatMessages: { id: number; user: string; message: string; color: string }[];
    featuredMessage: string | null;
    pollVotes: number[];
    superchatAmount: number;
    currentTime: Date;
}

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
const MOCK_COLORS = ['#e94560', '#44aa44', '#4488ff', '#ff8844', '#aa44ff', '#44aaaa', '#ff44aa', '#aaff44'];

// Maximum messages to keep in chat history
const MAX_CHAT_MESSAGES = 100;

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
}: EditorCanvasProps) {
    const [scale, setScale] = useState(0.5);
    const [autoScale, setAutoScale] = useState(true);
    const [dragState, setDragState] = useState<DragState | null>(null);
    const [resizeState, setResizeState] = useState<ResizeState | null>(null);
    const [mockData, setMockData] = useState<MockData>({
        viewerCount: 1234,
        chatMessages: [
            { id: 1, user: 'User123', message: 'Hello everyone! So excited to be here today!', color: '#e94560' },
            { id: 2, user: 'Viewer', message: 'Great stream as always, keep up the amazing work!', color: '#44aa44' },
            { id: 3, user: 'ChatFan', message: 'LET\'S GOOOOO! This is gonna be epic!', color: '#4488ff' },
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
            const containerWidth = container.clientWidth - 40; // padding
            const containerHeight = container.clientHeight - 40;

            const scaleX = containerWidth / CANVAS_WIDTH;
            const scaleY = containerHeight / CANVAS_HEIGHT;
            const newScale = Math.min(scaleX, scaleY, 1); // Don't scale above 100%

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
                        const newMessage = {
                            id: messageIdRef.current++,
                            user: MOCK_USERNAMES[Math.floor(Math.random() * MOCK_USERNAMES.length)],
                            message: MOCK_MESSAGES[Math.floor(Math.random() * MOCK_MESSAGES.length)],
                            color: MOCK_COLORS[Math.floor(Math.random() * MOCK_COLORS.length)],
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

        // Calculate element center
        const centerX = newLeftPx + dragState.elementWidth / 2;
        const centerY = newTopPx + dragState.elementHeight / 2;

        // Determine nearest edges based on center position
        const useRight = centerX > CANVAS_WIDTH / 2;
        const useBottom = centerY > CANVAS_HEIGHT / 2;

        // Build new position with vw/vh units
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
        setDragState(null);
        setResizeState(null);
    }, []);

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

                content = (
                    <div className="preview-chat" style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'flex-end',
                        overflow: 'hidden',
                    }}>
                        {visibleMessages.map((msg) => (
                            <div key={msg.id} className="preview-chat-message" style={{
                                fontSize: layout.messageStyle?.fontSize || '16px',
                            }}>
                                <div className="preview-avatar" style={{
                                    background: msg.color,
                                    width: layout.messageStyle?.avatarSize || '2em',
                                    height: layout.messageStyle?.avatarSize || '2em',
                                    flexShrink: 0,
                                }} />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    <strong style={{ color: msg.color }}>{msg.user}:</strong> {msg.message}
                                </span>
                            </div>
                        ))}
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
                    {Object.entries(layout.elements).map(([id, config]) =>
                        renderElement(id, config)
                    )}
                </div>
            </div>
        </div>
    );
}
