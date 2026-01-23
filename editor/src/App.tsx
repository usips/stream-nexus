import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Editor, Frame, Element, useEditor } from '@craftjs/core';
import { useWebSocket } from './hooks/useWebSocket';
import { Layout, ElementConfig, defaultLayout, defaultElementConfig, defaultChatOptions } from './types/layout';
import { TopBar } from './components/TopBar';
import { Toolbox } from './components/Toolbox';
import { SettingsPanel } from './components/SettingsPanel';
import { EditorCanvas } from './components/EditorCanvas';
import { LayerPanel } from './components/LayerPanel';
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

// Ensure all elements have unique z-index values
function ensureUniqueZIndexes(layout: Layout): Layout {
    const elements = Object.entries(layout.elements);

    // Check if z-indexes are already unique and properly set
    const zIndexes = elements.map(([, config]) => config.position.zIndex);
    const hasAllZIndexes = zIndexes.every(z => z !== undefined);
    const allUnique = new Set(zIndexes).size === zIndexes.length;

    if (hasAllZIndexes && allUnique) {
        return layout; // Already good
    }

    // Assign unique z-indexes based on current order, preserving any existing z-index ordering
    const sortedElements = [...elements].sort((a, b) => {
        const zA = a[1].position.zIndex ?? 0;
        const zB = b[1].position.zIndex ?? 0;
        return zB - zA; // Higher z-index first
    });

    const updatedElements: Record<string, ElementConfig> = {};
    sortedElements.forEach(([id, config], index) => {
        updatedElements[id] = {
            ...config,
            position: {
                ...config.position,
                zIndex: (sortedElements.length - 1 - index) * 10,
            },
        };
    });

    return {
        ...layout,
        elements: updatedElements,
    };
}

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

    // Grid settings
    const [gridSettings, setGridSettings] = useState({
        enabled: true,
        size: 20, // pixels
        visible: true,
        snapThreshold: 10, // pixels
        snapToElements: true,
    });

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
                // Ensure all elements have unique z-indexes
                const layoutWithZIndexes = ensureUniqueZIndexes(currentLayout);
                setLocalLayout(layoutWithZIndexes);
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

    // Duplicate selected element
    const handleDuplicateElement = useCallback(() => {
        if (!selectedElement || !localLayout.elements[selectedElement]) return;

        // Push current state to history before duplicating
        pushToHistory(localLayout);

        const originalElement = localLayout.elements[selectedElement];
        
        // Generate unique ID
        let newId = `${selectedElement}-copy`;
        let counter = 1;
        while (localLayout.elements[newId]) {
            newId = `${selectedElement}-copy-${counter}`;
            counter++;
        }

        // Create duplicate with slight offset
        const duplicatedElement = JSON.parse(JSON.stringify(originalElement));
        
        // Offset position by 20px (convert to vw/vh)
        const offsetVw = (20 / 1920) * 100;
        const offsetVh = (20 / 1080) * 100;
        
        if (duplicatedElement.position.x) {
            const currentX = parseFloat(duplicatedElement.position.x);
            duplicatedElement.position.x = `${currentX + offsetVw}vw`;
        }
        if (duplicatedElement.position.y) {
            const currentY = parseFloat(duplicatedElement.position.y);
            duplicatedElement.position.y = `${currentY + offsetVh}vh`;
        }

        // Increment z-index to place on top
        const maxZIndex = Math.max(
            0,
            ...Object.values(localLayout.elements).map(el => el.position.zIndex ?? 0)
        );
        duplicatedElement.position.zIndex = maxZIndex + 1;

        const newLayout = {
            ...localLayout,
            elements: {
                ...localLayout.elements,
                [newId]: duplicatedElement,
            },
        };

        setLocalLayout(newLayout);
        setSelectedElement(newId);
        broadcastLayout(newLayout, false);
    }, [selectedElement, localLayout, pushToHistory, broadcastLayout]);

    // Toggle lock on selected element
    const handleToggleLock = useCallback(() => {
        if (!selectedElement || !localLayout.elements[selectedElement]) return;

        // Push current state to history before changing lock
        pushToHistory(localLayout);

        const element = localLayout.elements[selectedElement];
        const newLayout = {
            ...localLayout,
            elements: {
                ...localLayout.elements,
                [selectedElement]: {
                    ...element,
                    locked: !element.locked,
                },
            },
        };

        setLocalLayout(newLayout);
        broadcastLayout(newLayout, false);
    }, [selectedElement, localLayout, pushToHistory, broadcastLayout]);

    // Cycle through elements (Tab navigation)
    const handleCycleElements = useCallback((forward: boolean = true) => {
        const elementIds = Object.keys(localLayout.elements);
        if (elementIds.length <= 1) return;

        const currentIndex = elementIds.indexOf(selectedElement);
        let nextIndex;
        
        if (forward) {
            nextIndex = (currentIndex + 1) % elementIds.length;
        } else {
            nextIndex = currentIndex <= 0 ? elementIds.length - 1 : currentIndex - 1;
        }

        setSelectedElement(elementIds[nextIndex]);
    }, [selectedElement, localLayout.elements]);

    // Layer management functions
    const handleBringForward = useCallback(() => {
        if (!selectedElement || !localLayout.elements[selectedElement]) return;

        pushToHistory(localLayout);

        const elements = localLayout.elements;
        const currentElement = elements[selectedElement];
        const currentZIndex = currentElement.position.zIndex ?? 0;

        // Find the next higher z-index
        const zIndexes = Object.values(elements)
            .map(el => el.position.zIndex ?? 0)
            .filter(z => z > currentZIndex)
            .sort((a, b) => a - b);

        const nextZIndex = zIndexes.length > 0 ? zIndexes[0] : currentZIndex + 1;

        const newLayout = {
            ...localLayout,
            elements: {
                ...elements,
                [selectedElement]: {
                    ...currentElement,
                    position: {
                        ...currentElement.position,
                        zIndex: nextZIndex + 1,
                    },
                },
            },
        };

        setLocalLayout(newLayout);
        broadcastLayout(newLayout, false);
    }, [selectedElement, localLayout, pushToHistory, broadcastLayout]);

    const handleSendBackward = useCallback(() => {
        if (!selectedElement || !localLayout.elements[selectedElement]) return;

        pushToHistory(localLayout);

        const elements = localLayout.elements;
        const currentElement = elements[selectedElement];
        const currentZIndex = currentElement.position.zIndex ?? 0;

        // Find the next lower z-index
        const zIndexes = Object.values(elements)
            .map(el => el.position.zIndex ?? 0)
            .filter(z => z < currentZIndex)
            .sort((a, b) => b - a);

        const nextZIndex = zIndexes.length > 0 ? zIndexes[0] : Math.max(0, currentZIndex - 1);

        const newLayout = {
            ...localLayout,
            elements: {
                ...elements,
                [selectedElement]: {
                    ...currentElement,
                    position: {
                        ...currentElement.position,
                        zIndex: Math.max(0, nextZIndex - 1),
                    },
                },
            },
        };

        setLocalLayout(newLayout);
        broadcastLayout(newLayout, false);
    }, [selectedElement, localLayout, pushToHistory, broadcastLayout]);

    const handleBringToFront = useCallback(() => {
        if (!selectedElement || !localLayout.elements[selectedElement]) return;

        pushToHistory(localLayout);

        const elements = localLayout.elements;
        const currentElement = elements[selectedElement];

        // Find the highest z-index
        const maxZIndex = Math.max(
            0,
            ...Object.values(elements).map(el => el.position.zIndex ?? 0)
        );

        const newLayout = {
            ...localLayout,
            elements: {
                ...elements,
                [selectedElement]: {
                    ...currentElement,
                    position: {
                        ...currentElement.position,
                        zIndex: maxZIndex + 1,
                    },
                },
            },
        };

        setLocalLayout(newLayout);
        broadcastLayout(newLayout, false);
    }, [selectedElement, localLayout, pushToHistory, broadcastLayout]);

    const handleSendToBack = useCallback(() => {
        if (!selectedElement || !localLayout.elements[selectedElement]) return;

        pushToHistory(localLayout);

        const elements = localLayout.elements;
        const currentElement = elements[selectedElement];

        const newLayout = {
            ...localLayout,
            elements: {
                ...elements,
                [selectedElement]: {
                    ...currentElement,
                    position: {
                        ...currentElement.position,
                        zIndex: 0,
                    },
                },
            },
        };

        setLocalLayout(newLayout);
        broadcastLayout(newLayout, false);
    }, [selectedElement, localLayout, pushToHistory, broadcastLayout]);

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
    // Element Management:
    // - Delete/Backspace: Delete selected element
    // - Ctrl+D: Duplicate selected element
    // - Ctrl+L: Toggle lock on selected element
    // - Tab/Shift+Tab: Cycle through elements
    // - Escape: Reset to first element
    // History:
    // - Ctrl+Z: Undo
    // - Ctrl+Y/Ctrl+Shift+Z: Redo
    // Layer Management:
    // - Ctrl+]: Bring forward one layer
    // - Ctrl+[: Send back one layer
    // - Ctrl+Shift+]: Bring to front
    // - Ctrl+Shift+[: Send to back
    // Positioning (handled in EditorCanvas):
    // - Arrow keys: Move 1px
    // - Shift+Arrow keys: Move 10px
    // - Ctrl+Arrow keys: Resize 1px
    // - Ctrl+Shift+Arrow keys: Resize 10px
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

            // Ctrl+D - Duplicate selected element
            if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
                e.preventDefault();
                handleDuplicateElement();
            }

            // Ctrl+L - Toggle lock on selected element
            if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
                e.preventDefault();
                handleToggleLock();
            }

            // Tab - Cycle through elements
            if (e.key === 'Tab') {
                e.preventDefault();
                handleCycleElements(!e.shiftKey);
            }

            // Escape - Deselect element
            if (e.key === 'Escape') {
                e.preventDefault();
                const elementIds = Object.keys(localLayout.elements);
                if (elementIds.length > 0) {
                    setSelectedElement(elementIds[0]);
                }
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

            // Layer management shortcuts
            // Ctrl+] - Bring forward one layer
            if ((e.ctrlKey || e.metaKey) && e.key === ']' && !e.shiftKey) {
                e.preventDefault();
                handleBringForward();
            }

            // Ctrl+[ - Send back one layer
            if ((e.ctrlKey || e.metaKey) && e.key === '[' && !e.shiftKey) {
                e.preventDefault();
                handleSendBackward();
            }

            // Ctrl+Shift+] - Bring to front
            if ((e.ctrlKey || e.metaKey) && e.key === ']' && e.shiftKey) {
                e.preventDefault();
                handleBringToFront();
            }

            // Ctrl+Shift+[ - Send to back
            if ((e.ctrlKey || e.metaKey) && e.key === '[' && e.shiftKey) {
                e.preventDefault();
                handleSendToBack();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleDeleteElement, handleDuplicateElement, handleToggleLock, handleCycleElements, handleUndo, handleRedo, handleBringForward, handleSendBackward, handleBringToFront, handleSendToBack, localLayout.elements]);

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

        // Find the highest z-index to place new element on top
        const maxZIndex = Math.max(
            0,
            ...Object.values(localLayout.elements).map(el => el.position.zIndex ?? 0)
        );

        // Create default config for the new element
        const baseConfig = defaultElementConfig();
        const newElement: typeof baseConfig = {
            ...baseConfig,
            position: dropPosition
                ? { x: `${(dropPosition.x / 1920 * 100).toFixed(2)}vw`, y: `${(dropPosition.y / 1080 * 100).toFixed(2)}vh`, zIndex: maxZIndex + 10 }
                : { x: '10vw', y: '10vh', zIndex: maxZIndex + 10 },
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
                        onLayoutChange={(newLayout, addToHistory = true) => {
                            setLocalLayout(newLayout);
                            broadcastLayout(newLayout, addToHistory);
                        }}
                        onPushHistory={pushToHistory}
                        selectedElement={selectedElement}
                        onSelectElement={setSelectedElement}
                        onDeleteElement={handleDeleteElement}
                        onUndo={handleUndo}
                        onRedo={handleRedo}
                        canUndo={undoHistory.length > 0}
                        canRedo={redoHistory.length > 0}
                        onAddElement={handleAddElement}
                        gridSettings={gridSettings}
                        onGridSettingsChange={setGridSettings}
                    />
                    <div className="right-panels">
                        <LayerPanel
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
                            onDeleteElement={handleDeleteElement}
                            canDelete={Object.keys(localLayout.elements).length > 1}
                        />
                    </div>
                </div>
            </Editor>
        </div>
    );
}

export default App;
