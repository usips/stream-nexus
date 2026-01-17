import React, { useCallback, useState, useRef } from 'react';
import { Layout, ElementConfig } from '../types/layout';

interface LayerPanelProps {
    layout: Layout;
    onLayoutChange: (layout: Layout) => void;
    selectedElement: string;
    onSelectElement: (elementId: string) => void;
}

// Get display name for an element
function getDisplayName(elementId: string, config: ElementConfig): string {
    if (config.displayName) return config.displayName;
    const baseId = elementId.replace(/-\d+$/, '');
    const names: Record<string, string> = {
        chat: 'Chat',
        live: 'Live Badge',
        text: 'Text',
        attribution: 'Text',
        featured: 'Featured',
        poll: 'Poll',
        superchat: 'Superchat',
        matter: 'Donation Matter',
    };
    return names[baseId] || elementId;
}

// Get icon for an element type
function getElementIcon(elementId: string): string {
    const baseId = elementId.replace(/-\d+$/, '');
    const icons: Record<string, string> = {
        chat: '💬',
        live: '🔴',
        text: '📝',
        attribution: '📝',
        featured: '⭐',
        poll: '📊',
        superchat: '💰',
        matter: '💥',
    };
    return icons[baseId] || '📦';
}

export function LayerPanel({
    layout,
    onLayoutChange,
    selectedElement,
    onSelectElement,
}: LayerPanelProps) {
    const [draggedItem, setDraggedItem] = useState<string | null>(null);
    const [dragOverItem, setDragOverItem] = useState<string | null>(null);
    const dragNode = useRef<HTMLDivElement | null>(null);

    // Get elements sorted by z-index (highest first = front)
    const sortedElements = Object.entries(layout.elements)
        .map(([id, config]) => ({
            id,
            config,
            zIndex: config.position.zIndex ?? 0,
        }))
        .sort((a, b) => b.zIndex - a.zIndex);

    // Handle drag start
    const handleDragStart = useCallback((e: React.DragEvent, elementId: string) => {
        setDraggedItem(elementId);
        dragNode.current = e.target as HTMLDivElement;

        // Set drag image
        if (dragNode.current) {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', elementId);
        }

        // Add dragging class after a brief delay
        setTimeout(() => {
            if (dragNode.current) {
                dragNode.current.classList.add('dragging');
            }
        }, 0);
    }, []);

    // Handle drag over
    const handleDragOver = useCallback((e: React.DragEvent, elementId: string) => {
        e.preventDefault();
        if (draggedItem && draggedItem !== elementId) {
            setDragOverItem(elementId);
        }
    }, [draggedItem]);

    // Handle drag leave
    const handleDragLeave = useCallback(() => {
        setDragOverItem(null);
    }, []);

    // Handle drop - reorder elements by updating z-index values
    const handleDrop = useCallback((e: React.DragEvent, targetId: string) => {
        e.preventDefault();

        if (!draggedItem || draggedItem === targetId) {
            setDraggedItem(null);
            setDragOverItem(null);
            return;
        }

        // Find the current positions in the sorted list
        const draggedIndex = sortedElements.findIndex(el => el.id === draggedItem);
        const targetIndex = sortedElements.findIndex(el => el.id === targetId);

        if (draggedIndex === -1 || targetIndex === -1) {
            setDraggedItem(null);
            setDragOverItem(null);
            return;
        }

        // Create new order: remove dragged item and insert at target position
        const newOrder = [...sortedElements];
        const [removed] = newOrder.splice(draggedIndex, 1);
        newOrder.splice(targetIndex, 0, removed);

        // Assign new z-index values (highest index = highest z-index)
        const updatedElements: Record<string, ElementConfig> = {};
        newOrder.forEach((item, index) => {
            const newZIndex = (newOrder.length - 1 - index) * 10; // Reverse order, multiply by 10 for spacing
            updatedElements[item.id] = {
                ...item.config,
                position: {
                    ...item.config.position,
                    zIndex: newZIndex,
                },
            };
        });

        onLayoutChange({
            ...layout,
            elements: updatedElements,
        });

        setDraggedItem(null);
        setDragOverItem(null);
    }, [draggedItem, sortedElements, layout, onLayoutChange]);

    // Handle drag end
    const handleDragEnd = useCallback(() => {
        if (dragNode.current) {
            dragNode.current.classList.remove('dragging');
        }
        setDraggedItem(null);
        setDragOverItem(null);
        dragNode.current = null;
    }, []);

    // Move element up (increase z-index)
    const moveUp = useCallback((elementId: string) => {
        const index = sortedElements.findIndex(el => el.id === elementId);
        if (index <= 0) return; // Already at top

        const newOrder = [...sortedElements];
        [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];

        const updatedElements: Record<string, ElementConfig> = {};
        newOrder.forEach((item, idx) => {
            const newZIndex = (newOrder.length - 1 - idx) * 10;
            updatedElements[item.id] = {
                ...item.config,
                position: {
                    ...item.config.position,
                    zIndex: newZIndex,
                },
            };
        });

        onLayoutChange({
            ...layout,
            elements: updatedElements,
        });
    }, [sortedElements, layout, onLayoutChange]);

    // Move element down (decrease z-index)
    const moveDown = useCallback((elementId: string) => {
        const index = sortedElements.findIndex(el => el.id === elementId);
        if (index === -1 || index >= sortedElements.length - 1) return; // Already at bottom

        const newOrder = [...sortedElements];
        [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];

        const updatedElements: Record<string, ElementConfig> = {};
        newOrder.forEach((item, idx) => {
            const newZIndex = (newOrder.length - 1 - idx) * 10;
            updatedElements[item.id] = {
                ...item.config,
                position: {
                    ...item.config.position,
                    zIndex: newZIndex,
                },
            };
        });

        onLayoutChange({
            ...layout,
            elements: updatedElements,
        });
    }, [sortedElements, layout, onLayoutChange]);

    // Toggle element visibility
    const toggleEnabled = useCallback((elementId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const config = layout.elements[elementId];
        if (!config) return;

        onLayoutChange({
            ...layout,
            elements: {
                ...layout.elements,
                [elementId]: {
                    ...config,
                    enabled: !config.enabled,
                },
            },
        });
    }, [layout, onLayoutChange]);

    return (
        <div className="layer-panel">
            <div className="layer-panel-header">
                <h3>Layers</h3>
                <span className="layer-count">{sortedElements.length}</span>
            </div>
            <div className="layer-list">
                {sortedElements.map(({ id, config, zIndex }, index) => (
                    <div
                        key={id}
                        className={`layer-item ${selectedElement === id ? 'selected' : ''} ${!config.enabled ? 'disabled' : ''} ${dragOverItem === id ? 'drag-over' : ''} ${draggedItem === id ? 'dragging' : ''}`}
                        draggable
                        onClick={() => onSelectElement(id)}
                        onDragStart={(e) => handleDragStart(e, id)}
                        onDragOver={(e) => handleDragOver(e, id)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, id)}
                        onDragEnd={handleDragEnd}
                    >
                        <span className="layer-drag-handle">⋮⋮</span>
                        <span className="layer-icon">{getElementIcon(id)}</span>
                        <span className="layer-name">{getDisplayName(id, config)}</span>
                        <div className="layer-actions">
                            <button
                                className="layer-btn"
                                onClick={(e) => { e.stopPropagation(); moveUp(id); }}
                                disabled={index === 0}
                                title="Move forward"
                            >
                                ▲
                            </button>
                            <button
                                className="layer-btn"
                                onClick={(e) => { e.stopPropagation(); moveDown(id); }}
                                disabled={index === sortedElements.length - 1}
                                title="Move backward"
                            >
                                ▼
                            </button>
                            <button
                                className={`layer-btn layer-visibility ${config.enabled ? 'visible' : 'hidden'}`}
                                onClick={(e) => toggleEnabled(id, e)}
                                title={config.enabled ? 'Hide' : 'Show'}
                            >
                                {config.enabled ? '👁' : '👁‍🗨'}
                            </button>
                        </div>
                    </div>
                ))}
            </div>
            <div className="layer-panel-footer">
                <small>Drag to reorder • Click to select</small>
            </div>
        </div>
    );
}
