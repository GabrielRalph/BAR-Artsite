import { Asset } from "../assets";
import * as THREE from "three";
import { WaypointAnimation } from "../waypoint-animation";


class TextMaterial extends THREE.MeshStandardMaterial {
    #canvas = null;
    #context = null;
    constructor(baseMaterial, {
            textureSize = 256,
            fontColor = null,
            flipY = false
        } = {}) {
        super();
        this.copy(baseMaterial);

        const keyColor = baseMaterial.color;
        const luminance = 0.2126 * keyColor.r + 0.7152 * keyColor.g + 0.0722 * keyColor.b;
        this.backgroundColor = keyColor.getStyle();
        this.color.set(0xffffff);
        this.fontColor = fontColor || (luminance > 0.5 ? "black" : "white");

        const canvas = document.createElement("canvas");
        this.#context = canvas.getContext("2d");
        this.#canvas = canvas;
        canvas.width = textureSize;
        canvas.height = textureSize;
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.flipY = flipY; 
        this.map = texture;
        this.name = "TextMaterial";
        this.needsUpdate = true;
    }

    clear() {
        const ctx = this.#context;
        ctx.fillStyle = this.backgroundColor;
        ctx.fillRect(0, 0, this.#canvas.width, this.#canvas.height);
        this.needsUpdate = true;
        this.map.needsUpdate = true;

        return this;
    }

    add(text, {
        textAlign = "center",
        textBaseline = "middle",
        fontFamily = "sans-serif",
        x = 0.5,
        y = 0.5,
        fontSize = 40,
        fontColor = null,
    }) {
        const ctx = this.#context;
        const fs = (fontSize * this.#canvas.width / 100).toFixed(1) + "px";
        ctx.fillStyle = fontColor || this.fontColor;
        ctx.font = fs + " " + fontFamily;
        ctx.textAlign = textAlign;
        ctx.textBaseline = textBaseline;
        ctx.fillText(text, this.#canvas.width * x, this.#canvas.height * y);
        this.needsUpdate = true;
        this.map.needsUpdate = true;
        return this;
    }
}

class Calculator extends Asset {
    screenHeight = 0.218;
    screenPadding = 0.01;
    screenLineRatio = 0.45;

    pushDelta = 0.005;

    #value = "";
    #replaceOnNextInput = false;
    #lastAnswer = 0;
    #on = false;

    KEY_ACTIONS = {
        "mplus": () => {},
        "mminus": () => {},
        "mc": () => {},
        "mr": () => {},
        "power": this.turnOff.bind(this),
        "c": this.clear.bind(this),
        "ac": this.clear.bind(this, true),
        "equals": this.evaluate.bind(this),
        "cos": () => {this.value = `cos(${this.value || "0"})`},
        "sin": () => {this.value = `sin(${this.value || "0"})`},
        "sqrt": () => {this.value = `√(${this.value || "0"})`},
        "recip": () => {this.value = `1/(${this.value || "1"})`},
        "mu": () => {this.value = `mu(${this.value || "0"})`}
    };

    constructor(...args) {
        super(...args);
        this.name = "CalculatorRoot"
        this.keys = {};
        this.#build();
        this.#updateScreen();
    }


    performClick(screenX, screenY, camera) {
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();

        let interaction = 0;

        mouse.x = (screenX / window.innerWidth) * 2 - 1;
        mouse.y = -(screenY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);

        const intersects = raycaster.intersectObject(this, true)
        if (this.#on) {
            if (intersects.length > 0) {
                interaction = 1;
                const key = intersects[0].object;
                if (key.isKey) {
                    const {keyName, keyValue} = key;
                    key.animation.start();
        
                    if (keyName in this.KEY_ACTIONS) {
                        this.KEY_ACTIONS[keyName]();
                    } else {
                        if (this.#replaceOnNextInput) {
                            this.value = "";
                            this.#replaceOnNextInput = false;
                        }
                        this.value += keyValue;
                    }
                    interaction = 2;
                } 
            } 
        } else {
            if (intersects.length > 0) {
                interaction = 1;
                this.turnOn();
            }
        }

        return interaction;
    }

    checkPointer(screenX, screenY, camera) {
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        mouse.x = (screenX / window.innerWidth) * 2 - 1;
        mouse.y = -(screenY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);

        let isPointer = false;
        const intersects = raycaster.intersectObject(this, true)
        if (intersects.length > 0) {
            isPointer = !this.#on || (intersects[0].object.isKey ?? false);
        }
        return isPointer;
    }


    turnOff() {
        this.#on = false;
        console.log("Calculator turned off");
        this.onPowerOff?.();
    }

    turnOn() {
        this.#on = true;
        console.log("Calculator turned on");
        this.onPowerOn?.();
    }


    clear(all = false) {
        this.value = "";
        if (all) this.lastAnswer = 0;
    }

    evaluate() {
        let expression = this.value || "0";
        expression = expression.replace(/×/g, "*").replace(/÷/g, "/");
        expression = expression.replace(/√/g, `sqrt`);

        try {
            let func = new Function(
                "ANS", "sqrt", "cos", "sin", 
                `mu = (x) => x / (1 - ANS);
                return ${expression};`
            );
            let ans = this.lastAnswer;
            ans = typeof ans === "number" ? ans : 0;
            this.lastAnswer = func(ans, Math.sqrt, Math.cos, Math.sin);
        } catch (e) {
            this.lastAnswer = "Error"
        }
        this.#replaceOnNextInput = true;
        this.onEvaluate?.(this.lastAnswer);
    } 

    update(dt) {
        for (const key of Object.values(this.keys)) {
            key.animation.update(dt);
        }
    }

    onEvaluate() {}
    onPowerOn() {}
    onPowerOff() {}
    
    set value(value) {
        this.#value = value;
        this.#updateScreen();
    }
    get value() {
        return this.#value;
    }

    set lastAnswer(value) {
        this.#lastAnswer = value;
        this.#updateScreen();
    }
    get lastAnswer() {
        return this.#lastAnswer;
    }

    #build() {
        this.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }


            // Build key or screen based on
            // the child mesh name or material
            if (child.name.startsWith("Key_")) {
                this.#buildKey(child);
            } else if (child.material?.name === "LCDScreenMaterial") {
                this.#buildScreen(child);
            } else if (child?.name === "Body") {
                this.body = child;
            }
        });
    }

    #buildKey(key) {
        let keyName = key.name.replace("Key_", "");
        let keyValue = Calculator.KEY_MAP[keyName] ?? keyName.toUpperCase();
        if (keyValue !== "_NONE_") {
            key.material = new TextMaterial(key.material);
            key.material.clear().add(
                keyValue, {
                    fontSize: keyValue.length == 1 || keyValue == "00" ? 50 : 40
                }
            )
        }
        key.isKey = true;
        key.keyValue = keyValue;
        key.keyName = keyName;
        key.animation = new WaypointAnimation(key, true);
        key.animation.add({
            position: key.position.clone(),
        }).add({
            position: key.position.clone().add(new THREE.Vector3(0, -this.pushDelta, 0)),
            duration: 0.1,
            timingFunction: t => t**3
        }).add({
            position: key.position.clone(),
            duration: 0.1,
        });
        this.keys[keyName] = key;
    }

    #buildScreen(screen) {
        this.screen = screen;
        screen.material = new TextMaterial(screen.material, {
            fontSize: 1,
            textureSize: 512,
            fontColor: "black"
        });
        screen.material.clear();
    }

    #updateScreen() {
        const p = this.screenPadding;
        const h = this.screenHeight;
        const r = this.screenLineRatio

        const lineTop = (h - 3 * p) * r;
        const lineBottom = (h - 3 * p) * (1 - r);

        const fsTop = lineTop * 0.8 * 100;
        const fsBottom = lineBottom * 0.8 * 100;

        if (this.screen) {
            let ans = this.#lastAnswer;
            if (typeof ans === "number") {
                let str = ans + "";
                let dp = str.indexOf(".");
                if (dp !== -1) {
                    dp = str.length - dp;
                } else {
                    dp = 0;
                }
                
                if (dp > 5) {
                    str = ans.toFixed(5);
                }

                ans = str;
            }
            this.screen.material.clear()
                .add(ans, {
                    x: 1- p*2,
                    y: 0.5 + lineBottom / 2,
                    fontSize: fsBottom,
                    fontFamily: "monospace",
                    textAlign: "right",
                })
                .add(this.#value || "0", {
                    x: p*2,
                    y: 0.5 - lineTop / 2,
                    fontSize: fsTop,
                    fontFamily: "monospace",
                    textAlign: "left",
                })
        }
    }

    static get KEY_MAP() {
        return {
            "plus": "+",
            "minus": "-",
            "multiply": "×",
            "divide": "÷",
            "recip": "1/x",
            "sqrt": "√",
            "percent": "%",
            "dot": ".",
            "times": "×",
            "power": "_NONE_",
            "equals": "=",
            "mplus": "M+",
            "mminus": "M-",
        };
    }
    
    static get url() {
        return import.meta.resolve("../../assets/Lounge/calculator.glb");
    }
}

export { Calculator, TextMaterial }