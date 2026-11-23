import { LoungeSceneGame } from "./Lounge/index.js";
import { SvgPlus } from "./SvgPlus/4.js";

const ZONES = ["lounge", "lab"];

/**
 * Top-level game element. Owns the zones and moves the player between them:
 *
 *   lounge ──(final prompt "yes" → `explore` event)──▶ lab
 *
 * The current zone is kept in the URL hash (#lounge / #lab) so a reload
 * comes back to the same point in the game.
 */
class GameMain extends HTMLElement {
    #zone = null;
    #current = null;
    #transitioning = false;
    /** Lab module import + asset load, started early so the switch is quick. */
    #labLoading = null;

    constructor() {
        super();
    }

    connectedCallback() {
        if (!this.#zone) this.#startAt(GameMain.hashZone);
        window.addEventListener("popstate", this.#onPopState);
    }

    disconnectedCallback() {
        window.removeEventListener("popstate", this.#onPopState);
    }

    /** Back/forward (or a hand-edited hash): move to the zone in the URL. */
    #onPopState = () => this.#syncToHash();

    #syncToHash() {
        if (this.#transitioning) return; // re-checked when the transition ends
        const zone = GameMain.hashZone;
        if (zone === this.#zone) return;
        if (zone === "lab") this.goToLab({ push: false });
        else this.goToLounge({ push: false });
    }

    /** Zone named in the URL hash, or "lounge" if there isn't a valid one. */
    static get hashZone() {
        const zone = location.hash.slice(1).toLowerCase();
        return ZONES.includes(zone) ? zone : "lounge";
    }

    #startAt(zone) {
        // The first zone replaces the current entry rather than adding one.
        if (zone === "lab") this.goToLab({ push: false });
        else this.showLounge({ push: false });
    }

    /** Name of the zone currently shown ("lounge" | "lab"). */
    get zone() { return this.#zone; }

    /** @param {{push?: boolean}} options push: add a history entry for #lounge. */
    showLounge({ push = false } = {}) {
        const lounge = document.createElement("lounge-scene-game");
        lounge.addEventListener("explore", () => this.goToLab(), { once: true });
        this.#setZone("lounge", lounge, push);

        // Start fetching the Lab while the player is in the Lounge, so it's
        // usually ready by the time they say "yes".
        this.#loadLab();
    }

    /**
     * Imports the Lab module, waits for LabGameScene.load() to fetch its
     * assets, and registers <lab-scene>. Runs once; resolves to the class.
     */
    #loadLab() {
        return this.#labLoading ??= (async () => {
            const { LabGameScene } = await import("./Lab/index.js");
            await LabGameScene.load();
            if (!customElements.get("lab-scene")) {
                customElements.define("lab-scene", LabGameScene);
            }
            return LabGameScene;
        })();
    }

    /**
     * Back to a fresh Lounge (e.g. pressing back from the Lab).
     * Clearing body[loaded] hides everything behind the loading screen;
     * the Lounge sets it again once it's ready.
     * @param {{push?: boolean}} options push: add a history entry for #lounge.
     */
    goToLounge({ push = true } = {}) {
        if (this.#transitioning || this.#zone === "lounge") return;
        document.body.toggleAttribute("loaded", false);
        this.showLounge({ push });
    }

    /**
     * Hides everything behind the loading screen (body[loaded] cleared) until
     * the Lab's assets are in, then shows it.
     * @param {{push?: boolean}} options
     *   push: add a history entry for #lab, so back returns to the Lounge.
     */
    async goToLab({ push = true } = {}) {
        if (this.#transitioning || this.#zone === "lab") return;
        this.#transitioning = true;
        document.body.toggleAttribute("loaded", false);

        const LabGameScene = await this.#loadLab();

        // Removing the lounge triggers its dispose() (listeners + render loop).
        // Constructed with `new` rather than document.createElement, because
        // the Lab's constructor appends children (which createElement forbids).
        this.#setZone("lab", new LabGameScene(), push);

        this.#transitioning = false;
        this.#syncToHash();

        setTimeout(() => document.body.toggleAttribute("loaded", true), 200);
    }

    /**
     * @param {boolean} push pushState for a player-driven move (so back
     *   returns to the previous zone); replaceState for the first zone and
     *   for moves that came from the history itself (back/forward).
     */
    #setZone(name, element, push) {
        this.#current?.remove();
        this.#current = element;
        this.#zone = name;
        this.setAttribute("zone", name);
        this.appendChild(element);

        const url = `#${name}`;
        if (push && location.hash !== url) history.pushState(null, "", url);
        else history.replaceState(history.state, "", url);
    }

    /** Loads everything the first zone needs and defines the custom elements. */
    static async load() {
        await LoungeSceneGame.load();
        // explicit tag name: the build minifies class names, so it can't be derived from LoungeSceneGame.name
        SvgPlus.defineHTMLElement(LoungeSceneGame, "lounge-scene-game");
        customElements.define("game-main", GameMain);
    }
}

export { GameMain };
