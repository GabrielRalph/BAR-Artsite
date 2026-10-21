import { BasicScene } from "./basic-scene";
import { Carousel, Room, TexMaterial } from "./assets";
import * as THREE from "three";
import { Keyboard } from "./keyboard";
import { TouchControls } from "./touch-controls";
import { metalness, roughness } from "three/tsl";





class WalkThroughScene extends BasicScene {

    
    lastT = null;
    yaw = 0;
    pitch = 0;
    playerSpeedMax = 0.05;
    playerSpeedMin = 0.02;
    playerPosition = new THREE.Vector3(0, 1.6, 5);
    playerBob = new THREE.Vector3(0, 0, 0);
    timeSinceMove = null;
    bobFrequency = 0.023;
    bobAmountY = 0.03;
    bobAmountZ = 0.03;

    touchSpeedScale = 300;
    
    playerYOffset = 0;
    playerYVelocity = 0;
    floorY = 0;
    lastFloorY = 0;
    gravity = -0.005;

    roomHeight = 4;
    roomWidth = 6;
    roomDepth = 12;

 
    constructor() {
        super();
        this.keyboard = new Keyboard();
        this.keyboard.onKeyDown(" ", () => this.jump());
        this.keyboard.onKeyDown("e", () => this.interact());

        this.touch = new TouchControls(this);
        this.touch.onLook((dx, dy) => this.look(dx, dy));
        this.touch.onJump(() => this.jump());

    }

    interact() {
        if (this.room && this.room.nearCoinSlot(this.playerPosition)) {
            console.log("Interacting with coin slot");
            this.carousel.on = true;
            this.room.on = true;
        }
    }

    jump() {
        if (this.playerYOffset === this.floorY) {
            this.playerYVelocity = 0.1; // Jump velocity
        }
    }

    look(deltaYaw, deltaPitch) {
        this.yaw -= deltaYaw;
        this.pitch -= deltaPitch;

        // Prevent the camera from flipping upside down.
        const limit = Math.PI / 2 - 0.01;
        this.pitch = THREE.MathUtils.clamp(this.pitch, -limit, limit);
    }

    // Renders the room once into a cube map so metal surfaces reflect the room instead of black.
    captureEnvironment() {
        const target = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
        const cubeCamera = new THREE.CubeCamera(0.05, 50, target);
        cubeCamera.position.set(0, 1.5, 0);

        // Hide the carousel so it doesn't appear in its own reflection.
        this.carousel.visible = false;
        cubeCamera.update(this.renderer, this.scene);
        this.carousel.visible = true;

        // PMREM pre-blurs the cube map so rough metals get a matching blurry reflection.
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        this.scene.environment = pmrem.fromCubemap(target.texture).texture;
        pmrem.dispose();
        target.dispose();
    }

    async createRoom() {
        await Room.load((p) => console.log(`Room loading progress: ${p}`));
        const room = new Room(this.roomWidth, this.roomHeight, this.roomDepth);
        this.scene.add(room);
        this.room = room;
    }

    async createFloor() {
        try {

            const geometry = new THREE.PlaneGeometry(20, 20);

            // const textureLoader = new THREE.TextureLoader();
           
            // const texture = await textureLoader.loadAsync(import.meta.resolve('../assets/tiles.jpg'));
            // tile the texture
            // texture.wrapS = THREE.RepeatWrapping;
            // texture.wrapT = THREE.RepeatWrapping;
            // texture.repeat.set(10,10);
            

            const material = new TexMaterial(import.meta.resolve('../assets/t512'), {
                repeatX: 8,
                repeatY: 8,
                matalic: false,
                // normal: "png",
                metalness: 0,
                roughness: .9
            });
            const floor = new THREE.Mesh(geometry, material);
            floor.rotation.x = -Math.PI / 2;
            floor.receiveShadow = true;
            this.scene.add(floor);
            this.floor = floor;



            const image = new Image();
            image.src = import.meta.resolve('../assets/floor.svg');
            await new Promise((resolve) => {
                image.onload = resolve;
            });
            const canvas = document.createElement("canvas");
            canvas.width = image.width;
            canvas.height = image.height;
            const context = canvas.getContext("2d");
            context.drawImage(image, 0, 0);
            this.floorPixels = context.getImageData(0, 0, canvas.width, canvas.height);
        } catch (error) {
            console.error("Error creating floor:", error);
        }
    }

    // Returns the floor texture's color (THREE.Color) at world (x, z), or null if off the floor.
    getColorOfFloorAt(x, z) {
        if (!this.floorPixels) {
            return null;
        }

    
        // Convert world coordinates into the floor's local plane coordinates.
        this.floor.updateMatrixWorld();
        const local = this.floor.worldToLocal(new THREE.Vector3(x, 0, z));
        const { width, height } = this.floor.geometry.parameters;
        const u = local.x / width + 0.5;
        const v = local.y / height + 0.5;
        if (u < 0 || u > 1 || v < 0 || v > 1) {
            return null;
        }

        // Textures are flipped vertically, so v = 1 is the top row of the image.
        const { data, width: imageWidth, height: imageHeight } = this.floorPixels;
        const px = Math.min(Math.floor(u * imageWidth), imageWidth - 1);
        const py = Math.min(Math.floor((1 - v) * imageHeight), imageHeight - 1);
        const i = (py * imageWidth + px) * 4;
        const color = new THREE.Color().setRGB(
            data[i] / 255,
            data[i + 1] / 255,
            data[i + 2] / 255,
            THREE.SRGBColorSpace
        );
        const brightness = (data[i] + data[i + 1] + data[i + 2]) / (3 * 255);
        return { color, brightness: 0 };
    }


  



