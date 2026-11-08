import {Vector2, Vector3, Camera, Euler, Matrix4, MathUtils} from 'three';
import { Capsule } from 'three/addons/math/Capsule.js';
/** @typedef {import('./collision-world.js').CollisionWorld} CollisionWorld */

/**
 * First person player with simple kinematic physics.
 *
 * The player's body is a vertical capsule whose bottom sits at `position`
 * (the feet). Every frame the capsule is moved by the player's velocity and
 * then pushed out of the scene by the shared `CollisionWorld`. Each contact
 * is classified as:
 *  - floor   (normal points mostly up)   -> stand on it, can jump
 *  - ceiling (normal points mostly down) -> stop upward motion
 *  - wall    (anything else)             -> slide along it
 *
 * Units: metres and seconds internally. `update(dt)` takes dt in milliseconds
 * (as passed from the render loop).
 */
class FirstPersonPlayer {
    mouseSensitivity = 0.002;

    /** Walking speed in metres / second. */
    speed = 5;
    /** Eye height above the feet. */
    height = 1.6;
    /** Height of the collision capsule (top of the head). */
    bodyHeight = 1.8;
    /** Radius of the collision capsule. */
    radius = 0.3;

    /** Downward acceleration in m/s². */
    gravity = 25;
    /** Initial upward speed of a jump in m/s (peak height = v² / 2g ≈ 1m). */
    jumpSpeed = 7;
    /** Fastest the player can fall, in m/s. */
    maxFallSpeed = 40;
    /** Steepest surface (radians) that still counts as floor. */
    maxSlope = MathUtils.degToRad(50);
    /** Grace period after leaving a ledge during which a jump still works (s). */
    coyoteTime = 0.1;
    /** A jump pressed this long before landing still happens on landing (s). */
    jumpBufferTime = 0.15;
    /** Physics sub-steps per frame; more = less chance of tunnelling through thin walls. */
    subSteps = 5;
    /** If the player falls below this y they are put back at the spawn point. */
    killY = -50;

    /** The obstacle currently being stood on, or null. */
    floorObject = null;

    bobFrequency = 0.023;
    bobAmount = new Vector3(0, 0.03, 0.03);

    #pitch = 0;
    #yaw = 0;

    #position = new Vector3();
    #spawn = new Vector3();
    #bobDelta = new Vector3();
    #velocity = new Vector3();
    #movement = new Vector2();

    #timeSinceMove = null;

    // Collision state
    #capsule = new Capsule();
    #prevCenter = new Vector3();
    #onFloor = false;
    #floorMesh = null;
    #timeSinceFloor = Infinity;
    #timeSinceJumpPressed = Infinity;

    /**
     * @param {CollisionWorld} [world] Scene geometry to collide with. Without
     *   one (or while it's empty) the player walks on an infinite floor at y = 0.
     */
    constructor(world = null) {
        this.world = world;
    }

