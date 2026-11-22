import * as THREE from "three";

class WaypointAnimation {
    #waypoints = [];
    #time = 0;
    #ended = false;
    /** Index of the last waypoint whose onStart has fired (-1 = none yet). */
    #current = -1;

    constructor(object, ended = false) {
        this.object = object;
        this.#ended = ended;
    }


    /**
     * @param {...[THREE.Vector3, THREE.Euler, THREE.Vector3, number, (t: number) => number]} args
     * @overload
     * @param {...[THREE.Matrix4, number, (t: number) => number]} args
     */
    add(options) {
        let {
            matrix = null,
            rotation = null,
            position = null,
            scale = 1,
            duration = 1,
            onEnd = null,
            onStart = null,
            timingFunction = null,
        } = options || {};

        if (matrix) {
            position = new THREE.Vector3();
            rotation = new THREE.Euler();
            scale = new THREE.Vector3();
            matrix.decompose(position, rotation, scale);
        }

        timingFunction = timingFunction instanceof Function 
            ? timingFunction
            : (t) => t;
         
        position = position instanceof THREE.Vector3 
            ? position : new THREE.Vector3();
        rotation = rotation instanceof THREE.Euler 
            ? rotation : new THREE.Euler();
        scale = scale instanceof THREE.Vector3 
            ? scale : new THREE.Vector3(scale, scale, scale);

        const waypoint = { position, rotation, scale, duration, timingFunction, onEnd, onStart };
        this.#waypoints.push(waypoint);
        return this;
    }

    get totalDuration() {
        return this.#waypoints.slice(1).reduce((sum, wp) => sum + wp.duration, 0);
    }


    getWaypointAt(t) {
        let waypoint = null;
        if (this.#waypoints.length > 0) {
            if (this.#waypoints.length === 1 || t < 0) {
                waypoint = this.#waypoints[0];
            } else {
                let durations = this.#waypoints.slice(1).map(wp => wp.duration);
                let cumlativeDurations = durations.map((d, i) => durations.slice(0, i + 1).reduce((a, b) => a + b, 0));
                if (t > cumlativeDurations[cumlativeDurations.length - 1]) return this.#waypoints[this.#waypoints.length - 1];
                let i = cumlativeDurations.findIndex(cd => t < cd);
                waypoint = this.#waypoints[i];
            }
        }
        return waypoint;
    }

    getMatrixAt(t) {
        if (this.#waypoints.length === 0) return new THREE.Matrix4();
        else if (this.#waypoints.length === 1 || t < 0) {
            const wp = this.#waypoints[0];
            const m = new THREE.Matrix4();
            m.makeRotationFromEuler(wp.rotation);
            m.setPosition(wp.position);
            m.scale(wp.scale);
            return m;
        } else {
            let durations = this.#waypoints.slice(1).map(wp => wp.duration);
            let cumlativeDurations = durations.map((d, i) => durations.slice(0, i + 1).reduce((a, b) => a + b, 0));
            if (t >= cumlativeDurations[cumlativeDurations.length - 1]) {
                const wp = this.#waypoints[this.#waypoints.length - 1];
                const m = new THREE.Matrix4();
                m.makeRotationFromEuler(wp.rotation);
                m.setPosition(wp.position);
                m.scale(wp.scale);
                return m;
            } else {
                let i = cumlativeDurations.findIndex(cd => t < cd);
                const wp0 = this.#waypoints[i];
                const wp1 = this.#waypoints[i + 1];
                const t0 = i === 0 ? 0 : cumlativeDurations[i - 1];
                const localT = (t - t0) / wp1.duration;

                const easedT = wp1.timingFunction(localT);

                const position = new THREE.Vector3().lerpVectors(wp0.position, wp1.position, easedT);
                const rotation = new THREE.Euler().setFromQuaternion(
                    new THREE.Quaternion().slerpQuaternions(
                        new THREE.Quaternion().setFromEuler(wp0.rotation),
                        new THREE.Quaternion().setFromEuler(wp1.rotation),
                        easedT
                    )
                );
                const scale = new THREE.Vector3().lerpVectors(wp0.scale, wp1.scale, easedT);
                const m = new THREE.Matrix4();
                m.makeRotationFromEuler(rotation);
                m.setPosition(position);
                m.scale(scale);
                return m;
            }
        }
    }

    moveTo(t) {
        this.object.matrixAutoUpdate = false;
        this.object.matrix.copy(this.getMatrixAt(t));
    }

    /** Index of the last waypoint reached at time t (waypoint 0 is reached at t = 0). */
    #reachedIndexAt(t) {
        let arrival = 0;
        let index = 0;
        for (let i = 1; i < this.#waypoints.length; i++) {
            arrival += this.#waypoints[i].duration;
            if (t >= arrival) index = i;
            else break;
        }
        return index;
    }

    /**
     * Waypoint callbacks:
     *   onStart - fires when the waypoint is reached
     *   onEnd   - fires when the animation moves on from it
     *             (for the last waypoint: when the animation finishes)
     */
    update(dt) {
        if (this.#ended || this.#waypoints.length === 0) return;

        this.#time += dt;

        // Walk through every waypoint reached since the last update, so a long
        // frame that skips over one still fires its callbacks.
        const reached = this.#reachedIndexAt(this.#time);
        while (this.#current < reached) {
            this.#waypoints[this.#current]?.onEnd?.();
            this.#current++;
            this.#waypoints[this.#current].onStart?.();
        }

        this.moveTo(this.#time);

        if (this.#time >= this.totalDuration) {
            this.#ended = true;
            this.#waypoints[this.#current]?.onEnd?.();
            this.onEnded?.();
        }
    }

    start() {
        this.#time = 0;
        this.#current = -1;
        this.#ended = false;
    }

}

export {WaypointAnimation}