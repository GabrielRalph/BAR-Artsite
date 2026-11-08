import { Vector3, Triangle, Plane, Box3, Ray, Matrix4 } from 'three';
import { Octree } from 'three/addons/math/Octree.js';
import { Capsule } from 'three/addons/math/Capsule.js';

/**
 * @typedef {Object} Contact
 * @property {Vector3} normal  Unit vector pointing out of the surface, toward the body.
 * @property {number}  depth   How far the body was pushed out along `normal`.
 * @property {Vector3} point   Point on the surface that was touched.
 * @property {Object3D} object The obstacle (as passed to `add`) that was hit.
 * @property {Mesh}    mesh    The specific mesh that was hit. Pass it to
 *   `getMotion()` to find out how that surface moved this frame.
 */

/**
 * @typedef {Object} RayHit
 * @property {number}  distance Distance from the ray origin.
 * @property {Vector3} point    World-space hit point.
 * @property {Vector3} normal   Surface normal, facing back toward the ray origin.
 * @property {Object3D} object  The obstacle (as passed to `add`) that was hit.
 * @property {Mesh}    mesh     The specific mesh that was hit.
 */

/**
 * One moving mesh. Its triangles are baked once, in world space, at the pose
 * the mesh had when the world was built ("bake space"). `matrix` maps bake
 * space to where the mesh is now. As long as the mesh only moves rigidly
 * (rotates / translates, no change of scale) that matrix is rigid too, so
 * capsules and spheres can be moved into bake space without distorting them.
 * @typedef {Object} Part
 * @property {Mesh}     mesh
 * @property {Object3D} object      The obstacle the mesh belongs to.
 * @property {Octree}   octree      Triangles in bake space.
 * @property {Matrix4}  bakeInverse Inverse of the mesh's world matrix at bake time.
 * @property {Matrix4}  matrix      Bake space -> current world space.
 * @property {Matrix4}  inverse     Current world space -> bake space.
 * @property {Matrix4}  motion      How the mesh moved during the last `update()` (world space).
 */

const _plane = new Plane();
const _flipped = new Triangle();
const _box = new Box3();
const _ray = new Ray();
const _hit = new Vector3();
const _normal = new Vector3();
const _m = new Matrix4();
const _instance = new Matrix4();
const _capsule = new Capsule();
const _prev = new Vector3();
const _origin = new Vector3();
const _dir = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();

/**
 * The solid geometry of the scene, shared by everything that needs to bump
 * into it (the player, dropped objects, ...).
 *
 * Register solid objects with `add()`. Static obstacles have their triangles
 * baked into one octree in world space the next time a query runs; if you
 * move one, call `refresh()`.
 *
 * Moving obstacles (e.g. the spinning carousel) are added with
 * `add(object, { dynamic: true })`. Every mesh beneath them gets its own
 * octree, baked once. Each query moves the body into that mesh's bake space,
 * collides there, and moves it back out. Call `update()` once per frame after
 * animating them (and before stepping bodies) so the world picks up their new
 * pose. `getMotion(contact.mesh)` then tells a body how the surface it's
 * touching moved, so it can ride along.
 *
 * Collision is two-sided: each triangle pushes a body out toward the side it
 * was on before it moved (`prevCenter`), regardless of which way the face
 * normal points. So a closed room mesh works whether its normals face in or out.
 */
class CollisionWorld {
    /** @type {Map<Object3D, {dynamic: boolean}>} */
    #obstacles = new Map();
    #octree = null;
    /** @type {Part[]} */
    #parts = [];
    /** @type {Map<Mesh, Part>} */
    #partsByMesh = new Map();
    #dirty = false;

    /**
     * Registers an object (and every mesh beneath it) as solid. Uses its
     * current world transform. Meshes with `userData.noCollide = true` are skipped.
     * @param {Object3D} object
     * @param {Object} [options]
     * @param {boolean} [options.dynamic=false] The object (or meshes inside it)
     *   moves. Its meshes must only move rigidly - scaling isn't supported.
     */
    add(object, { dynamic = false } = {}) {
        this.#obstacles.set(object, { dynamic });
        this.#dirty = true;
        return this;
    }

    /** @param {Object3D} object */
    remove(object) {
        this.#obstacles.delete(object);
        this.#dirty = true;
        return this;
    }

    /** Re-reads every obstacle's geometry and transform. */
    refresh() {
        this.#dirty = true;
    }

