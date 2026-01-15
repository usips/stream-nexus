import React, { useState, useCallback, useEffect } from 'react';
import { Layout, ElementConfig } from '../types/layout';
import { getAvailableTokens } from '../utils/tokens';

interface SettingsPanelProps {
    layout: Layout;
    onLayoutChange: (layout: Layout) => void;
    selectedElement: string;
    onSelectElement: (elementId: string) => void;
    onDeleteElement: () => void;
    canDelete: boolean;
}

// Collapsible section component
interface CollapsibleSectionProps {
    title: string;
    defaultOpen?: boolean;
    children: React.ReactNode;
}

function CollapsibleSection({ title, defaultOpen = true, children }: CollapsibleSectionProps) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div className={`collapsible-section ${isOpen ? 'open' : 'closed'}`}>
            <div
                className="section-header"
                onClick={() => setIsOpen(!isOpen)}
            >
                <span className="collapse-icon">{isOpen ? '▼' : '▶'}</span>
                <span>{title}</span>
            </div>
            {isOpen && <div className="section-content">{children}</div>}
        </div>
    );
}

// Get default display name for an element
function getDefaultDisplayName(elementId: string): string {
    const baseId = elementId.replace(/-\d+$/, '');
    const names: Record<string, string> = {
        chat: 'Chat Panel',
        live: 'Live Badge',
        text: 'Text',
        attribution: 'Text', // Backward compatibility
        featured: 'Featured Message',
        poll: 'Poll Display',
        superchat: 'Superchat Display',
    };
    const suffix = elementId.match(/-(\d+)$/)?.[1];
    const baseName = names[baseId] || baseId.charAt(0).toUpperCase() + baseId.slice(1);
    return suffix ? `${baseName} ${suffix}` : baseName;
}

