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
    const [autoSave, setAutoSave] = useState(true);
    const [selectedElement, setSelectedElement] = useState<string>('chat');
    const debounceRef = useRef<NodeJS.Timeout | null>(null);
    const saveDebounceRef = useRef<NodeJS.Timeout | null>(null);

    // Sync local layout with server layout
    useEffect(() => {
        if (currentLayout) {
            setLocalLayout(currentLayout);
        }
    }, [currentLayout]);

    // Debounced layout broadcast (always broadcasts for live preview)
    // Also saves to disk if autoSave is enabled
    const broadcastLayout = useCallback((layout: Layout) => {
        // Always broadcast immediately for live preview
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }
        debounceRef.current = setTimeout(() => {
            sendLayoutUpdate(layout);
        }, 100); // 100ms debounce for broadcast

        // Auto-save to disk with longer debounce
        if (autoSave) {
            if (saveDebounceRef.current) {
                clearTimeout(saveDebounceRef.current);
            }
            saveDebounceRef.current = setTimeout(() => {
                const name = layout.name || 'default';
                saveLayout(name, layout);
            }, 500); // 500ms debounce for save
        }
    }, [sendLayoutUpdate, saveLayout, autoSave]);

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
                    autoSave={autoSave}
                    onAutoSaveChange={setAutoSave}
                />
                <div className="editor-main">
                    <Toolbox />
                    <EditorCanvas
                        layout={localLayout}
                        onLayoutChange={(newLayout) => {
                            setLocalLayout(newLayout);
                            broadcastLayout(newLayout);
                        }}
                        selectedElement={selectedElement}
                        onSelectElement={setSelectedElement}
                    />
                    <SettingsPanel
                        layout={localLayout}
                        onLayoutChange={(newLayout) => {
                            setLocalLayout(newLayout);
                            broadcastLayout(newLayout);
                        }}
                        selectedElement={selectedElement}
                        onSelectElement={setSelectedElement}
                    />
                </div>
            </Editor>
        </div>
    );
}

export default App;
