import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Editor, Frame, Element, useEditor } from '@craftjs/core';
import { useWebSocket } from './hooks/useWebSocket';
import { Layout, defaultLayout } from './types/layout';
import { TopBar } from './components/TopBar';
import { Toolbox } from './components/Toolbox';
import { SettingsPanel } from './components/SettingsPanel';
import { EditorCanvas } from './components/EditorCanvas';
import {
    ChatPanel,
    LiveBadge,
    Attribution,
    FeaturedMessage,
    PollDisplay,
    SuperchatDisplay,
    Container,
} from './components/elements';
import './styles.css';

function App() {
    const {
        connected,
        currentLayout,
        layoutList,
        sendLayoutUpdate,
        switchLayout,
        saveLayout,
        requestLayouts,
    } = useWebSocket();

    const [localLayout, setLocalLayout] = useState<Layout>(defaultLayout());
    const debounceRef = useRef<NodeJS.Timeout | null>(null);

    // Sync local layout with server layout
    useEffect(() => {
        if (currentLayout) {
            setLocalLayout(currentLayout);
        }
    }, [currentLayout]);

    // Debounced layout broadcast
    const broadcastLayout = useCallback((layout: Layout) => {
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }
        debounceRef.current = setTimeout(() => {
            sendLayoutUpdate(layout);
        }, 100); // 100ms debounce
    }, [sendLayoutUpdate]);

    const handleSave = useCallback(() => {
        const name = localLayout.name || 'default';
        saveLayout(name, localLayout);
        // Refresh layout list
        setTimeout(requestLayouts, 500);
    }, [localLayout, saveLayout, requestLayouts]);

    const handleSaveAs = useCallback((newName: string) => {
        const newLayout = { ...localLayout, name: newName };
        setLocalLayout(newLayout);
        saveLayout(newName, newLayout);
        setTimeout(requestLayouts, 500);
    }, [localLayout, saveLayout, requestLayouts]);

    const handleLayoutChange = useCallback((name: string) => {
        switchLayout(name);
    }, [switchLayout]);

    return (
        <div className="editor-app">
            <Editor
                resolver={{
                    Container,
                    ChatPanel,
                    LiveBadge,
                    Attribution,
                    FeaturedMessage,
                    PollDisplay,
                    SuperchatDisplay,
                }}
            >
                <TopBar
                    connected={connected}
                    layoutList={layoutList}
                    currentLayoutName={localLayout.name}
                    onLayoutChange={handleLayoutChange}
                    onSave={handleSave}
                    onSaveAs={handleSaveAs}
                />
                <div className="editor-main">
                    <Toolbox />
                    <EditorCanvas
                        layout={localLayout}
                        onLayoutChange={(newLayout) => {
                            setLocalLayout(newLayout);
                            broadcastLayout(newLayout);
                        }}
                    />
                    <SettingsPanel
                        layout={localLayout}
                        onLayoutChange={(newLayout) => {
                            setLocalLayout(newLayout);
                            broadcastLayout(newLayout);
                        }}
                    />
                </div>
            </Editor>
        </div>
    );
}

export default App;
