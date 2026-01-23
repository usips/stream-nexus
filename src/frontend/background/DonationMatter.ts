/**
 * DonationMatter - Physics-based donation visualization using Matter.js
 *
 * This module creates a full-screen physics simulation where donations
 * spawn physical objects (ammo rounds) that fall and settle at the bottom.
 *
 * Performance optimizations:
 * - Object pooling to reduce GC pressure
 * - Pre-computed vertices
 * - Adaptive physics iterations based on object count
 * - Frame-skipped boundary checks
 * - Optimized label rendering with caching
 * - Spawn queue instead of individual setTimeout calls
 */

// Matter.js is loaded as an external via script tag
declare const Matter: typeof import('matter-js');

// ============================================================================
// Types and Configuration
// ============================================================================

export interface DonationMatterConfig {
    // Object appearance
    objectType: 'ammo' | 'coin' | 'custom';
    objectScale: number;
    objectSprites: string[];         // Array of sprite paths (random selection)

    // Physics properties
    restitution: number;             // Bounciness (0-1)
    friction: number;                // Surface friction (0-1)
    frictionAir: number;             // Air resistance (0-0.1)
    density: number;                 // Mass per unit area

    // Label display
    showLabels: boolean;
    labelColor: string;
    labelFont: string;
    labelSize: number;

    // Spawn behavior
    spawnRate: number;               // Objects per dollar
    spawnDelay: number;              // Delay between spawns (ms)
    maxObjects: number;              // Maximum objects before cleanup

    // Renderer options
    showAngleIndicator: boolean;
    wireframes: boolean;
    fps: number;                     // Target FPS (actually enforced now)
}

export interface SpawnedObject {
    body: Matter.Body;
    username?: string;
    active: boolean;                 // For object pooling
}

interface SpawnRequest {
    x?: number;
    y?: number;
    username?: string;
    scheduledTime: number;
}

// Default configuration values
export const DEFAULT_DONATION_MATTER_CONFIG: DonationMatterConfig = {
    objectType: 'ammo',
    objectScale: 0.1,
    objectSprites: [
        '/static/img/ammo_556_round_a.png',
        '/static/img/ammo_556_round_b.png',
        '/static/img/ammo_556_round_c.png',
        '/static/img/ammo_556_round_d.png',
    ],

    restitution: 0.05,           // Lower bounce for more stable stacking
    friction: 0.9,               // Higher friction to prevent sliding
    frictionAir: 0.01,           // Lower air resistance
    density: 0.002,              // Lower density for proper mass with larger collision body

    showLabels: false,           // Disabled by default for performance
    labelColor: '#ffff00',
    labelFont: 'Verlag',
    labelSize: 12,

    spawnRate: 2,      // 2 objects per dollar
    spawnDelay: 50,    // 50ms between spawns
    maxObjects: 500,   // Max 500 objects

    showAngleIndicator: false,   // Disabled by default
    wireframes: false,
    fps: 60,                     // Target 60 FPS
};

// ============================================================================
// DonationMatter Class
// ============================================================================

export class DonationMatter {
    private engine: Matter.Engine;
    private render: Matter.Render;
    private runner: Matter.Runner;
    private world: Matter.World;

    private bottomWall: Matter.Body;
    private leftWall: Matter.Body;
    private rightWall: Matter.Body;

    private viewportWidth: number;
    private viewportHeight: number;

    private config: DonationMatterConfig;
    private objects: SpawnedObject[] = [];
    private objectPool: SpawnedObject[] = [];  // Pool of inactive objects for reuse
    private isRunning: boolean = false;

    // Pre-computed vertices for object creation
    private precomputedVertices: Matter.Vector[] | null = null;

    // Cached font string for label rendering
    private cachedFontString: string = '';

    // Frame counter for skipping boundary checks
    private frameCount: number = 0;
    private readonly BOUNDARY_CHECK_INTERVAL = 5;  // Check every 5 frames

    // Label rendering frame skip
    private labelFrameCount: number = 0;
    private readonly LABEL_RENDER_INTERVAL = 3;  // Render labels every 3 frames

    // Spawn queue for batched spawning
    private spawnQueue: SpawnRequest[] = [];
    private spawnQueueTimerId: number | null = null;

    // Bound event handlers (stored for proper cleanup)
    private boundHandleResize: () => void;
    private boundAfterUpdate: () => void;
    private boundAfterRender: () => void;