export function SettingsPanel({
    layout,
    onLayoutChange,
    selectedElement,
    onSelectElement,
    onDeleteElement,
    canDelete,
}: SettingsPanelProps) {
    const [panelWidth, setPanelWidth] = useState(320);
    const [isResizing, setIsResizing] = useState(false);

    // Handle panel resize
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizing(true);
    }, []);

    useEffect(() => {
        if (!isResizing) return;

        const handleMouseMove = (e: MouseEvent) => {
            const newWidth = window.innerWidth - e.clientX;
            setPanelWidth(Math.max(250, Math.min(600, newWidth)));
        };

        const handleMouseUp = () => {
            setIsResizing(false);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing]);

    const updateElementConfig = (updates: Partial<ElementConfig>) => {
        const currentElement = layout.elements[selectedElement];
        const newLayout = {
            ...layout,
            elements: {
                ...layout.elements,
                [selectedElement]: {
                    ...currentElement,
                    ...updates,
                    position: {
                        ...currentElement?.position,
                        ...updates.position,
                    },
                    size: {
                        ...currentElement?.size,
                        ...updates.size,
                    },
                    style: {
                        ...currentElement?.style,
                        ...updates.style,
                    },
                    options: updates.options !== undefined
                        ? { ...currentElement?.options, ...updates.options }
                        : currentElement?.options,
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
        <div
            className={`settings-panel ${isResizing ? 'resizing' : ''}`}
            style={{ width: panelWidth }}
        >
            {/* Resize handle */}
            <div
                className="resize-handle"
                onMouseDown={handleMouseDown}
            />

            <div className="settings-content">
                <div className="settings-header">
                    <h3>Element Settings</h3>
                    <button
                        className="btn btn-danger btn-sm"
                        onClick={onDeleteElement}
                        disabled={!canDelete}
                        title={canDelete ? 'Delete this element (Del)' : 'Cannot delete the last element'}
                    >
                        🗑 Delete
                    </button>
                </div>

                {/* Element Selection */}
                <div className="settings-section element-selector">
                    <div className="settings-row">
                        <label>Select Element</label>
                        <select
                            value={selectedElement}
                            onChange={(e) => onSelectElement(e.target.value)}
                        >
                            {Object.keys(layout.elements).map((id) => {
                                const config = layout.elements[id];
                                const displayName = config.displayName || getDefaultDisplayName(id);
                                return (
                                    <option key={id} value={id}>
                                        {displayName}
                                    </option>
                                );
                            })}
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

                    <div className="settings-row">
                        <label>Display Name</label>
                        <input
                            type="text"
                            value={currentConfig.displayName || ''}
                            placeholder={getDefaultDisplayName(selectedElement)}
                            onChange={(e) => updateElementConfig({
                                displayName: e.target.value || undefined
                            } as Partial<ElementConfig>)}
                        />
                    </div>
                </div>

                {/* Element-specific Options Section - at top for quick access */}
                <ElementOptionsSection
                    elementId={selectedElement}
                    config={currentConfig}
                    onUpdate={updateElementConfig}
                />

                {/* Position Section */}
                <CollapsibleSection title="Position" defaultOpen={false}>
                    <div className="settings-row-inline">
                        <div className="settings-row">
                            <label>X (Left)</label>
                            <input
                                type="text"
                                value={currentConfig.position.x ?? ''}
                                placeholder="auto"
                                onChange={(e) => updateElementConfig({
                                    position: {
                                        x: e.target.value || null,
                                        right: null,
                                    }
                                })}
                            />
                        </div>
                        <div className="settings-row">
                            <label>Y (Top)</label>
                            <input
                                type="text"
                                value={currentConfig.position.y ?? ''}
                                placeholder="auto"
                                onChange={(e) => updateElementConfig({
                                    position: {
                                        y: e.target.value || null,
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
                                type="text"
                                value={currentConfig.position.right ?? ''}
                                placeholder="auto"
                                onChange={(e) => updateElementConfig({
                                    position: {
                                        right: e.target.value || null,
                                        x: null,
                                    }
                                })}
                            />
                        </div>
                        <div className="settings-row">
                            <label>Bottom</label>
                            <input
                                type="text"
                                value={currentConfig.position.bottom ?? ''}
                                placeholder="auto"
                                onChange={(e) => updateElementConfig({
                                    position: {
                                        bottom: e.target.value || null,
                                        y: null,
                                    }
                                })}
                            />
                        </div>
                    </div>
                </CollapsibleSection>

                {/* Size Section */}
                <CollapsibleSection title="Size" defaultOpen={true}>
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
                                            width: val === '' ? undefined : (isNaN(numVal) ? val : numVal),
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
                                            height: val === '' ? undefined : (isNaN(numVal) ? val : numVal),
                                        }
                                    });
                                }}
                            />
                        </div>
                    </div>
                </CollapsibleSection>

                {/* Style Section */}
                <CollapsibleSection title="Style" defaultOpen={false}>
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
                        <label>Font Family</label>
                        <input
                            type="text"
                            value={currentConfig.style.fontFamily ?? ''}
                            placeholder="inherit"
                            onChange={(e) => updateElementConfig({
                                style: { fontFamily: e.target.value || undefined }
                            })}
                        />
                    </div>
                    <div className="settings-row">
                        <label>Font Weight</label>
                        <input
                            type="text"
                            value={currentConfig.style.fontWeight ?? ''}
                            placeholder="normal"
                            onChange={(e) => updateElementConfig({
                                style: { fontWeight: e.target.value || undefined }
                            })}
                        />
                    </div>
                    <div className="settings-row">
                        <label>Text Color</label>
                        <input
                            type="text"
                            value={currentConfig.style.color ?? ''}
                            placeholder="inherit"
                            onChange={(e) => updateElementConfig({
                                style: { color: e.target.value || undefined }
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
                    <div className="settings-row">
                        <label>Padding</label>
                        <input
                            type="text"
                            value={currentConfig.style.padding ?? ''}
                            placeholder="0"
                            onChange={(e) => updateElementConfig({
                                style: { padding: e.target.value || undefined }
                            })}
                        />
                    </div>
                    <div className="settings-row">
                        <label>Border Radius</label>
                        <input
                            type="text"
                            value={currentConfig.style.borderRadius ?? ''}
                            placeholder="0"
                            onChange={(e) => updateElementConfig({
                                style: { borderRadius: e.target.value || undefined }
                            })}
                        />
                    </div>
                </CollapsibleSection>

                {/* Message Style (Global) */}
                <CollapsibleSection title="Message Style (Global)" defaultOpen={false}>
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
                </CollapsibleSection>
            </div>
        </div>
    );
}

// Element-specific options section
interface ElementOptionsSectionProps {
    elementId: string;
    config: ElementConfig;
    onUpdate: (updates: Partial<ElementConfig>) => void;
}

const PLATFORMS = ['YouTube', 'Kick', 'Rumble', 'Twitch', 'Odysee', 'X', 'VK', 'XMRChat'];

function ElementOptionsSection({ elementId, config, onUpdate }: ElementOptionsSectionProps) {
    const elementType = elementId.replace(/-\d+$/, '');
    const options = (config.options || {}) as Record<string, unknown>;

    const updateOptions = (newOptions: Record<string, unknown>) => {
        onUpdate({ options: { ...options, ...newOptions } } as Partial<ElementConfig>);
    };

    // Live Badge options
    if (elementType === 'live') {
        const platformMode = (options.platformMode as string) || 'all';
        const platforms = (options.platforms as string[]) || [];
        const showIcon = options.showIcon === true;
        const showLabel = options.showLabel !== false;
        const showCount = options.showCount !== false;

        return (
            <CollapsibleSection title="Live Badge Options" defaultOpen={true}>
                <div className="settings-row">
                    <label>Platform Filter</label>
                    <select
                        value={platformMode}
                        onChange={(e) => updateOptions({ platformMode: e.target.value })}
                    >
                        <option value="all">All Platforms</option>
                        <option value="exclude">Exclude Platforms</option>
                        <option value="include">Include Only</option>
                    </select>
                </div>

                {platformMode !== 'all' && (
                    <div className="settings-row platform-list">
                        <label>Platforms</label>
                        <div className="platform-checkboxes">
                            {PLATFORMS.map((p) => (
                                <label key={p} className="platform-checkbox">
                                    <input
                                        type="checkbox"
                                        checked={platforms.includes(p)}
                                        onChange={(e) => {
                                            const newPlatforms = e.target.checked
                                                ? [...platforms, p]
                                                : platforms.filter((x) => x !== p);
                                            updateOptions({ platforms: newPlatforms });
                                        }}
                                    />
                                    <span>{p}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                )}

                <div className="settings-row">
                    <label>Display Options</label>
                    <div className="settings-checkbox-group">
                        <label className="settings-checkbox-inline">
                            <input
                                type="checkbox"
                                checked={showIcon}
                                onChange={(e) => updateOptions({ showIcon: e.target.checked })}
                            />
                            <span>Show Icon</span>
                        </label>
                        <label className="settings-checkbox-inline">
                            <input
                                type="checkbox"
                                checked={showLabel}
                                onChange={(e) => updateOptions({ showLabel: e.target.checked })}
                            />
                            <span>Show "LIVE"</span>
                        </label>
                        <label className="settings-checkbox-inline">
                            <input
                                type="checkbox"
                                checked={showCount}
                                onChange={(e) => updateOptions({ showCount: e.target.checked })}
                            />
                            <span>Show Count</span>
                        </label>
                    </div>
                </div>
            </CollapsibleSection>
        );
    }

    // Text element options (including backward compatibility for 'attribution')
    if (elementType === 'text' || elementType === 'attribution') {
        const content = (options.content as string) || '';
        const tokens = getAvailableTokens();

        return (
            <CollapsibleSection title="Text Options" defaultOpen={true}>
                <div className="settings-row">
                    <label>Content</label>
                    <textarea
                        value={content}
                        placeholder="Enter text content..."
                        onChange={(e) => updateOptions({ content: e.target.value })}
                        rows={3}
                        style={{
                            width: '100%',
                            padding: '8px',
                            borderRadius: '4px',
                            border: '1px solid #0f3460',
                            background: '#1a1a2e',
                            color: '#eee',
                            fontSize: '13px',
                            resize: 'vertical',
                            fontFamily: 'inherit',
                        }}
                    />
                </div>
                <div className="settings-row">
                    <label>Available Tokens</label>
                    <div className="token-list" style={{
                        fontSize: '11px',
                        color: '#888',
                        background: '#1a1a2e',
                        padding: '8px',
                        borderRadius: '4px',
                        border: '1px solid #0f3460',
                    }}>
                        {tokens.map((token) => (
                            <div key={token.name} className="token-item" style={{ marginBottom: '6px' }}>
                                <code style={{
                                    background: '#0f3460',
                                    padding: '2px 6px',
                                    borderRadius: '3px',
                                    color: '#e94560',
                                    cursor: 'pointer',
                                }}
                                onClick={() => {
                                    const newContent = content + token.example;
                                    updateOptions({ content: newContent });
                                }}
                                title="Click to insert"
                                >
                                    {token.example}
                                </code>
                                <span style={{ marginLeft: '8px' }}>{token.description}</span>
                            </div>
                        ))}
                    </div>
                    <small style={{ color: '#666', marginTop: '4px', display: 'block' }}>
                        Click a token to insert it. Tokens update in real-time.
                    </small>
                </div>
            </CollapsibleSection>
        );
    }

    // No options for other element types (yet)
    return null;
}
