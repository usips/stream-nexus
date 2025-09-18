// Import Matter.js physics engine
const Matter = require('matter-js');

var Runner = Runner || {};

Runner.prizes = function () {
    var Engine = Matter.Engine,
        Render = Matter.Render,
        Runner = Matter.Runner,
        Composites = Matter.Composites,
        Common = Matter.Common,
        Events = Matter.Events,
        MouseConstraint = Matter.MouseConstraint,
        Mouse = Matter.Mouse,
        Composite = Matter.Composite,
        Bodies = Matter.Bodies,
        Vertices = Matter.Vertices;

    // Get viewport dimensions
    var viewportWidth = window.innerWidth;
    var viewportHeight = window.innerHeight;

    // Prevent scrolling
    document.body.style.overflow = 'hidden';
    document.body.style.margin = '0';
    document.body.style.padding = '0';

    // create engine
    var engine = Engine.create({
        enableSleeping: true
    }),
        world = engine.world;

    // create renderer that fills the entire screen
    var render = Render.create({
        element: document.body,
        engine: engine,
        fps: 24,
        options: {
            width: viewportWidth,
            height: viewportHeight,
            showAngleIndicator: true,
            showBounds: false,
            showSleeping: false,
            wireframes: false,
            background: 'transparent'
        }
    });

    Render.run(render);

    // create runner
    var runner = Runner.create();
    Runner.run(runner, engine);


    // add invisible boundary walls (positioned outside visible area but still functional)
    var bottomWall = Bodies.rectangle(viewportWidth / 2, viewportHeight + 25, viewportWidth, 50, { isStatic: true, render: { visible: false } });
    var leftWall = Bodies.rectangle(-25, viewportHeight / 2, 50, viewportHeight * 2, { isStatic: true, render: { visible: false } });
    var rightWall = Bodies.rectangle(viewportWidth + 25, viewportHeight / 2, 50, viewportHeight * 2, { isStatic: true, render: { visible: false } });

    Composite.add(world, [bottomWall, leftWall, rightWall]);


    // add mouse control
    var mouse = Mouse.create(render.canvas),
        mouseConstraint = MouseConstraint.create(engine, {
            mouse: mouse,
            constraint: {
                stiffness: 0.2,
                render: {
                    visible: false
                }
            }
        });

    Composite.add(world, mouseConstraint);
    render.mouse = mouse;

    // fit the render viewport to the scene (cover entire screen)
    Render.lookAt(render, {
        min: { x: 0, y: 0 },
        max: { x: viewportWidth, y: viewportHeight }
    });

    // Add event to check for out-of-bounds objects on each engine update
    Events.on(engine, 'afterUpdate', function () {
        var allBodies = Composite.allBodies(world);

        for (var i = 0; i < allBodies.length; i++) {
            var body = allBodies[i];

            // Skip static bodies (walls, etc.)
            if (body.isStatic) continue;

            var outOfBounds = false;
            var newPosition = { x: body.position.x, y: body.position.y };

            // Check boundaries and determine new position
            if (body.position.x < 0) {
                newPosition.x = 50;
                outOfBounds = true;
            } else if (body.position.x > viewportWidth) {
                newPosition.x = viewportWidth - 50;
                outOfBounds = true;
            }

            if (body.position.y > viewportHeight) {
                newPosition.y = viewportHeight - 50;
                outOfBounds = true;
            }

            // If object is out of bounds, stop it and push it back
            if (outOfBounds) {
                // Stop the object's velocity immediately
                Matter.Body.setVelocity(body, { x: 0, y: 0 });
                Matter.Body.setAngularVelocity(body, 0);

                // Push it back into bounds
                Matter.Body.setPosition(body, newPosition);

                // Wake the body if it was sleeping so it can settle properly
                if (body.isSleeping) {
                    Matter.Sleeping.set(body, false);
                }
            }
        }
    });

    // Add custom rendering for labels after each frame
    Events.on(render, 'afterRender', function () {
        var ctx = render.canvas.getContext('2d');
        var allBodies = Composite.allBodies(world);

        // Draw labels for objects that have them
        for (var i = 0; i < allBodies.length; i++) {
            var body = allBodies[i];
            if (body.label && body.label.text && !body.isStatic) {
                ctx.save();

                // Position text above the object
                var x = body.position.x;
                var y = body.position.y;

                // Translate to the object's position and rotate to match its orientation
                ctx.translate(x, y);
                ctx.rotate(body.angle + Math.PI / 2);

                // Set text style
                ctx.font = '12px Verlag';
                ctx.fillStyle = body.label.color || '#ffffff';
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 2;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';

                // Draw text with outline (relative to rotated coordinate system)
                ctx.strokeText(body.label.text, 10, 6);
                ctx.fillText(body.label.text, 10, 6);

                ctx.restore();
            }
        }
    });

    // Handle window resize
    window.addEventListener('resize', function () {
        var newWidth = window.innerWidth;
        var newHeight = window.innerHeight;

        // Update canvas dimensions
        render.canvas.width = newWidth;
        render.canvas.height = newHeight;
        render.options.width = newWidth;
        render.options.height = newHeight;

        // Update viewport
        Render.lookAt(render, {
            min: { x: 0, y: 0 },
            max: { x: newWidth, y: newHeight }
        });

        // Update boundary wall positions and dimensions
        Matter.Body.setPosition(bottomWall, { x: newWidth / 2, y: newHeight + 25 });
        Matter.Body.scale(bottomWall, newWidth / (bottomWall.bounds.max.x - bottomWall.bounds.min.x), 1);

        Matter.Body.setPosition(leftWall, { x: -25, y: newHeight / 2 });
        Matter.Body.scale(leftWall, 1, (newHeight * 2) / (leftWall.bounds.max.y - leftWall.bounds.min.y));

        Matter.Body.setPosition(rightWall, { x: newWidth + 25, y: newHeight / 2 });
        Matter.Body.scale(rightWall, 1, (newHeight * 2) / (rightWall.bounds.max.y - rightWall.bounds.min.y));

        // Wake up all sleeping objects so they can respond to the new boundaries
        var allBodies = Composite.allBodies(world);
        for (var i = 0; i < allBodies.length; i++) {
            var body = allBodies[i];
            if (body.isSleeping && !body.isStatic) {
                Matter.Sleeping.set(body, false);
            }
        }

        // Push objects back into view if window has shrunk
        for (var i = 0; i < allBodies.length; i++) {
            var body = allBodies[i];
            if (!body.isStatic) {
                var newPosition = { x: body.position.x, y: body.position.y };
                var moved = false;

                // Check if object is outside the right boundary
                if (body.position.x > newWidth) {
                    newPosition.x = newWidth - 50; // 50px margin from edge
                    moved = true;
                }

                // Check if object is outside the left boundary
                if (body.position.x < 0) {
                    newPosition.x = 50; // 50px margin from edge
                    moved = true;
                }

                // Check if object is below the new bottom boundary
                if (body.position.y > newHeight) {
                    newPosition.y = newHeight - 50; // 50px margin from bottom
                    moved = true;
                }

                // Apply the new position if the object was moved
                if (moved) {
                    Matter.Body.setPosition(body, newPosition);
                    // Give it a small velocity to make the movement feel natural
                    Matter.Body.setVelocity(body, { x: 0, y: 0 });
                }
            }
        }

        // Update viewport dimensions for future reference
        viewportWidth = newWidth;
        viewportHeight = newHeight;
    });

    // Function to spawn ammo object from external calls
    function spawnAmmo(x, y, username) {
        if (y === undefined) y = -100; // Spawn above visible area
        if (x === undefined) {
            // Generate a position on x in a parabolic curve
            var centerX = viewportWidth / 2;
            var amplitude = viewportWidth / 2.5; // Controls the width of the parabola
            var randomFactor = Common.random(-1, 1); // Random factor between -1 and 1
            x = centerX + (amplitude * randomFactor * randomFactor * (randomFactor < 0 ? -1 : 1));
        }

        // Create vertices to match the round shape - simplified 5 points (square + triangle tip)
        var ammoVertices = Vertices.fromPath('6 0 12 20 12 80 0 80 0 20 6 0');

        // Create the ammo body with custom vertices
        var ammoSprite = ['a', 'b', 'c', 'd'][Math.floor(Math.random() * 4)];
        var ammoBody = Bodies.fromVertices(x, y, ammoVertices, {
            render: {
                sprite: {
                    texture: `/static/img/ammo_556_round_${ammoSprite}.png`,
                    xScale: 0.1,
                    yScale: 0.1
                }
            },
            // Physics properties for less bounce and quicker settling
            restitution: 0.1,      // Low bounce
            friction: 0.8,         // High friction
            frictionAir: 0.02,     // Air resistance to slow down movement
            density: 0.008         // Higher density for more weight
        });

        // Add label if username is provided
        if (username) {
            ammoBody.label = {
                text: username,
                color: '#ffff00' // Yellow text by default
            };
        }

        // Randomly orient the object
        var randomAngle = Math.random() * Math.PI * 2; // Random angle between 0 and 2π
        Matter.Body.setAngle(ammoBody, randomAngle);

        // Add the ammo to the world
        Composite.add(world, ammoBody);

        return ammoBody;
    }

    // context for MatterTools.Demo
    return {
        engine: engine,
        runner: runner,
        render: render,
        canvas: render.canvas,
        spawnAmmo: spawnAmmo,
        stop: function () {
            Matter.Render.stop(render);
            Matter.Runner.stop(runner);
        }
    };
};