    /**
     * Picks up the current pose of every dynamic obstacle and records how far
     * each one moved since the last call. Call once per frame, after
     * animating, before updating bodies.
     */
    update() {
        this.#build();
        for (const part of this.#parts) {
            part.mesh.updateWorldMatrix(true, false);
            _m.multiplyMatrices(part.mesh.matrixWorld, part.bakeInverse);
            part.motion.multiplyMatrices(_m, part.inverse); // new * old⁻¹
            part.matrix.copy(_m);
            part.inverse.copy(_m).invert();
        }
    }

    /**
     * How a surface moved during the last `update()`: a world-space matrix
     * that takes a point riding on it from its old position to its new one.
     * Returns null for static surfaces.
     * @param {Mesh} mesh Usually `contact.mesh` or `hit.mesh`.
     * @returns {Matrix4|null}
     */
    getMotion(mesh) {
        return this.#partsByMesh.get(mesh)?.motion ?? null;
    }

    /** True when there is nothing to collide with. */
    get isEmpty() {
        this.#build();
        return this.#octree === null && this.#parts.length === 0;
    }

    /**
     * Pushes `capsule` out of the world (modifies it in place).
     * @param {Capsule} capsule
     * @param {Vector3} prevCenter Centre of the body before this step's move.
     * @returns {Contact[]}
     */
    collideCapsule(capsule, prevCenter) {
        this.#build();
        const contacts = [];
        const octree = this.#octree;
        if (octree) {
            const triangles = [];
            octree.getCapsuleTriangles(capsule, triangles);
            this.#resolve(triangles, prevCenter, contacts,
                (tri) => octree.triangleCapsuleIntersect(capsule, tri),
                (offset) => capsule.translate(offset));
        }

        for (const part of this.#parts) {
            _capsule.copy(capsule);
            _capsule.start.applyMatrix4(part.inverse);
            _capsule.end.applyMatrix4(part.inverse);
            const triangles = [];
            part.octree.getCapsuleTriangles(_capsule, triangles);
            if (triangles.length === 0) continue;

            _prev.copy(prevCenter).applyMatrix4(part.inverse);
            const local = [];
            this.#resolve(triangles, _prev, local,
                (tri) => part.octree.triangleCapsuleIntersect(_capsule, tri),
                (offset) => _capsule.translate(offset));
            if (local.length === 0) continue;

            capsule.start.copy(_capsule.start).applyMatrix4(part.matrix);
            capsule.end.copy(_capsule.end).applyMatrix4(part.matrix);
            for (const contact of local) contacts.push(toWorld(contact, part));
        }
        return contacts;
    }

    /**
     * Pushes `sphere` out of the world (modifies it in place).
     * @param {Sphere} sphere
     * @param {Vector3} prevCenter Centre of the body before this step's move.
     * @returns {Contact[]}
     */
    collideSphere(sphere, prevCenter) {
        this.#build();
        const contacts = [];
        const octree = this.#octree;
        if (octree) {
            const triangles = [];
            octree.getSphereTriangles(sphere, triangles);
            this.#resolve(triangles, prevCenter, contacts,
                (tri) => octree.triangleSphereIntersect(sphere, tri),
                (offset) => sphere.center.add(offset));
        }

        for (const part of this.#parts) {
            const local = sphere.clone();
            local.center.applyMatrix4(part.inverse);
            const triangles = [];
            part.octree.getSphereTriangles(local, triangles);
            if (triangles.length === 0) continue;

            _prev.copy(prevCenter).applyMatrix4(part.inverse);
            const localContacts = [];
            this.#resolve(triangles, _prev, localContacts,
                (tri) => part.octree.triangleSphereIntersect(local, tri),
                (offset) => local.center.add(offset));
            if (localContacts.length === 0) continue;

            sphere.center.copy(local.center).applyMatrix4(part.matrix);
            for (const contact of localContacts) contacts.push(toWorld(contact, part));
        }
        return contacts;
    }

    /**
     * Finds the nearest surface along a ray. Hits both sides of faces.
     * @param {Vector3} origin
     * @param {Vector3} direction Unit vector.
     * @param {number} [far=Infinity] Ignore hits further than this.
     * @returns {RayHit|null}
     */
    raycast(origin, direction, far = Infinity) {
        this.#build();
        let best = this.#octree ? raycastOctree(this.#octree, origin, direction, far) : null;

        for (const part of this.#parts) {
            _origin.copy(origin).applyMatrix4(part.inverse);
            _dir.copy(direction).transformDirection(part.inverse);
            const hit = raycastOctree(part.octree, _origin, _dir, best ? best.distance : far);
            if (!hit) continue;
            hit.point.applyMatrix4(part.matrix);
            hit.normal.transformDirection(part.matrix);
            best = hit;
        }
        return best;
    }

    #resolve(triangles, prevCenter, contacts, intersect, translate) {
        for (const triangle of triangles) {
            // three's tests push the body out along the face normal. If the body
            // was behind the face, test the same triangle with reversed winding,
            // which flips its normal toward the body.
            triangle.getPlane(_plane);
            let tri = triangle;
            if (_plane.distanceToPoint(prevCenter) < 0) {
                tri = _flipped.set(triangle.a, triangle.c, triangle.b);
            }
            const hit = intersect(tri);
            if (!hit || !(hit.depth > 1e-10)) continue;
            translate(hit.normal.clone().multiplyScalar(hit.depth));
            contacts.push({ normal: hit.normal, depth: hit.depth, point: hit.point, object: triangle.object, mesh: triangle.mesh });
        }
        return contacts;
    }

    #build() {
        if (!this.#dirty) return;
        // An Octree can't be extended after it's built, so rebuild from scratch.
        const octree = new Octree();
        let hasTriangles = false;
        this.#parts = [];
        this.#partsByMesh.clear();

        for (const [obstacle, { dynamic }] of this.#obstacles) {
            obstacle.updateWorldMatrix(true, true);
            obstacle.traverse((mesh) => {
                if (!mesh.isMesh || mesh.userData.noCollide) return;
                if (!dynamic) {
                    if (addMeshTriangles(octree, mesh, obstacle)) hasTriangles = true;
                    return;
                }
                const partOctree = new Octree();
                if (!addMeshTriangles(partOctree, mesh, obstacle)) return;
                const part = {
                    mesh,
                    object: obstacle,
                    octree: partOctree.build(),
                    bakeInverse: mesh.matrixWorld.clone().invert(),
                    matrix: new Matrix4(),
                    inverse: new Matrix4(),
                    motion: new Matrix4(),
                };
                this.#parts.push(part);
                this.#partsByMesh.set(mesh, part);
            });
        }
        this.#octree = hasTriangles ? octree.build() : null;
        this.#dirty = false;
    }
}

