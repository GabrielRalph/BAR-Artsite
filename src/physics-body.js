import { Vector3, Quaternion, Matrix4, Sphere, Euler, MathUtils } from 'three';
/** @typedef {import('./collision-world.js').CollisionWorld} CollisionWorld */

const _up = new Vector3(0, 1, 0);
const _v = new Vector3();
const _q = new Quaternion();
const _m = new Matrix4();
const _dir = new Vector3();

/**
 * A simple falling object that bounces off and comes to rest on the
 * `CollisionWorld`. It's meant for small props (the coin) rather than full
 * rigid-body physics. The collider is a sphere at the object's origin, and
 * when the object comes to rest it's turned to lie "flat": its local +Y
 * points up, keeping whatever heading it landed with.
 *
 * The body drives `object.matrix` directly (matrixAutoUpdate = false) while
 * it is simulating or resting, the same way the held-object code does.
 *
 * Usage:
 *   const body = new PhysicsBody(world, coin, { radius: 0.01 });
 *   body.drop(worldMatrix, velocity);  // let go of it
 *   body.hold();                       // pick it up again (stops simulating)
 *   body.update(dtMs);                 // every frame
 */
class PhysicsBody {
    /** Downward acceleration in m/s². */
    gravity = 9.8;
    /** 0 = no bounce, 1 = perfectly elastic. */
    bounce = 0.3;
    /** Fraction of sliding speed lost per contact (0 to 1). */
    friction = 0.4;
    /** Collision sphere radius (metres). */
    radius = 0.02;
    /** Below this speed (m/s) while touching the floor, the body settles. */
    restSpeed = 0.15;
    /** How fast it turns to lie flat once it touches the floor (per second). */
    settleRate = 12;
    /** Seconds to grow/shrink from the drop scale to `restScale`. */
    scaleTime = 0.25;
    /** Physics sub-steps per frame. */
    subSteps = 4;
    /** If it falls below this y, it's put back where it was first created. */
    killY = -50;

    position = new Vector3();
    velocity = new Vector3();
    quaternion = new Quaternion();
    angularVelocity = new Vector3();
    scale = new Vector3(1, 1, 1);
    /** World scale the object returns to after being dropped. */
    restScale = new Vector3(1, 1, 1);

    /** 'held' (not simulated), 'falling' or 'resting'. */
    state = 'held';

    #world;
    #object;
    #sphere = new Sphere();
    #prev = new Vector3();
    #startScale = new Vector3();
    #scaleT = 1;
    #home = new Matrix4();
    #onFloor = false;
    /** The mesh it last landed on, so it can ride it while resting. */
    #floorMesh = null;

    /**
     * @param {CollisionWorld} world
     * @param {Object3D} object The object to drive.
     * @param {Partial<PhysicsBody>} [options] Any of the public tuning fields.
     */
    constructor(world, object, options = {}) {
        this.#world = world;
        this.#object = object;
        Object.assign(this, options);

        object.updateWorldMatrix(true, false);
        this.#home.copy(object.matrixWorld);
        object.matrixWorld.decompose(this.position, this.quaternion, this.restScale);
        this.scale.copy(this.restScale);
    }