    constructor(
        container: HTMLElement,
        config: Partial<DonationMatterConfig> = {}
    ) {
        this.config = { ...DEFAULT_DONATION_MATTER_CONFIG, ...config };
        this.viewportWidth = window.innerWidth;
        this.viewportHeight = window.innerHeight;

        // Pre-compute vertices once
        this.precomputeVertices();

        // Cache font string
        this.updateCachedFont();

        // Bind event handlers once (store references for cleanup)
        this.boundHandleResize = this.handleResize.bind(this);
        this.boundAfterUpdate = this.onAfterUpdate.bind(this);
        this.boundAfterRender = this.onAfterRender.bind(this);

        // Prevent scrolling
        document.body.style.overflow = 'hidden';
        document.body.style.margin = '0';
        document.body.style.padding = '0';

        // Create engine with adaptive collision settings
        this.engine = Matter.Engine.create({
            enableSleeping: true,
            // Start with moderate iterations, will adapt based on object count
            positionIterations: 6,
            velocityIterations: 4,
            constraintIterations: 2,
        });
        this.world = this.engine.world;

        // Configure gravity (slightly reduced to prevent compression at bottom)
        this.engine.gravity.y = 0.8;

        // Create renderer
        this.render = Matter.Render.create({
            element: container,
            engine: this.engine,
            options: {
                width: this.viewportWidth,
                height: this.viewportHeight,
                showAngleIndicator: this.config.showAngleIndicator,
                showBounds: false,
                showSleeping: false,
                wireframes: this.config.wireframes,
                background: 'transparent',
            } as Matter.IRendererOptions,
        });

        // Create runner with target FPS
        this.runner = Matter.Runner.create({
            delta: 1000 / this.config.fps,
        });

        // Create invisible boundary walls
        this.bottomWall = Matter.Bodies.rectangle(
            this.viewportWidth / 2,
            this.viewportHeight + 25,
            this.viewportWidth,
            50,
            { isStatic: true, render: { visible: false } }
        );

        this.leftWall = Matter.Bodies.rectangle(
            -25,
            this.viewportHeight / 2,
            50,
            this.viewportHeight * 2,
            { isStatic: true, render: { visible: false } }
        );

        this.rightWall = Matter.Bodies.rectangle(
            this.viewportWidth + 25,
            this.viewportHeight / 2,
            50,
            this.viewportHeight * 2,
            { isStatic: true, render: { visible: false } }
        );

        Matter.Composite.add(this.world, [
            this.bottomWall,
            this.leftWall,
            this.rightWall,
        ]);

        // Add mouse control
        const mouse = Matter.Mouse.create(this.render.canvas);
        const mouseConstraint = Matter.MouseConstraint.create(this.engine, {
            mouse: mouse,
            constraint: {
                stiffness: 0.2,
                render: { visible: false },
            },
        });

        Matter.Composite.add(this.world, mouseConstraint);
        this.render.mouse = mouse;

        // Set up event handlers
        this.setupEventHandlers();

        // Set up resize handler with stored reference
        window.addEventListener('resize', this.boundHandleResize);
    }

    /**
     * Pre-compute vertices for ammo shape (called once at init)
     */
    private precomputeVertices(): void {
        // Vertices for ammo shape matching actual sprite proportions (~170x980 pixels)
        const vertexPath = [
            '85 0', '105 120', '115 200', '115 780', '105 800',
            '125 850', '125 980', '45 980', '45 850', '65 800',
            '55 780', '55 200', '65 120'
        ].join(' ');

        this.precomputedVertices = Matter.Vertices.fromPath(vertexPath, undefined as any);

        // Pre-scale the vertices
        const scale = this.config.objectScale;
        const center = Matter.Vertices.centre(this.precomputedVertices);
        this.precomputedVertices = this.precomputedVertices.map(v => ({
            x: (v.x - center.x) * scale,
            y: (v.y - center.y) * scale
        }));
    }

    /**
     * Update cached font string
     */
    private updateCachedFont(): void {
        this.cachedFontString = `${this.config.labelSize}px ${this.config.labelFont}`;
    }

    /**
     * Set up Matter.js event handlers
     */
    private setupEventHandlers(): void {
        Matter.Events.on(this.engine, 'afterUpdate', this.boundAfterUpdate);
        Matter.Events.on(this.render, 'afterRender', this.boundAfterRender);
    }

    /**
     * After update handler - boundary checking with frame skipping
     */
    private onAfterUpdate(): void {
        this.frameCount++;

        // Adapt physics iterations based on object count
        this.adaptPhysicsIterations();

        // Only check boundaries every N frames
        if (this.frameCount % this.BOUNDARY_CHECK_INTERVAL === 0) {
            this.checkBoundaries();
        }

        // Cleanup excess objects (cheap check)
        if (this.objects.length > this.config.maxObjects) {
            this.cleanupExcessObjects();
        }
    }