Runner.prizes.title = 'Prizes';
Runner.prizes.for = '>=0.14.2';

if (typeof module !== 'undefined') {
    module.exports = Runner.prizes;
}

window.addEventListener("load", (event) => {
    var demo = Runner.prizes();
    window.spawnAmmo = demo.spawnAmmo;


    //
    // TO-DO: Move this logic over to its own thing so that it can be shared between views.
    //

    // Create WebSocket connection.
    let socket = new WebSocket("ws://127.0.0.2:1350/chat.ws");
    const reconnect = () => {
        // check if socket is connected
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
            return true;
        }
        // attempt to connect
        socket = new WebSocket("ws://127.0.0.2:1350/chat.ws");
        bindWebsocketEvents(socket);
    };

    // Connection opened
    const bindWebsocketEvents = () => {
        socket.addEventListener("open", (event) => {
            console.log("[SNEED] Connection established.");
        });

        // Listen for messages
        socket.addEventListener("message", (event) => {
            const data = JSON.parse(event.data);
            const message = JSON.parse(data.message);
            switch (data.tag) {
                case "chat_message":
                    handle_message(message);
                    break;
                default:
                    break;

            }
        });

        socket.addEventListener("close", (event) => {
            console.log("[SNEED] Socket has closed. Attempting reconnect.", event.reason);
            setTimeout(function () { reconnect(); }, 1000);
        });

        socket.addEventListener("error", (event) => {
            socket.close();
            setTimeout(function () { reconnect(); }, 1000);
        });
    };

    bindWebsocketEvents(socket);

    const handle_message = (message) => {
        if (message.amount > 0) {
            const ammoAmount = Math.floor(message.amount / 0.5);

            for (let i = 0; i < ammoAmount; i++) {
                setTimeout(() => {
                    window.spawnAmmo(undefined, undefined, message.username);
                }, i * 50);
            }
        }
    };
});