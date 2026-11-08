import { BasicScene } from "./basic-scene";
import * as THREE from "three";
import { Keyboard } from "./keyboard";
import { TouchControls } from "./touch-controls";

import { LabScene } from "./a2.js";

import { RectAreaLightHelper } from "three/examples/jsm/helpers/RectAreaLightHelper.js";


import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SelectiveGlowPass } from "./glow-pass.js";
import { FirstPersonPlayer } from "./fpp.js";
import { CollisionWorld } from "./collision-world.js";
import { PhysicsBody } from "./physics-body.js";



class WaypointAnimation {
    #waypoints = [];
    #time = 0;
    #ended = false;

    constructor(object) {
        this.object = object;
    }

    /**
     * @param {...[THREE.Vector3, THREE.Euler, THREE.Vector3, number, (t: number) => number]} args
     * @overload
     * @param {...[THREE.Matrix4, number, (t: number) => number]} args
     */
    add(...args) {
        let rotation, position, scale, duration, timingFunction;
        if (args[0] instanceof THREE.Matrix4) {
            const decomposed = new THREE.Vector3();
            scale = new THREE.Vector3();
            rotation = new THREE.Euler();
            args[0].decompose(decomposed, new THREE.Quaternion().setFromEuler(rotation), scale);
            position = decomposed;
            duration = args[1];
            timingFunction = args[2] ?? ((t) => t);
            
        } else if (args[0] instanceof THREE.Vector3) {
            position = args[0];
            rotation = args[1];
            scale = args[2];
            duration = args[3];
            timingFunction = args[4] ?? ((t) => t);
        }

        const waypoint = { position, rotation, scale, duration, timingFunction };
        this.#waypoints.push(waypoint);
    }

