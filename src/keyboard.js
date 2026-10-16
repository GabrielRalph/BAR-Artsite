export class Keyboard {
    #keys = new Map();
    #callbackMap = new Map();
    // timeout = 10000;
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
            // setTimeout(() => {
            //     if (this.#keys.get(event.key) === now) {
            //         this.#keys.delete(event.key);
            //     }
            // }, this.timeout);
        }); 
        window.addEventListener('keyup', (event) => { 
            this.#keys.delete(event.key); 
        }); 
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
}