    async load() {

        let promts = document.createElement("div");
        promts.id = "promts";
        this.appendChild(promts);
        this.prompts = promts;
        promts.addEventListener("click", () => this.interact());


        await Promise.all([
            Carousel.load(),
            this.createFloor(),
            this.createRoom()
        ])

        this.carousel = new Carousel();
        this.carousel.position.set(this.roomWidth/8, 0, 0);
        this.scene.add(this.carousel);

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
        });

        document.addEventListener('mousemove', (event) => {
            if (document.pointerLockElement !== document.body) {
                return;
            }

            const sensitivity = 0.002;
            this.look(event.movementX * sensitivity, event.movementY * sensitivity);
        });
    }

    updateMotion(deltaTime) {
        
        const direction = new THREE.Vector3();
        if (this.keyboard.isDown("w") || this.keyboard.isDown("ArrowUp")) {
            direction.z -= 1;
        }
        if (this.keyboard.isDown("s") || this.keyboard.isDown("ArrowDown")) {
            direction.z += 1;
        }
        if (this.keyboard.isDown("a") || this.keyboard.isDown("ArrowLeft")) {
            direction.x -= 1;
        }
        if (this.keyboard.isDown("d") || this.keyboard.isDown("ArrowRight")) {
            direction.x += 1;
        }
        direction.x += this.touch.move.x;
        direction.z += this.touch.move.z;

        let isMove = direction.length() > 0 
        if (isMove && this.timeSinceMove == null) {
            this.timeSinceMove = performance.now();
        } else if (!isMove) {
            this.timeSinceMove = null;
        }

        // playerSpeedMax is the step per 60fps frame; scale by elapsed time so slow devices move just as fast.
        const speed = this.playerSpeedMax * (deltaTime / (1000 / 80));
        const oldPos = this.playerPosition.clone();
        // const speed = this.playerSpeedMin + (this.playerSpeedMax - this.playerSpeedMin) * (1 + Math.cos(Date.now() * 0.03)) / 2
        const directionWRSCamera = direction.clone().applyEuler(new THREE.Euler(0, this.yaw, 0));
        // Clamp rather than normalize so a partly pushed joystick moves slower.
        directionWRSCamera.clampLength(0, 1);
        directionWRSCamera.multiplyScalar(speed);
        this.playerPosition.add(directionWRSCamera);

        if (isMove) {
            let deltaTime = performance.now() - this.timeSinceMove;
            let bobTheta = deltaTime * this.bobFrequency;
            let newY = Math.sin(bobTheta) * this.bobAmountY;
            let newZ = Math.cos(bobTheta * 0.5) * this.bobAmountZ;
            this.playerBob.y = newY;
            this.playerBob.z = newZ;
        }   

        if (this.room) {
            if (this.room.isOutside(this.playerPosition)) {
                this.playerPosition.copy(oldPos);
            }

            this.prompts.innerHTML = this.room.nearCoinSlot(this.playerPosition) ? "Press [E] to interact" : "";
        }


        const newFloorY = 3 * (this.getColorOfFloorAt(this.playerPosition.x, this.playerPosition.z)?.brightness ?? 0);
        // console.log(newFloorY, this.floorY, this.playerYOffset);
        if (newFloorY - this.playerYOffset > this.floorY + 0.35) {
            this.playerPosition.copy(oldPos);
        } else {
            this.floorY = newFloorY;
        }

        this.playerYVelocity += this.gravity * (deltaTime / 10);
        this.playerYOffset += this.playerYVelocity  * (deltaTime / 10);
        if (this.playerYOffset < this.floorY) {
            this.playerYOffset = this.floorY;
            this.playerYVelocity = 0;
        }

        
    }

    updateCamera() {
        this.camera.rotation.order = 'YXZ';
        this.camera.rotation.y = this.yaw;
        this.camera.rotation.x = this.pitch;
        const bobWRSCamera = this.playerBob.clone().applyEuler(new THREE.Euler(0, this.yaw, 0));
        bobWRSCamera.add(this.playerPosition);
        bobWRSCamera.y += this.playerYOffset;
        this.camera.position.copy(bobWRSCamera);

            // this.carousel.model.rotation.y = performance.now() * 0.00025;
        // }
        // this.playerModel.scene.rotation.y = this.yaw + Math.PI/2; // Rotate the model to face the same direction as the camera

        // let pos = this.position.clone();
        // let forwardDelta = new THREE.Vector3(
        //     Math.sin(this.yaw),
        //     0,
        //     Math.cos(this.yaw)
        // ).multiplyScalar(-0.7);
        // pos.add(forwardDelta);
        // this.playerModel.scene.position.copy(pos);
    }


    beforeRender() {
        if (this.lastT === null) this.lastT = performance.now();
        const now = performance.now();
        // Cap so a stalled frame (e.g. after switching tabs) doesn't teleport the player.
        const deltaTime = Math.min(now - this.lastT, 100);
        this.lastT = now;

        if (this.carousel) this.carousel.time = performance.now() * 0.001;
        if (this.room) this.room.time = performance.now() * 0.001;
        this.updateMotion(deltaTime);
        this.updateCamera(deltaTime);
        // this.carousel?.positionCrabs(performance.now() * 0.001);
    }


    


}

customElements.define("basic-scene", WalkThroughScene);