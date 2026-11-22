/**
 * "Scroll to fullscreen" for iPhone Safari.
 *
 * iPhone Safari has no Fullscreen API for normal elements, but it hides its
 * toolbars (address bar + tab bar) when the *document* is scrolled down. A
 * page made entirely of fixed elements never scrolls, so the bars never go.
 *
 * In landscape this module:
 *   1. makes the document scrollable (a tall invisible spacer),
 *   2. shows a "swipe up" hint,
 *   3. once Safari has collapsed its bars, hides the hint and locks scrolling
 *      (touchmove is cancelled) so the user can't scroll the bars back in.
 *   4. if the bars come back anyway (e.g. tapping the top/bottom edge), it
 *      unlocks and shows the hint again.
 *
 * All page content must be position: fixed (not absolute) so it doesn't move
 * while the document scrolls.
 */
import STYLE from "./style.css?inline";
import HINT_HTML from "./hint.html?raw";


class FullscreenManager {
    #root = null;
    #queued = false;
    #locked = false;
    #enabled = false;
    #probe = null;
    #landscapeQuery = matchMedia("(orientation: landscape)");
    landscapeOnly = true;

    constructor(root, landscapeOnly = true) {
        this.#root = root;
        this.landscapeOnly = landscapeOnly;

        // Create style element
        const style = document.createElement("style");
        style.textContent = STYLE;
        document.head.appendChild(style);


        const spacer = document.createElement("div");
        spacer.className = "fs-spacer";

        const probe = document.createElement("div");
        probe.className = "fs-probe";
        this.#probe = probe;

        const hint = document.createElement("div");
        hint.className = "fs-hint";
        hint.innerHTML = HINT_HTML;
        document.body.append(spacer, probe, hint);

        window.addEventListener("scroll", this.schedule.bind(this), { passive: true });
        window.visualViewport?.addEventListener("resize", this.schedule.bind(this));
        window.addEventListener("resize", this.schedule.bind(this));
        this.#landscapeQuery.addEventListener?.("change", () => {
            this.schedule();
            setTimeout(this.schedule.bind(this), 300);
        });
        document.addEventListener("touchmove", (e) => {
            if (this.locked && e.cancelable) e.preventDefault();
        }, { passive: false });


        this.schedule();

    }

    get isLandscape() {
        return this.#landscapeQuery.matches;
    }
    get barsHidden() {
        return window.innerHeight >= this.#probe.offsetHeight - 2;
    }

    set enabled(on) {  
        if (on !== this.#enabled) {
            this.#enabled = on;
            this.#root.classList.toggle("fs-scroll", on);
            if (!on) this.locked = false;
        }
    }
    get enabled() { return this.#enabled; }

    set locked(on) {
        if (on !== this.#locked) {
            this.#locked = on;
            this.#root?.classList?.toggle("fs-locked", on);
        }
    }
    get locked() { return this.#locked; }

    schedule() {
        if (!this.#queued) {
            this.#queued = true;
            requestAnimationFrame(() => {
                this.#queued = false;
                this.#update();
            });
        }
    }


    #update() {
        this.enabled = !this.landscapeOnly || this.isLandscape;

        if (!this.enabled) {
            if (window.scrollY !== 0) window.scrollTo(0, 0);
            return;
        }


        if (this.barsHidden) {
            this.locked = true;
        } else if (locked) {
            this.locked = false;
            window.scrollTo(0, 0);
        }
    }

    static initialise(landscapeOnly = true) {
        const root = document.documentElement;
        const coarse = matchMedia("(pointer: coarse)").matches;
        const hasFullscreenApi = !!(root.requestFullscreen || root.webkitRequestFullscreen);
        let manager;
        if (coarse || !hasFullscreenApi) {
            manager = new this(root, landscapeOnly);
        }
        return manager;
    }
}


export {FullscreenManager}