const STYLE = `
.touch-joystick {
    position: fixed;
    width: 120px;
    height: 120px;
    margin: -60px 0 0 -60px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.15);
    border: 2px solid rgba(255, 255, 255, 0.4);
    pointer-events: none;
    display: none;
    z-index: 10;
}
.touch-joystick-knob {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 50px;
    height: 50px;
    margin: -25px 0 0 -25px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.6);
}
.touch-jump {
    position: fixed;
    right: 24px;
    bottom: 24px;
    width: 72px;
    height: 72px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.2);
    border: 2px solid rgba(255, 255, 255, 0.5);
    color: white;
    font: 600 14px system-ui, sans-serif;
    letter-spacing: 0;
    display: none;
    align-items: center;
    justify-content: center;
    user-select: none;
    -webkit-user-select: none;
    touch-action: none;
    z-index: 10;
}
@media (pointer: coarse) {
    .touch-jump { display: flex; }
}
`;

/**
 * Touch controls: drag on the left half of the screen to move (floating joystick),
 * drag on the right half to look around, and tap the jump button to jump.
 */
export class TouchControls {
    /** Joystick vector, x = strafe (right +), z = forward/back (back +), each in [-1, 1]. */
    move = { x: 0, z: 0 };
    lookSensitivity = 0.005;
    joystickRadius = 60;

    #movePointer = null;
    #moveOrigin = null;
    #lookPointer = null;
    #lookLast = null;
    #lookCallbacks = [];
    #jumpCallbacks = [];

    /** @param {HTMLElement} element */
    constructor(element) {
        this.element = element;
        element.style.touchAction = "none";

        const style = document.createElement("style");
        style.textContent = STYLE;
        document.head.appendChild(style);

        this.joystick = document.createElement("div");
        this.joystick.className = "touch-joystick";
        this.knob = document.createElement("div");
        this.knob.className = "touch-joystick-knob";
        this.joystick.appendChild(this.knob);

        this.jumpButton = document.createElement("div");
        this.jumpButton.className = "touch-jump";

        document.body.append(this.joystick, this.jumpButton);

        this.jumpButton.addEventListener("pointerdown", (event) => {
            event.preventDefault();
            event.stopPropagation();
            for (const callback of this.#jumpCallbacks) callback();
        });

        element.addEventListener("pointerdown", (event) => this.#onDown(event));
        element.addEventListener("pointermove", (event) => this.#onMove(event));
        element.addEventListener("pointerup", (event) => this.#onUp(event));
        element.addEventListener("pointercancel", (event) => this.#onUp(event));
    }

    onLook(callback) {
        this.#lookCallbacks.push(callback);
    }

    onJump(callback) {
        this.#jumpCallbacks.push(callback);
    }

    #onDown(event) {
        if (event.pointerType !== "touch") return;

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
        } else {
            return;
        }
        this.element.setPointerCapture(event.pointerId);
    }

    #onMove(event) {
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
            const dx = event.clientX - this.#lookLast.x;
            const dy = event.clientY - this.#lookLast.y;
            this.#lookLast = { x: event.clientX, y: event.clientY };
            for (const callback of this.#lookCallbacks) {
                callback(dx * this.lookSensitivity, dy * this.lookSensitivity);
            }
        }
    }

    #onUp(event) {
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
