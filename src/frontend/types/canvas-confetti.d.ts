declare module 'canvas-confetti' {
    export type Shape = 'square' | 'circle' | 'star' | Record<string, unknown>;

    export interface Options {
        particleCount?: number;
        angle?: number;
        spread?: number;
        startVelocity?: number;
        decay?: number;
        gravity?: number;
        drift?: number;
        flat?: boolean;
        ticks?: number;
        origin?: { x?: number; y?: number };
        colors?: string[];
        shapes?: Shape[];
        scalar?: number;
        zIndex?: number;
        disableForReducedMotion?: boolean;
    }

    export interface GlobalOptions {
        resize?: boolean;
        useWorker?: boolean;
        disableForReducedMotion?: boolean;
    }

    export interface CreateTypes {
        (options?: Options): Promise<void> | null;
        reset(): void;
    }

    export interface ConfettiGenerator extends CreateTypes {
        create(canvas: HTMLCanvasElement, options?: GlobalOptions): CreateTypes;
    }

    const confetti: ConfettiGenerator;
    export default confetti;
}
