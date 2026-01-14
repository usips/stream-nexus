import React from 'react';
import { useNode } from '@craftjs/core';

// Base component wrapper for Craft.js elements
interface ElementProps {
    children?: React.ReactNode;
    style?: React.CSSProperties;
    className?: string;
}

// Container element for the canvas
export function Container({ children, style, className }: ElementProps) {
    const { connectors: { connect, drag } } = useNode();

    return (
        <div
            ref={(ref) => ref && connect(drag(ref))}
            style={style}
            className={className}
        >
            {children}
        </div>
    );
}

Container.craft = {
    displayName: 'Container',
};

// Chat Panel element
export function ChatPanel({ style }: { style?: React.CSSProperties }) {
    const { connectors: { connect, drag }, selected } = useNode((state) => ({
        selected: state.events.selected,
    }));

    return (
        <div
            ref={(ref) => ref && connect(drag(ref))}
            style={style}
            className={`element-wrapper ${selected ? 'selected' : ''}`}
        >
            <span className="element-label">Chat Panel</span>
            <div className="preview-chat">
                <div className="preview-chat-message">
                    <div className="preview-avatar" />
                    <span>Sample chat message...</span>
                </div>
            </div>
        </div>
    );
}

ChatPanel.craft = {
    displayName: 'Chat Panel',
    props: {
        width: 300,
        height: '100%',
    },
};

// Live Badge element
export function LiveBadge({ style }: { style?: React.CSSProperties }) {
    const { connectors: { connect, drag }, selected } = useNode((state) => ({
        selected: state.events.selected,
    }));

    return (
        <div
            ref={(ref) => ref && connect(drag(ref))}
            style={style}
            className={`element-wrapper ${selected ? 'selected' : ''}`}
        >
            <span className="element-label">Live Badge</span>
            <div className="preview-live">
                <span className="preview-live-badge live">LIVE</span>
                <span className="preview-live-badge">1,234</span>
            </div>
        </div>
    );
}

LiveBadge.craft = {
    displayName: 'Live Badge',
};

// Attribution element
export function Attribution({ style }: { style?: React.CSSProperties }) {
    const { connectors: { connect, drag }, selected } = useNode((state) => ({
        selected: state.events.selected,
    }));

    return (
        <div
            ref={(ref) => ref && connect(drag(ref))}
            style={style}
            className={`element-wrapper ${selected ? 'selected' : ''}`}
        >
            <span className="element-label">Attribution</span>
            <div className="preview-attribution">
                Streamer Name
            </div>
        </div>
    );
}

Attribution.craft = {
    displayName: 'Attribution',
};

// Featured Message element
export function FeaturedMessage({ style }: { style?: React.CSSProperties }) {
    const { connectors: { connect, drag }, selected } = useNode((state) => ({
        selected: state.events.selected,
    }));

    return (
        <div
            ref={(ref) => ref && connect(drag(ref))}
            style={style}
            className={`element-wrapper ${selected ? 'selected' : ''}`}
        >
            <span className="element-label">Featured Message</span>
            <div className="preview-featured">
                Featured message appears here...
            </div>
        </div>
    );
}

FeaturedMessage.craft = {
    displayName: 'Featured Message',
};

// Poll Display element
export function PollDisplay({ style }: { style?: React.CSSProperties }) {
    const { connectors: { connect, drag }, selected } = useNode((state) => ({
        selected: state.events.selected,
    }));

    return (
        <div
            ref={(ref) => ref && connect(drag(ref))}
            style={style}
            className={`element-wrapper ${selected ? 'selected' : ''}`}
        >
            <span className="element-label">Poll Display</span>
            <div className="preview-poll">
                <strong>Poll Question?</strong>
                <div>Option 1 - 50%</div>
                <div>Option 2 - 50%</div>
            </div>
        </div>
    );
}

PollDisplay.craft = {
    displayName: 'Poll Display',
};

// Superchat Display element
export function SuperchatDisplay({ style }: { style?: React.CSSProperties }) {
    const { connectors: { connect, drag }, selected } = useNode((state) => ({
        selected: state.events.selected,
    }));

    return (
        <div
            ref={(ref) => ref && connect(drag(ref))}
            style={style}
            className={`element-wrapper ${selected ? 'selected' : ''}`}
        >
            <span className="element-label">Superchat Display</span>
            <div className="preview-superchat">
                <strong>$10 Superchat</strong>
                <div>Thank you message!</div>
            </div>
        </div>
    );
}

SuperchatDisplay.craft = {
    displayName: 'Superchat Display',
};