    get object() { return this.#object; }

    /** Stop simulating, e.g. because the player picked the object up. */
    hold() {
        this.state = 'held';
    }

    /**
     * Release the object so it falls.
     * @param {Matrix4} [worldMatrix] Where it starts (defaults to where it is now).
     * @param {Vector3} [velocity] Initial velocity in m/s.
     * @param {Vector3} [angularVelocity] Initial spin in rad/s (local axes).
     */
    drop(worldMatrix, velocity = new Vector3(), angularVelocity = null) {
        if (!worldMatrix) {
            this.#object.updateWorldMatrix(true, false);
            worldMatrix = this.#object.matrixWorld;
        }
        worldMatrix.decompose(this.position, this.quaternion, this.scale);
        this.velocity.copy(velocity);
        this.angularVelocity.copy(angularVelocity ?? new Vector3(
            MathUtils.randFloatSpread(8), MathUtils.randFloatSpread(4), MathUtils.randFloatSpread(8)));
        this.#startScale.copy(this.scale);
        this.#scaleT = 0;
        this.#onFloor = false;
        this.#floorMesh = null;
        this.state = 'falling';
        this.#sync();
    }

    /** @param {number} dt seconds since the last frame. */
    update(dt) {
        if (this.state === 'held') return;

        if (this.#scaleT < 1) {
            this.#scaleT = Math.min(1, this.#scaleT + dt / this.scaleTime);
            this.scale.lerpVectors(this.#startScale, this.restScale, MathUtils.smootherstep(this.#scaleT, 0, 1));
        }

        if (this.state === 'resting' && this.#floorMesh) {
            // Ride along if it's resting on something that moves (the carousel).
            const motion = this.#world.getMotion(this.#floorMesh);
            if (motion) {
                this.position.applyMatrix4(motion);
                _q.setFromRotationMatrix(motion);
                this.quaternion.premultiply(_q);
            }
        }

        if (this.state === 'falling') {
            const step = dt / this.subSteps;
            for (let i = 0; i < this.subSteps && this.state === 'falling'; i++) this.#step(step);

            if (this.position.y < this.killY) {
                this.#home.decompose(this.position, this.quaternion, this.restScale);
                this.velocity.set(0, 0, 0);
                this.#floorMesh = null;
                this.state = 'resting';
            }
        }
        this.#sync();
    }

    #step(dt) {
        const v = this.velocity;
        v.y -= this.gravity * dt;

        // Swept test first: a small, fast object can move further than its own
        // size in one step and skip straight through the floor.
        this.#prev.copy(this.position);
        const distance = v.length() * dt;
        if (distance > 1e-9) {
            _dir.copy(v).normalize();
            const hit = this.#world.raycast(this.position, _dir, distance + this.radius);
            if (hit) {
                // Stop just short of the surface and bounce.
                this.position.copy(hit.point).addScaledVector(hit.normal, this.radius);
                this.#contact(hit.normal);
            } else {
                this.position.addScaledVector(v, dt);
            }
        }

        // Then resolve any overlap (resting on, or sliding along, surfaces).
        this.#onFloor = false;
        this.#floorMesh = null;
        this.#sphere.set(this.position, this.radius);
        const contacts = this.#world.collideSphere(this.#sphere, this.#prev);
        this.position.copy(this.#sphere.center);
        for (const { normal, mesh } of contacts) {
            this.#contact(normal);
            if (normal.y > 0.7) this.#floorMesh = mesh;
        }

        // Spin while airborne; once on the floor ease toward lying flat.
        if (this.#onFloor) {
            this.angularVelocity.multiplyScalar(Math.max(0, 1 - 10 * dt));
            this.#flatten(1 - Math.exp(-this.settleRate * dt));
        } else {
            const w = this.angularVelocity;
            _q.setFromEuler(new Euler(w.x * dt, w.y * dt, w.z * dt));
            this.quaternion.multiply(_q);
        }

        if (this.#onFloor && v.length() < this.restSpeed) {
            v.set(0, 0, 0);
            this.angularVelocity.set(0, 0, 0);
            this.#flatten(1);
            this.state = 'resting';
        }
    }

    #contact(normal) {
        const v = this.velocity;
        const into = v.dot(normal);
        if (into < 0) {
            // Split into the part going into the surface and the sliding part.
            _v.copy(normal).multiplyScalar(into);
            v.sub(_v);                                     // tangential only
            v.multiplyScalar(1 - this.friction);           // friction on sliding
            const bounceSpeed = -into * this.bounce;
            // Kill tiny bounces so it settles instead of jittering.
            if (bounceSpeed > 0.4) v.addScaledVector(normal, bounceSpeed);
        }
        if (normal.y > 0.7) this.#onFloor = true;
    }

    /** Rotate toward local +Y = world up, keeping the current heading. */
    #flatten(amount) {
        const localUp = _v.copy(_up).applyQuaternion(this.quaternion);
        _q.setFromUnitVectors(localUp, _up).multiply(this.quaternion);
        this.quaternion.slerp(_q, amount);
    }

    #sync() {
        const object = this.#object;
        _m.compose(this.position, this.quaternion, this.scale);
        // Convert from world space into the parent's space.
        if (object.parent) {
            object.parent.updateWorldMatrix(true, false);
            _m.premultiply(new Matrix4().copy(object.parent.matrixWorld).invert());
        }
        object.matrixAutoUpdate = false;
        object.matrix.copy(_m);
        object.matrixWorldNeedsUpdate = true;
    }
}

export { PhysicsBody };
