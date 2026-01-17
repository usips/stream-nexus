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

function CollapsibleSection({ title, defaultOpen = false, children }: CollapsibleSectionProps) {
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

    const updateMessageStyle = (key: keyof typeof layout.messageStyle, value: string | boolean) => {
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

                {/* Element Section (Global Message Style) - Always open by default */}
                <CollapsibleSection title="Element" defaultOpen={true}>
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

                    {/* Display Options */}
                    <div className="settings-row">
                        <label>Display Options</label>
                        <div className="settings-checkbox-group">
                            <label className="settings-checkbox-inline">
                                <input
                                    type="checkbox"
                                    checked={layout.messageStyle.showAvatars !== false}
                                    onChange={(e) => updateMessageStyle('showAvatars', e.target.checked)}
                                />
                                <span>Show Avatars</span>
                            </label>
                            <label className="settings-checkbox-inline">
                                <input
                                    type="checkbox"
                                    checked={layout.messageStyle.showUsernames !== false}
                                    onChange={(e) => updateMessageStyle('showUsernames', e.target.checked)}
                                />
                                <span>Show Usernames</span>
                            </label>
                            <label className="settings-checkbox-inline">
                                <input
                                    type="checkbox"
                                    checked={layout.messageStyle.condensedMode === true}
                                    onChange={(e) => updateMessageStyle('condensedMode', e.target.checked)}
                                />
                                <span>Condensed Mode</span>
                            </label>
                        </div>
                    </div>

                    {/* Chat Direction */}
                    <div className="settings-row">
                        <label>Chat Direction</label>
                        <select
                            value={layout.messageStyle.direction || 'bottom'}
                            onChange={(e) => updateMessageStyle('direction', e.target.value as 'bottom' | 'top')}
                        >
                            <option value="bottom">Bottom-first (new messages at bottom)</option>
                            <option value="top">Top-first (new messages at top)</option>
                        </select>
                    </div>

                    {/* Badge Visibility */}
                    <div className="settings-row">
                        <label>Visible Badges</label>
                        <div className="settings-checkbox-group">
                            <label className="settings-checkbox-inline">
                                <input
                                    type="checkbox"
                                    checked={layout.messageStyle.showOwnerBadge !== false}
                                    onChange={(e) => updateMessageStyle('showOwnerBadge', e.target.checked)}
                                />
                                <span style={{ color: '#ffd700' }}>Owner</span>
                            </label>
                            <label className="settings-checkbox-inline">
                                <input
                                    type="checkbox"
                                    checked={layout.messageStyle.showStaffBadge !== false}
                                    onChange={(e) => updateMessageStyle('showStaffBadge', e.target.checked)}
                                />
                                <span style={{ color: '#ff3434' }}>Staff</span>
                            </label>
                            <label className="settings-checkbox-inline">
                                <input
                                    type="checkbox"
                                    checked={layout.messageStyle.showModBadge !== false}
                                    onChange={(e) => updateMessageStyle('showModBadge', e.target.checked)}
                                />
                                <span style={{ color: '#197ce3' }}>Mod</span>
                            </label>
                            <label className="settings-checkbox-inline">
                                <input
                                    type="checkbox"
                                    checked={layout.messageStyle.showVerifiedBadge !== false}
                                    onChange={(e) => updateMessageStyle('showVerifiedBadge', e.target.checked)}
                                />
                                <span style={{ color: '#a80da8' }}>Verified</span>
                            </label>
                            <label className="settings-checkbox-inline">
                                <input
                                    type="checkbox"
                                    checked={layout.messageStyle.showSubBadge !== false}
                                    onChange={(e) => updateMessageStyle('showSubBadge', e.target.checked)}
                                />
                                <span style={{ color: '#2f8d15' }}>Sub</span>
                            </label>
                        </div>
                    </div>
                </CollapsibleSection>

                {/* Element-specific Options Section */}
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
                                        ...currentConfig.position,
                                        x: e.target.value || undefined,
                                        right: undefined, // Clear opposite anchor
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
                                        ...currentConfig.position,
                                        y: e.target.value || undefined,
                                        bottom: undefined, // Clear opposite anchor
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
                                        ...currentConfig.position,
                                        right: e.target.value || undefined,
                                        x: undefined, // Clear opposite anchor
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
                                        ...currentConfig.position,
                                        bottom: e.target.value || undefined,
                                        y: undefined, // Clear opposite anchor
                                    }
                                })}
                            />
                        </div>
                    </div>
                    <div className="settings-row">
                        <label>Z-Index</label>
                        <input
                            type="number"
                            value={currentConfig.position.zIndex ?? ''}
                            placeholder="auto"
                            onChange={(e) => updateElementConfig({
                                position: {
                                    ...currentConfig.position,
                                    zIndex: e.target.value ? parseInt(e.target.value, 10) : undefined,
                                }
                            })}
                        />
                    </div>
                </CollapsibleSection>

                {/* Size Section */}
                <CollapsibleSection title="Size" defaultOpen={false}>
                    <div className="settings-row-inline">
                        <div className="settings-row">
                            <label>Width</label>
                            <input
                                type="text"
                                value={currentConfig.size.width ?? ''}
                                placeholder="auto"
                                onChange={(e) => {
                                    const val = e.target.value;
                                    updateElementConfig({
                                        size: {
                                            width: val === '' ? undefined : val,
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
                                    updateElementConfig({
                                        size: {
                                            height: val === '' ? undefined : val,
                                        }
                                    });
                                }}
                            />
                        </div>
                    </div>
                </CollapsibleSection>

                {/* CSS/SCSS Editor Section */}
                <CollapsibleSection title="CSS / SCSS" defaultOpen={false}>
                    <div className="settings-row">
                        <label>Custom Styles</label>
                        <textarea
                            value={currentConfig.style.customCss ?? ''}
                            placeholder="/* SCSS supported */&#10;$primary: #e94560;&#10;&#10;background: rgba(0,0,0,0.5);&#10;border: 1px solid $primary;&#10;box-shadow: 0 2px 8px rgba($primary, 0.3);"
                            onChange={(e) => updateElementConfig({
                                style: { customCss: e.target.value || undefined }
                            })}
                            rows={8}
                            style={{
                                width: '100%',
                                padding: '8px',
                                borderRadius: '4px',
                                border: '1px solid #0f3460',
                                background: '#1a1a2e',
                                color: '#eee',
                                fontSize: '12px',
                                resize: 'vertical',
                                fontFamily: 'monospace',
                            }}
                        />
                    </div>
                    <small style={{ color: '#666', display: 'block', marginTop: '4px' }}>
                        Supports SCSS: variables ($var), color functions (rgba, lighten, darken), and more.
                    </small>
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
            <CollapsibleSection title="Live Badge Options" defaultOpen={false}>
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
            <CollapsibleSection title="Text Options" defaultOpen={false}>
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

    // Chat element options
    if (elementType === 'chat') {
        const showAvatars = options.showAvatars !== false;
        const showUsernames = options.showUsernames !== false;
        const condensedMode = options.condensedMode === true;
        const direction = (options.direction as string) || 'bottom';
        const showOwnerBadge = options.showOwnerBadge !== false;
        const showStaffBadge = options.showStaffBadge !== false;
        const showModBadge = options.showModBadge !== false;
        const showVerifiedBadge = options.showVerifiedBadge !== false;
        const showSubBadge = options.showSubBadge !== false;

        return (
            <CollapsibleSection title="Chat Options" defaultOpen={true}>
                {/* Display Options */}
                <div className="settings-row">
                    <label>Display Options</label>
                    <div className="settings-checkbox-group">
                        <label className="settings-checkbox-inline">
                            <input
                                type="checkbox"
                                checked={showAvatars}
                                onChange={(e) => updateOptions({ showAvatars: e.target.checked })}
                            />
                            <span>Show Avatars</span>
                        </label>
                        <label className="settings-checkbox-inline">
                            <input
                                type="checkbox"
                                checked={showUsernames}
                                onChange={(e) => updateOptions({ showUsernames: e.target.checked })}
                            />
                            <span>Show Usernames</span>
                        </label>
                        <label className="settings-checkbox-inline">
                            <input
                                type="checkbox"
                                checked={condensedMode}
                                onChange={(e) => updateOptions({ condensedMode: e.target.checked })}
                            />
                            <span>Condensed Mode</span>
                        </label>
                    </div>
                </div>

                {/* Chat Direction */}
                <div className="settings-row">
                    <label>Message Direction</label>
                    <select
                        value={direction}
                        onChange={(e) => updateOptions({ direction: e.target.value })}
                    >
                        <option value="bottom">Bottom-first (new at bottom)</option>
                        <option value="top">Top-first (new at top)</option>
                    </select>
                </div>

                {/* Badge Visibility */}
                <div className="settings-row">
                    <label>Visible Badges</label>
                    <div className="settings-checkbox-group">
                        <label className="settings-checkbox-inline">
                            <input
                                type="checkbox"
                                checked={showOwnerBadge}
                                onChange={(e) => updateOptions({ showOwnerBadge: e.target.checked })}
                            />
                            <span style={{ color: '#ffd700' }}>Owner</span>
                        </label>
                        <label className="settings-checkbox-inline">
                            <input
                                type="checkbox"
                                checked={showStaffBadge}
                                onChange={(e) => updateOptions({ showStaffBadge: e.target.checked })}
                            />
                            <span style={{ color: '#ff3434' }}>Staff</span>
                        </label>
                        <label className="settings-checkbox-inline">
                            <input
                                type="checkbox"
                                checked={showModBadge}
                                onChange={(e) => updateOptions({ showModBadge: e.target.checked })}
                            />
                            <span style={{ color: '#197ce3' }}>Mod</span>
                        </label>
                        <label className="settings-checkbox-inline">
                            <input
                                type="checkbox"
                                checked={showVerifiedBadge}
                                onChange={(e) => updateOptions({ showVerifiedBadge: e.target.checked })}
                            />
                            <span style={{ color: '#a80da8' }}>Verified</span>
                        </label>
                        <label className="settings-checkbox-inline">
                            <input
                                type="checkbox"
                                checked={showSubBadge}
                                onChange={(e) => updateOptions({ showSubBadge: e.target.checked })}
                            />
                            <span style={{ color: '#2f8d15' }}>Sub</span>
                        </label>
                    </div>
                </div>
            </CollapsibleSection>
        );
    }

    // No options for other element types (yet)
    return null;
}
