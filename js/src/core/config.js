/**
 * CHUCK - Chat Harvesting Universal Connection Kit
 * Configuration management with storage abstraction
 */

// Default configuration
const DEFAULTS = {
    serverUrl: 'ws://127.0.0.2:1350/chat.ws',
    debug: false,
    platforms: {
        kick: true,
        odysee: true,
        rumble: true,
        twitch: true,
        youtube: true,
        vk: true,
        x: true,
        xmrchat: true
    }
};

// Detect environment
const isExtension = typeof chrome !== 'undefined' && chrome.storage;
const isUserscript = typeof GM_getValue !== 'undefined';

/**
 * Configuration class that abstracts storage between userscript and extension
 */
export class Config {
    static _cache = null;

    /**
     * Get a configuration value
     * @param {string} key - The configuration key
     * @param {*} defaultValue - Default value if not set
     * @returns {Promise<*>}
     */
    static async get(key, defaultValue) {
        const config = await this._loadConfig();
        return config[key] ?? defaultValue ?? DEFAULTS[key];
    }

    /**
     * Set a configuration value
     * @param {string} key - The configuration key
     * @param {*} value - The value to set
     * @returns {Promise<void>}
     */
    static async set(key, value) {
        const config = await this._loadConfig();
        config[key] = value;
        await this._saveConfig(config);
    }

    /**
     * Get all configuration
     * @returns {Promise<Object>}
     */
    static async getAll() {
        return await this._loadConfig();
    }

    /**
     * Reset configuration to defaults
     * @returns {Promise<void>}
     */
    static async reset() {
        await this._saveConfig({ ...DEFAULTS });
        this._cache = null;
    }

    /**
     * Load configuration from storage
     * @private
     */
    static async _loadConfig() {
        if (this._cache) {
            return this._cache;
        }

        let config = { ...DEFAULTS };

        if (isExtension) {
            try {
                const stored = await chrome.storage.sync.get('chuck_config');
                if (stored.chuck_config) {
                    config = { ...DEFAULTS, ...stored.chuck_config };
                }
            } catch (e) {
                console.warn('[CHUCK] Failed to load extension config:', e);
            }
        } else if (isUserscript) {
            try {
                const stored = GM_getValue('chuck_config');
                if (stored) {
                    config = { ...DEFAULTS, ...JSON.parse(stored) };
                }
            } catch (e) {
                console.warn('[CHUCK] Failed to load userscript config:', e);
            }
        }

        this._cache = config;
        return config;
    }

    /**
     * Save configuration to storage
     * @private
     */
    static async _saveConfig(config) {
        this._cache = config;

        if (isExtension) {
            try {
                await chrome.storage.sync.set({ chuck_config: config });
            } catch (e) {
                console.warn('[CHUCK] Failed to save extension config:', e);
            }
        } else if (isUserscript) {
            try {
                GM_setValue('chuck_config', JSON.stringify(config));
            } catch (e) {
                console.warn('[CHUCK] Failed to save userscript config:', e);
            }
        }
    }
}

// Export defaults for reference
export { DEFAULTS };