    set pitch(value) {
        const limit = Math.PI / 2 - 0.01;
        this.#pitch = MathUtils.clamp(value, -limit, limit);
    }
    get pitch() { return this.#pitch; }
    set yaw(value) { this.#yaw = value; }
    get yaw() { return this.#yaw; }

    /** Position of the player's feet. Setting it also sets the respawn point. */
    set position(value) {
        this.#position.copy(value);
        this.#spawn.copy(value);
        this.#velocity.set(0, 0, 0);
    }
    get position() { return this.#position.clone(); }

    /** Velocity in metres / second. */
    get velocity() { return this.#velocity.clone(); }

    /** True while the player is standing on a floor surface. */
    get onFloor() { return this.#onFloor; }

    /**
     * @param {Vector2} value
     */
    set movement(value) {
        this.#movement.copy(value);
        const direction = new Vector3(
            value.x,
            0,
            value.y,
        );
        // Clamp rather than normalise so analogue (touch) input can walk slowly.
        if (direction.lengthSq() > 1) direction.normalize();

        const absDelta = direction.length();
        if (absDelta > 1e-4 && this.#timeSinceMove == null) {
            this.#timeSinceMove = performance.now();
        } else if (absDelta <= 1e-4) {
            this.#timeSinceMove = null;
        }

        direction.applyEuler(new Euler(0, this.yaw, 0));
        direction.multiplyScalar(this.speed);
        // Only the horizontal velocity is driven by input; y belongs to gravity / jumping.
        this.#velocity.x = direction.x;
        this.#velocity.z = direction.z;
    }
    /**
     * Returns the current movement input as a Vector2.
     * @returns {Vector2} The current movement input.
     */
    get movement() {
        return this.#movement.clone();
    }

    /**
     * Returns the transformation matrix representing the player's current
     * position and orientation, including head bobbing.
     * @returns {Matrix4} The transformation matrix.
     */
    get matrix() {
        const matrix = new Matrix4();
        const {position, pitch, yaw} = this;
        matrix.makeRotationFromEuler(new Euler(pitch, yaw, 0, 'YXZ'));
        position.y += this.height;
        position.add(this.#bobDelta);
        matrix.setPosition(position);
        return matrix;
    }

    #updateBob() {
        // Only bob while walking on the ground.
        if (this.#timeSinceMove != null && this.#onFloor) {
            let ToM = performance.now() - this.#timeSinceMove;
            let bobTheta = ToM * this.bobFrequency;
            this.#bobDelta = this.bobAmount
                .clone()
                .multiply(new Vector3(
                    0,
                    Math.sin(bobTheta),
                    Math.cos(bobTheta * 0.5)
                ));
        } else {
            this.#bobDelta.lerp(new Vector3(), 0.2);
        }
    }

    /**
     * Requests a jump. Happens immediately if the player is (or very recently
     * was) on the floor, otherwise it is buffered briefly until they land.
     */
    jump() {
        this.#timeSinceJumpPressed = 0;
    }

    look(pxDeltaYaw, pxDeltaPitch) {
        this.yaw -= pxDeltaYaw * this.mouseSensitivity;
        this.pitch -= pxDeltaPitch * this.mouseSensitivity;
    }

    move(direction) {
        this.movement = direction;
    }

    /**
     * Advances the simulation.
     * @param {number} dt time since last frame in milliseconds.
     */
    update(dt) {
        this.#ridePlatform();

        const seconds = Math.min(dt, 0.1)
        const step = seconds / this.subSteps;
        for (let i = 0; i < this.subSteps; i++) {
            this.#step(step);
        }

        if (this.#position.y < this.killY) {
            this.position = this.#spawn;
        }

        this.#updateBob();
    }

    /**
     * If we're standing on something that moves (e.g. the carousel), move
     * and turn with it by however much it moved since last frame.
     */
    #ridePlatform() {
        if (!this.#onFloor || !this.#floorMesh || !this.world) return;
        const motion = this.world.getMotion(this.#floorMesh);
        if (!motion) return;
        this.#position.applyMatrix4(motion);
        // Turn the view with the platform's rotation about the vertical axis.
        const forward = new Vector3(0, 0, -1).transformDirection(motion);
        this.yaw += Math.atan2(-forward.x, -forward.z);
    }

    #step(dt) {
        const v = this.#velocity;

        // --- Jumping (with coyote time and input buffering) ---
        this.#timeSinceJumpPressed += dt;
        this.#timeSinceFloor = this.#onFloor ? 0 : this.#timeSinceFloor + dt;
        if (this.#timeSinceJumpPressed <= this.jumpBufferTime && this.#timeSinceFloor <= this.coyoteTime) {
            v.y = this.jumpSpeed;
            this.#onFloor = false;
            this.#timeSinceFloor = Infinity;
            this.#timeSinceJumpPressed = Infinity;
        }

        // --- Gravity ---
        v.y = Math.max(v.y - this.gravity * dt, -this.maxFallSpeed);

        // --- Integrate ---
        // Remember where the body's centre was before moving, so collisions
        // know which side of each surface the player is on.
        this.#prevCenter.copy(this.#position).y += this.bodyHeight / 2;
        this.#position.addScaledVector(v, dt);

        // --- Collide ---
        if (this.world && !this.world.isEmpty) {
            this.#resolveCollisions();
        } else {
            // No obstacles registered: fall back to an infinite floor at y = 0.
            this.#onFloor = this.#position.y <= 0;
            if (this.#onFloor) {
                this.#position.y = 0;
                v.y = Math.max(v.y, 0);
            }
        }
    }

    #resolveCollisions() {
        const capsule = this.#capsule;
        const r = this.radius;
        capsule.radius = r;
        capsule.start.copy(this.#position).y += r;
        capsule.end.copy(this.#position).y += Math.max(this.bodyHeight - r, r);

        const floorCos = Math.cos(this.maxSlope);
        const v = this.#velocity;
        // The world pushes the capsule out of everything it overlaps and
        // reports each contact. Here we decide what each contact means.
        const contacts = this.world.collideCapsule(capsule, this.#prevCenter);

        this.#onFloor = false;
        this.floorObject = null;
        this.#floorMesh = null;
        for (const { normal: n, object, mesh } of contacts) {
            if (n.y >= floorCos) {
                // Floor: stand on it.
                this.#onFloor = true;
                // What we're standing on, so we can ride it if it moves.
                this.floorObject = object;
                this.#floorMesh = mesh;
                if (v.y < 0) v.y = 0;
            } else if (n.y <= -floorCos) {
                // Ceiling: bonk.
                if (v.y > 0) v.y = 0;
            } else {
                // Wall (or too-steep slope): remove the part of the velocity going into it.
                const into = v.dot(n);
                if (into < 0) v.addScaledVector(n, -into);
            }
        }

        this.#position.copy(capsule.start);
        this.#position.y -= r;
    }

    /**
     * @param {Camera} camera
     */
    transformCamera(camera) {
        const {matrix} = this;
        camera.matrixAutoUpdate = false;
        camera.matrix.copy(matrix);
        camera.updateMatrixWorld(true);
    }


    getMatrixInFront(disance, deltaPitch, deltaYaw) {
        const{position, pitch, yaw} = this;
        position.y += this.height;
        position.add(this.#bobDelta);

        const delta = new Vector3(0,0,-disance)
        delta.applyEuler(new Euler(pitch + deltaPitch, yaw + deltaYaw, 0, 'YXZ'));
        position.add(delta);

        const matrix = new Matrix4();
        matrix.makeRotationFromEuler(new Euler(pitch + deltaPitch, yaw + deltaYaw, 0, 'YXZ'));
        matrix.setPosition(position);

        return matrix;
    }

}

export { FirstPersonPlayer }
