import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Layout, ElementConfig } from '../types/layout';

interface EditorCanvasProps {
    layout: Layout;
    onLayoutChange: (layout: Layout) => void;
    selectedElement: string;
    onSelectElement: (elementId: string) => void;
}

interface DragState {
    elementId: string;
    startX: number;
    startY: number;
    startPosX: number;
    startPosY: number;
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
}

const MOCK_USERNAMES = ['Viewer123', 'ChatFan', 'StreamLover', 'CoolGuy99', 'NightOwl', 'GameMaster', 'TechWiz', 'MusicFan'];
const MOCK_MESSAGES = [
    'Hello everyone!', 'Great stream!', 'LET\'S GO!', 'This is amazing',
    'First time here', 'Love the content', 'POG', 'Hype!', 'GG',
    'Can\'t wait!', 'So good', 'W stream', 'Based', 'True'
];
const MOCK_COLORS = ['#e94560', '#44aa44', '#4488ff', '#ff8844', '#aa44ff', '#44aaaa'];

const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;

export function EditorCanvas({ layout, onLayoutChange, selectedElement, onSelectElement }: EditorCanvasProps) {
    const [scale, setScale] = useState(0.5);
    const [dragState, setDragState] = useState<DragState | null>(null);
    const [resizeState, setResizeState] = useState<ResizeState | null>(null);
    const [mockData, setMockData] = useState<MockData>({
        viewerCount: 1234,
        chatMessages: [
            { id: 1, user: 'User123', message: 'Hello world!', color: '#e94560' },
            { id: 2, user: 'Viewer', message: 'Great stream!', color: '#44aa44' },
        ],
        featuredMessage: null,
        pollVotes: [50, 50],
        superchatAmount: 10,
    });
    const canvasRef = useRef<HTMLDivElement>(null);
    const messageIdRef = useRef(3);

    // Simulate live data updates
    useEffect(() => {
        const interval = setInterval(() => {
            setMockData(prev => {
                // Random viewer count fluctuation
                const viewerDelta = Math.floor(Math.random() * 21) - 10;
                const newViewerCount = Math.max(100, prev.viewerCount + viewerDelta);

                // Add a new chat message occasionally
                const newMessages = [...prev.chatMessages];
                if (Math.random() > 0.3) {
                    const newMessage = {
                        id: messageIdRef.current++,
                        user: MOCK_USERNAMES[Math.floor(Math.random() * MOCK_USERNAMES.length)],
                        message: MOCK_MESSAGES[Math.floor(Math.random() * MOCK_MESSAGES.length)],
                        color: MOCK_COLORS[Math.floor(Math.random() * MOCK_COLORS.length)],
                    };
                    newMessages.push(newMessage);
                    // Keep only the last 5 messages
                    if (newMessages.length > 5) {
                        newMessages.shift();
                    }
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
                };
            });
        }, 1500); // Update every 1.5 seconds

        return () => clearInterval(interval);
    }, []);

    const updateElementConfig = useCallback((elementId: string, updates: Partial<ElementConfig>) => {
        const newLayout = {
            ...layout,
            elements: {
                ...layout.elements,
                [elementId]: {
                    ...layout.elements[elementId],
                    ...updates,
                    position: {
                        ...layout.elements[elementId]?.position,
                        ...updates.position,
                    },
                    size: {
                        ...layout.elements[elementId]?.size,
                        ...updates.size,
                    },
                    style: {
                        ...layout.elements[elementId]?.style,
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

        setDragState({
            elementId,
            startX: e.clientX,
            startY: e.clientY,
            startPosX: element.position.x ?? element.position.right ?? 0,
            startPosY: element.position.y ?? element.position.bottom ?? 0,
        });
    }, [layout.elements, onSelectElement]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!dragState) return;

        const dx = (e.clientX - dragState.startX) / scale;
        const dy = (e.clientY - dragState.startY) / scale;

        const element = layout.elements[dragState.elementId];
        if (!element) return;

        const newPosition: typeof element.position = {};

        // Determine if element uses right/bottom positioning
        if (element.position.right !== null && element.position.right !== undefined) {
            newPosition.right = Math.max(0, dragState.startPosX - dx);
        } else {
            newPosition.x = Math.max(0, dragState.startPosX + dx);
        }

        if (element.position.bottom !== null && element.position.bottom !== undefined) {
            newPosition.bottom = Math.max(0, dragState.startPosY - dy);
        } else {
            newPosition.y = Math.max(0, dragState.startPosY + dy);
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
        const currentWidth = element.size.width ?? defaults.width;
        const currentHeight = element.size.height ?? defaults.height;

        setResizeState({
            elementId,
            handle,
            startX: e.clientX,
            startY: e.clientY,
            startWidth: typeof currentWidth === 'number' ? currentWidth : parseInt(currentWidth) || 200,
            startHeight: typeof currentHeight === 'number' ? currentHeight : parseInt(currentHeight) || 100,
            startPosX: element.position.x ?? null,
            startPosY: element.position.y ?? null,
            startPosRight: element.position.right ?? null,
            startPosBottom: element.position.bottom ?? null,
        });
    }, [layout.elements, onSelectElement]);

    const handleResizeMove = useCallback((e: React.MouseEvent) => {
        if (!resizeState) return;

        const dx = (e.clientX - resizeState.startX) / scale;
        const dy = (e.clientY - resizeState.startY) / scale;

        const element = layout.elements[resizeState.elementId];
        if (!element) return;

        let newWidth = resizeState.startWidth;
        let newHeight = resizeState.startHeight;
        const newPosition: typeof element.position = {};

        const handle = resizeState.handle;
        const usesRight = resizeState.startPosRight !== null;
        const usesBottom = resizeState.startPosBottom !== null;

        // Width changes
        if (handle.includes('e')) {
            if (usesRight) {
                // Right-anchored element: east edge is the anchor point
                // Dragging the east handle moves the anchor, not the width
                // This makes the element slide left/right while keeping its size
                // When right=0 (at boundary), dragging right does nothing (stops)
                const proposedRight = resizeState.startPosRight! - dx;
                newPosition.right = Math.max(0, proposedRight);
                // Width stays the same - no leftward growth
            } else {
                // Left-anchored element: east handle resizes (left edge fixed)
                const proposedWidth = resizeState.startWidth + dx;
                const startX = resizeState.startPosX ?? 0;
                const maxWidth = CANVAS_WIDTH - startX;
                newWidth = Math.max(50, Math.min(proposedWidth, maxWidth));
            }
        }
        if (handle.includes('w')) {
            if (usesRight) {
                // Right-anchored element: west handle resizes (right edge fixed)
                const proposedWidth = resizeState.startWidth - dx;
                const maxWidth = CANVAS_WIDTH - resizeState.startPosRight!;
                newWidth = Math.max(50, Math.min(proposedWidth, maxWidth));
            } else {
                // Left-anchored element: west handle resizes AND moves position
                const proposedWidth = resizeState.startWidth - dx;
                const proposedX = (resizeState.startPosX ?? 0) + dx;
                // Don't let it go past left edge
                if (proposedX >= 0) {
                    newWidth = Math.max(50, proposedWidth);
                    newPosition.x = proposedX;
                } else {
                    // Clamp to left edge
                    newPosition.x = 0;
                    newWidth = Math.max(50, resizeState.startWidth + (resizeState.startPosX ?? 0));
                }
            }
        }

        // Height changes
        if (handle.includes('s')) {
            if (usesBottom) {
                // Bottom-anchored element: south edge is the anchor point
                // Dragging the south handle moves the anchor, not the height
                // When bottom=0 (at boundary), dragging down does nothing (stops)
                const proposedBottom = resizeState.startPosBottom! - dy;
                newPosition.bottom = Math.max(0, proposedBottom);
                // Height stays the same - no upward growth
            } else {
                // Top-anchored element: south handle resizes (top edge fixed)
                const proposedHeight = resizeState.startHeight + dy;
                const startY = resizeState.startPosY ?? 0;
                const maxHeight = CANVAS_HEIGHT - startY;
                newHeight = Math.max(30, Math.min(proposedHeight, maxHeight));
            }
        }
        if (handle.includes('n')) {
            if (usesBottom) {
                // Bottom-anchored element: north handle resizes (bottom edge fixed)
                const proposedHeight = resizeState.startHeight - dy;
                const maxHeight = CANVAS_HEIGHT - resizeState.startPosBottom!;
                newHeight = Math.max(30, Math.min(proposedHeight, maxHeight));
            } else {
                // Top-anchored element: north handle resizes AND moves position
                const proposedHeight = resizeState.startHeight - dy;
                const proposedY = (resizeState.startPosY ?? 0) + dy;
                // Don't let it go past top edge
                if (proposedY >= 0) {
                    newHeight = Math.max(30, proposedHeight);
                    newPosition.y = proposedY;
                } else {
                    // Clamp to top edge
                    newPosition.y = 0;
                    newHeight = Math.max(30, resizeState.startHeight + (resizeState.startPosY ?? 0));
                }
            }
        }

        updateElementConfig(resizeState.elementId, {
            size: { width: Math.round(newWidth), height: Math.round(newHeight) },
            ...(Object.keys(newPosition).length > 0 ? { position: newPosition } : {}),
        });
    }, [resizeState, scale, layout.elements, updateElementConfig]);

    // Default sizes for each element type
    const defaultSizes: Record<string, { width: number | string; height: number | string }> = {
        chat: { width: 300, height: '100%' },
        live: { width: 150, height: 40 },
        attribution: { width: 400, height: 60 },
        featured: { width: 600, height: 100 },
        poll: { width: 300, height: 150 },
        superchat: { width: 300, height: 100 },
    };

    const getElementStyle = (elementId: string, config: ElementConfig): React.CSSProperties => {
        const style: React.CSSProperties = {
            position: 'absolute',
        };

        const defaults = defaultSizes[elementId] || { width: 200, height: 100 };

        // Position
        if (config.position.x !== null && config.position.x !== undefined) {
            style.left = config.position.x;
        }
        if (config.position.y !== null && config.position.y !== undefined) {
            style.top = config.position.y;
        }
        if (config.position.right !== null && config.position.right !== undefined) {
            style.right = config.position.right;
        }
        if (config.position.bottom !== null && config.position.bottom !== undefined) {
            style.bottom = config.position.bottom;
        }

        // Size (with defaults)
        style.width = config.size.width
            ? (typeof config.size.width === 'number' ? config.size.width : config.size.width)
            : defaults.width;
        style.height = config.size.height
            ? (typeof config.size.height === 'number' ? config.size.height : config.size.height)
            : defaults.height;

        return style;
    };

    // Get display name for element label
    const getDisplayName = (elementId: string, config: ElementConfig) => {
        if (config.displayName) return config.displayName;
        const baseId = elementId.replace(/-\d+$/, '');
        const names: Record<string, string> = {
            chat: 'Chat',
            live: 'Live',
            attribution: 'Attribution',
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

        let content: React.ReactNode;
        switch (baseElementType) {
            case 'chat':
                content = (
                    <div className="preview-chat" style={{ width: '100%', height: '100%' }}>
                        {mockData.chatMessages.map((msg) => (
                            <div key={msg.id} className="preview-chat-message">
                                <div className="preview-avatar" style={{ background: msg.color }} />
                                <span><strong style={{ color: msg.color }}>{msg.user}:</strong> {msg.message}</span>
                            </div>
                        ))}
                    </div>
                );
                break;
            case 'live': {
                const options = config.options || {};
                const showIcon = options.showIcon !== false;
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
            case 'attribution':
                content = (
                    <div className="preview-attribution">
                        Mad at the Internet
                    </div>
                );
                break;
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

    return (
        <div className="editor-canvas">
            <div className="canvas-toolbar">
                <label style={{ fontSize: '12px', marginRight: '8px' }}>Zoom:</label>
                <input
                    type="range"
                    min="0.25"
                    max="1"
                    step="0.05"
                    value={scale}
                    onChange={(e) => setScale(parseFloat(e.target.value))}
                    style={{ width: '100px' }}
                />
                <span style={{ fontSize: '12px', marginLeft: '8px' }}>
                    {Math.round(scale * 100)}%
                </span>
            </div>

            <div
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
