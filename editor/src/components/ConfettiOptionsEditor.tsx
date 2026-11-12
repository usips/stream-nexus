import React, { useState } from 'react';
import {
    ConfettiOptions,
    ConfettiShape,
    defaultConfettiOptions,
} from '../types/layout';

interface ConfettiOptionsEditorProps {
    options: Record<string, unknown>;
    onChange: (updates: Record<string, unknown>) => void;
}

interface OptionSectionProps {
    title: string;
    defaultOpen?: boolean;
    children: React.ReactNode;
}

function OptionSection({ title, defaultOpen = false, children }: OptionSectionProps) {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    return (
        <div className={`collapsible-section ${isOpen ? 'open' : 'closed'}`}>
            <div className="section-header" onClick={() => setIsOpen(!isOpen)}>
                <span className="collapse-icon">{isOpen ? '▼' : '▶'}</span>
                <span>{title}</span>
            </div>
            {isOpen && <div className="section-content">{children}</div>}
        </div>
    );
}

interface NumberOptionProps {
    label: string;
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
    help?: string;
}

function NumberOption({ label, value, onChange, min, max, step = 1, help }: NumberOptionProps) {
    return (
        <div className="settings-row">
            <label>{label}</label>
            <input
                type="number"
                value={value}
                min={min}
                max={max}
                step={step}
                onChange={(event) => {
                    const next = event.currentTarget.valueAsNumber;
                    if (Number.isFinite(next)) onChange(next);
                }}
            />
            {help && <small className="settings-help">{help}</small>}
        </div>
    );
}

