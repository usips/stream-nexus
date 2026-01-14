import React from 'react';

interface ToolboxItemProps {
    label: string;
    icon: string;
    elementId: string;
}

function ToolboxItem({ label, icon, elementId }: ToolboxItemProps) {
    return (
        <div
            className="toolbox-item"
            draggable
            onDragStart={(e) => {
                e.dataTransfer.setData('element-id', elementId);
            }}
        >
            <span className="toolbox-icon">{icon}</span>
            <span>{label}</span>
        </div>
    );
}

export function Toolbox() {
    return (
        <div className="toolbox">
            <h3>Elements</h3>

            <ToolboxItem
                label="Chat Panel"
                icon="💬"
                elementId="chat"
            />

            <ToolboxItem
                label="Live Badge"
                icon="🔴"
                elementId="live"
            />

            <ToolboxItem
                label="Attribution"
                icon="📝"
                elementId="attribution"
            />

            <ToolboxItem
                label="Featured Message"
                icon="⭐"
                elementId="featured"
            />

            <ToolboxItem
                label="Poll Display"
                icon="📊"
                elementId="poll"
            />

            <ToolboxItem
                label="Superchat Display"
                icon="💰"
                elementId="superchat"
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
