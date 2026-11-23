import { LoungeScene } from "./lounge.js";
import { checkSecretKey, initialise } from "../Database/user.js";
import { FullscreenManager } from "../FullScreenManager/manager.js";
import { TypeWriter } from "../TypeWriter/type-writer.js";
import { SoundSprites } from "../sound-sprites.js";
import { SvgPlus } from "../SvgPlus/4.js";

import PROMPT_HTML from     "./html-css/prompt.html?raw";
import INITIAL_PROMPT from  "./html-css/initial-prompt.html?raw";
import LETTER_MESSAGE from  "./html-css/letter-message.html?raw";
import NOTE_MESSAGE from    "./html-css/note-message.html?raw";
import FINAL_PROMPT from    "./html-css/final-prompt.html?raw";

import BAG_SVG from "../../assets/Lounge/bag.svg?raw";

import "./html-css/style.css"

const ASSETS = import.meta.resolve("../../assets");


class Prompt extends SvgPlus {
    constructor(toggleCollapsed = true) {
        super("div");
        this.classList.add("prompt");
        this.innerHTML = PROMPT_HTML
        this.content = this.createChild("div", { class: "content"})

        if (toggleCollapsed) {
            this.events = {
                click: () => {
                    this.toggleCollapsed()
                }
            }
        }
    }
    toggleCollapsed() {
        this.collapsed = !this.collapsed;
    }
    set collapsed(value) {
        this.toggleAttribute("collapsed", value);
    }
    get collapsed() {
        return this.hasAttribute("collapsed");
    }
}

class PaperPage extends SvgPlus {
    constructor(content, imgSrc) {
        super("paper-page");
       
        const rel = this.createChild("div");
        this.content = rel;
        this.img = rel.createChild("img", {
            src: imgSrc,
            class: "sizer"
        });
        this.writer = rel.createChild("type-writer", {
            content,
            delay: 20,
        });
    }
}

class LoungeSceneGame extends SvgPlus {
    #built = false;
    #seenLetter = false;
    #seenNote = false;
    #mode = null;

     /** Aborting this removes the window listeners added in build(). */
    #listeners = new AbortController();
    #lastTouchTime = 0;
    #cursorHideTimer = null;
   
    constructor(el) {
        super(el);

    }  

