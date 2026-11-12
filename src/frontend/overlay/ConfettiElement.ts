import confetti, { CreateTypes, Options as CanvasConfettiOptions } from 'canvas-confetti';
import type { ConfettiOptions, ConfettiShape } from '../types';

const DEFAULT_COLORS = [
    '#26ccff',
    '#a25afd',
    '#ff5e7e',
    '#88ff5a',
    '#fcff42',
    '#ffa62d',
    '#ff36ff',
];

const DEFAULT_SHAPES: ConfettiShape[] = ['square', 'circle'];
const MAX_PRECIPITATION_EMITTERS = 100;

const DEFAULT_OPTIONS: Required<ConfettiOptions> = {
    spawnMode: 'random',
    triggerMode: 'timer',
    timerMinSeconds: 5,
    timerMaxSeconds: 15,
    eventSpacingSeconds: 1,
    particleCount: 50,
    angle: 90,
    spread: 45,
    startVelocity: 45,
    decay: 0.9,
    gravity: 1,
    drift: 0,
    flat: false,
    ticks: 200,
    colors: DEFAULT_COLORS,
    shapes: DEFAULT_SHAPES,
    scalar: 1,
    zIndex: 100,
    resize: true,
    useWorker: false,
    disableForReducedMotion: false,
};

function numberOption(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeOptions(options: Partial<ConfettiOptions>): Required<ConfettiOptions> {
    const colors = Array.isArray(options.colors)
        ? options.colors.filter((color): color is string =>
            typeof color === 'string' && /^#?(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color.trim()))
        : [];
    const shapes = Array.isArray(options.shapes)
        ? options.shapes.filter((shape): shape is ConfettiShape =>
            shape === 'square' || shape === 'circle' || shape === 'star')
        : [];

    return {
        spawnMode: options.spawnMode === 'precipitation' ? 'precipitation' : 'random',
        triggerMode: options.triggerMode === 'event' ? 'event' : 'timer',
        timerMinSeconds: Math.max(0.1, numberOption(options.timerMinSeconds, DEFAULT_OPTIONS.timerMinSeconds)),
        timerMaxSeconds: Math.max(0.1, numberOption(options.timerMaxSeconds, DEFAULT_OPTIONS.timerMaxSeconds)),
        eventSpacingSeconds: Math.max(0.05, numberOption(options.eventSpacingSeconds, DEFAULT_OPTIONS.eventSpacingSeconds)),
        particleCount: Math.max(0, Math.round(numberOption(options.particleCount, DEFAULT_OPTIONS.particleCount))),
        angle: numberOption(options.angle, DEFAULT_OPTIONS.angle),
        spread: Math.max(0, numberOption(options.spread, DEFAULT_OPTIONS.spread)),
        startVelocity: numberOption(options.startVelocity, DEFAULT_OPTIONS.startVelocity),
        decay: numberOption(options.decay, DEFAULT_OPTIONS.decay),
        gravity: numberOption(options.gravity, DEFAULT_OPTIONS.gravity),
        drift: numberOption(options.drift, DEFAULT_OPTIONS.drift),
        flat: options.flat === true,
        ticks: Math.max(0, Math.round(numberOption(options.ticks, DEFAULT_OPTIONS.ticks))),
        colors: colors.length > 0 ? colors : [...DEFAULT_COLORS],
        shapes: shapes.length > 0 ? shapes : [...DEFAULT_SHAPES],
        scalar: Math.max(0, numberOption(options.scalar, DEFAULT_OPTIONS.scalar)),
        zIndex: Math.round(numberOption(options.zIndex, DEFAULT_OPTIONS.zIndex)),
        resize: options.resize !== false,
        useWorker: options.useWorker === true,
        disableForReducedMotion: options.disableForReducedMotion === true,
    };
}

/** Runs one independently configured canvas-confetti instance on a layout-owned canvas. */
export class ConfettiElement {
    private canvas: HTMLCanvasElement;
    private fire: CreateTypes | null = null;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private resizeObserver: ResizeObserver | null = null;
    private canvasWidth = 0;
    private canvasHeight = 0;
    private options: Required<ConfettiOptions> = { ...DEFAULT_OPTIONS };
    private serializedOptions = '';
    private lastEventAt = Number.NEGATIVE_INFINITY;

    constructor(canvas: HTMLCanvasElement, options: Partial<ConfettiOptions>) {
        this.canvas = canvas;
        this.prepareCanvas();

        if (typeof ResizeObserver !== 'undefined') {
            this.resizeObserver = new ResizeObserver((entries) => {
                const entry = entries[0];
                if (!entry || !this.options.resize) return;

                const { width, height } = entry.contentRect;
                if (width === this.canvasWidth && height === this.canvasHeight) return;

                this.replaceCanvas();
                this.createLauncher();
            });
            this.resizeObserver.observe(canvas);
        }
        this.updateConfig(options);
    }

    updateConfig(options: Partial<ConfettiOptions>): void {
        const normalized = normalizeOptions(options);
        const serialized = JSON.stringify(normalized);
        if (serialized === this.serializedOptions) return;

        this.stopTimer();
        if (this.fire) {
            // canvas-confetti instances should not be reinitialized on the same
            // canvas, and worker-backed canvases cannot be reclaimed. Replace the
            // layout canvas while retaining its unique ID and layout styles.
            this.replaceCanvas();
        }
        this.options = normalized;
        this.serializedOptions = serialized;
        this.lastEventAt = Number.NEGATIVE_INFINITY;
        this.createLauncher();

        if (this.options.triggerMode === 'timer') {
            this.scheduleTimer();
        }
    }

    handleChatMessage(): void {
        if (this.options.triggerMode !== 'event') return;

        const now = performance.now();
        const spacingMs = this.options.eventSpacingSeconds * 1000;
        if (now - this.lastEventAt < spacingMs) return;

        this.lastEventAt = now;
        this.launch();
    }

    destroy(): void {
        this.stopTimer();
        this.fire?.reset();
        this.fire = null;
        this.resizeObserver?.disconnect();
        this.resizeObserver = null;
        this.serializedOptions = '';
    }

    private prepareCanvas(): void {
        this.canvas.classList.add('confetti-canvas');
        this.canvas.setAttribute('aria-hidden', 'true');
        const bounds = this.canvas.getBoundingClientRect();
        this.canvasWidth = bounds.width;
        this.canvasHeight = bounds.height;
    }

    private createLauncher(): void {
        this.prepareCanvas();
        this.fire = confetti.create(this.canvas, {
            resize: this.options.resize,
            useWorker: this.options.useWorker,
            disableForReducedMotion: this.options.disableForReducedMotion,
        });
    }

    private scheduleTimer(): void {
        const minSeconds = Math.min(this.options.timerMinSeconds, this.options.timerMaxSeconds);
        const maxSeconds = Math.max(this.options.timerMinSeconds, this.options.timerMaxSeconds);
        const delayMs = (minSeconds + Math.random() * (maxSeconds - minSeconds)) * 1000;

        this.timer = setTimeout(() => {
            this.timer = null;
            this.launch();
            if (this.options.triggerMode === 'timer') this.scheduleTimer();
        }, delayMs);
    }

    private launch(): void {
        if (!this.fire) return;

        const launchOptions: CanvasConfettiOptions = {
            particleCount: this.options.particleCount,
            angle: this.options.angle,
            spread: this.options.spread,
            startVelocity: this.options.startVelocity,
            decay: this.options.decay,
            gravity: this.options.gravity,
            drift: this.options.drift,
            flat: this.options.flat,
            ticks: this.options.ticks,
            colors: this.options.colors,
            shapes: this.options.shapes,
            scalar: this.options.scalar,
            zIndex: this.options.zIndex,
            disableForReducedMotion: this.options.disableForReducedMotion,
        };

        if (this.options.spawnMode === 'precipitation') {
            this.launchPrecipitation(launchOptions);
            return;
        }

        this.fire({
            ...launchOptions,
            origin: { x: Math.random(), y: Math.random() },
        });
    }

    private launchPrecipitation(launchOptions: CanvasConfettiOptions): void {
        if (!this.fire || this.options.particleCount === 0) return;

        // Split the top edge into narrow segments and choose one random origin
        // inside each. With normal particle counts this gives every particle its
        // own point along the border, creating a rain-like curtain instead of a
        // burst from one random location. Cap the number of calls for unusually
        // large particle counts, distributing the remainder between emitters.
        const emitterCount = Math.min(this.options.particleCount, MAX_PRECIPITATION_EMITTERS);
        const particlesPerEmitter = Math.floor(this.options.particleCount / emitterCount);
        const remainder = this.options.particleCount % emitterCount;

        for (let index = 0; index < emitterCount; index += 1) {
            const particleCount = particlesPerEmitter + (index < remainder ? 1 : 0);
            const x = (index + Math.random()) / emitterCount;
            this.fire({
                ...launchOptions,
                particleCount,
                origin: { x, y: 0 },
            });
        }
    }

    private stopTimer(): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    private replaceCanvas(): void {
        const previousCanvas = this.canvas;
        this.fire?.reset();
        this.fire = null;

        const replacement = previousCanvas.cloneNode(false) as HTMLCanvasElement;
        // Do not carry over the old backing-buffer size. canvas-confetti will
        // measure the editor-defined CSS box when the next burst begins.
        replacement.removeAttribute('width');
        replacement.removeAttribute('height');

        this.resizeObserver?.unobserve(previousCanvas);
        previousCanvas.replaceWith(replacement);
        this.canvas = replacement;
        this.prepareCanvas();
        this.resizeObserver?.observe(replacement);
    }
}
