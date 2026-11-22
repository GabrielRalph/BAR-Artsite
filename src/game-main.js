import { LoungeSceneGame } from "./Lounge/index.js";
import { SvgPlus } from "./SvgPlus/4.js";

const FADE_MS = 800;
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
        this.fader = document.createElement("div");
        this.fader.className = "zone-fader";
    }

    connectedCallback() {
        if (!this.fader.isConnected) this.appendChild(this.fader);
        if (!this.#zone) this.#startAt(GameMain.hashZone);
    }

    /** Zone named in the URL hash, or "lounge" if there isn't a valid one. */
    static get hashZone() {
        const zone = location.hash.slice(1).toLowerCase();
        return ZONES.includes(zone) ? zone : "lounge";
    }

    #startAt(zone) {
        if (zone === "lab") this.goToLab({ fade: false });
        else this.showLounge();
    }

    /** Name of the zone currently shown ("lounge" | "lab"). */
    get zone() { return this.#zone; }

    showLounge() {
        const lounge = document.createElement("lounge-scene-game");
        lounge.addEventListener("explore", () => this.goToLab(), { once: true });
        this.#setZone("lounge", lounge);

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
     * @param {{fade?: boolean}} options fade: false when starting straight
     *   in the Lab (e.g. reloading on #lab), where the loading screen covers it.
     */
    async goToLab({ fade = true } = {}) {
        if (this.#transitioning || this.#zone === "lab") return;
        this.#transitioning = true;
        document.body.toggleAttribute("loaded", false);


        // Fade out and finish loading at the same time; the screen stays
        // black until the Lab's assets are in.
        const [LabGameScene] = await Promise.all([
            this.#loadLab(),
            fade && this.#fade(true),
        ]);

        // Removing the lounge triggers its dispose() (listeners + render loop).
        // Constructed with `new` rather than document.createElement, because
        // the Lab's constructor appends children (which createElement forbids).
        this.#setZone("lab", new LabGameScene());

        // The Lounge normally hides the loading screen; when we skip it, we do.
        document.body.toggleAttribute("loaded", true);

        if (fade) await this.#fade(false);
        this.#transitioning = false;
    }

    #setZone(name, element) {
        this.#current?.remove();
        this.#current = element;
        this.#zone = name;
        this.setAttribute("zone", name);
        this.insertBefore(element, this.fader);

        // replaceState so moving between zones doesn't add history entries
        // (going "back" into a torn-down zone isn't supported).
        history.replaceState(history.state, "", `#${name}`);
    }

    #fade(toBlack) {
        this.fader.toggleAttribute("shown", toBlack);
        return new Promise(r => setTimeout(r, FADE_MS));
    }

    /** Loads everything the first zone needs and defines the custom elements. */
    static async load() {
        await LoungeSceneGame.load();
        SvgPlus.defineHTMLElement(LoungeSceneGame);
        customElements.define("game-main", GameMain);
    }
}

export { GameMain };
