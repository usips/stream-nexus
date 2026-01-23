import React, { useState, useCallback, useEffect } from 'react';
import { Layout, ElementConfig, AnchorPoint, getPositionPropsForAnchor, CANVAS_WIDTH, CANVAS_HEIGHT } from '../types/layout';
import { getAvailableTokens } from '../utils/tokens';

// ============================================================================
// DimensionInput Component - Number input with unit dropdown
// ============================================================================

type DimensionUnit = 'px' | 'vw' | 'vh' | '%' | 'em';

interface DimensionInputProps {
    value: string | number | null | undefined;
    onChange: (value: string | undefined) => void;
    placeholder?: string;
    /** Whether this is a horizontal (width/x) or vertical (height/y) dimension */
    isHorizontal?: boolean;
}

// Parse a dimension string like "15.63vw" into { value: 15.63, unit: 'vw' }
function parseDimension(input: string | number | null | undefined): { value: number; unit: DimensionUnit } | null {
    if (input === null || input === undefined || input === '') return null;

    if (typeof input === 'number') {
        return { value: input, unit: 'px' };
    }

    const str = input.toString().trim();
    if (!str) return null;

    // Match number followed by optional unit
    const match = str.match(/^(-?[\d.]+)\s*(vw|vh|%|px|em)?$/i);
    if (match) {
        const value = parseFloat(match[1]);
        const unit = (match[2]?.toLowerCase() || 'px') as DimensionUnit;
        return { value, unit };
    }

    return null;
}

// Convert a value from one unit to another
function convertUnit(
    value: number,
    fromUnit: DimensionUnit,
    toUnit: DimensionUnit,
    isHorizontal: boolean
): number {
    if (fromUnit === toUnit) return value;

    const refSize = isHorizontal ? CANVAS_WIDTH : CANVAS_HEIGHT;

    // First convert to pixels
    let pixels: number;
    switch (fromUnit) {
        case 'px':
            pixels = value;
            break;
        case 'vw':
            pixels = (value / 100) * CANVAS_WIDTH;
            break;
        case 'vh':
            pixels = (value / 100) * CANVAS_HEIGHT;
            break;
        case '%':
            pixels = (value / 100) * refSize;
            break;
        case 'em':
            pixels = value * 16; // Assume 16px base font size
            break;
        default:
            pixels = value;
    }

    // Then convert from pixels to target unit
    switch (toUnit) {
        case 'px':
            return Math.round(pixels * 100) / 100;
        case 'vw':
            return Math.round((pixels / CANVAS_WIDTH) * 100 * 100) / 100;
        case 'vh':
            return Math.round((pixels / CANVAS_HEIGHT) * 100 * 100) / 100;
        case '%':
            return Math.round((pixels / refSize) * 100 * 100) / 100;
        case 'em':
            return Math.round((pixels / 16) * 100) / 100;
        default:
            return pixels;
    }
}

