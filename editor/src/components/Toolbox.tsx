import React from 'react';

interface ToolboxItemProps {
    label: string;
    icon: string;
    elementId: string;
    onAddElement: (elementId: string) => void;
}

function ToolboxItem({ label, icon, elementId, onAddElement }: ToolboxItemProps) {
    return (
        <div
            className="toolbox-item"
            draggable
            onClick={() => onAddElement(elementId)}
            onDragStart={(e) => {
                e.dataTransfer.setData('element-id', elementId);
            }}
        >
            <span className="toolbox-icon">{icon}</span>
            <span>{label}</span>
        </div>
    );
}

interface ToolboxProps {
    onAddElement: (elementId: string) => void;
}

export function Toolbox({ onAddElement }: ToolboxProps) {
    return (
        <div className="toolbox">
            <h3>Elements</h3>

            <ToolboxItem
                label="Chat Panel"
                icon="💬"
                elementId="chat"
                onAddElement={onAddElement}
            />

            <ToolboxItem
                label="Live Badge"
                icon="🔴"
                elementId="live"
                onAddElement={onAddElement}
            />

            <ToolboxItem
                label="Text"
                icon="📝"
                elementId="text"
                onAddElement={onAddElement}
            />

            <ToolboxItem
                label="Featured Message"
                icon="⭐"
                elementId="featured"
                onAddElement={onAddElement}
            />

            <ToolboxItem
                label="Poll Display"
                icon="📊"
                elementId="poll"
                onAddElement={onAddElement}
            />

            <ToolboxItem
                label="Superchat Display"
                icon="💰"
                elementId="superchat"
                onAddElement={onAddElement}
            />

            <ToolboxItem
                label="Donation Matter"
                icon="💥"
                elementId="matter"
                onAddElement={onAddElement}
            />

            <h3 style={{ marginTop: '24px' }}>Tips</h3>
            <div style={{ fontSize: '12px', color: '#888', lineHeight: 1.5 }}>
                <p>Click an element to select it and edit its properties.</p>
                <p style={{ marginTop: '8px' }}>
                    Drag elements in the canvas to reposition them.
                </p>
                <p style={{ marginTop: '8px' }}>
                    Changes are broadcast live to all connected overlays.
                </p>
            </div>
        </div>
    );
}
