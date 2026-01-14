import React, { useState, useCallback, useRef } from 'react';
import { Layout, ElementConfig } from '../types/layout';

interface EditorCanvasProps {
    layout: Layout;
    onLayoutChange: (layout: Layout) => void;
}

interface DragState {
    elementId: string;
    startX: number;
    startY: number;
    startPosX: number;
    startPosY: number;
}

const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;

export function EditorCanvas({ layout, onLayoutChange }: EditorCanvasProps) {
    const [selectedElement, setSelectedElement] = useState<string | null>(null);
    const [scale, setScale] = useState(0.5);
    const [dragState, setDragState] = useState<DragState | null>(null);
    const canvasRef = useRef<HTMLDivElement>(null);

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
        setSelectedElement(elementId);

        const element = layout.elements[elementId];
        if (!element) return;

        setDragState({
            elementId,
            startX: e.clientX,
            startY: e.clientY,
            startPosX: element.position.x ?? element.position.right ?? 0,
            startPosY: element.position.y ?? element.position.bottom ?? 0,
        });
    }, [layout.elements]);

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
    }, []);

    const getElementStyle = (elementId: string, config: ElementConfig): React.CSSProperties => {
        const style: React.CSSProperties = {
            position: 'absolute',
        };

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

        // Size
        if (config.size.width) {
            style.width = typeof config.size.width === 'number'
                ? config.size.width
                : config.size.width;
        }
        if (config.size.height) {
            style.height = typeof config.size.height === 'number'
                ? config.size.height
                : config.size.height;
        }

        return style;
    };

    const renderElement = (elementId: string, config: ElementConfig) => {
        if (!config.enabled) {
            return null;
        }

        const isSelected = selectedElement === elementId;
        const style = getElementStyle(elementId, config);

        let content: React.ReactNode;
        switch (elementId) {
            case 'chat':
                content = (
                    <div className="preview-chat" style={{ width: '100%', height: '100%' }}>
                        <div className="preview-chat-message">
                            <div className="preview-avatar" />
                            <span>User123: Hello world!</span>
                        </div>
                        <div className="preview-chat-message">
                            <div className="preview-avatar" style={{ background: '#44aa44' }} />
                            <span>Viewer: Great stream!</span>
                        </div>
                    </div>
                );
                break;
            case 'live':
                content = (
                    <div className="preview-live">
                        <span className="preview-live-badge live">LIVE</span>
                        <span className="preview-live-badge">1,234</span>
                    </div>
                );
                break;
            case 'attribution':
                content = (
                    <div className="preview-attribution">
                        Mad at the Internet
                    </div>
                );
                break;
            case 'featured':
                content = (
                    <div className="preview-featured">
                        Featured message appears here...
                    </div>
                );
                break;
            case 'poll':
                content = (
                    <div className="preview-poll">
                        <strong>Poll Question?</strong>
                        <div>Option 1 - 50%</div>
                        <div>Option 2 - 50%</div>
                    </div>
                );
                break;
            case 'superchat':
                content = (
                    <div className="preview-superchat">
                        <strong>$10 Superchat</strong>
                        <div>Thank you message!</div>
                    </div>
                );
                break;
            default:
                content = <div>Unknown element</div>;
        }

        return (
            <div
                key={elementId}
                className={`element-wrapper ${isSelected ? 'selected' : ''}`}
                style={style}
                onMouseDown={(e) => handleMouseDown(e, elementId)}
            >
                <span className="element-label">{elementId}</span>
                {content}
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
                onMouseMove={handleMouseMove}
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
                    onClick={() => setSelectedElement(null)}
                >
                    {Object.entries(layout.elements).map(([id, config]) =>
                        renderElement(id, config)
                    )}
                </div>
            </div>
        </div>
    );
}
