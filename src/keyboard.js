export class Keyboard {
    #keys = new Map();
    #callbackMap = new Map();
    #listeners = new AbortController();
    constructor() {
        // this.keys = new Set(); 
        window.addEventListener('keydown', (event) => {
            let now = Date.now()
            this.#keys.set(event.key, now); 
            if (this.#callbackMap.has(event.key)) {
                for (const callback of this.#callbackMap.get(event.key)) {
                    callback();
                }
            }
        }, {signal: this.#listeners.signal}); 
        window.addEventListener('keyup', (event) => { 
            this.#keys.delete(event.key); 
        }, {signal: this.#listeners.signal}); 
    } 

    onKeyDown(key, callback) {
        if (!this.#callbackMap.has(key)) {
            this.#callbackMap.set(key, []);
        }
        this.#callbackMap.get(key).push(callback);
        if (this.isDown(key)) {
            callback();
        }
    }

    isDown(code) { return this.#keys.has(code); } 

    /**
     * @param {string[]} codes - An array of key codes to check if any are currently pressed.
     */
    areAnyDown(codes) {
        return codes.some(code => this.isDown(code));
    }


    disconnect() {
        this.#listeners.abort();
    }
}