    get totalDuration() {
        return this.#waypoints.slice(1).reduce((sum, wp) => sum + wp.duration, 0);
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
            if (t > cumlativeDurations[cumlativeDurations.length - 1]) {
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

                console.log("localT:", localT);
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
                console.log("matrix:", scale.x);
                return m;
            }
        }
    }

    update(dt) {
        this.#time += dt;
        this.object.matrixAutoUpdate = false;
        this.object.matrix.copy(this.getMatrixAt(this.#time));

        if (this.#time > this.totalDuration) {
            if (!this.#ended) {
                this.onEnded?.();
                this.#ended = true;
            }
        }

    }

}


class WalkThroughScene extends BasicScene {

    lastT = null;
    selectedObject = null;
    /** Solid scene geometry shared by the player and physics bodies. */
    world = new CollisionWorld();
    player = new FirstPersonPlayer(this.world);
    /** @type {Map<THREE.Object3D, PhysicsBody>} objects that fall when dropped */
    bodies = new Map();
    animations = []

    maxSelectDistance = 1.8;
 
    constructor() {
        super();
        this.keyboard = new Keyboard();
        this.keyboard.onKeyDown(" ", () => this.player.jump());
        this.keyboard.onKeyDown("e", () => this.interact());

        this.touch = new TouchControls(this);
        this.touch.onLook((dx, dy) => this.player.look(dx, dy));
        this.touch.onJump(() => this.player.jump());
        window.wts = this;
        // this.player.position = new THREE.Vector3(0, 0, 5);

        this.setupPostProcessing();
    }

    setupPostProcessing() {
        const { width, height } = this.getViewportSize();
        // Multisampled target so we keep antialiasing when rendering through the composer.
        const target = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, samples: 4 });
        this.composer = new EffectComposer(this.renderer, target);
        this.composer.addPass(new RenderPass(this.scene, this.camera));

        this.glowPass = new SelectiveGlowPass(this.scene, this.camera, {
            color: 0xd8ecff,
            strength: 1.6,
            radius: 0.45,
            surface: 0.12,
        });
        this.composer.addPass(this.glowPass);

        // Color space conversion and tone mapping, which the renderer would normally do itself.
        this.composer.addPass(new OutputPass());
        this.composer.setSize(width, height);
    }

    render() {
        if (this.composer && this.glowPass?.numberOfSelectedObjects > 0) {
            this.composer.render();
        } else {
            super.render();
        }
    }

    resize() {
        super.resize();
        const { width, height } = this.getViewportSize();
        this.composer?.setSize(width, height);
    }


 
    // Renders the room once into a cube map so metal surfaces reflect the room instead of black.
    captureEnvironment() {
        const target = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
        const cubeCamera = new THREE.CubeCamera(0.05, 50, target);
        cubeCamera.position.set(0, 1.5, 0);

        // Hide the carousel so it doesn't appear in its own reflection.
        // this.carousel.visible = false;
        this.labScene.getNodePath("CarouselGroup").visible = false;
        cubeCamera.update(this.renderer, this.scene);
        this.labScene.getNodePath("CarouselGroup").visible = true;

        // PMREM pre-blurs the cube map so rough metals get a matching blurry reflection.
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        this.scene.environment = pmrem.fromCubemap(target.texture).texture;
        pmrem.dispose();
        target.dispose();
    }



    /**
     * @param {THREE.InstancedMesh} lights
     */
    getLightRegions(lights) {
        lights.material.emissiveIntensity = 8;
        lights.updateWorldMatrix(true, false);
        if (!lights.geometry.boundingBox) lights.geometry.computeBoundingBox();
        const localBox = lights.geometry.boundingBox.clone();

        const instanceMatrix = new THREE.Matrix4();
        const worldMatrix = new THREE.Matrix4();
        for (let i = 0; i < lights.count; i++) {
            lights.getMatrixAt(i, instanceMatrix);
            worldMatrix.multiplyMatrices(lights.matrixWorld, instanceMatrix);
            const ibox = localBox.clone().applyMatrix4(worldMatrix);
            this.createLightPanel(ibox.min.x, ibox.min.z, ibox.max.x, ibox.max.z);
        }
    }

    createLightPanel(x1, y1, x2, y2) {
        const cx = (x1 + x2) / 2;
        const cz = (y1 + y2) / 2;
        const spot = new THREE.SpotLight(0xffffff, 20, 8, Math.PI / 2.5, 0.8, 2);
        spot.position.set(cx, 3.9, cz);
        spot.target.position.set(cx, 0, cz);
        spot.castShadow = true;
        spot.shadow.mapSize.set(2048, 2048);
        spot.shadow.bias = -0.01;     // stops striped "shadow acne"
        spot.shadow.normalBias = 0.02;
        this.scene.add(spot, spot.target);
    }

    setupShadows() {
        console.log("Setting up shadows");
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFShadowMap;
        this.renderer.shadowMap.autoUpdate = false;
        this.renderer.shadowMap.needsUpdate = true;
        for (const [key, cast, recv] of [["Room", false, true], ["StaticObjects", true, false], ["CarouselGroup", true, true]]) {
            const node = this.labScene.getNodePath(key);
            if (node) node.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = cast;
                    child.receiveShadow = recv;
                }
            });
        }
    }

    
    

    rayCastFromCenter() {
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        //perform raycasting from the center of the screen
        const intersects = raycaster.intersectObjects(this.scene.children, true);
        const i0 = intersects[0] ?? null;
        let intersected = i0?.object ?? null;
        let hitDistance = i0?.distance ?? null;
        console.log("intersected:", intersected ? intersected.name : null, "hitDistance:", hitDistance);
        if (hitDistance < this.maxSelectDistance) {

            while (intersected && !intersected.isSelectable) {
                intersected = intersected.parent;
            }
            if (intersected) {
                return intersected;
            }
        }
        return null;
    }


    makeMoveable(object) {
        object.isSelectable = true;
        // Sphere collider about the coin's half-thickness, so it lands flat on the floor.
        this.bodies.set(object, new PhysicsBody(this.world, object, { radius: 0.07, bounce: 0.35, friction: 0.5 }));
        object.onSelect = () => {
            if (this.selectedObject !== object) {
                this.dropSelected();
            }   
            this.bodies.get(object)?.hold();
            this.glowPass.add(object);
            this.selectedObject = object;
        };
    }



    async load() {
        let promts = document.createElement("div");
        promts.id = "promts";
        this.appendChild(promts);
        this.prompts = promts;
        promts.addEventListener("click", () => this.interact());

        await LabScene.load();
        const labScene = new LabScene();
        this.labScene = labScene;
        this.scene.add(labScene);
        await labScene.setupWindowView();


        this.setupCollisions();

        // Make the coin selectable
        this.makeMoveable(this.labScene.getNodePath("Coin"));

        // Make the key selectable
        this.makeMoveable(this.labScene.getNodePath("Key"));

        const coinSlot = this.labScene.getNodePath("CoinSlot");
        coinSlot.isSelectable = true;
        coinSlot.onSelect = () => {
            if (this.selectedObject && this.selectedObject.name === "Coin") {
                this.playCoinInsertAnimation();
            }
        };

        this.getLightRegions(this.labScene.getNodePath("Lights"));
        this.setupShadows();
        this.captureEnvironment();


        let lastPointerType = "mouse";
        document.addEventListener('pointerdown', (event) => {
            lastPointerType = event.pointerType;
        });

        document.body.addEventListener('click', () => {
            if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen().catch(() => {});
            }
            if (lastPointerType === "mouse") {
                document.body.requestPointerLock();
            }

            this.interact();
        });

        document.addEventListener('mousemove', (event) => {
            if (document.pointerLockElement === document.body) {
                this.player.look(event.movementX, event.movementY);
            }
        });
    }


    playCoinInsertAnimation() {
        const coin = this.labScene.getNodePath("Coin");
        this.glowPass.remove(coin);
        const coinAnimation = new WaypointAnimation(coin);
        coinAnimation.add(coin.matrix, 10); // Example waypoint, adjust as needed

        const pos2 = new THREE.Vector3(3.179, 1.62, 2.93);
        const rotation = new THREE.Euler(Math.PI/2, 0, -Math.PI/2); // Example rotation, adjust as needed
        coinAnimation.add(pos2, rotation, new THREE.Vector3(1.2, 1.2, 1.2),  1); // Example waypoint, adjust as needed

        const rot2 = new THREE.Euler(3 * Math.PI/4, 0, -Math.PI/2);
        coinAnimation.add(pos2.clone().add(new THREE.Vector3(0, -0.01, 0.1)), rot2, new THREE.Vector3(1.2, 1.2, 1.2), 0.3);
        this.animations.push(coinAnimation);

        coinAnimation.onEnded = () => {
            this.spinCarousel = true;
        };
        

    
        // Implement the coin insert animation logic here
    }



    


    /** Click / "e": drop what we're holding, otherwise try to pick something up. */
    interact() {
        const selected = this.rayCastFromCenter();
        if (!selected && this.selectedObject) {
            this.dropSelected();
        } else if (selected) {
            selected.onSelect?.();


            
        } 
   
    }

    /** Lets go of the held object. If it has a PhysicsBody it falls to the floor. */
    dropSelected() {
        const object = this.selectedObject;
        if (!object) return;
        this.glowPass.remove(object);
        this.selectedObject = null;

        const body = this.bodies.get(object);
        if (body) {
            // Inherit the player's motion plus a gentle forward toss.
            const forward = new THREE.Vector3(0, 0, -1)
                .applyEuler(new THREE.Euler(this.player.pitch, this.player.yaw, 0, 'YXZ'));
            const velocity = this.player.velocity.addScaledVector(forward, 1.5);
            body.drop(null, velocity); // starts from where it's currently held
        }
    }

    /**
     * Tells the collision world which parts of the scene are solid.
     *
     * If the GLB has a top-level "Colliders" node, only its meshes are used
     * (and they're hidden) - this is the recommended setup: simple invisible
     * boxes / ramps modelled in Blender. Otherwise falls back to the visible
     * room, static furniture and carousel meshes.
     */
    setupCollisions() {
        const colliders = this.labScene.getNodePath("Colliders");
        if (colliders) {
            colliders.visible = false;
            this.world.add(colliders);
        } else {
            for (const name of ["Room", "StaticObjects"]) {
                const node = this.labScene.getNodePath(name);
                if (node) this.world.add(node);
            }
        }

        // The carousel spins (and its crabs/poles bob), so it's tracked as a
        // moving obstacle that the player and dropped objects can ride.
        const carousel = this.labScene.getNodePath("CarouselGroup");
        if (carousel) this.world.add(carousel, { dynamic: true });

        // Start clear of the carousel (which sits around the origin), facing it.
        this.player.position = new THREE.Vector3(0, .3, 1.8);
    }




    updateMotion() {
        const direction = new THREE.Vector2();
        if (this.keyboard.isDown("w") || this.keyboard.isDown("ArrowUp")) {
            direction.y -= 1;
        }
        if (this.keyboard.isDown("s") || this.keyboard.isDown("ArrowDown")) {
            direction.y += 1;
        }
        if (this.keyboard.isDown("a") || this.keyboard.isDown("ArrowLeft")) {
            direction.x -= 1;
        }
        if (this.keyboard.isDown("d") || this.keyboard.isDown("ArrowRight")) {
            direction.x += 1;
        }
        direction.x += this.touch.move.x;
        direction.y += this.touch.move.z;
       
        this.player.move(direction);
    }

    beforeRender() {
        if (this.lastT === null) this.lastT = performance.now();
        const now = performance.now();
        const deltaTime = (Math.min(now - this.lastT, 100)) / 1000;
        this.lastT = now;

        // Animate moving obstacles first, then let the collision world pick up
        // their new pose before anything collides with them.
        if (this.labScene && this.spinCarousel) {
            this.labScene.carouselTheta = performance.now() * 0.001;
            this.labScene.getNodePath("Water").height += deltaTime * 0.05;
        }

        this.world.update();

        this.updateMotion();
        this.player.update(deltaTime);
        this.player.transformCamera(this.camera);
        for (const body of this.bodies.values()) body.update(deltaTime);
        if (this.selectedObject) {
            const matrixInFront = this.player.getMatrixInFront(0.25, -0.25, -0.25);
            const rotateX = new THREE.Matrix4().makeRotationX(Math.PI / 2);
            matrixInFront.multiply(rotateX);
            matrixInFront.scale(new THREE.Vector3(0.5, 0.5, 0.5));
            // console.log("Updating selected object in front of player", this.selectedObject);
            this.selectedObject.matrixAutoUpdate = false;
            this.selectedObject.matrix.copy(matrixInFront);
        }
        for (const animation of this.animations) {
            animation.update(deltaTime);
        }
    
    }

}

customElements.define("basic-scene", WalkThroughScene);