function DimensionInput({ value, onChange, placeholder = 'auto', isHorizontal = true }: DimensionInputProps) {
    const parsed = parseDimension(value);
    const [numValue, setNumValue] = useState<string>(parsed ? parsed.value.toString() : '');
    const [unit, setUnit] = useState<DimensionUnit>(parsed?.unit || 'vw');

    // Update local state when prop changes
    useEffect(() => {
        const parsed = parseDimension(value);
        if (parsed) {
            setNumValue(parsed.value.toString());
            setUnit(parsed.unit);
        } else {
            setNumValue('');
        }
    }, [value]);

    const handleValueChange = (newNumValue: string) => {
        setNumValue(newNumValue);
        if (newNumValue === '' || newNumValue === '-') {
            onChange(undefined);
        } else {
            const num = parseFloat(newNumValue);
            if (!isNaN(num)) {
                // Always include unit suffix for valid CSS
                onChange(`${num}${unit}`);
            }
        }
    };

    const handleUnitChange = (newUnit: DimensionUnit) => {
        const oldUnit = unit;
        setUnit(newUnit);

        // Convert the value when unit changes
        if (numValue !== '' && numValue !== '-') {
            const num = parseFloat(numValue);
            if (!isNaN(num)) {
                const converted = convertUnit(num, oldUnit, newUnit, isHorizontal);
                setNumValue(converted.toString());
                // Always include unit suffix for valid CSS
                onChange(`${converted}${newUnit}`);
            }
        }
    };

    return (
        <div className="dimension-input">
            <input
                type="text"
                inputMode="decimal"
                value={numValue}
                placeholder={placeholder}
                onChange={(e) => handleValueChange(e.target.value)}
            />
            <select
                value={unit}
                onChange={(e) => handleUnitChange(e.target.value as DimensionUnit)}
                className="dimension-unit"
            >
                <option value="vw">vw</option>
                <option value="vh">vh</option>
                <option value="px">px</option>
                <option value="%">%</option>
                <option value="em">em</option>
            </select>
        </div>
    );
}

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

                {/* Element Settings */}
                <div className="settings-section element-selector">
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

                    <div className="settings-checkbox">
                        <input
                            type="checkbox"
                            id="element-autosize"
                            checked={currentConfig.autoSize === true}
                            onChange={(e) => updateElementConfig({ autoSize: e.target.checked || undefined })}
                        />
                        <label htmlFor="element-autosize">Auto-size (content-sized)</label>
                    </div>

                    {currentConfig.autoSize && (
                        <div className="settings-row">
                            <label>Anchor Point</label>
                            <select
                                value={currentConfig.anchor || 'top-left'}
                                onChange={(e) => {
                                    const anchor = e.target.value as AnchorPoint;
                                    const { horizontal, vertical } = getPositionPropsForAnchor(anchor);
                                    // Update position to match anchor
                                    const pos = currentConfig.position;
                                    const newPosition = { ...pos };
                                    // Clear conflicting position values
                                    if (horizontal === 'x') {
                                        delete newPosition.right;
                                    } else {
                                        delete newPosition.x;
                                    }
                                    if (vertical === 'y') {
                                        delete newPosition.bottom;
                                    } else {
                                        delete newPosition.y;
                                    }
                                    updateElementConfig({
                                        anchor,
                                        position: newPosition
                                    });
                                }}
                            >
                                <option value="top-left">↖ Top Left</option>
                                <option value="top">↑ Top Center</option>
                                <option value="top-right">↗ Top Right</option>
                                <option value="left">← Left Center</option>
                                <option value="center">● Center</option>
                                <option value="right">→ Right Center</option>
                                <option value="bottom-left">↙ Bottom Left</option>
                                <option value="bottom">↓ Bottom Center</option>
                                <option value="bottom-right">↘ Bottom Right</option>
                            </select>
                        </div>
                    )}
                </div>

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
                            <DimensionInput
                                value={currentConfig.position.x}
                                isHorizontal={true}
                                onChange={(val) => updateElementConfig({
                                    position: {
                                        ...currentConfig.position,
                                        x: val,
                                        right: undefined, // Clear opposite anchor
                                    }
                                })}
                            />
                        </div>
                        <div className="settings-row">
                            <label>Y (Top)</label>
                            <DimensionInput
                                value={currentConfig.position.y}
                                isHorizontal={false}
                                onChange={(val) => updateElementConfig({
                                    position: {
                                        ...currentConfig.position,
                                        y: val,
                                        bottom: undefined, // Clear opposite anchor
                                    }
                                })}
                            />
                        </div>
                    </div>
                    <div className="settings-row-inline">
                        <div className="settings-row">
                            <label>Right</label>
                            <DimensionInput
                                value={currentConfig.position.right}
                                isHorizontal={true}
                                onChange={(val) => updateElementConfig({
                                    position: {
                                        ...currentConfig.position,
                                        right: val,
                                        x: undefined, // Clear opposite anchor
                                    }
                                })}
                            />
                        </div>
                        <div className="settings-row">
                            <label>Bottom</label>
                            <DimensionInput
                                value={currentConfig.position.bottom}
                                isHorizontal={false}
                                onChange={(val) => updateElementConfig({
                                    position: {
                                        ...currentConfig.position,
                                        bottom: val,
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

                {/* Size Section - hidden when autoSize is enabled */}
                {!currentConfig.autoSize && (
                    <CollapsibleSection title="Size" defaultOpen={false}>
                        <div className="settings-row-inline">
                            <div className="settings-row">
                                <label>Width</label>
                                <DimensionInput
                                    value={currentConfig.size.width}
                                    isHorizontal={true}
                                    onChange={(val) => updateElementConfig({
                                        size: { ...currentConfig.size, width: val }
                                    })}
                                />
                            </div>
                            <div className="settings-row">
                                <label>Height</label>
                                <DimensionInput
                                    value={currentConfig.size.height}
                                    isHorizontal={false}
                                    onChange={(val) => updateElementConfig({
                                        size: { ...currentConfig.size, height: val }
                                    })}
                                />
                            </div>
                        </div>
                    </CollapsibleSection>
                )}

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
        const style = config.style || {};

        const updateStyle = (styleUpdates: Record<string, string | undefined>) => {
            onUpdate({ style: { ...style, ...styleUpdates } });
        };

        return (
            <>
                <CollapsibleSection title="Text Content" defaultOpen={true}>
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

                <CollapsibleSection title="Text Style" defaultOpen={false}>
                    <div className="settings-row">
                        <label>Font Size</label>
                        <DimensionInput
                            value={style.fontSize}
                            isHorizontal={true}
                            placeholder="inherit"
                            onChange={(val) => updateStyle({ fontSize: val })}
                        />
                    </div>
                    <div className="settings-row">
                        <label>Font Weight</label>
                        <select
                            value={style.fontWeight || ''}
                            onChange={(e) => updateStyle({ fontWeight: e.target.value || undefined })}
                        >
                            <option value="">Normal</option>
                            <option value="100">100 (Thin)</option>
                            <option value="200">200 (Extra Light)</option>
                            <option value="300">300 (Light)</option>
                            <option value="400">400 (Regular)</option>
                            <option value="500">500 (Medium)</option>
                            <option value="600">600 (Semi Bold)</option>
                            <option value="700">700 (Bold)</option>
                            <option value="800">800 (Extra Bold)</option>
                            <option value="900">900 (Black)</option>
                            <option value="bold">Bold</option>
                        </select>
                    </div>
                    <div className="settings-row">
                        <label>Font Style</label>
                        <select
                            value={style.fontStyle || ''}
                            onChange={(e) => updateStyle({ fontStyle: e.target.value || undefined })}
                        >
                            <option value="">Normal</option>
                            <option value="italic">Italic</option>
                            <option value="oblique">Oblique</option>
                        </select>
                    </div>
                    <div className="settings-row">
                        <label>Text Color</label>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <input
                                type="color"
                                value={style.color || '#ffffff'}
                                onChange={(e) => updateStyle({ color: e.target.value })}
                                style={{ width: '40px', height: '28px', border: 'none', cursor: 'pointer' }}
                            />
                            <input
                                type="text"
                                value={style.color || ''}
                                placeholder="#ffffff"
                                onChange={(e) => updateStyle({ color: e.target.value || undefined })}
                                style={{ flex: 1 }}
                            />
                        </div>
                    </div>
                    <div className="settings-row">
                        <label>Line Height</label>
                        <input
                            type="text"
                            value={style.lineHeight || ''}
                            placeholder="normal"
                            onChange={(e) => updateStyle({ lineHeight: e.target.value || undefined })}
                        />
                    </div>
                    <div className="settings-row">
                        <label>Letter Spacing</label>
                        <input
                            type="text"
                            value={style.letterSpacing || ''}
                            placeholder="normal"
                            onChange={(e) => updateStyle({ letterSpacing: e.target.value || undefined })}
                        />
                    </div>
                    <div className="settings-row">
                        <label>Text Align</label>
                        <select
                            value={style.textAlign || ''}
                            onChange={(e) => updateStyle({ textAlign: e.target.value || undefined })}
                        >
                            <option value="">Left</option>
                            <option value="center">Center</option>
                            <option value="right">Right</option>
                            <option value="justify">Justify</option>
                        </select>
                    </div>
                </CollapsibleSection>
            </>
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

                {/* Message Style - per-element */}
                <div className="settings-row">
                    <label>Avatar Size</label>
                    <input
                        type="text"
                        value={(options.avatarSize as string) || ''}
                        placeholder="32px"
                        onChange={(e) => updateOptions({ avatarSize: e.target.value || undefined })}
                    />
                </div>
                <div className="settings-row">
                    <label>Font Size</label>
                    <input
                        type="text"
                        value={(options.fontSize as string) || ''}
                        placeholder="14px"
                        onChange={(e) => updateOptions({ fontSize: e.target.value || undefined })}
                    />
                </div>
                <div className="settings-row">
                    <label>Max Height</label>
                    <input
                        type="text"
                        value={(options.maxHeight as string) || ''}
                        placeholder="none"
                        onChange={(e) => updateOptions({ maxHeight: e.target.value || undefined })}
                    />
                </div>
                <div className="settings-row">
                    <label>Border Radius</label>
                    <input
                        type="text"
                        value={(options.borderRadius as string) || ''}
                        placeholder="8px"
                        onChange={(e) => updateOptions({ borderRadius: e.target.value || undefined })}
                    />
                </div>
            </CollapsibleSection>
        );
    }

    // Featured Message options
    if (elementType === 'featured') {
        const scale = (options.scale as number) ?? 1;

        return (
            <CollapsibleSection title="Featured Message Options" defaultOpen={true}>
                <div className="settings-row">
                    <label>Scale</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                            type="range"
                            min="0.5"
                            max="3"
                            step="0.1"
                            value={scale}
                            onChange={(e) => updateOptions({ scale: parseFloat(e.target.value) })}
                            style={{ flex: 1 }}
                        />
                        <span style={{ minWidth: '40px', textAlign: 'right' }}>{scale.toFixed(1)}x</span>
                    </div>
                </div>
            </CollapsibleSection>
        );
    }

    // No options for other element types (yet)
    return null;
}