export function ConfettiOptionsEditor({ options, onChange }: ConfettiOptionsEditorProps) {
    const values = { ...defaultConfettiOptions(), ...options } as ConfettiOptions;
    const colors = Array.isArray(values.colors) && values.colors.length > 0
        ? values.colors
        : defaultConfettiOptions().colors!;
    const shapes = Array.isArray(values.shapes) && values.shapes.length > 0
        ? values.shapes
        : defaultConfettiOptions().shapes!;

    const update = <K extends keyof ConfettiOptions>(key: K, value: ConfettiOptions[K]) => {
        onChange({ [key]: value });
    };

    const updateColor = (index: number, color: string) => {
        update('colors', colors.map((existing, i) => i === index ? color : existing));
    };

    const toggleShape = (shape: ConfettiShape, checked: boolean) => {
        const next = checked
            ? [...new Set([...shapes, shape])]
            : shapes.filter((existing) => existing !== shape);
        if (next.length > 0) update('shapes', next);
    };

    return (
        <>
            <OptionSection title="Confetti Spawn & Trigger" defaultOpen={true}>
                <div className="settings-row">
                    <label>Spawn Location</label>
                    <select
                        value={values.spawnMode}
                        onChange={(event) => update('spawnMode', event.target.value as ConfettiOptions['spawnMode'])}
                    >
                        <option value="random">Random (anywhere in bounds)</option>
                        <option value="precipitation">Precipitation (across top border)</option>
                    </select>
                    <small className="settings-help">
                        Precipitation spreads particles across the full top edge; use a 270° angle for an immediate downward launch.
                    </small>
                </div>

                <div className="settings-row">
                    <label>Trigger</label>
                    <select
                        value={values.triggerMode}
                        onChange={(event) => update('triggerMode', event.target.value as ConfettiOptions['triggerMode'])}
                    >
                        <option value="timer">Timer</option>
                        <option value="event">Event-based</option>
                    </select>
                </div>

                {values.triggerMode === 'event' ? (
                    <>
                        <div className="settings-row">
                            <label>Event</label>
                            <select value="chat_message" disabled>
                                <option value="chat_message">Chat message received</option>
                            </select>
                        </div>
                        <NumberOption
                            label="Minimum Message Spacing (seconds)"
                            value={values.eventSpacingSeconds!}
                            min={0.05}
                            step={0.05}
                            onChange={(value) => update('eventSpacingSeconds', value)}
                            help="Messages received during this cooldown are ignored, avoiding animation backlogs and lag."
                        />
                    </>
                ) : (
                    <div className="settings-row-inline">
                        <NumberOption
                            label="Minimum Time (seconds)"
                            value={values.timerMinSeconds!}
                            min={0.1}
                            step={0.1}
                            onChange={(value) => update('timerMinSeconds', value)}
                        />
                        <NumberOption
                            label="Maximum Time (seconds)"
                            value={values.timerMaxSeconds!}
                            min={0.1}
                            step={0.1}
                            onChange={(value) => update('timerMaxSeconds', value)}
                        />
                    </div>
                )}
            </OptionSection>

            <OptionSection title="Confetti Appearance" defaultOpen={true}>
                <NumberOption
                    label="Particle Count"
                    value={values.particleCount!}
                    min={0}
                    step={1}
                    onChange={(value) => update('particleCount', value)}
                />
                <NumberOption
                    label="Particle Scale"
                    value={values.scalar!}
                    min={0}
                    step={0.1}
                    onChange={(value) => update('scalar', value)}
                />

                <div className="settings-row">
                    <label>Shapes</label>
                    <div className="settings-checkbox-group">
                        {(['square', 'circle', 'star'] as ConfettiShape[]).map((shape) => (
                            <label className="settings-checkbox-inline" key={shape}>
                                <input
                                    type="checkbox"
                                    checked={shapes.includes(shape)}
                                    onChange={(event) => toggleShape(shape, event.target.checked)}
                                />
                                <span>{shape.charAt(0).toUpperCase() + shape.slice(1)}</span>
                            </label>
                        ))}
                    </div>
                </div>

                <div className="settings-row">
                    <label>Colors</label>
                    <div className="confetti-colors">
                        {colors.map((color, index) => (
                            <div className="confetti-color-row" key={index}>
                                <input
                                    type="color"
                                    value={/^#[0-9a-f]{6}$/i.test(color) ? color : '#ffffff'}
                                    onChange={(event) => updateColor(index, event.target.value)}
                                    aria-label={`Confetti color ${index + 1}`}
                                />
                                <input
                                    type="text"
                                    value={color}
                                    onChange={(event) => updateColor(index, event.target.value)}
                                    aria-label={`Confetti color ${index + 1} hex value`}
                                />
                                <button
                                    type="button"
                                    className="btn btn-secondary confetti-color-remove"
                                    disabled={colors.length === 1}
                                    onClick={() => update('colors', colors.filter((_, i) => i !== index))}
                                    aria-label={`Remove confetti color ${index + 1}`}
                                >
                                    ×
                                </button>
                            </div>
                        ))}
                    </div>
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => update('colors', [...colors, '#ffffff'])}
                    >
                        + Add Color
                    </button>
                    <small className="settings-help">canvas-confetti expects hexadecimal colors.</small>
                </div>

                <label className="settings-checkbox">
                    <input
                        type="checkbox"
                        checked={values.flat === true}
                        onChange={(event) => update('flat', event.target.checked)}
                    />
                    <span>Flat particles (disable tilt and wobble)</span>
                </label>
            </OptionSection>

            <OptionSection title="Confetti Motion" defaultOpen={false}>
                <NumberOption label="Angle (degrees)" value={values.angle!} step={1} onChange={(value) => update('angle', value)} />
                <NumberOption label="Spread (degrees)" value={values.spread!} min={0} step={1} onChange={(value) => update('spread', value)} />
                <NumberOption label="Start Velocity" value={values.startVelocity!} step={1} onChange={(value) => update('startVelocity', value)} />
                <NumberOption
                    label="Decay"
                    value={values.decay!}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(value) => update('decay', value)}
                    help="Keep between 0 and 1 so particles lose speed instead of accelerating."
                />
                <NumberOption label="Gravity" value={values.gravity!} step={0.1} onChange={(value) => update('gravity', value)} />
                <NumberOption label="Drift" value={values.drift!} step={0.1} onChange={(value) => update('drift', value)} />
                <NumberOption label="Ticks (lifetime)" value={values.ticks!} min={0} step={1} onChange={(value) => update('ticks', value)} />
            </OptionSection>

            <OptionSection title="Confetti Rendering" defaultOpen={false}>
                <NumberOption label="Canvas Z-Index" value={values.zIndex!} step={1} onChange={(value) => update('zIndex', value)} />
                <label className="settings-checkbox">
                    <input
                        type="checkbox"
                        checked={values.resize !== false}
                        onChange={(event) => update('resize', event.target.checked)}
                    />
                    <span>Resize canvas with element</span>
                </label>
                <label className="settings-checkbox">
                    <input
                        type="checkbox"
                        checked={values.useWorker === true}
                        onChange={(event) => update('useWorker', event.target.checked)}
                    />
                    <span>Use rendering worker when supported</span>
                </label>
                <label className="settings-checkbox">
                    <input
                        type="checkbox"
                        checked={values.disableForReducedMotion === true}
                        onChange={(event) => update('disableForReducedMotion', event.target.checked)}
                    />
                    <span>Disable for reduced-motion users</span>
                </label>
            </OptionSection>
        </>
    );
}
