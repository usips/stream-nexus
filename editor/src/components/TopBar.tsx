import React, { useState } from 'react';
import { LayoutListResponse } from '../types/layout';

interface TopBarProps {
    connected: boolean;
    layoutList: LayoutListResponse | null;
    currentLayoutName: string;
    onLayoutChange: (name: string) => void;
    onSave: () => void;
    onSaveAs: (name: string) => void;
}

export function TopBar({
    connected,
    layoutList,
    currentLayoutName,
    onLayoutChange,
    onSave,
    onSaveAs,
}: TopBarProps) {
    const [showSaveAs, setShowSaveAs] = useState(false);
    const [newLayoutName, setNewLayoutName] = useState('');

    const handleSaveAs = () => {
        if (newLayoutName.trim()) {
            onSaveAs(newLayoutName.trim());
            setShowSaveAs(false);
            setNewLayoutName('');
        }
    };

    return (
        <>
            <div className="top-bar">
                <div className="top-bar-left">
                    <h1 style={{ fontSize: '16px', fontWeight: 'bold' }}>
                        Stream Nexus Editor
                    </h1>
                    <div className="connection-status">
                        <span className={`connection-dot ${connected ? 'connected' : ''}`} />
                        {connected ? 'Connected' : 'Disconnected'}
                    </div>
                </div>

                <div className="top-bar-right">
                    <div className="layout-selector">
                        <label>Layout:</label>
                        <select
                            value={currentLayoutName}
                            onChange={(e) => onLayoutChange(e.target.value)}
                        >
                            {layoutList?.layouts.map((name) => (
                                <option key={name} value={name}>
                                    {name}
                                    {name === layoutList.active ? ' (active)' : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    <button className="btn btn-secondary" onClick={() => setShowSaveAs(true)}>
                        Save As...
                    </button>
                    <button className="btn btn-primary" onClick={onSave}>
                        Save
                    </button>
                </div>
            </div>

            {showSaveAs && (
                <div className="modal-overlay" onClick={() => setShowSaveAs(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <h3>Save Layout As</h3>
                        <input
                            type="text"
                            placeholder="Layout name..."
                            value={newLayoutName}
                            onChange={(e) => setNewLayoutName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveAs()}
                            autoFocus
                        />
                        <div className="modal-buttons">
                            <button
                                className="btn btn-secondary"
                                onClick={() => setShowSaveAs(false)}
                            >
                                Cancel
                            </button>
                            <button className="btn btn-primary" onClick={handleSaveAs}>
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
