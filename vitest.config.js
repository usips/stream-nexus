import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'jsdom',
        include: ['js/test/**/*.test.js'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            include: ['js/src/**/*.js'],
        },
        globals: true,
    },
    resolve: {
        alias: {
            '@core': '/js/src/core',
            '@platforms': '/js/src/platforms',
        },
    },
});
