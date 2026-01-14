/**
 * CHUCK - Chat Harvesting Universal Connection Kit
 * Platform registry and detection
 */

import { Config, WINDOW } from '../core/index.js';

// Import all platforms
import Kick from './kick.js';
import Odysee from './odysee.js';
import Rumble from './rumble.js';
import Twitch from './twitch.js';
import YouTube from './youtube.js';
import VK from './vk.js';
import X from './x.js';
import XMRChat from './xmrchat.js';

// Platform registry
const platforms = new Map();

/**
 * Register a platform class with its hostname(s)
 */
export function registerPlatform(hostname, PlatformClass) {
    platforms.set(hostname, PlatformClass);
}

/**
 * Get all registered platforms
 */
export function getPlatforms() {
    return platforms;
}

/**
 * Detect and instantiate the appropriate platform for current hostname
 */
export async function detectPlatform() {
    const hostname = window.location.hostname;
    const Platform = platforms.get(hostname);

    if (!Platform) {
        console.log(`[CHUCK] No platform detected for ${hostname}.`);
        return null;
    }

    // Check if platform is enabled in config
    const platformKey = Platform.name.toLowerCase();
    try {
        const platformConfig = await Config.get('platforms', {});
        if (platformConfig[platformKey] === false) {
            console.log(`[CHUCK] Platform ${Platform.name} is disabled in config.`);
            return null;
        }
    } catch (e) {
        // Config not available, proceed anyway
    }

    return new Platform();
}

/**
 * Initialize all platform registrations
 */
export function registerAllPlatforms() {
    // Kick
    registerPlatform('kick.com', Kick);

    // Odysee
    registerPlatform('odysee.com', Odysee);

    // Rumble
    registerPlatform('rumble.com', Rumble);

    // Twitch
    registerPlatform('twitch.tv', Twitch);

    // YouTube
    registerPlatform('youtube.com', YouTube);
    registerPlatform('www.youtube.com', YouTube);

    // VK
    registerPlatform('vk.com', VK);

    // X/Twitter
    registerPlatform('x.com', X);
    registerPlatform('twitter.com', X);

    // XMRChat
    registerPlatform('xmrchat.com', XMRChat);
}

// Export platform classes for direct use
export {
    Kick,
    Odysee,
    Rumble,
    Twitch,
    YouTube,
    VK,
    X,
    XMRChat
};
