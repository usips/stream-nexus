/**
 * Background Script - Physics donation visualization
 * 
 * Initializes the DonationMatter physics engine and connects to
 * the WebSocket for receiving donation events.
 */

import { DonationMatter, DonationMatterConfig } from './DonationMatter';

// ============================================================================
// Configuration from window.FRAME_CONFIG
// ============================================================================

// Extend Window interface for background-specific types
declare global {
    interface Window {
        donationMatter?: DonationMatter;
        spawnAmmo?: (x?: number, y?: number, username?: string) => any;
    }
}

function getDonationMatterConfig(): Partial<DonationMatterConfig> {
    const frameConfig = (window as any).FRAME_CONFIG;
    if (!frameConfig) return {};

    // Parse donation matter config from frame options
    if (frameConfig.donationMatter) {
        return frameConfig.donationMatter as Partial<DonationMatterConfig>;
    }

    return {};
}

// ============================================================================
// WebSocket Connection
// ============================================================================

class BackgroundWebSocket {
    private socket: WebSocket | null = null;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private onDonation: (amount: number, username: string) => void;

    constructor(onDonation: (amount: number, username: string) => void) {
        this.onDonation = onDonation;
        this.connect();
    }

    private connect(): void {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = protocol + '//' + window.location.host + '/chat.ws';

        console.log('[Background] Connecting to WebSocket:', wsUrl);
        this.socket = new WebSocket(wsUrl);

        this.socket.addEventListener('open', () => {
            console.log('[Background] WebSocket connected');
        });

        this.socket.addEventListener('message', (event) => {
            this.handleMessage(event.data);
        });

        this.socket.addEventListener('close', (event) => {
            console.log('[Background] WebSocket closed:', event.reason);
            this.scheduleReconnect();
        });

        this.socket.addEventListener('error', () => {
            this.socket?.close();
        });
    }

    private handleMessage(data: string): void {
        try {
            const parsed = JSON.parse(data);
            const message = JSON.parse(parsed.message);

            switch (parsed.tag) {
                case 'chat_message':
                    if (message.amount > 0) {
                        this.onDonation(message.amount, message.username);
                    }
                    break;

                case 'layout_update':
                    // Could update donation matter config here if needed
                    break;
            }
        } catch (e) {
            console.error('[Background] Failed to parse message:', e);
        }
    }

    private scheduleReconnect(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }

        this.reconnectTimer = setTimeout(() => {
            console.log('[Background] Attempting reconnect...');
            this.connect();
        }, 1000);
    }

    public destroy(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }
        this.socket?.close();
    }
}

// ============================================================================
// Main Initialization
// ============================================================================

function init(): void {
    // Get container element
    const container = document.getElementById('physics-canvas')?.parentElement || document.body;

    // Get configuration from frame config
    const config = getDonationMatterConfig();

    // Create donation matter instance
    const donationMatter = new DonationMatter(container, config);

    // Start the physics simulation
    donationMatter.start();

    // Connect to WebSocket for donation events
    new BackgroundWebSocket((amount, username) => {
        donationMatter.handleDonation(amount, username);
    });

    // Expose for debugging
    window.donationMatter = donationMatter;
    window.spawnAmmo = (x?: number, y?: number, username?: string) => {
        return donationMatter.spawnObject(x, y, username);
    };

    console.log('[Background] DonationMatter initialized');
}

// Wait for DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