    /**
     * After render handler - optimized label rendering
     */
    private onAfterRender(): void {
        if (!this.config.showLabels) return;

        this.labelFrameCount++;

        // Only render labels every N frames for performance
        if (this.labelFrameCount % this.LABEL_RENDER_INTERVAL === 0) {
            this.renderLabels();
        }
    }

    /**
     * Adapt physics iterations based on object count for performance
     */
    private adaptPhysicsIterations(): void {
        const count = this.objects.length;

        // Reduce iterations as object count increases
        if (count > 400) {
            this.engine.positionIterations = 4;
            this.engine.velocityIterations = 2;
            this.engine.constraintIterations = 1;
        } else if (count > 200) {
            this.engine.positionIterations = 6;
            this.engine.velocityIterations = 4;
            this.engine.constraintIterations = 2;
        } else {
            // Default/low object count - higher quality
            this.engine.positionIterations = 8;
            this.engine.velocityIterations = 6;
            this.engine.constraintIterations = 3;
        }
    }

    /**
     * Check and correct objects that go out of bounds (optimized)
     */
    private checkBoundaries(): void {
        // Only check active (non-sleeping, non-static) bodies
        for (const obj of this.objects) {
            if (!obj.active) continue;

            const body = obj.body;
            if (body.isStatic || body.isSleeping) continue;

            let outOfBounds = false;
            const newPosition = { x: body.position.x, y: body.position.y };

            if (body.position.x < 0) {
                newPosition.x = 50;
                outOfBounds = true;
            } else if (body.position.x > this.viewportWidth) {
                newPosition.x = this.viewportWidth - 50;
                outOfBounds = true;
            }

            if (body.position.y > this.viewportHeight + 100) {
                newPosition.y = this.viewportHeight - 50;
                outOfBounds = true;
            }

            if (outOfBounds) {
                Matter.Body.setVelocity(body, { x: 0, y: 0 });
                Matter.Body.setAngularVelocity(body, 0);
                Matter.Body.setPosition(body, newPosition);
            }
        }
    }

    /**
     * Remove oldest objects if we exceed maxObjects (optimized with pooling)
     */
    private cleanupExcessObjects(): void {
        const excess = this.objects.length - this.config.maxObjects;
        if (excess <= 0) return;

        // Find oldest active objects and deactivate them
        let removed = 0;
        for (let i = 0; i < this.objects.length && removed < excess; i++) {
            const obj = this.objects[i];
            if (obj.active) {
                this.deactivateObject(obj);
                removed++;
            }
        }

        // Remove deactivated objects from the active list
        this.objects = this.objects.filter(obj => obj.active);
    }

    /**
     * Deactivate an object and return it to the pool
     */
    private deactivateObject(obj: SpawnedObject): void {
        obj.active = false;
        Matter.Composite.remove(this.world, obj.body);

        // Add to pool for reuse (limit pool size)
        if (this.objectPool.length < 100) {
            this.objectPool.push(obj);
        }
    }

    /**
     * Get an object from the pool or create a new one
     */
    private getPooledObject(x: number, y: number, username?: string): SpawnedObject {
        let obj = this.objectPool.pop();

        if (obj) {
            // Reuse pooled object
            this.resetBody(obj.body, x, y, username);
            obj.username = username;
            obj.active = true;
            Matter.Composite.add(this.world, obj.body);
        } else {
            // Create new object
            const body = this.createBody(x, y, username);
            obj = { body, username, active: true };
            Matter.Composite.add(this.world, body);
        }

        return obj;
    }

    /**
     * Create a new physics body
     */
    private createBody(x: number, y: number, username?: string): Matter.Body {
        // Clone pre-computed vertices
        const vertices = this.precomputedVertices!.map(v => ({ x: v.x, y: v.y }));

        // Random sprite selection
        const sprite = this.config.objectSprites[
            Math.floor(Math.random() * this.config.objectSprites.length)
        ];

        // Create body from vertices (no double-scaling - vertices are pre-scaled)
        const body = Matter.Bodies.fromVertices(x, y, [vertices], {
            render: {
                sprite: {
                    texture: sprite,
                    xScale: this.config.objectScale,
                    yScale: this.config.objectScale,
                },
            },
            restitution: this.config.restitution,
            friction: this.config.friction,
            frictionAir: this.config.frictionAir,
            density: this.config.density,
            slop: 0.01,
            frictionStatic: 0.9,
        });

        // Add label if username provided
        if (username && this.config.showLabels) {
            (body as any).label = {
                text: username,
                color: this.config.labelColor,
            };
        }

        // Random initial rotation
        Matter.Body.setAngle(body, Math.random() * Math.PI * 2);

        return body;
    }

