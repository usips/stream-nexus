/**
 * DonationMatter - Physics-based donation visualization using Matter.js
 * 
 * This module creates a full-screen physics simulation where donations
 * spawn physical objects (ammo rounds) that fall and settle at the bottom.
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
    fps: number;
}

export interface SpawnedObject {
    body: Matter.Body;
    username?: string;
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

    showLabels: true,
    labelColor: '#ffff00',
    labelFont: 'Verlag',
    labelSize: 12,

    spawnRate: 2,      // 2 objects per dollar
    spawnDelay: 50,    // 50ms between spawns
    maxObjects: 500,   // Max 500 objects

    showAngleIndicator: true,
    wireframes: false,
    fps: 24,
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
    private isRunning: boolean = false;

    constructor(
        container: HTMLElement,
        config: Partial<DonationMatterConfig> = {}
    ) {
        this.config = { ...DEFAULT_DONATION_MATTER_CONFIG, ...config };
        this.viewportWidth = window.innerWidth;
        this.viewportHeight = window.innerHeight;

        // Prevent scrolling
        document.body.style.overflow = 'hidden';
        document.body.style.margin = '0';
        document.body.style.padding = '0';

        // Create engine with improved collision settings
        this.engine = Matter.Engine.create({
            enableSleeping: true,
            positionIterations: 10,        // More iterations = more accurate collision resolution (default: 6)
            velocityIterations: 8,         // More iterations = better velocity solving (default: 4)
            constraintIterations: 4,       // Constraint solving iterations (default: 2)
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

        // Create runner
        this.runner = Matter.Runner.create();

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

        // Set up resize handler
        window.addEventListener('resize', this.handleResize.bind(this));
    }

    /**
     * Set up Matter.js event handlers
     */
    private setupEventHandlers(): void {
        // Boundary checking after each update
        Matter.Events.on(this.engine, 'afterUpdate', () => {
            this.checkBoundaries();
            this.cleanupExcessObjects();
        });

        // Custom label rendering after each frame
        Matter.Events.on(this.render, 'afterRender', () => {
            if (this.config.showLabels) {
                this.renderLabels();
            }
        });
    }

    /**
     * Check and correct objects that go out of bounds
     */
    private checkBoundaries(): void {
        const allBodies = Matter.Composite.allBodies(this.world);

        for (const body of allBodies) {
            if (body.isStatic) continue;

            let outOfBounds = false;
            const newPosition = { x: body.position.x, y: body.position.y };

            if (body.position.x < 0) {
                newPosition.x = 50;
                outOfBounds = true;
            } else if (body.position.x > this.viewportWidth) {
                newPosition.x = this.viewportWidth - 50;
                outOfBounds = true;
            }

            if (body.position.y > this.viewportHeight) {
                newPosition.y = this.viewportHeight - 50;
                outOfBounds = true;
            }

            if (outOfBounds) {
                Matter.Body.setVelocity(body, { x: 0, y: 0 });
                Matter.Body.setAngularVelocity(body, 0);
                Matter.Body.setPosition(body, newPosition);

                if (body.isSleeping) {
                    Matter.Sleeping.set(body, false);
                }
            }
        }
    }

    /**
     * Remove oldest objects if we exceed maxObjects
     */
    private cleanupExcessObjects(): void {
        while (this.objects.length > this.config.maxObjects) {
            const oldest = this.objects.shift();
            if (oldest) {
                Matter.Composite.remove(this.world, oldest.body);
            }
        }
    }

    /**
     * Render username labels on objects
     */
    private renderLabels(): void {
        const ctx = this.render.canvas.getContext('2d');
        if (!ctx) return;

        const allBodies = Matter.Composite.allBodies(this.world);

        for (const body of allBodies) {
            const label = (body as any).label;
            if (label?.text && !body.isStatic) {
                ctx.save();

                const x = body.position.x;
                const y = body.position.y;

                ctx.translate(x, y);
                ctx.rotate(body.angle + Math.PI / 2);

                ctx.font = `${this.config.labelSize}px ${this.config.labelFont}`;
                ctx.fillStyle = label.color || this.config.labelColor;
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 2;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';

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

        // Wake up all sleeping objects
        const allBodies = Matter.Composite.allBodies(this.world);
        for (const body of allBodies) {
            if (body.isSleeping && !body.isStatic) {
                Matter.Sleeping.set(body, false);
            }

            // Push back into bounds if needed
            if (!body.isStatic) {
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

        this.isRunning = true;
    }

    /**
     * Stop the physics simulation
     */
    public stop(): void {
        if (!this.isRunning) return;

        Matter.Render.stop(this.render);
        Matter.Runner.stop(this.runner);

        this.isRunning = false;
    }

    /**
     * Spawn a single object at the specified position
     */
    public spawnObject(x?: number, y?: number, username?: string): Matter.Body {
        // Default spawn position
        if (y === undefined) {
            y = -100; // Above visible area
        }

        if (x === undefined) {
            // Generate a position on x in a parabolic curve
            const centerX = this.viewportWidth / 2;
            const amplitude = this.viewportWidth / 2.5;
            const randomFactor = Math.random() * 2 - 1; // -1 to 1
            x = centerX + (amplitude * randomFactor * randomFactor * (randomFactor < 0 ? -1 : 1));
        }

        // Create vertices for ammo shape matching actual sprite proportions (~170x980 pixels)
        // This creates a bullet shape: pointed tip, body, and rim at base
        // The bullet body takes up roughly 50% of image width, rim is slightly wider
        // Centered at x=85 (half of 170), y ranges from 0-980
        const vertexPath = [
            // Pointed tip (narrow, ~40 pixels wide)
            '85 0',      // Top point (center)
            '105 120',   // Right side of tip
            // Bullet body (wider, ~70 pixels)
            '115 200',   // Body right shoulder
            '115 780',   // Body right bottom
            // Base rim (widest, ~90 pixels)
            '105 800',   // Rim neck right
            '125 850',   // Rim outer right
            '125 980',   // Bottom right corner
            '45 980',    // Bottom left corner
            '45 850',    // Rim outer left
            '65 800',    // Rim neck left
            // Bullet body left side
            '55 780',    // Body left bottom
            '55 200',    // Body left shoulder
            // Tip left side
            '65 120',    // Left side of tip
        ].join(' ');

        const vertices = Matter.Vertices.fromPath(vertexPath, undefined as any);

        // Random sprite selection
        const sprite = this.config.objectSprites[
            Math.floor(Math.random() * this.config.objectSprites.length)
        ];

        // Create body from vertices with collision settings optimized for stacking
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
            slop: 0.01,                    // Tighter collision tolerance (reduces overlap)
            frictionStatic: 0.9,           // Higher static friction for stable stacking
        });

        // Scale the collision body to match the sprite scale
        // This ensures the physics body matches the visual sprite size
        Matter.Body.scale(body, this.config.objectScale, this.config.objectScale);

        // Add label if username provided
        if (username && this.config.showLabels) {
            (body as any).label = {
                text: username,
                color: this.config.labelColor,
            };
        }

        // Random initial rotation
        Matter.Body.setAngle(body, Math.random() * Math.PI * 2);

        // Add to world
        Matter.Composite.add(this.world, body);

        // Track the object
        this.objects.push({ body, username });

        return body;
    }

    /**
     * Handle a donation by spawning multiple objects
     */
    public handleDonation(amount: number, username?: string): void {
        const objectCount = Math.floor(amount * this.config.spawnRate);

        for (let i = 0; i < objectCount; i++) {
            setTimeout(() => {
                this.spawnObject(undefined, undefined, username);
            }, i * this.config.spawnDelay);
        }
    }

    /**
     * Update configuration
     */
    public updateConfig(newConfig: Partial<DonationMatterConfig>): void {
        this.config = { ...this.config, ...newConfig };
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
            Matter.Composite.remove(this.world, obj.body);
        }
        this.objects = [];
    }

    /**
     * Get the canvas element
     */
    public getCanvas(): HTMLCanvasElement {
        return this.render.canvas;
    }

    /**
     * Destroy the instance and clean up resources
     */
    public destroy(): void {
        this.stop();
        this.clear();
        window.removeEventListener('resize', this.handleResize.bind(this));

        if (this.render.canvas.parentNode) {
            this.render.canvas.parentNode.removeChild(this.render.canvas);
        }

        Matter.Engine.clear(this.engine);
    }
}

// Export for CommonJS/Node
export default DonationMatter;
