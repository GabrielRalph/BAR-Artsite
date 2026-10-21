import * as THREE from "three"

export class BasicScene extends HTMLElement {
    #rendering = false;

    constructor() {
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
            Math.min(window.devicePixelRatio, 2)
        );

        this.renderer.setSize(
            width,
            height
        );

        this.scene = new THREE.Scene();
        this.mainGroup = new THREE.Group();
        this.scene.add(this.mainGroup);
        this.setupLighting();

        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(this);

        this.appendChild(this.renderer.domElement);
        this.load();
    }


    rotateCamera(deltaX, deltaY) {
        this.mainGroup.rotation.y += deltaX;
        this.mainGroup.rotation.x += deltaY;
    }


    async load() {
    }


    connectedCallback() {
        this.startRenderingLoop();
    }


    setupLighting() {
        // this.ambientLight = new THREE.HemisphereLight(
        //     0xffffff,
        //     0xffffff,
        //     .1
        // );
        // this.scene.add(this.ambientLight);

        // // scene background white
        // // this.scene.background = new THREE.Color(0xffffff);
        // this.directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        // this.directionalLight.position.set(5, 10, 7.5);
        // this.scene.add(this.directionalLight);
    }


    beforeRender() {

    }
    render() {
        this.renderer.render(this.scene, this.camera);
    }


    async startRenderingLoop() {
        if (this.#rendering) return;
        this.#rendering = true;
        while (this.#rendering) {
            this.beforeRender();
            this.render();
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
}
