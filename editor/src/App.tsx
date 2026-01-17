import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Editor, Frame, Element, useEditor } from '@craftjs/core';
import { useWebSocket } from './hooks/useWebSocket';
import { Layout, defaultLayout, defaultElementConfig, defaultChatOptions } from './types/layout';
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
    DonationMatter,
    Container,
} from './components/elements';
import './styles.css';

const MAX_UNDO_HISTORY = 50;

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
    const [undoHistory, setUndoHistory] = useState<Layout[]>([]);
    const [redoHistory, setRedoHistory] = useState<Layout[]>([]);
    const saveDebounceRef = useRef<NodeJS.Timeout | null>(null);
    const isUndoingRef = useRef(false);

    // Track current layout name to detect when switching layouts
    const currentLayoutNameRef = useRef<string | null>(null);

    // Sync local layout with server layout only when:
    // 1. First load (currentLayoutNameRef is null)
    // 2. Switching to a different layout (name changes)
    // This prevents overwriting local changes when server echoes back our own updates
    useEffect(() => {
        if (currentLayout) {
            const isNewLayout = currentLayoutNameRef.current !== currentLayout.name;
            if (isNewLayout) {
                console.log('[Editor] Switching to layout:', currentLayout.name);
                setLocalLayout(currentLayout);
                // Clear history when switching layouts
                setUndoHistory([]);
                setRedoHistory([]);
                currentLayoutNameRef.current = currentLayout.name;
            }
        }
    }, [currentLayout]);

    // Push to undo history (call before making changes)
    const pushToHistory = useCallback((layout: Layout) => {
        if (isUndoingRef.current) return;
        setUndoHistory(prev => {
            const newHistory = [...prev, JSON.parse(JSON.stringify(layout))];
            // Limit history size
            if (newHistory.length > MAX_UNDO_HISTORY) {
                newHistory.shift();
            }
            return newHistory;
        });
        // Clear redo when new action is taken
        setRedoHistory([]);
    }, []);

    // Undo last action
    const handleUndo = useCallback(() => {
        if (undoHistory.length === 0) return;

        isUndoingRef.current = true;
        const previousLayout = undoHistory[undoHistory.length - 1];

        // Push current state to redo
        setRedoHistory(prev => [...prev, JSON.parse(JSON.stringify(localLayout))]);

        // Pop from undo history
        setUndoHistory(prev => prev.slice(0, -1));

        // Restore previous layout
        setLocalLayout(previousLayout);
        sendLayoutUpdate(previousLayout);

        // Update selected element if it no longer exists
        if (previousLayout.elements && !previousLayout.elements[selectedElement]) {
            const elementIds = Object.keys(previousLayout.elements);
            if (elementIds.length > 0) {
                setSelectedElement(elementIds[0]);
            }
        }

        isUndoingRef.current = false;
    }, [undoHistory, localLayout, selectedElement, sendLayoutUpdate]);

    // Redo last undone action
    const handleRedo = useCallback(() => {
        if (redoHistory.length === 0) return;

        isUndoingRef.current = true;
        const nextLayout = redoHistory[redoHistory.length - 1];

        // Push current state to undo
        setUndoHistory(prev => [...prev, JSON.parse(JSON.stringify(localLayout))]);

        // Pop from redo history
        setRedoHistory(prev => prev.slice(0, -1));

        // Restore next layout
        setLocalLayout(nextLayout);
        sendLayoutUpdate(nextLayout);

        // Update selected element if it no longer exists
        if (nextLayout.elements && !nextLayout.elements[selectedElement]) {
            const elementIds = Object.keys(nextLayout.elements);
            if (elementIds.length > 0) {
                setSelectedElement(elementIds[0]);
            }
        }

        isUndoingRef.current = false;
    }, [redoHistory, localLayout, selectedElement, sendLayoutUpdate]);

    // Delete selected element
    const handleDeleteElement = useCallback(() => {
        if (!selectedElement) return;

        const elementIds = Object.keys(localLayout.elements);
        if (elementIds.length <= 1) {
            // Don't delete the last element
            return;
        }

        // Push current state to history before deleting
        pushToHistory(localLayout);

        // Create new layout without the selected element
        const { [selectedElement]: deleted, ...remainingElements } = localLayout.elements;
        const newLayout = {
            ...localLayout,
            elements: remainingElements,
        };

        // Select another element
        const remainingIds = Object.keys(remainingElements);
        setSelectedElement(remainingIds[0] || '');

        setLocalLayout(newLayout);
        sendLayoutUpdate(newLayout);

        if (autoSave) {
            if (saveDebounceRef.current) {
                clearTimeout(saveDebounceRef.current);
            }
            saveDebounceRef.current = setTimeout(() => {
                saveLayout(newLayout.name || 'default', newLayout);
            }, 500);
        }
    }, [selectedElement, localLayout, pushToHistory, sendLayoutUpdate, autoSave, saveLayout]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Don't trigger shortcuts when typing in inputs
            if (e.target instanceof HTMLInputElement ||
                e.target instanceof HTMLTextAreaElement ||
                e.target instanceof HTMLSelectElement) {
                return;
            }

            // Delete key - delete selected element
            if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                handleDeleteElement();
            }

            // Ctrl+Z - Undo
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                handleUndo();
            }

            // Ctrl+Shift+Z or Ctrl+Y - Redo
            if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
                e.preventDefault();
                handleRedo();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleDeleteElement, handleUndo, handleRedo]);

    // Layout broadcast - sends immediately for live preview during drag
    // Also saves to disk if autoSave is enabled (debounced)
    const broadcastLayout = useCallback((layout: Layout, addToHistory = true) => {
        // Add to history before making changes (debounced to avoid flooding)
        if (addToHistory && !isUndoingRef.current) {
            pushToHistory(localLayout);
        }

        // Broadcast immediately for live preview during drag
        sendLayoutUpdate(layout);

        // Auto-save to disk with debounce (don't save on every drag frame)
        if (autoSave) {
            if (saveDebounceRef.current) {
                clearTimeout(saveDebounceRef.current);
            }
            saveDebounceRef.current = setTimeout(() => {
                const name = layout.name || 'default';
                saveLayout(name, layout);
            }, 500); // 500ms debounce for save
        }
    }, [sendLayoutUpdate, saveLayout, autoSave, pushToHistory, localLayout]);

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

    const handleCreateNew = useCallback((newName: string) => {
        // Create a fresh layout with default values
        const newLayout = { ...defaultLayout(), name: newName };
        setLocalLayout(newLayout);
        currentLayoutNameRef.current = newName;
        // Clear history for the new layout
        setUndoHistory([]);
        setRedoHistory([]);
        // Save and broadcast
        saveLayout(newName, newLayout);
        sendLayoutUpdate(newLayout);
        setTimeout(requestLayouts, 500);
    }, [saveLayout, sendLayoutUpdate, requestLayouts]);

    const handleLayoutChange = useCallback((name: string) => {
        switchLayout(name);
    }, [switchLayout]);

    // Add a new element to the layout
    const handleAddElement = useCallback((elementType: string, dropPosition?: { x: number; y: number }) => {
        // Generate unique ID if element already exists
        let elementId = elementType;
        let counter = 1;
        while (localLayout.elements[elementId]) {
            elementId = `${elementType}-${counter}`;
            counter++;
        }

        // Create default config for the new element
        const baseConfig = defaultElementConfig();
        const newElement: typeof baseConfig = {
            ...baseConfig,
            position: dropPosition
                ? { x: `${(dropPosition.x / 1920 * 100).toFixed(2)}vw`, y: `${(dropPosition.y / 1080 * 100).toFixed(2)}vh` }
                : { x: '10vw', y: '10vh' },
        };

        // Add element-specific defaults (only if not dropped at specific position)
        if (!dropPosition) {
            switch (elementType) {
                case 'chat':
                    newElement.size = { width: '15.63vw', height: '100vh' };
                    newElement.position = { y: '0vh', right: '0vw' };
                    newElement.options = defaultChatOptions();
                    break;
                case 'live':
                    newElement.position = { x: '0vw', y: '0vh' };
                    break;
                case 'text':
                    newElement.position = { x: '0.78vw', bottom: '0.65vh' };
                    newElement.style = { fontSize: '3.5vw', fontStyle: 'italic', fontWeight: 'bold' };
                    newElement.options = { content: 'New Text Element' };
                    break;
                case 'featured':
                    newElement.position = { x: '0vw', bottom: '47.41vh' };
                    newElement.size = { maxWidth: 'calc(100vw - 16.41vw)' };
                    newElement.style = { fontSize: '32px' };
                    break;
                case 'poll':
                case 'superchat':
                    newElement.position = { y: '0vh' };
                    break;
            }
        } else {
            // When dropped, still apply element-specific size/style defaults
            switch (elementType) {
                case 'chat':
                    newElement.size = { width: '15.63vw', height: '100vh' };
                    newElement.options = defaultChatOptions();
                    break;
                case 'text':
                    newElement.style = { fontSize: '3.5vw', fontStyle: 'italic', fontWeight: 'bold' };
                    newElement.options = { content: 'New Text Element' };
                    break;
                case 'featured':
                    newElement.size = { maxWidth: 'calc(100vw - 16.41vw)' };
                    newElement.style = { fontSize: '32px' };
                    break;
            }
        }

        // Push current state to history
        pushToHistory(localLayout);

        // Add the new element
        const newLayout = {
            ...localLayout,
            elements: {
                ...localLayout.elements,
                [elementId]: newElement,
            },
        };

        setLocalLayout(newLayout);
        setSelectedElement(elementId);
        broadcastLayout(newLayout, false); // Don't add to history again
    }, [localLayout, pushToHistory, broadcastLayout]);

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
                    DonationMatter,
                }}
            >
                <TopBar
                    connected={connected}
                    layoutList={layoutList}
                    currentLayoutName={localLayout.name}
                    onLayoutChange={handleLayoutChange}
                    onSave={handleSave}
                    onSaveAs={handleSaveAs}
                    onCreateNew={handleCreateNew}
                    autoSave={autoSave}
                    onAutoSaveChange={setAutoSave}
                />
                <div className="editor-main">
                    <Toolbox onAddElement={handleAddElement} />
                    <EditorCanvas
                        layout={localLayout}
                        onLayoutChange={(newLayout) => {
                            setLocalLayout(newLayout);
                            broadcastLayout(newLayout);
                        }}
                        selectedElement={selectedElement}
                        onSelectElement={setSelectedElement}
                        onDeleteElement={handleDeleteElement}
                        onUndo={handleUndo}
                        onRedo={handleRedo}
                        canUndo={undoHistory.length > 0}
                        canRedo={redoHistory.length > 0}
                        onAddElement={handleAddElement}
                    />
                    <SettingsPanel
                        layout={localLayout}
                        onLayoutChange={(newLayout) => {
                            setLocalLayout(newLayout);
                            broadcastLayout(newLayout);
                        }}
                        selectedElement={selectedElement}
                        onSelectElement={setSelectedElement}
                        onDeleteElement={handleDeleteElement}
                        canDelete={Object.keys(localLayout.elements).length > 1}
                    />
                </div>
            </Editor>
        </div>
    );
}

export default App;