    /**
     * Reset an existing body for reuse
     */
    private resetBody(body: Matter.Body, x: number, y: number, username?: string): void {
        Matter.Body.setPosition(body, { x, y });
        Matter.Body.setVelocity(body, { x: 0, y: 0 });
        Matter.Body.setAngularVelocity(body, 0);
        Matter.Body.setAngle(body, Math.random() * Math.PI * 2);

        // Wake up if sleeping
        if (body.isSleeping) {
            Matter.Sleeping.set(body, false);
        }

        // Update label
        if (username && this.config.showLabels) {
            (body as any).label = {
                text: username,
                color: this.config.labelColor,
            };
        } else {
            (body as any).label = null;
        }

        // Random sprite on reuse
        const sprite = this.config.objectSprites[
            Math.floor(Math.random() * this.config.objectSprites.length)
        ];
        if (body.render.sprite) {
            body.render.sprite.texture = sprite;
        }
    }

    /**
     * Render username labels on objects (optimized)
     */
    private renderLabels(): void {
        const ctx = this.render.canvas.getContext('2d');
        if (!ctx) return;

        // Set font once (cached)
        ctx.font = this.cachedFontString;
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';

        for (const obj of this.objects) {
            if (!obj.active) continue;

            const body = obj.body;
            const label = (body as any).label;

            if (label?.text && !body.isStatic) {
                ctx.save();

                ctx.translate(body.position.x, body.position.y);
                ctx.rotate(body.angle + Math.PI / 2);

                ctx.fillStyle = label.color || this.config.labelColor;
                ctx.strokeText(label.text, 10, 6);
                ctx.fillText(label.text, 10, 6);

                ctx.restore();
            }
        }
    }

    /**
     * Handle window resize
     */
    private handleResize(): void {
        const newWidth = window.innerWidth;
        const newHeight = window.innerHeight;

        // Update canvas dimensions
        this.render.canvas.width = newWidth;
        this.render.canvas.height = newHeight;
        (this.render.options as any).width = newWidth;
        (this.render.options as any).height = newHeight;

        // Update viewport
        Matter.Render.lookAt(this.render, {
            min: { x: 0, y: 0 },
            max: { x: newWidth, y: newHeight },
        });

        // Update boundary walls
        Matter.Body.setPosition(this.bottomWall, {
            x: newWidth / 2,
            y: newHeight + 25,
        });
        Matter.Body.scale(
            this.bottomWall,
            newWidth / (this.bottomWall.bounds.max.x - this.bottomWall.bounds.min.x),
            1
        );

        Matter.Body.setPosition(this.leftWall, { x: -25, y: newHeight / 2 });
        Matter.Body.scale(
            this.leftWall,
            1,
            (newHeight * 2) / (this.leftWall.bounds.max.y - this.leftWall.bounds.min.y)
        );

        Matter.Body.setPosition(this.rightWall, { x: newWidth + 25, y: newHeight / 2 });
        Matter.Body.scale(
            this.rightWall,
            1,
            (newHeight * 2) / (this.rightWall.bounds.max.y - this.rightWall.bounds.min.y)
        );

        // Wake up sleeping objects near edges and push into bounds
        for (const obj of this.objects) {
            if (!obj.active) continue;

            const body = obj.body;
            if (body.isStatic) continue;

            const newPosition = { x: body.position.x, y: body.position.y };
            let moved = false;

            if (body.position.x > newWidth) {
                newPosition.x = newWidth - 50;
                moved = true;
            }
            if (body.position.x < 0) {
                newPosition.x = 50;
                moved = true;
            }
            if (body.position.y > newHeight) {
                newPosition.y = newHeight - 50;
                moved = true;
            }

            if (moved) {
                Matter.Body.setPosition(body, newPosition);
                Matter.Body.setVelocity(body, { x: 0, y: 0 });
                if (body.isSleeping) {
                    Matter.Sleeping.set(body, false);
                }
            }
        }

        this.viewportWidth = newWidth;
        this.viewportHeight = newHeight;
    }

    /**
     * Start the physics simulation
     */
    public start(): void {
        if (this.isRunning) return;

        Matter.Render.run(this.render);
        Matter.Runner.run(this.runner, this.engine);

        // Fit viewport to scene
        Matter.Render.lookAt(this.render, {
            min: { x: 0, y: 0 },
            max: { x: this.viewportWidth, y: this.viewportHeight },
        });

        // Start spawn queue processor
        this.startSpawnQueue();

        this.isRunning = true;
    }

