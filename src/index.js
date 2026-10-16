import { BasicScene } from "./basic-scene";
import { Carousel, Crab } from "./crab";
import * as THREE from "three";
import { Keyboard } from "./keyboard";

class WalkThroughScene extends BasicScene {

    yaw = 0;
    pitch = 0;
    playerSpeedMax = 0.05;
    playerSpeedMin = 0.02;
    playerPosition = new THREE.Vector3(0, 1.7, 5);
    playerBob = new THREE.Vector3(0, 0, 0);
    timeSinceMove = null;
    bobFrequency = 0.03;
    bobAmountY = 0.03;
    bobAmountZ = 0.03;
    
    playerYOffset = 0;
    playerYVelocity = 0;
    floorY = 0;
    lastFloorY = 0;
    gravity = -0.005;
 
    constructor() {
        super();
        this.keyboard = new Keyboard();
        this.keyboard.onKeyDown(" ", () => {
            if (this.playerYOffset === this.floorY) {
                this.playerYVelocity = 0.1; // Jump velocity
            }
        });
    }


    async createFloor() {
        try {

            const geometry = new THREE.PlaneGeometry(17 , 17);
            const textureLoader = new THREE.TextureLoader();
            const texture = await textureLoader.loadAsync(import.meta.resolve('../assets/floor.webp'));
            // tile the texture
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(4, 4);
            const material = new THREE.MeshStandardMaterial({ map: texture });
            const floor = new THREE.Mesh(geometry, material);
            floor.rotation.x = -Math.PI / 2;
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
        return { color, brightness };
    }


  



    async load() {

        await Promise.all([
            Crab.load(),
            Carousel.load(),
            this.createFloor()
        ])

        this.carousel = new Carousel();
        // this.crab = new Crab();
        this.scene.add(this.carousel.model);
        // this.scene.add(this.crab.model);

        document.body.addEventListener('click', () => {
            if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen()
            }
            document.body.requestPointerLock();
        });

        document.addEventListener('mousemove', (event) => {
            if (document.pointerLockElement !== document.body) {
                return;
            }

            const sensitivity = 0.002;

            this.yaw -= event.movementX * sensitivity;
            this.pitch -= event.movementY * sensitivity;

            // Prevent the camera from flipping upside down.
            const limit = Math.PI / 2 - 0.01;

            this.pitch = THREE.MathUtils.clamp(
                this.pitch,
                -limit,
                limit
            );
        });
    }

    updateMotion() {
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

        let isMove = direction.length() > 0 
        if (isMove && this.timeSinceMove == null) {
            this.timeSinceMove = performance.now();
        } else if (!isMove) {
            this.timeSinceMove = null;
        }

        const speed = this.playerSpeedMax;
        const oldPos = this.playerPosition.clone();
        // const speed = this.playerSpeedMin + (this.playerSpeedMax - this.playerSpeedMin) * (1 + Math.cos(Date.now() * 0.03)) / 2
        const directionWRSCamera = direction.clone().applyEuler(new THREE.Euler(0, this.yaw, 0));
        directionWRSCamera.normalize();
        directionWRSCamera.multiplyScalar(speed)
        this.playerPosition.add(directionWRSCamera);

        if (isMove) {
            let deltaTime = performance.now() - this.timeSinceMove;
            let bobTheta = deltaTime * this.bobFrequency;
            let newY = Math.sin(bobTheta) * this.bobAmountY;
            let newZ = Math.cos(bobTheta * 0.5) * this.bobAmountZ;
            this.playerBob.y = newY;
            this.playerBob.z = newZ;
        }   


        const newFloorY = 3 * (this.getColorOfFloorAt(this.playerPosition.x, this.playerPosition.z)?.brightness ?? 0);
        console.log(newFloorY, this.floorY, this.playerYOffset);
        if (newFloorY - this.playerYOffset > this.floorY + 0.35) {
            this.playerPosition.copy(oldPos);
        } else {
            this.floorY = newFloorY;
        }

        this.playerYVelocity += this.gravity;
        this.playerYOffset += this.playerYVelocity;
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

        if (this.carousel)
            this.carousel.model.rotation.y += 0.005
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
        this.updateMotion();
        this.updateCamera();
    }


    


}

customElements.define("basic-scene", WalkThroughScene);