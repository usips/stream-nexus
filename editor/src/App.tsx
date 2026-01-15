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

    // Sync local layout with server layout
    useEffect(() => {
        if (currentLayout) {
            setLocalLayout(currentLayout);
            // Clear history when switching layouts
            setUndoHistory([]);
            setRedoHistory([]);
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
                        onDeleteElement={handleDeleteElement}
                        onUndo={handleUndo}
                        onRedo={handleRedo}
                        canUndo={undoHistory.length > 0}
                        canRedo={redoHistory.length > 0}
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