    /**
     * Stop the physics simulation
     */
    public stop(): void {
        if (!this.isRunning) return;

        Matter.Render.stop(this.render);
        Matter.Runner.stop(this.runner);

        // Stop spawn queue processor
        this.stopSpawnQueue();

        this.isRunning = false;
    }

    /**
     * Start the spawn queue processor
     */
    private startSpawnQueue(): void {
        if (this.spawnQueueTimerId !== null) return;

        const processQueue = () => {
            const now = Date.now();

            // Process all spawn requests that are due
            while (this.spawnQueue.length > 0 && this.spawnQueue[0].scheduledTime <= now) {
                const request = this.spawnQueue.shift()!;
                this.spawnObjectImmediate(request.x, request.y, request.username);
            }

            this.spawnQueueTimerId = requestAnimationFrame(processQueue) as unknown as number;
        };

        this.spawnQueueTimerId = requestAnimationFrame(processQueue) as unknown as number;
    }

    /**
     * Stop the spawn queue processor
     */
    private stopSpawnQueue(): void {
        if (this.spawnQueueTimerId !== null) {
            cancelAnimationFrame(this.spawnQueueTimerId);
            this.spawnQueueTimerId = null;
        }
    }

    /**
     * Spawn a single object immediately (internal)
     */
    private spawnObjectImmediate(x?: number, y?: number, username?: string): Matter.Body {
        // Default spawn position
        if (y === undefined) {
            y = -100;
        }

        if (x === undefined) {
            const centerX = this.viewportWidth / 2;
            const amplitude = this.viewportWidth / 2.5;
            const randomFactor = Math.random() * 2 - 1;
            x = centerX + (amplitude * randomFactor * randomFactor * (randomFactor < 0 ? -1 : 1));
        }

        const obj = this.getPooledObject(x, y, username);
        this.objects.push(obj);

        return obj.body;
    }

    /**
     * Spawn a single object at the specified position (public API)
     */
    public spawnObject(x?: number, y?: number, username?: string): void {
        // Add to spawn queue for immediate processing
        this.spawnQueue.push({
            x, y, username,
            scheduledTime: Date.now()
        });
    }

    /**
     * Handle a donation by spawning multiple objects (uses spawn queue)
     */
    public handleDonation(amount: number, username?: string): void {
        const objectCount = Math.floor(amount * this.config.spawnRate);
        const now = Date.now();

        // Add all spawn requests to queue at once
        for (let i = 0; i < objectCount; i++) {
            this.spawnQueue.push({
                x: undefined,
                y: undefined,
                username,
                scheduledTime: now + (i * this.config.spawnDelay)
            });
        }
    }

    /**
     * Update configuration
     */
    public updateConfig(newConfig: Partial<DonationMatterConfig>): void {
        this.config = { ...this.config, ...newConfig };

        // Update cached values
        this.updateCachedFont();

        // Re-precompute vertices if scale changed
        if (newConfig.objectScale !== undefined) {
            this.precomputeVertices();
        }
    }

    /**
     * Get the current configuration
     */
    public getConfig(): DonationMatterConfig {
        return { ...this.config };
    }

    /**
     * Clear all spawned objects
     */
    public clear(): void {
        for (const obj of this.objects) {
            if (obj.active) {
                Matter.Composite.remove(this.world, obj.body);
            }
        }
        this.objects = [];
        this.objectPool = [];
        this.spawnQueue = [];
    }

    /**
     * Get the canvas element
     */
    public getCanvas(): HTMLCanvasElement {
        return this.render.canvas;
    }

    /**
     * Get current object count (for monitoring)
     */
    public getObjectCount(): number {
        return this.objects.filter(o => o.active).length;
    }

    /**
     * Get pool size (for monitoring)
     */
    public getPoolSize(): number {
        return this.objectPool.length;
    }

    /**
     * Destroy the instance and clean up resources
     */
    public destroy(): void {
        this.stop();
        this.clear();

        // Remove event listeners using stored references
        window.removeEventListener('resize', this.boundHandleResize);
        Matter.Events.off(this.engine, 'afterUpdate', this.boundAfterUpdate);
        Matter.Events.off(this.render, 'afterRender', this.boundAfterRender);

        if (this.render.canvas.parentNode) {
            this.render.canvas.parentNode.removeChild(this.render.canvas);
        }

        Matter.Engine.clear(this.engine);
    }
}

// Export for CommonJS/Node
export default DonationMatter;
