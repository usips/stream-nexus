/**
 * CHUCK - Chat Harvesting Universal Connection Kit
 * Userscript entry point
 */

import { WINDOW } from './core/index.js';
import { registerAllPlatforms, detectPlatform } from './platforms/index.js';

(async function() {
    'use strict';

    // Register all platform handlers
    registerAllPlatforms();

    // Detect and initialize the appropriate platform
    const platform = await detectPlatform();

    // Store reference in window for debugging
    WINDOW.CHUCK = platform;
})();
