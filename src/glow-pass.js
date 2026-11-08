// glow-pass.js — post-process halo around selected objects only.
//
// How it works each frame:
//   1. Render a mask: the whole scene in black (so walls etc. still hide the coin),
//      then the glowing objects in white on top.
//   2. Blur the mask with UnrealBloomPass to get a soft halo.
//   3. Add the tinted halo onto the normal render, leaving the coin itself mostly untouched.
//
// Usage:
//   const glowPass = new SelectiveGlowPass(scene, camera, { color: 0xd8ecff });
//   composer.addPass(glowPass);
//   glowPass.add(coinObject);

import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';

const compositeShader = {
    uniforms: {
        tDiffuse: { value: null }, // the normal scene render
        tGlow: { value: null },    // mask + bloom
        tMask: { value: null },    // the sharp mask
        uColor: { value: new THREE.Color() },
        uSurface: { value: 0 },
    },
    vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform sampler2D tGlow;
        uniform sampler2D tMask;
        uniform vec3 uColor;
        uniform float uSurface;
        varying vec2 vUv;

        void main() {
            vec4 base = texture2D(tDiffuse, vUv);
            float mask = texture2D(tMask, vUv).r;
            // The bloom output is mask + blur. The blur is bright inside the object too,
            // so keep only the part outside the mask, otherwise it washes the coin out.
            float halo = max(texture2D(tGlow, vUv).r - mask, 0.0) * (1.0 - mask);
            vec3 add = uColor * (halo + mask * uSurface);
            gl_FragColor = vec4(base.rgb + add, clamp(base.a + halo, 0.0, 1.0));
        }
    `,
};

export class SelectiveGlowPass extends Pass {
    #selectedObjects = new Set();
    constructor(scene, camera, opts = {}) {
        super();
        const {
            color = 0xd8ecff,  // cool white halo
            strength = 1.6,    // halo brightness
            radius = 0.45,     // halo spread (0..1)
            surface = 0.12,    // how much the object itself is brightened
            layer = 10,        // layer used to mark glowing objects
        } = opts;

        this.scene = scene;
        this.camera = camera;
        this.layer = layer;

        this.maskRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
        this.glowRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });

        this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), strength, radius, 0);

        this.blackMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
        this.whiteMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });

        this.copyQuad = new FullScreenQuad(new THREE.ShaderMaterial({
            uniforms: THREE.UniformsUtils.clone(CopyShader.uniforms),
            vertexShader: CopyShader.vertexShader,
            fragmentShader: CopyShader.fragmentShader,
        }));

        this.compositeQuad = new FullScreenQuad(new THREE.ShaderMaterial({
            uniforms: THREE.UniformsUtils.clone(compositeShader.uniforms),
            vertexShader: compositeShader.vertexShader,
            fragmentShader: compositeShader.fragmentShader,
        }));

        this.color = color;
        this.surface = surface;
        this._clearColor = new THREE.Color();
    }

    // Tweakable at runtime, e.g. wts.glowPass.strength = 2
    set color(v) { this.compositeQuad.material.uniforms.uColor.value.set(v); }
    set surface(v) { this.compositeQuad.material.uniforms.uSurface.value = v; }
    set strength(v) { this.bloom.strength = v; }
    get strength() { return this.bloom.strength; }
    set radius(v) { this.bloom.radius = v; }
    get radius() { return this.bloom.radius; }

    add(object) {
        object.traverse(o => o.layers.enable(this.layer));
        this.#selectedObjects.add(object);
    }

    remove(object) {
        object.traverse(o => o.layers.disable(this.layer));
        this.#selectedObjects.delete(object);
    }


    get numberOfSelectedObjects() {
        return this.#selectedObjects.size;
    }


    setSize(width, height) {
        this.maskRT.setSize(width, height);
        this.glowRT.setSize(width, height);
        this.bloom.setSize(width, height);
    }

    render(renderer, writeBuffer, readBuffer, deltaTime, maskActive) {
        const { scene, camera } = this;

        // Save renderer and scene state.
        const oldAutoClear = renderer.autoClear;
        const oldClearAlpha = renderer.getClearAlpha();
        renderer.getClearColor(this._clearColor);
        const oldShadowUpdate = renderer.shadowMap.autoUpdate;
        const oldBackground = scene.background;
        const oldOverride = scene.overrideMaterial;
        const oldLayers = camera.layers.mask;

        // 1. Mask: everything black (for occlusion), then the glowing objects white.
        renderer.shadowMap.autoUpdate = false; // no need to redo shadow maps for the mask
        scene.background = null;
        renderer.setClearColor(0x000000, 1);
        renderer.setRenderTarget(this.maskRT);
        renderer.clear();
        renderer.autoClear = false;

        scene.overrideMaterial = this.blackMaterial;
        renderer.render(scene, camera);

        camera.layers.set(this.layer);
        scene.overrideMaterial = this.whiteMaterial;
        renderer.render(scene, camera);

        camera.layers.mask = oldLayers;
        scene.overrideMaterial = oldOverride;
        scene.background = oldBackground;

        // 2. Copy the mask and bloom it in place (UnrealBloomPass adds onto its input).
        this.copyQuad.material.uniforms.tDiffuse.value = this.maskRT.texture;
        renderer.setRenderTarget(this.glowRT);
        renderer.clear();
        this.copyQuad.render(renderer);
        this.bloom.render(renderer, null, this.glowRT, deltaTime, false);

        // 3. Composite the halo onto the scene.
        const u = this.compositeQuad.material.uniforms;
        u.tDiffuse.value = readBuffer.texture;
        u.tGlow.value = this.glowRT.texture;
        u.tMask.value = this.maskRT.texture;
        renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
        renderer.clear();
        this.compositeQuad.render(renderer);

        // Restore.
        renderer.autoClear = oldAutoClear;
        renderer.setClearColor(this._clearColor, oldClearAlpha);
        renderer.shadowMap.autoUpdate = oldShadowUpdate;
    }

    dispose() {
        this.maskRT.dispose();
        this.glowRT.dispose();
        this.bloom.dispose();
        this.blackMaterial.dispose();
        this.whiteMaterial.dispose();
        this.copyQuad.dispose();
        this.compositeQuad.dispose();
    }
}
