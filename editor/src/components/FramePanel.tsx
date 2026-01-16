import React, { useState } from 'react';
import { Layout, Frame, defaultFrames, DonationMatterOptions, defaultDonationMatterOptions } from '../types/layout';

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

// Collapsible section component for DonationMatter settings
interface CollapsibleSectionProps {
    title: string;
    defaultOpen?: boolean;
    children: React.ReactNode;
}

function CollapsibleSection({ title, defaultOpen = false, children }: CollapsibleSectionProps) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div className={`dm-collapsible ${isOpen ? 'open' : 'closed'}`}>
            <div className="dm-section-header" onClick={() => setIsOpen(!isOpen)}>
                <span className="dm-collapse-icon">{isOpen ? '▼' : '▶'}</span>
                <span>{title}</span>
            </div>
            {isOpen && <div className="dm-section-content">{children}</div>}
        </div>
    );
}

// DonationMatter configuration panel
interface DonationMatterSettingsProps {
    config: DonationMatterOptions;
    onChange: (config: DonationMatterOptions) => void;
}

function DonationMatterSettings({ config, onChange }: DonationMatterSettingsProps) {
    const updateConfig = (updates: Partial<DonationMatterOptions>) => {
        onChange({ ...config, ...updates });
    };

    return (
        <div className="dm-settings">
            <CollapsibleSection title="💥 Donation Matter" defaultOpen={true}>
                <div className="dm-row">
                    <label>Object Type</label>
                    <select
                        value={config.objectType || 'ammo'}
                        onChange={(e) => updateConfig({ objectType: e.target.value as 'ammo' | 'coin' | 'custom' })}
                    >
                        <option value="ammo">Ammo Rounds</option>
                        <option value="coin">Coins</option>
                        <option value="custom">Custom</option>
                    </select>
                </div>

                <div className="dm-row">
                    <label>Object Scale</label>
                    <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        max="1"
                        value={config.objectScale ?? 0.1}
                        onChange={(e) => updateConfig({ objectScale: parseFloat(e.target.value) })}
                    />
                </div>

                <div className="dm-row">
                    <label>Spawn Rate</label>
                    <input
                        type="number"
                        step="0.5"
                        min="0.5"
                        max="20"
                        value={config.spawnRate ?? 2}
                        onChange={(e) => updateConfig({ spawnRate: parseFloat(e.target.value) })}
                    />
                    <small>objects per dollar</small>
                </div>

                <div className="dm-row">
                    <label>Spawn Delay</label>
                    <input
                        type="number"
                        step="10"
                        min="10"
                        max="500"
                        value={config.spawnDelay ?? 50}
                        onChange={(e) => updateConfig({ spawnDelay: parseInt(e.target.value) })}
                    />
                    <small>ms between spawns</small>
                </div>

                <div className="dm-row">
                    <label>Max Objects</label>
                    <input
                        type="number"
                        step="50"
                        min="10"
                        max="2000"
                        value={config.maxObjects ?? 500}
                        onChange={(e) => updateConfig({ maxObjects: parseInt(e.target.value) })}
                    />
                </div>
            </CollapsibleSection>

            <CollapsibleSection title="⚡ Physics" defaultOpen={false}>
                <div className="dm-row">
                    <label>Bounciness</label>
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={config.restitution ?? 0.1}
                        onChange={(e) => updateConfig({ restitution: parseFloat(e.target.value) })}
                    />
                    <span className="dm-range-value">{(config.restitution ?? 0.1).toFixed(2)}</span>
                </div>

                <div className="dm-row">
                    <label>Friction</label>
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={config.friction ?? 0.8}
                        onChange={(e) => updateConfig({ friction: parseFloat(e.target.value) })}
                    />
                    <span className="dm-range-value">{(config.friction ?? 0.8).toFixed(2)}</span>
                </div>

                <div className="dm-row">
                    <label>Air Resistance</label>
                    <input
                        type="range"
                        min="0"
                        max="0.1"
                        step="0.005"
                        value={config.frictionAir ?? 0.02}
                        onChange={(e) => updateConfig({ frictionAir: parseFloat(e.target.value) })}
                    />
                    <span className="dm-range-value">{(config.frictionAir ?? 0.02).toFixed(3)}</span>
                </div>

                <div className="dm-row">
                    <label>Density</label>
                    <input
                        type="range"
                        min="0.001"
                        max="0.05"
                        step="0.001"
                        value={config.density ?? 0.008}
                        onChange={(e) => updateConfig({ density: parseFloat(e.target.value) })}
                    />
                    <span className="dm-range-value">{(config.density ?? 0.008).toFixed(3)}</span>
                </div>
            </CollapsibleSection>

            <CollapsibleSection title="🏷️ Labels" defaultOpen={false}>
                <div className="dm-row dm-checkbox">
                    <input
                        type="checkbox"
                        id="dm-show-labels"
                        checked={config.showLabels !== false}
                        onChange={(e) => updateConfig({ showLabels: e.target.checked })}
                    />
                    <label htmlFor="dm-show-labels">Show Username Labels</label>
                </div>

                <div className="dm-row">
                    <label>Label Color</label>
                    <input
                        type="color"
                        value={config.labelColor || '#ffff00'}
                        onChange={(e) => updateConfig({ labelColor: e.target.value })}
                    />
                </div>

                <div className="dm-row">
                    <label>Label Font</label>
                    <input
                        type="text"
                        value={config.labelFont || 'Verlag'}
                        onChange={(e) => updateConfig({ labelFont: e.target.value })}
                    />
                </div>

                <div className="dm-row">
                    <label>Label Size</label>
                    <input
                        type="number"
                        min="8"
                        max="48"
                        value={config.labelSize ?? 12}
                        onChange={(e) => updateConfig({ labelSize: parseInt(e.target.value) })}
                    />
                    <small>px</small>
                </div>
            </CollapsibleSection>

            <CollapsibleSection title="🔧 Debug" defaultOpen={false}>
                <div className="dm-row dm-checkbox">
                    <input
                        type="checkbox"
                        id="dm-wireframes"
                        checked={config.wireframes === true}
                        onChange={(e) => updateConfig({ wireframes: e.target.checked })}
                    />
                    <label htmlFor="dm-wireframes">Wireframe Mode</label>
                </div>

                <div className="dm-row dm-checkbox">
                    <input
                        type="checkbox"
                        id="dm-angle-indicator"
                        checked={config.showAngleIndicator === true}
                        onChange={(e) => updateConfig({ showAngleIndicator: e.target.checked })}
                    />
                    <label htmlFor="dm-angle-indicator">Show Angle Indicators</label>
                </div>
            </CollapsibleSection>
        </div>
    );
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
                                            onChange={(e) => {
                                                const newBackground = e.target.value || undefined;
                                                const updates: Partial<Frame> = { background: newBackground };
                                                // Add default donation matter config when enabling physics
                                                if (newBackground === 'physics' && !frame.donationMatter) {
                                                    updates.donationMatter = defaultDonationMatterOptions();
                                                }
                                                updateFrame(frameId, updates);
                                            }}
                                        >
                                            <option value="">None</option>
                                            <option value="physics">Physics (Donation Matter)</option>
                                        </select>
                                    </div>

                                    {frame.background === 'physics' && (
                                        <DonationMatterSettings
                                            config={frame.donationMatter || defaultDonationMatterOptions()}
                                            onChange={(newConfig) => updateFrame(frameId, { donationMatter: newConfig })}
                                        />
                                    )}

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