/**
 * Adds a mesh's triangles (every instance, for an InstancedMesh) to `octree`
 * in world space. Returns true if any were added.
 */
function addMeshTriangles(octree, mesh, obstacle) {
    const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
    const pos = geometry.getAttribute('position');
    const count = mesh.isInstancedMesh ? mesh.count : 1;
    let added = false;
    for (let k = 0; k < count; k++) {
        if (mesh.isInstancedMesh) {
            mesh.getMatrixAt(k, _instance);
            _m.multiplyMatrices(mesh.matrixWorld, _instance);
        } else {
            _m.copy(mesh.matrixWorld);
        }
        for (let i = 0; i + 2 < pos.count; i += 3) {
            _a.fromBufferAttribute(pos, i).applyMatrix4(_m);
            _b.fromBufferAttribute(pos, i + 1).applyMatrix4(_m);
            _c.fromBufferAttribute(pos, i + 2).applyMatrix4(_m);
            const tri = new Triangle(_a.clone(), _b.clone(), _c.clone());
            if (tri.getArea() < 1e-12) continue; // degenerate triangles have no normal
            tri.object = obstacle;
            tri.mesh = mesh;
            octree.addTriangle(tri);
            added = true;
        }
    }
    if (geometry !== mesh.geometry) geometry.dispose();
    return added;
}

/** Nearest hit against one octree, in that octree's space. */
function raycastOctree(octree, origin, direction, far) {
    _ray.set(origin, direction);
    const triangles = [];
    if (Number.isFinite(far)) {
        // For short rays only gather triangles near the segment.
        _box.makeEmpty().expandByPoint(origin)
            .expandByPoint(_hit.copy(origin).addScaledVector(direction, far));
        octree.getBoxTriangles(_box, triangles);
    } else {
        octree.getRayTriangles(_ray, triangles);
    }

    let best = null;
    for (const tri of triangles) {
        if (!_ray.intersectTriangle(tri.a, tri.b, tri.c, false, _hit)) continue;
        const distance = _hit.distanceTo(origin);
        if (distance > far || (best && distance >= best.distance)) continue;
        tri.getNormal(_normal);
        if (_normal.dot(direction) > 0) _normal.negate();
        best = { distance, point: _hit.clone(), normal: _normal.clone(), object: tri.object, mesh: tri.mesh };
    }
    return best;
}

/** Converts a contact found in a part's bake space to world space (in place). */
function toWorld(contact, part) {
    contact.normal.transformDirection(part.matrix);
    contact.point.applyMatrix4(part.matrix);
    return contact;
}

export { CollisionWorld };
