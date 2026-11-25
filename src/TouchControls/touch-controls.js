import { SvgPlus } from "../SvgPlus/4";
import JOYSTICK_STYLE from "./style.css?inline"

function supportsConstructedSheets(win = window) {
    try {
        new win.CSSStyleSheet();
        return "adoptedStyleSheets" in win.Document.prototype;
    } catch (e) {
        return false;
    }
}
async function newCSSStyleSheet(text) {
    if (supportsConstructedSheets()) {
        let style = new CSSStyleSheet()
        style.replaceSync(text);
        return style;
    } else {
        let style = document.createElement("style")
        style.innerHTML = text;
        return style;
    }
}

const STYLE_SHEET = await newCSSStyleSheet(JOYSTICK_STYLE);

/**
 * Touch controls: drag on the left half of the screen to move (floating joystick),
 * drag on the right half to look around, and tap the jump button to jump.
 */
export class TouchControls extends SvgPlus {
    /** Joystick vector, x = strafe (right +), z = forward/back (back +), each in [-1, 1]. */
    move = { x: 0, z: 0 };
    lookSensitivity = 2.5;
    joystickRadius = 60;

    #movePointer = null;
    #moveOrigin = null;
    #lookPointer = null;
    #lookLast = null;
    #lookCallbacks = [];
    #jumpCallbacks = [];
    #tapCallbacks = [];

    /** @type {Map<number, {x: number, y: number, time: number}>} where each touch started */
    #touchStarts = new Map();

    /**
     * A touch shorter than this (ms) that never strays more than `tapDistance`
     * (px) from where it started is a tap. Looking around also only starts once
     * a finger has moved further than `tapDistance`, so a tap doesn't nudge the
     * crosshair off what you're aiming at.
     */
    tapTime = 400;
    tapDistance = 20;
    #lookDragging = false;
    
    #listeners = new AbortController();

    /** @param {HTMLElement} element */
    constructor(element) {
        super("touch-controls");
        this.styles = {display: "contents"}


        this.attachShadow({mode: "open"});
        let root = new SvgPlus("div");
        this.shadowRoot.appendChild(root);

        if (STYLE_SHEET instanceof Element) {
            this.shadowRoot.appendChild(STYLE_SHEET);
        } else {
            this.shadowRoot.adoptedStyleSheets = [STYLE_SHEET];
        }

        this.joystick = root.createChild("div", {class: "touch-joystick"});
        this.knob = this.joystick.createChild("div", {class: "touch-joystick-knob"});
        this.jumpButton = root.createChild("div", {class: "touch-jump",
            events: {
                pointerdown: (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    for (const callback of this.#jumpCallbacks) callback();
                }
            }
        });

        if (element) this.connect(element);
    }

    connect(element) {
        if (this.element !== null) {
            this.disconnect();
        }

        this.element = element;
        element.style.touchAction = "none";

        element.addEventListener(
            "pointerdown", 
            (event) => this.#onDown(event), 
            {signal: this.#listeners.signal}
        );
        element.addEventListener(
            "pointermove", 
            (event) => this.#onMove(event),
            {signal: this.#listeners.signal}
        );
        element.addEventListener(
            "pointerup", 
            (event) => this.#onUp(event),
            {signal: this.#listeners.signal}
        );
        element.addEventListener(
            "pointercancel", 
            (event) => this.#onUp(event),
            {signal: this.#listeners.signal}
        );
    }

    disconnect() {
        this.#listeners.abort();
        this.element = null;
    }

    onLook(callback) {
        this.#lookCallbacks.push(callback);
    }

    onJump(callback) {
        this.#jumpCallbacks.push(callback);
    }

    /** Called when the screen is tapped (anywhere except the jump button). */
    onTap(callback) {
        this.#tapCallbacks.push(callback);
    }

    #onDown(event) {
        if (event.pointerType === "mouse") return;
        this.#touchStarts.set(event.pointerId, { x: event.clientX, y: event.clientY, time: performance.now(), moved: false });

        if (event.clientX < window.innerWidth / 2 && this.#movePointer === null) {
            this.#movePointer = event.pointerId;
            this.#moveOrigin = { x: event.clientX, y: event.clientY };
            this.joystick.style.left = `${event.clientX}px`;
            this.joystick.style.top = `${event.clientY}px`;
            this.joystick.style.display = "block";
            this.#setKnob(0, 0);
        } else if (this.#lookPointer === null) {
            this.#lookPointer = event.pointerId;
            this.#lookLast = { x: event.clientX, y: event.clientY };
            this.#lookDragging = false;
        } else {
            return;
        }
        this.element.setPointerCapture(event.pointerId);
    }

    #onMove(event) {
        const start = this.#touchStarts.get(event.pointerId);
        if (start && !start.moved
            && Math.hypot(event.clientX - start.x, event.clientY - start.y) >= this.tapDistance) {
            start.moved = true; // strayed too far: this touch is a drag, not a tap
        }

        if (event.pointerId === this.#movePointer) {
            let dx = event.clientX - this.#moveOrigin.x;
            let dy = event.clientY - this.#moveOrigin.y;
            const length = Math.hypot(dx, dy);
            if (length > this.joystickRadius) {
                dx *= this.joystickRadius / length;
                dy *= this.joystickRadius / length;
            }
            this.#setKnob(dx, dy);
            this.move.x = dx / this.joystickRadius;
            this.move.z = dy / this.joystickRadius;
        } else if (event.pointerId === this.#lookPointer) {
            // Ignore small jitter until the finger has clearly started dragging.
            if (!this.#lookDragging) {
                if (!start?.moved) return;
                this.#lookDragging = true;
            }
            const dx = event.clientX - this.#lookLast.x;
            const dy = event.clientY - this.#lookLast.y;
            this.#lookLast = { x: event.clientX, y: event.clientY };
            for (const callback of this.#lookCallbacks) {
                callback(dx * this.lookSensitivity, dy * this.lookSensitivity);
            }
        }
    }

    #onUp(event) {
        const start = this.#touchStarts.get(event.pointerId);
        this.#touchStarts.delete(event.pointerId);
        if (start && event.type === "pointerup" && !start.moved
            && performance.now() - start.time < this.tapTime) {
            for (const callback of this.#tapCallbacks) callback();
        }

        if (event.pointerId === this.#movePointer) {
            this.#movePointer = null;
            this.move.x = 0;
            this.move.z = 0;
            this.joystick.style.display = "none";
        } else if (event.pointerId === this.#lookPointer) {
            this.#lookPointer = null;
        }
    }

    #setKnob(dx, dy) {
        this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    }
}
