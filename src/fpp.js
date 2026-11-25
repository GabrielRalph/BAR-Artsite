import {Vector2, Vector3, Camera, Euler, Matrix4, MathUtils, Quaternion} from 'three';
import { Capsule } from 'three/addons/math/Capsule.js';
/** @typedef {import('./collision-world.js').CollisionWorld} CollisionWorld */

const _v = new Vector3();
const _axis = new Vector3();
const _center = new Vector3();
const _f0 = new Vector3();
const _f1 = new Vector3();
const _q = new Quaternion();
const _e = new Euler();

/**
 * First person player with simple kinematic physics and changeable gravity.
 *
 * The player has an orientation "frame": a rotation that takes its local
 * space (where +Y is up) into world space. Yaw and pitch are measured inside
 * that frame, and the body is a capsule whose axis lines up with the frame's
 * up vector, with its bottom at `position` (the feet).
 *
 * Gravity pulls along `gravityDirection`. When you change it the frame turns
 * smoothly (`gravityTurnSpeed`) until the player's up points against the new
 * gravity. The turn happens around the body's centre, so the player swings
 * over to the new "floor" and doesn't pivot on their feet.
 *
 * Every frame the capsule is moved by the player's velocity and then pushed
 * out of the scene by the shared `CollisionWorld`. Each contact is
 * classified relative to the player's up:
 *  - floor   (normal points mostly up)   -> stand on it, can jump
 *  - ceiling (normal points mostly down) -> stop upward motion
 *  - wall    (anything else)             -> slide along it
 *
 * Units: metres and seconds.
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

    /** Gravitational acceleration in m/s² (along `gravityDirection`). */
    gravity = 25;
    /** How fast the player turns to line up with a new gravity, in radians / second. Infinity = snap. */
    gravityTurnSpeed = Math.PI * 1.5;
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
    /**
     * If the player gets further than this below the world origin, measured
     * along their current up axis, they go back to the spawn point.
     * With normal gravity this is just a y position.
     */
    killY = -50;

    /** The obstacle currently being stood on, or null. */
    floorObject = null;

    bobFrequency = 0.023;
    /** Head bob amount in the player's local (yawed) space. */
    bobAmount = new Vector3(0, 0.03, 0.03);

    #pitch = 0;
    #yaw = 0;

    #position = new Vector3();
    #spawn = new Vector3();
    /** Head bob offset, in the player's local yawed space. */
    #bobDelta = new Vector3();
    #velocity = new Vector3();
    #movement = new Vector2();
    /** Desired walking velocity in the player's local frame (y always 0). */
    #moveLocal = new Vector3();

    #timeSinceMove = null;

    // Gravity / orientation
    /** Rotation from the player's local space (Y up) to world space. */
    #frame = new Quaternion();
    /** Current up (world space). Always equal to +Y rotated by #frame. */
    #up = new Vector3(0, 1, 0);
    /** Where #up is turning to: the opposite of the gravity direction. */
    #targetUp = new Vector3(0, 1, 0);

    // Collision state
    #capsule = new Capsule();
    #prevCenter = new Vector3();
    #onFloor = false;
    #floorMesh = null;
    #timeSinceFloor = Infinity;
    #timeSinceJumpPressed = Infinity;

    /**
     * @param {CollisionWorld} [world] Scene geometry to collide with. Without
     *   one (or while it's empty) the player walks on an infinite floor
     *   through the origin.
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

    /** Velocity in metres / second (world space). */
    get velocity() { return this.#velocity.clone(); }

    /** True while the player is standing on a floor surface. */
    get onFloor() { return this.#onFloor; }

    /** The player's current up direction (world space, unit length). */
    get up() { return this.#up.clone(); }

    /**
     * The direction gravity pulls in (world space, unit length). Setting it
     * makes the player turn to line up with it at `gravityTurnSpeed`; use
     * `setGravityDirection(dir, true)` to snap straight away.
     * @param {Vector3} value Any length except zero.
     */
    set gravityDirection(value) {
        this.setGravityDirection(value);
    }
    get gravityDirection() { return this.#targetUp.clone().negate(); }

    /**
     * @param {Vector3} direction Direction gravity pulls in. Any length except zero.
     * @param {boolean} [instant=false] Snap to it now instead of turning smoothly.
     */
    setGravityDirection(direction, instant = false) {
        if (!direction || direction.lengthSq() < 1e-12) return;
        this.#targetUp.copy(direction).normalize().negate();
        if (instant) this.#turnTowardsTargetUp(Infinity);
    }

    /**
     * The player's view rotation in world space (frame, then yaw and pitch).
     * @param {Quaternion} [target]
     * @returns {Quaternion}
     */
    getQuaternion(target = new Quaternion()) {
        return this.#viewQuaternion(this.#pitch, this.#yaw, target);
    }

    /** The direction the player is looking (world space). */
    get forward() {
        return new Vector3(0, 0, -1).applyQuaternion(this.getQuaternion(_q));
    }

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

        direction.applyEuler(_e.set(0, this.yaw, 0));
        direction.multiplyScalar(this.speed);
        this.#moveLocal.copy(direction);
        this.#applyMovement();
    }
    /**
     * Returns the current movement input as a Vector2.
     * @returns {Vector2} The current movement input.
     */
    get movement() {
        return this.#movement.clone();
    }

    /**
     * Sets the part of the velocity that's perpendicular to up (walking)
     * from the movement input. The part along up belongs to gravity and
     * jumping, so it's left alone.
     */
    #applyMovement() {
        const up = this.#up;
        const v = this.#velocity;
        const vertical = v.dot(up);
        v.copy(this.#moveLocal).applyQuaternion(this.#frame).addScaledVector(up, vertical);
    }

    /** Frame rotation, then yaw and pitch, written into `target`. */
    #viewQuaternion(pitch, yaw, target) {
        return target.setFromEuler(_e.set(pitch, yaw, 0, 'YXZ')).premultiply(this.#frame);
    }

    /** Head bob offset in world space. */
    #bobWorld(target = new Vector3()) {
        _q.setFromEuler(_e.set(0, this.#yaw, 0)).premultiply(this.#frame);
        return target.copy(this.#bobDelta).applyQuaternion(_q);
    }

    /** World position of the eyes, head bob included. */
    #eyePosition(target = new Vector3()) {
        return target.copy(this.#position)
            .addScaledVector(this.#up, this.height)
            .add(this.#bobWorld(_v));
    }

    /**
     * Returns the transformation matrix representing the player's current
     * position and orientation, including head bobbing.
     * @returns {Matrix4} The transformation matrix.
     */
    get matrix() {
        const matrix = new Matrix4();
        matrix.makeRotationFromQuaternion(this.getQuaternion(new Quaternion()));
        matrix.setPosition(this.#eyePosition());
        return matrix;
    }

    get centerPosition() {
        return this.position
            .addScaledVector(this.#up, this.height * 0.4)
            .add(this.#bobWorld(_v));
    }

    #updateBob() {
        // Only bob while walking on the ground.
        if (this.#timeSinceMove != null && this.#onFloor) {
            let ToM = performance.now() - this.#timeSinceMove;
            let bobTheta = ToM * this.bobFrequency;
            this.#bobDelta.set(
                0,
                Math.sin(bobTheta),
                Math.cos(bobTheta * 0.5)
            ).multiply(this.bobAmount);
        } else {
            this.#bobDelta.lerp(_v.set(0, 0, 0), 0.2);
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
     * @param {number} dt time since last frame, in seconds.
     */
    update(dt) {
        const seconds = Math.min(dt, 0.1);

        this.#ridePlatform();
        this.#turnTowardsTargetUp(this.gravityTurnSpeed * seconds);
        // Keep the walking velocity lined up with the frame while it turns.
        this.#applyMovement();

        const step = seconds / this.subSteps;
        for (let i = 0; i < this.subSteps; i++) {
            this.#step(step);
        }

        if (this.#position.dot(this.#up) < this.killY) {
            this.position = this.#spawn;
        }

        this.#updateBob();
    }

    /**
     * Turns the frame so up moves towards the target up by at most
     * `maxAngle` radians. The turn happens around the body's centre.
     */
    #turnTowardsTargetUp(maxAngle) {
        const up = this.#up;
        const target = this.#targetUp;
        const angle = up.angleTo(target);
        if (angle < 1e-6) return;

        _axis.crossVectors(up, target);
        if (_axis.lengthSq() < 1e-10) {
            // Gravity flipped exactly: turn head over heels around the
            // player's right-hand axis.
            _q.setFromEuler(_e.set(0, this.#yaw, 0)).premultiply(this.#frame);
            _axis.set(1, 0, 0).applyQuaternion(_q);
        }
        _axis.normalize();

        const turn = Math.min(angle, maxAngle);
        _q.setFromAxisAngle(_axis, turn);

        // Keep the capsule's centre where it is.
        const halfHeight = this.bodyHeight / 2;
        _center.copy(this.#position).addScaledVector(up, halfHeight);

        this.#frame.premultiply(_q).normalize();
        if (turn === angle) {
            // Finished: snap exactly onto the target so rounding errors don't build up.
            _q.setFromUnitVectors(_v.set(0, 1, 0).applyQuaternion(this.#frame), target);
            this.#frame.premultiply(_q).normalize();
        }
        up.set(0, 1, 0).applyQuaternion(this.#frame);

        this.#position.copy(_center).addScaledVector(up, -halfHeight);
        // We're probably not on the old floor any more.
        this.#onFloor = false;
        this.#floorMesh = null;
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

        // Turn the view by the platform's rotation about our up axis.
        const up = this.#up;
        _f0.set(0, 0, -1).applyQuaternion(this.#frame);
        _f1.copy(_f0).transformDirection(motion);
        _f1.addScaledVector(up, -_f1.dot(up));
        const sin = _v.crossVectors(_f0, _f1).dot(up);
        const cos = _f0.dot(_f1);
        this.yaw += Math.atan2(sin, cos);
    }

    #step(dt) {
        const v = this.#velocity;
        const up = this.#up;

        // --- Jumping (with coyote time and input buffering) ---
        this.#timeSinceJumpPressed += dt;
        this.#timeSinceFloor = this.#onFloor ? 0 : this.#timeSinceFloor + dt;
        if (this.#timeSinceJumpPressed <= this.jumpBufferTime && this.#timeSinceFloor <= this.coyoteTime) {
            // Set the upward speed to exactly jumpSpeed.
            v.addScaledVector(up, this.jumpSpeed - v.dot(up));
            this.#onFloor = false;
            this.#timeSinceFloor = Infinity;
            this.#timeSinceJumpPressed = Infinity;
        }

        // --- Gravity ---
        const vertical = v.dot(up);
        const newVertical = Math.max(vertical - this.gravity * dt, -this.maxFallSpeed);
        v.addScaledVector(up, newVertical - vertical);

        // --- Integrate ---
        // Remember where the body's centre was before moving, so collisions
        // know which side of each surface the player is on.
        this.#prevCenter.copy(this.#position).addScaledVector(up, this.bodyHeight / 2);
        this.#position.addScaledVector(v, dt);

        // --- Collide ---
        if (this.world && !this.world.isEmpty) {
            this.#resolveCollisions();
        } else {
            // No obstacles registered: fall back to an infinite floor through
            // the origin, perpendicular to up.
            const height = this.#position.dot(up);
            this.#onFloor = height <= 0;
            if (this.#onFloor) {
                this.#position.addScaledVector(up, -height);
                const into = v.dot(up);
                if (into < 0) v.addScaledVector(up, -into);
            }
        }
    }

    #resolveCollisions() {
        const capsule = this.#capsule;
        const r = this.radius;
        const up = this.#up;
        capsule.radius = r;
        capsule.start.copy(this.#position).addScaledVector(up, r);
        capsule.end.copy(this.#position).addScaledVector(up, Math.max(this.bodyHeight - r, r));

        const floorCos = Math.cos(this.maxSlope);
        const v = this.#velocity;
        // The world pushes the capsule out of everything it overlaps and
        // reports each contact. Here we decide what each contact means.
        const contacts = this.world.collideCapsule(capsule, this.#prevCenter);

        this.#onFloor = false;
        this.floorObject = null;
        this.#floorMesh = null;
        for (const { normal: n, object, mesh } of contacts) {
            const nUp = n.dot(up);
            if (nUp >= floorCos) {
                // Floor: stand on it.
                this.#onFloor = true;
                // What we're standing on, so we can ride it if it moves.
                this.floorObject = object;
                this.#floorMesh = mesh;
                const vertical = v.dot(up);
                if (vertical < 0) v.addScaledVector(up, -vertical);
            } else if (nUp <= -floorCos) {
                // Ceiling: bonk.
                const vertical = v.dot(up);
                if (vertical > 0) v.addScaledVector(up, -vertical);
            } else {
                // Wall (or too-steep slope): remove the part of the velocity going into it.
                const into = v.dot(n);
                if (into < 0) v.addScaledVector(n, -into);
            }
        }

        this.#position.copy(capsule.start).addScaledVector(up, -r);
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
        const rotation = this.#viewQuaternion(this.pitch + deltaPitch, this.yaw + deltaYaw, new Quaternion());
        const position = this.#eyePosition();
        position.add(new Vector3(0, 0, -disance).applyQuaternion(rotation));

        const matrix = new Matrix4();
        matrix.makeRotationFromQuaternion(rotation);
        matrix.setPosition(position);

        return matrix;
    }

}

export { FirstPersonPlayer }
