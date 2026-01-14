import React, { useState } from 'react';
import { Layout, ElementConfig } from '../types/layout';

interface SettingsPanelProps {
    layout: Layout;
    onLayoutChange: (layout: Layout) => void;
}

export function SettingsPanel({ layout, onLayoutChange }: SettingsPanelProps) {
    const [selectedElement, setSelectedElement] = useState<string>('chat');

    const updateElementConfig = (updates: Partial<ElementConfig>) => {
        const newLayout = {
            ...layout,
            elements: {
                ...layout.elements,
                [selectedElement]: {
                    ...layout.elements[selectedElement],
                    ...updates,
                    position: {
                        ...layout.elements[selectedElement]?.position,
                        ...updates.position,
                    },
                    size: {
                        ...layout.elements[selectedElement]?.size,
                        ...updates.size,
                    },
                    style: {
                        ...layout.elements[selectedElement]?.style,
                        ...updates.style,
                    },
                },
            },
        };
        onLayoutChange(newLayout);
    };

    const updateMessageStyle = (key: keyof typeof layout.messageStyle, value: string) => {
        const newLayout = {
            ...layout,
            messageStyle: {
                ...layout.messageStyle,
                [key]: value,
            },
        };
        onLayoutChange(newLayout);
    };

    const currentConfig = layout.elements[selectedElement] || {
        enabled: true,
        position: {},
        size: {},
        style: {},
    };

    return (
        <div className="settings-panel">
            <div className="settings-header">
                <h3>Element Settings</h3>
            </div>

            <div className="settings-section">
                <div className="settings-row">
                    <label>Select Element</label>
                    <select
                        value={selectedElement}
                        onChange={(e) => setSelectedElement(e.target.value)}
                    >
                        {Object.keys(layout.elements).map((id) => (
                            <option key={id} value={id}>
                                {id.charAt(0).toUpperCase() + id.slice(1)}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="settings-checkbox">
                    <input
                        type="checkbox"
                        id="element-enabled"
                        checked={currentConfig.enabled}
                        onChange={(e) => updateElementConfig({ enabled: e.target.checked })}
                    />
                    <label htmlFor="element-enabled">Enabled</label>
                </div>
            </div>

            <div className="settings-section">
                <h4>Position</h4>
                <div className="settings-row-inline">
                    <div className="settings-row">
                        <label>X (Left)</label>
                        <input
                            type="number"
                            value={currentConfig.position.x ?? ''}
                            placeholder="auto"
                            onChange={(e) => updateElementConfig({
                                position: {
                                    x: e.target.value ? parseFloat(e.target.value) : null,
                                    right: null,
                                }
                            })}
                        />
                    </div>
                    <div className="settings-row">
                        <label>Y (Top)</label>
                        <input
                            type="number"
                            value={currentConfig.position.y ?? ''}
                            placeholder="auto"
                            onChange={(e) => updateElementConfig({
                                position: {
                                    y: e.target.value ? parseFloat(e.target.value) : null,
                                    bottom: null,
                                }
                            })}
                        />
                    </div>
                </div>
                <div className="settings-row-inline">
                    <div className="settings-row">
                        <label>Right</label>
                        <input
                            type="number"
                            value={currentConfig.position.right ?? ''}
                            placeholder="auto"
                            onChange={(e) => updateElementConfig({
                                position: {
                                    right: e.target.value ? parseFloat(e.target.value) : null,
                                    x: null,
                                }
                            })}
                        />
                    </div>
                    <div className="settings-row">
                        <label>Bottom</label>
                        <input
                            type="number"
                            value={currentConfig.position.bottom ?? ''}
                            placeholder="auto"
                            onChange={(e) => updateElementConfig({
                                position: {
                                    bottom: e.target.value ? parseFloat(e.target.value) : null,
                                    y: null,
                                }
                            })}
                        />
                    </div>
                </div>
            </div>

            <div className="settings-section">
                <h4>Size</h4>
                <div className="settings-row-inline">
                    <div className="settings-row">
                        <label>Width</label>
                        <input
                            type="text"
                            value={currentConfig.size.width ?? ''}
                            placeholder="auto"
                            onChange={(e) => {
                                const val = e.target.value;
                                const numVal = parseFloat(val);
                                updateElementConfig({
                                    size: {
                                        width: isNaN(numVal) ? val : numVal,
                                    }
                                });
                            }}
                        />
                    </div>
                    <div className="settings-row">
                        <label>Height</label>
                        <input
                            type="text"
                            value={currentConfig.size.height ?? ''}
                            placeholder="auto"
                            onChange={(e) => {
                                const val = e.target.value;
                                const numVal = parseFloat(val);
                                updateElementConfig({
                                    size: {
                                        height: isNaN(numVal) ? val : numVal,
                                    }
                                });
                            }}
                        />
                    </div>
                </div>
            </div>

            <div className="settings-section">
                <h4>Style</h4>
                <div className="settings-row">
                    <label>Background Color</label>
                    <input
                        type="text"
                        value={currentConfig.style.backgroundColor ?? ''}
                        placeholder="transparent"
                        onChange={(e) => updateElementConfig({
                            style: { backgroundColor: e.target.value || undefined }
                        })}
                    />
                </div>
                <div className="settings-row">
                    <label>Font Size</label>
                    <input
                        type="text"
                        value={currentConfig.style.fontSize ?? ''}
                        placeholder="inherit"
                        onChange={(e) => updateElementConfig({
                            style: { fontSize: e.target.value || undefined }
                        })}
                    />
                </div>
                <div className="settings-row">
                    <label>Opacity</label>
                    <input
                        type="number"
                        min="0"
                        max="1"
                        step="0.1"
                        value={currentConfig.style.opacity ?? ''}
                        placeholder="1"
                        onChange={(e) => updateElementConfig({
                            style: { opacity: e.target.value ? parseFloat(e.target.value) : undefined }
                        })}
                    />
                </div>
            </div>

            <div className="settings-section">
                <h4>Message Style (Global)</h4>
                <div className="settings-row">
                    <label>Avatar Size</label>
                    <input
                        type="text"
                        value={layout.messageStyle.avatarSize}
                        onChange={(e) => updateMessageStyle('avatarSize', e.target.value)}
                    />
                </div>
                <div className="settings-row">
                    <label>Font Size</label>
                    <input
                        type="text"
                        value={layout.messageStyle.fontSize}
                        onChange={(e) => updateMessageStyle('fontSize', e.target.value)}
                    />
                </div>
                <div className="settings-row">
                    <label>Max Height</label>
                    <input
                        type="text"
                        value={layout.messageStyle.maxHeight}
                        onChange={(e) => updateMessageStyle('maxHeight', e.target.value)}
                    />
                </div>
                <div className="settings-row">
                    <label>Border Radius</label>
                    <input
                        type="text"
                        value={layout.messageStyle.borderRadius}
                        onChange={(e) => updateMessageStyle('borderRadius', e.target.value)}
                    />
                </div>
            </div>
        </div>
    );
}
