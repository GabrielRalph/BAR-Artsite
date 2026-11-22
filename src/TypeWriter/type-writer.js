
import "./style.css"

class TypeWriter extends HTMLElement {
    /** @type {HTMLElement[]} */
    chars = [];
    #playId = 0;
    #split = false; 
    delay = 50;

    constructor() {
        super();
    }

    reset() {
        this.chars.map(c => c.toggleAttribute("on", false))
    }

    connectedCallback() {
        if (this.#split) return; // only split once, even if re-connected
        this.#split = true;
        this.chars = [];
        this.#splitNode(this);
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (name === "on") {
            if (newValue !== null) {
                this.play();
            } else {
                this.reset();
            }
        } else if (name === "delay") {
            if (newValue !== null) {
                this.delay = Number(newValue);
            }
        }
    }



    #splitNode(node) {
        // Copy children first since we replace nodes while iterating
        for (const child of [...node.childNodes]) {
            if (child.nodeType === Node.TEXT_NODE) {
                const frag = document.createDocumentFragment();
                // Split into runs of whitespace and single non-whitespace chars
                for (const part of child.textContent.match(/\s+|\S/gu) || []) {
                    if (/\s/.test(part)) {
                        frag.appendChild(document.createTextNode(part));
                    } else {
                        const s = document.createElement("s");
                        s.textContent = part;
                        this.chars.push(s);
                        frag.appendChild(s);
                    }
                }
                child.replaceWith(frag);
            } else if (child.nodeType === Node.ELEMENT_NODE) {
                this.#splitNode(child);
            }
        }
    }

    /**
     * Turns on each character in order.
     * @param {number} delay ms between characters
     */
    async play(delay = this.delay) {
        const id = ++this.#playId; // calling play again cancels the previous loop
        for (const s of this.chars) {
            if (id !== this.#playId) return;
            s.toggleAttribute("on", true);
            await new Promise((r) => setTimeout(r, delay));
        }
    }

    static get observedAttributes() {
        return ["on", "delay"];
    }

    static define() {
        customElements.define("type-writer", this);
    }
}

export { TypeWriter };