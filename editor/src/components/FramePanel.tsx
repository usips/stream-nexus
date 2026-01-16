import React, { useState } from 'react';
import { Layout, Frame, defaultFrames } from '../types/layout';

interface FramePanelProps {
    layout: Layout;
    onLayoutChange: (layout: Layout) => void;
    selectedFrame: string | null;
    onSelectFrame: (frameId: string | null) => void;
}

// Get default display name for an element
function getElementDisplayName(elementId: string, layout: Layout): string {
    const config = layout.elements[elementId];
    if (config?.displayName) return config.displayName;

    const baseId = elementId.replace(/-\d+$/, '');
    const names: Record<string, string> = {
        chat: 'Chat Panel',
        live: 'Live Badge',
        text: 'Text',
        attribution: 'Text',
        featured: 'Featured Message',
        poll: 'Poll Display',
        superchat: 'Superchat Display',
    };
    const suffix = elementId.match(/-(\d+)$/)?.[1];
    const baseName = names[baseId] || baseId.charAt(0).toUpperCase() + baseId.slice(1);
    return suffix ? `${baseName} ${suffix}` : baseName;
}

export function FramePanel({
    layout,
    onLayoutChange,
    selectedFrame,
    onSelectFrame,
}: FramePanelProps) {
    const [newFrameName, setNewFrameName] = useState('');
    const [editingFrame, setEditingFrame] = useState<string | null>(null);

    const frames = layout.frames || defaultFrames();
    const frameIds = Object.keys(frames);
    const elementIds = Object.keys(layout.elements);

    const addFrame = () => {
        if (!newFrameName.trim()) return;

        const frameId = newFrameName.toLowerCase().replace(/\s+/g, '-');
        if (frames[frameId]) {
            alert('Frame already exists');
            return;
        }

        const newLayout = {
            ...layout,
            frames: {
                ...frames,
                [frameId]: {
                    name: newFrameName.trim(),
                    elements: [], // Empty means all elements
                    background: undefined,
                },
            },
        };
        onLayoutChange(newLayout);
        setNewFrameName('');
        setEditingFrame(frameId);
    };

    const deleteFrame = (frameId: string) => {
        if (frameIds.length <= 1) {
            alert('Cannot delete the last frame');
            return;
        }

        const { [frameId]: deleted, ...remainingFrames } = frames;
        const newLayout = {
            ...layout,
            frames: remainingFrames,
        };
        onLayoutChange(newLayout);

        if (selectedFrame === frameId) {
            onSelectFrame(null);
        }
        if (editingFrame === frameId) {
            setEditingFrame(null);
        }
    };

    const updateFrame = (frameId: string, updates: Partial<Frame>) => {
        const newLayout = {
            ...layout,
            frames: {
                ...frames,
                [frameId]: {
                    ...frames[frameId],
                    ...updates,
                },
            },
        };
        onLayoutChange(newLayout);
    };

    const toggleElement = (frameId: string, elementId: string) => {
        const frame = frames[frameId];
        const currentElements = frame.elements || [];

        let newElements: string[];
        if (currentElements.length === 0) {
            // Currently showing all - now start with just this element unchecked
            newElements = elementIds.filter((id) => id !== elementId);
        } else if (currentElements.includes(elementId)) {
            // Remove element
            newElements = currentElements.filter((id) => id !== elementId);
        } else {
            // Add element
            newElements = [...currentElements, elementId];
        }

        // If all elements are selected, switch back to empty (show all)
        if (newElements.length === elementIds.length) {
            newElements = [];
        }

        updateFrame(frameId, { elements: newElements });
    };

    const isElementInFrame = (frameId: string, elementId: string): boolean => {
        const frame = frames[frameId];
        // Empty array means all elements are shown
        if (!frame.elements || frame.elements.length === 0) return true;
        return frame.elements.includes(elementId);
    };

    return (
        <div className="frame-panel">
            <div className="frame-panel-header">
                <h4>Frames</h4>
                <button
                    className="btn btn-sm"
                    onClick={() => onSelectFrame(null)}
                    style={{
                        opacity: selectedFrame === null ? 1 : 0.5,
                    }}
                    title="Show all elements (no frame filter)"
                >
                    All
                </button>
            </div>

            <div className="frame-list">
                {frameIds.map((frameId) => {
                    const frame = frames[frameId];
                    const isSelected = selectedFrame === frameId;
                    const isEditing = editingFrame === frameId;
                    const elementCount =
                        frame.elements && frame.elements.length > 0
                            ? `${frame.elements.length}/${elementIds.length}`
                            : 'All';

                    return (
                        <div
                            key={frameId}
                            className={`frame-item ${isSelected ? 'selected' : ''} ${isEditing ? 'editing' : ''}`}
                        >
                            <div
                                className="frame-item-header"
                                onClick={() => onSelectFrame(isSelected ? null : frameId)}
                            >
                                <span className="frame-name">{frame.name}</span>
                                <span className="frame-meta">
                                    {elementCount}
                                    {frame.background && ` · ${frame.background}`}
                                </span>
                                <div className="frame-actions">
                                    <button
                                        className="btn btn-xs"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setEditingFrame(isEditing ? null : frameId);
                                        }}
                                        title="Edit frame"
                                    >
                                        {isEditing ? '✕' : '✎'}
                                    </button>
                                    <button
                                        className="btn btn-xs btn-danger"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            deleteFrame(frameId);
                                        }}
                                        title="Delete frame"
                                        disabled={frameIds.length <= 1}
                                    >
                                        🗑
                                    </button>
                                </div>
                            </div>

                            {isEditing && (
                                <div className="frame-edit-panel">
                                    <div className="frame-edit-row">
                                        <label>Name</label>
                                        <input
                                            type="text"
                                            value={frame.name}
                                            onChange={(e) => updateFrame(frameId, { name: e.target.value })}
                                        />
                                    </div>
                                    <div className="frame-edit-row">
                                        <label>Background</label>
                                        <select
                                            value={frame.background || ''}
                                            onChange={(e) =>
                                                updateFrame(frameId, {
                                                    background: e.target.value || undefined,
                                                })
                                            }
                                        >
                                            <option value="">None</option>
                                            <option value="physics">Physics</option>
                                        </select>
                                    </div>
                                    <div className="frame-edit-row">
                                        <label>
                                            Elements
                                            <small style={{ marginLeft: '8px', color: '#888' }}>
                                                (unchecked = hidden in frame)
                                            </small>
                                        </label>
                                        <div className="frame-elements-list">
                                            {elementIds.map((elementId) => (
                                                <label key={elementId} className="frame-element-checkbox">
                                                    <input
                                                        type="checkbox"
                                                        checked={isElementInFrame(frameId, elementId)}
                                                        onChange={() => toggleElement(frameId, elementId)}
                                                    />
                                                    <span>{getElementDisplayName(elementId, layout)}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="frame-edit-url">
                                        <label>Frame URL</label>
                                        <code>/frame?view={frameId}</code>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="frame-add">
                <input
                    type="text"
                    placeholder="New frame name..."
                    value={newFrameName}
                    onChange={(e) => setNewFrameName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addFrame()}
                />
                <button className="btn btn-sm btn-primary" onClick={addFrame}>
                    + Add
                </button>
            </div>
        </div>
    );
}
