import * as THREE from "three"

export class BasicScene extends HTMLElement {
    #rendering = false;
    #updateAbles = [];

    constructor(scene) {
        super();

        const { width, height } = this.getViewportSize();

        this.camera = new THREE.PerspectiveCamera(
            75,
            width / height,
            0.1,
            1000
        );

        this.camera.position.set(0, 1.7, 5);

        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
        });

        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFShadowMap;
        this.renderer.setPixelRatio(
            window.devicePixelRatio
        );

        this.renderer.setSize(
            width,
            height
        );

        if (scene instanceof THREE.Scene) {
            this.scene = scene;
        } else {
            this.scene = new THREE.Scene();
            this.mainGroup = new THREE.Group();
            this.scene.add(this.mainGroup);
        }


        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(this);

    }


    rotateCamera(deltaX, deltaY) {
        this.mainGroup.rotation.y += deltaX;
        this.mainGroup.rotation.x += deltaY;
    }

    connectedCallback() {
        this.appendChild(this.renderer.domElement);
        this.startRenderingLoop();
    }

    addUpdater(updater) {
        if (updater instanceof Function || (updater && updater.update instanceof Function)) {
            this.#updateAbles.push(updater);
        }
    }

    updateUpdaters(dt) {
        for (const updater of this.#updateAbles) {
            if (updater instanceof Function) {
                updater(dt);
            } else if (updater && updater.update instanceof Function) {
                updater.update(dt);
            }
        }
    }



    beforeRender(dt) {
        this.updateUpdaters(dt);
    }

    render(dt) {
        this.renderer.render(this.scene, this.camera);
    }

    async startRenderingLoop() {
        if (this.#rendering) return;
        this.#rendering = true;
        let then = performance.now() / 1000;
        while (this.#rendering) {
            let now = performance.now() / 1000;
            let dt = now - then;
            then = now;
            this.beforeRender(dt);
            this.render(dt);
            await new Promise(requestAnimationFrame);
        }
    }

    stopRenderingLoop() {
        this.#rendering = false;
    }



    getViewportSize() {
        return {
            width: Math.max(1, this.clientWidth),
            height: Math.max(1, this.clientHeight)
        };
    }

    resize() {
        const { width, height } = this.getViewportSize();
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(
            width,
            height
        );
    }


    static define(name = "basic-scene") {
        customElements.define(name, this);
    }
}
