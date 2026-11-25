import { BasicScene } from "../basic-scene";
import { CubeRegions } from "./region";
import * as THREE from "three";
import { Keyboard } from "../keyboard";
import { TouchControls } from "../TouchControls/touch-controls";
import { FirstPersonPlayer } from "../fpp";
import { CollisionWorld } from "../collision-world";


class FirstPersonControls extends THREE.Controls {
    #listeners = new AbortController();
    constructor(player, element) {
        super(player, element);

        this.touch = new TouchControls();
        this.touch.onLook((dx, dy) => this.player.look(dx, dy));
        this.touch.onJump(() => this.player.jump());

        this.keyboard = new Keyboard();
        this.keyboard.onKeyDown(" ", () => player.jump());
    }

    connect(domElement, requestPointerLock = true) {
        console.log("connecting controls")

        domElement.appendChild(this.touch);
        this.touch.connect(domElement);
        
        console.log('Connecting controls');
        if (requestPointerLock) {
            console.log('Requesting pointer lock on click');
            domElement.addEventListener('click', () => {
                domElement.requestPointerLock();
            }, {signal: this.#listeners.signal});
        }

        domElement.addEventListener('mousemove', (event) => {
            // if (document.pointerLockElement === document.body) {
                this.object.look(event.movementX, event.movementY);
            // }
        }, {signal: this.#listeners.signal});
    }

    disconnect() {
        this.#listeners.abort();
        this.touch.disconnect();
    }

    update() {
        if (this.keyboard) {
            const direction = new THREE.Vector2();
            if (this.keyboard.areAnyDown(["w", "W", "ArrowUp"])) {
                direction.y -= 1;
            }
            if (this.keyboard.areAnyDown(["s", "S", "ArrowDown"])) {
                direction.y += 1;
            }
            if (this.keyboard.areAnyDown(["a", "A", "ArrowLeft"])) {
                direction.x -= 1;
            }
            if (this.keyboard.areAnyDown(["d", "D", "ArrowRight"])) {
                direction.x += 1;
            }

            direction.x += this.touch.move.x;
            direction.y += this.touch.move.z;
            
            this.object.move(direction);
        }
    }
}


class EntranceScene extends BasicScene {
    #lastGravityDirectionIndex = null;

    constructor() {
        super();

        this.world = new CollisionWorld();
        this.player = new FirstPersonPlayer(this.world)
        this.playerControls = new FirstPersonControls(this.player, this);
        this.addUpdater(this.playerControls);
        this.addUpdater(this.updateGravityDirection.bind(this));
        this.addUpdater((dt) => {
            this.player.update(dt);
            this.player.transformCamera(this.camera)
        })

        this.buildLighting();
        this.buildScene();
    }


    updateGravityDirection() {
        if (this.regions) {
            const [g, index] = this.regions.query(
                this.player.centerPosition
            );
            if (this.#lastGravityDirectionIndex !== index) {
                this.#lastGravityDirectionIndex = index;
                // Outside every region: keep whatever gravity we last had.
                if (g) {
                    console.log(`${g.x.toFixed(1)}, ${g.y.toFixed(1)}, ${g.z.toFixed(1)}`);
                    this.player.gravityDirection = g;
                }
            }
        }
    }


    buildLighting() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(5, 10, 7.5);
        this.scene.add(directionalLight);
    }


    buildScene() {
        const regions = new CubeRegions();
        this.scene.add(regions);
        regions.objects.map(this.world.add.bind(this.world))
        this.regions = regions;
    }

    buildElement() {
        console.log('Building element');
        this.playerControls.connect(this, true);
    }


    static async load() {
        await CubeRegions.load();
    }
}

export { EntranceScene };