    set mode(value) {
        this.soundSprites.play("click");
        if (value === "letter") {
            this.letter.writer.play();
            this.toggleAttribute("letter", true);
            this.toggleAttribute("open", true);
            this.#seenLetter = true;
        } else if (value === "note") {
            this.note.writer.play();
            this.toggleAttribute("note", true);
            this.toggleAttribute("open", true);
            this.#seenNote = true;
        } else if (value === "open") {
            this.toggleAttribute("open", true);
            this.toggleAttribute("letter", false);
            this.toggleAttribute("note", false);
            if (this.#seenLetter && this.#seenNote) {
                setTimeout(() => {
                    this.finalPrompt.collapsed = false;
                    this.finalPromptMessage.play();
                    this.#seenLetter = false;
                    this.#seenNote = false;
                }, 100);
            }
        } else {
            value = null;
            this.toggleAttribute("letter", false);
            this.toggleAttribute("note", false);
            this.toggleAttribute("open", false);
        }
        this.#mode = value;
    }
    get mode() { return this.#mode; }


   

    onconnect() {
        this.build();
    }

    ondisconnect() {
        this.dispose();
    }

    /**
     * Stops the lounge for good: removes its window listeners (which would
     * otherwise keep swallowing clicks aimed at the calculator) and stops
     * the WebGL render loop.
     */
    dispose() {
        this.#listeners.abort();
        this.loungeScene?.stopRenderingLoop();
    }

    build() {
        if (!this.#built) {
            this.#built = true;

            this.createChild("div", {class: "background"});


            // BUILD THE INITIAL PROMPT
            this.initialPrompt = this.createChild(Prompt, {
                class: "prompt initial clickable"
            });
            this.initialPromptMessage = this.initialPrompt.content
            .createChild("type-writer", {
                content: INITIAL_PROMPT,
            });


            // BUILD THE BAG
            this.bagGroup = this.createChild("div", { class: "bag-group image-sizer" }).createChild("div");
            const bag = new SvgPlus(SvgPlus.parseSVGString(BAG_SVG));
            bag.props = {
                class: "bag sizer",
                width: "506.513",
                height: "488.974",
                events: {
                    click: () => this.mode = this.mode === "open" ? null : "open"
                }
            }
            this.bagGroup.appendChild(bag);

            // BUILD THE ENVELOPE IMAGE
            this.bagGroup.createChild("img", {
                src: ASSETS + "/Lounge/envelope.webp",
                class: "envelope clickable",
                events: {
                    click: () => this.mode = "letter"
                }
            })

            //BUILD THE NOTE PAPER IMAGE
            this.bagGroup.createChild("img", {
                src: ASSETS + "/Lounge/folded-paper.webp",
                class: "note-paper clickable",
                events: {
                    click: () => this.mode = "note"
                }
            })


            // BUILD THE LOUNGE SCENE
            const loungeScene = this.createChild("lounge-scene", {
                events: {
                    evaluate: async (event) => {
                        const result = await checkSecretKey(event.detail);
                        if (result.index >= 0)
                            this.showKeyFound(result, event.detail);
                    }
                }
            })
            this.loungeScene = loungeScene;
            // Returns true if the point hit the calculator.
            const pressCalculator = (clientX, clientY) => {
                const clickMode = loungeScene.click({ clientX, clientY });
                if (clickMode === 2) {
                    this.soundSprites.play("keypress")
                }
                return clickMode > 0;
            }

            window.addEventListener("click", (event) => {
                if (pressCalculator(event.clientX, event.clientY)) {
                    event.preventDefault();
                    event.stopPropagation();
                    event.stopImmediatePropagation();
                }
            }, { capture: true, signal: this.#listeners.signal });

            // Touch: handle taps right away instead of waiting for the delayed
            // synthetic click (which is dropped on quick repeat taps).
            let tapStart = null;
            window.addEventListener("touchstart", (event) => {
                const t = event.touches[0];
                tapStart = event.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null;
                // Don't touch the cursor here: iOS treats a tap that makes content
                // visible as a "hover" and swallows the click (needing a second tap).
                this.#lastTouchTime = Date.now();
            }, { capture: true, passive: true, signal: this.#listeners.signal });

            window.addEventListener("touchend", (event) => {
                const t = event.changedTouches[0];
                const start = tapStart;
                tapStart = null;
                // ignore drags and multi-finger gestures
                if (!start || event.touches.length > 0 || Math.hypot(t.clientX - start.x, t.clientY - start.y) > 10) return;

                if (pressCalculator(t.clientX, t.clientY)) {
                    // cancels the synthetic click so the key isn't pressed twice
                    if (event.cancelable) event.preventDefault();
                    event.stopPropagation();
                    event.stopImmediatePropagation();
                }
            }, { capture: true, passive: false, signal: this.#listeners.signal });



            // BUILD THE LETTER
            this.letter =this.createChild(PaperPage, {
                    class: "letter clickable",
                    events: { click: () => this.mode = "open" }
                }, 
                LETTER_MESSAGE,
                ASSETS + "/Lounge/letter-paper.webp"
            );
          


             // BUILD THE NOTE
            this.note =this.createChild(PaperPage, {
                    class: "note clickable",
                    events: { click: () => this.mode = "open" }
                },
                `<img src="${ASSETS + "/Lounge/massbleed.webp"}" alt="Note Paper">
                 <br/>
                ${NOTE_MESSAGE}`,
                ASSETS + "/Lounge/white-paper.webp"
            );


            // FINAL PROMT 
            this.finalPrompt = this.createChild(Prompt, {
                class: "prompt final",
            }, false);
            this.finalPromptMessage = new SvgPlus("type-writer")
            this.finalPromptMessage.createChild("p", { content: FINAL_PROMPT });
            const row = this.finalPromptMessage.createChild("div", {
                class: "row"
            })
            row.createChild("div", {
                class: "clickable",
                content: "yes",
                events: {click: () => {
                    this.soundSprites.play("click");
                    // GameMain listens for this to move on to the next zone.
                    this.dispatchEvent(new CustomEvent("explore", { bubbles: true }));
                }}
            });
            row.createChild("div", {
                class: "clickable", 
                content: "no",
                events: {click: () => this.finalPrompt.collapsed = true}
            });
            this.finalPrompt.content.appendChild(this.finalPromptMessage);


            // KEY FOUND POPUP (content is filled in by showKeyFound)
            this.keyFoundPrompt = this.createChild(Prompt, {
                class: "prompt key-found",
            });

            this.cursor = this.createChild("div", {
                class: "cursor",
                mode: "default"
            });
            this.cursor.createChild("img", {
                src: ASSETS + "/normal-cursor.svg",
                alt: "Cursor",
                class: "default",
                styles: { 
                    width: "64px",
                    transform: "translate(-6px, -14px)"
                }
            })
            this.cursor.createChild("img", {
                src: ASSETS + "/cursor.svg",
                alt: "Cursor",
                class: "pointer",
                styles: {
                    width: "64px",
                    transform: "translate(-23px, -10px)"
                }
            });

            window.addEventListener("mousemove", (e) => {
                this.updateCursorMode(e.clientX, e.clientY, e.target, false);
            }, {signal: this.#listeners.signal});   
            
            window.addEventListener("touchmove", (e) => {
                const t = e.touches[0];
                this.#lastTouchTime = Date.now();
                this.updateCursorMode(t.clientX, t.clientY, e.target, true);
            }, {signal: this.#listeners.signal});

            // For taps, show the cursor only once the click has been dispatched.
            window.addEventListener("click", (e) => {
                if (Date.now() - this.#lastTouchTime > 1000) return;
                const { clientX, clientY, target } = e;
                setTimeout(() => this.updateCursorMode(clientX, clientY, target, true), 0);
            }, {signal: this.#listeners.signal});

            document.body.toggleAttribute("loaded");
            this.keyFoundPrompt.collapsed = true;
            this.finalPrompt.collapsed = true;
            this.initialPrompt.collapsed = false;
            this.initialPromptMessage.play();
        }
    }

    updateCursorMode(clientX, clientY, target, isTouch) {
        if (isTouch) {
            clearTimeout(this.#cursorHideTimer);
            this.#cursorHideTimer = setTimeout(() => {
                this.cursor.style.opacity = "0";
            }, 2000);
            this.cursor.style.opacity = "1";
        }

        let cursorMode = target?.closest?.(".clickable");
        if (!cursorMode) {
            cursorMode = this.loungeScene.checkPointer({ clientX, clientY });
        }
        this.cursor.style.left = clientX + "px";
        this.cursor.style.top = clientY + "px";
        this.cursor.setAttribute("mode", cursorMode ? "pointer" : "default");
    }

    /**
     * Shows the "secret key found" popup.
     * @param {{index: number, remaining: number, total: number}} result from checkSecretKey
     * @param {string} key the key the user entered
     */
    showKeyFound({ index, remaining, total }, key) {
        const left = remaining === 0
            ? "WOW! You've found every secret key!"
            : `${remaining} of ${total} key${remaining === 1 ? "" : "s"} left to find.`;

        // TypeWriter only splits its text once, so make a fresh one each time
        this.keyFoundPrompt.content.innerHTML = "";
        const writer = this.keyFoundPrompt.content.createChild("type-writer", {
            content: `You found secret key #${index + 1}!
                <br/><br/>
                <span class="key-code">${key}</span>
                <br/><br/>
                ${left}`,
        });
        this.keyFoundPrompt.collapsed = false;
        writer.play();
    }

    get soundSprites() {
        return LoungeSceneGame.soundSprites;
    }
   
    static async load() {
        initialise();
        const [sounds] = await Promise.all([
            await SoundSprites.load(ASSETS + "/SFX/sound-sprites.smp3"),
            await LoungeScene.load()
        ]);
        FullscreenManager.initialise();
        LoungeScene.define("lounge-scene");
        TypeWriter.define();
        this.soundSprites = sounds;
    }
}

export {LoungeSceneGame};