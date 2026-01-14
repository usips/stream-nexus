import { useState, useEffect, useRef, useCallback } from 'react';
import { Layout, LayoutListResponse } from '../types/layout';

interface WebSocketMessage {
    tag: string;
    message: string;
}

export function useWebSocket() {
    const wsRef = useRef<WebSocket | null>(null);
    const [connected, setConnected] = useState(false);
    const [currentLayout, setCurrentLayout] = useState<Layout | null>(null);
    const [layoutList, setLayoutList] = useState<LayoutListResponse | null>(null);

    const connect = useCallback(() => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/chat.ws`;

        console.log('[Editor] Connecting to WebSocket:', wsUrl);
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('[Editor] WebSocket connected');
            setConnected(true);
            // Request current layout and layout list
            ws.send(JSON.stringify({ request_layout: true }));
            ws.send(JSON.stringify({ request_layouts: true }));
        };

        ws.onmessage = (event) => {
            try {
                const data: WebSocketMessage = JSON.parse(event.data);
                const message = JSON.parse(data.message);

                switch (data.tag) {
                    case 'layout_update':
                        console.log('[Editor] Received layout update:', message.name);
                        setCurrentLayout(message as Layout);
                        break;
                    case 'layout_list':
                        console.log('[Editor] Received layout list:', message);
                        setLayoutList(message as LayoutListResponse);
                        break;
                    default:
                        // Ignore chat messages and other tags in editor
                        break;
                }
            } catch (e) {
                console.error('[Editor] Failed to parse message:', e);
            }
        };

        ws.onclose = () => {
            console.log('[Editor] WebSocket disconnected');
            setConnected(false);
            // Reconnect after 3 seconds
            setTimeout(connect, 3000);
        };

        ws.onerror = (err) => {
            console.error('[Editor] WebSocket error:', err);
            ws.close();
        };

        wsRef.current = ws;
    }, []);

    useEffect(() => {
        connect();
        return () => {
            if (wsRef.current) {
                wsRef.current.close();
            }
        };
    }, [connect]);

    const sendLayoutUpdate = useCallback((layout: Layout) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ layout_update: layout }));
        }
    }, []);

    const switchLayout = useCallback((name: string) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ switch_layout: name }));
        }
    }, []);

    const saveLayout = useCallback((name: string, layout: Layout) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                save_layout: { name, layout }
            }));
        }
    }, []);

    const deleteLayout = useCallback((name: string) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ delete_layout: name }));
        }
    }, []);

    const requestLayouts = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ request_layouts: true }));
        }
    }, []);

    return {
        connected,
        currentLayout,
        layoutList,
        sendLayoutUpdate,
        switchLayout,
        saveLayout,
        deleteLayout,
        requestLayouts,
    };
}
