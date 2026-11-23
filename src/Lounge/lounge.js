
import * as THREE from "three";
import { Calculator } from "./calculator";
import { BasicScene } from "../basic-scene";
import { WaypointAnimation } from "../waypoint-animation";

const D2R = Math.PI / 180;
const euler = new THREE.Euler((55-90)*D2R, 52*D2R, 0, "YZX");
const CameraPos = [3, 2.35, 3.5];
const CalculatorPos = [1.6, 1.35, 2];
const ForeGroundRotation = [-0.023, -0.420, -0.318]
const BackgroundRotation = [0, 15*D2R, 0];
const ENVIRONMENT_TEXTURE = (new THREE.TextureLoader()).loadAsync(
    import.meta.resolve("../../assets/Lounge/background.webp")
);

class LoungeScene extends BasicScene {
    constructor() {
        super();
        this.camera.position.set(...CameraPos);
        this.camera.rotation.copy(euler);

        this.camera.fov = 60;
        this.camera.near = 0.1;
        this.camera.far = 20;
   
        this.setupLights();
        this.setupEnvironment();
        this.createTableTop();
        this.setupCalculator();
    }
        
    setupLights() {
         // add some ambient light
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
        this.mainGroup.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
        this.directionalLight = directionalLight;
        directionalLight.position.set(5, 10, 5);
        directionalLight.target.position.set(0, 0, 0);
        this.mainGroup.add(directionalLight);

        // make sure the lights cast shadows
        directionalLight.castShadow = true;

        // remove shadow acne 
        directionalLight.shadow.bias = -0.0001;
        directionalLight.shadow.normalBias = 0.02;

        // higher resolution shadow map (default is 512)
        directionalLight.shadow.mapSize.set(2048, 2048);
        directionalLight.shadow.radius = 3;
    }

    setupEnvironment() {
        const texture = this.constructor.environmentTexture;
        if (texture) {
            texture.encoding = THREE.sRGBEncoding;
            texture.mapping = THREE.EquirectangularReflectionMapping;
            this.scene.environment = texture;
        }
    }

    createTableTop() {
        const geometry = new THREE.PlaneGeometry(3.5, 1.83);
        const material = new THREE.ShadowMaterial({ opacity: 0.75, color: 0x110501});
        const tableTop = new THREE.Mesh(geometry, material);
        tableTop.rotation.x = -Math.PI / 2;
        tableTop.receiveShadow = true;
        tableTop.position.set(1, 1.2 + 0.114 / 2, 2.4);
        this.mainGroup.add(tableTop);
        return tableTop;
    }

    setupCalculator() {
        const calculator = new Calculator();
        this.mainGroup.add(calculator);

        const timingFunction = t => 0.5-Math.cos(t * Math.PI) * 0.5;
        const backgroundT = {
            position: new THREE.Vector3(...CalculatorPos),
            rotation: new THREE.Euler(...BackgroundRotation),
        };
        
        const foregroundT = {
            position: this.camera.position.clone().add(
                this.camera.getWorldDirection(new THREE.Vector3())
                .multiplyScalar(1)
            ),
            rotation: new THREE.Euler(...ForeGroundRotation)
        };

        const toForground = (new WaypointAnimation(calculator, true))
        .add(backgroundT).add({
            timingFunction,
            ...foregroundT,
            duration: 1
        });
        const toBackground = (new WaypointAnimation(calculator, true))
        .add(foregroundT).add({
            timingFunction,
            ...backgroundT,
            duration: 1
        });

        this.addUpdater(toForground);
        this.addUpdater(toBackground);

        calculator.onPowerOn = toForground.start.bind(toForground);
        calculator.onPowerOff = toBackground.start.bind(toBackground);

        toForground.moveTo(0);
        this.calculator = calculator;
        this.addUpdater(calculator);

        calculator.onEvaluate = async (result) => {
            this.dispatchEvent(new CustomEvent("evaluate", { detail: result }));
        };
    }

    click(event) {
        return this.calculator.performClick(event.clientX, event.clientY, this.camera) 
    }

    checkPointer(event) {
        return this.calculator.checkPointer(event.clientX, event.clientY, this.camera);
    }

    static async load() {
        await Promise.all([
            ENVIRONMENT_TEXTURE,
            Calculator.load()
        ]);
        this.environmentTexture = await ENVIRONMENT_TEXTURE;
    }
}

export { LoungeScene };