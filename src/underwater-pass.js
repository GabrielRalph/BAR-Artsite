// underwater-pass.js — makes the view look like it's under water.
//
// Works on each pixel of the normal render using the depth buffer:
//   - Rebuilds the pixel's world position from depth.
//   - Only the part of the view ray that is under water counts, so looking up
//     through the surface at the room above is less fogged.
//   - Water soaks up red first, then green, so distant things go blue-green
//     (per-channel absorption), then fade into the water colour (scattering).
//   - Moving caustic light patterns on surfaces under the water.
//   - Wobble distortion, soft blur that grows with distance, and a vignette.
//   - Per-pixel waterline: when the camera is half in the water, only the
//     part of the screen below the surface gets the effect.
//
// Needs the composer's render target to have a depthTexture. Put this pass
// straight after the RenderPass so readBuffer still holds the scene depth.

import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const underwaterShader = {
    uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: null },
        uProjInv: { value: new THREE.Matrix4() },
        uCamWorld: { value: new THREE.Matrix4() },
        uCamPos: { value: new THREE.Vector3() },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uWaterY: { value: 0 },
        uWaterColor: { value: new THREE.Color() },  // colour of light scattered by the water
        uAbsorption: { value: new THREE.Vector3() }, // per-metre loss of R, G, B
        uDensity: { value: 0 },                      // how fast it fogs to the water colour
        uCaustics: { value: 0 },
        uDistortion: { value: 0 },
        uBlur: { value: 0 },
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
        uniform sampler2D tDepth;
        uniform mat4 uProjInv;
        uniform mat4 uCamWorld;
        uniform vec3 uCamPos;
        uniform vec2 uResolution;
        uniform float uTime;
        uniform float uWaterY;
        uniform vec3 uWaterColor;
        uniform vec3 uAbsorption;
        uniform float uDensity;
        uniform float uCaustics;
        uniform float uDistortion;
        uniform float uBlur;
        varying vec2 vUv;

        #define TAU 6.28318530718

        vec3 worldFromDepth(vec2 uv, float depth) {
            vec4 ndc = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
            vec4 view = uProjInv * ndc;
            view /= view.w;
            return (uCamWorld * view).xyz;
        }

        // Cheap tiling caustic pattern (bright wobbling web of lines).
        float caustic(vec2 p, float t) {
            p = mod(p * TAU, TAU) - 250.0;
            vec2 i = p;
            float c = 1.0;
            float inten = 0.005;
            for (int n = 0; n < 4; n++) {
                float tt = t * (1.0 - (3.5 / float(n + 1)));
                i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
                c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
            }
            c /= 4.0;
            c = 1.17 - pow(c, 1.4);
            return pow(abs(c), 8.0);
        }

        void main() {
            // Is the start of this pixel's view ray (on the near plane) under the surface?
            vec3 nearP = worldFromDepth(vUv, 0.0);
            float waveLine = uWaterY
                + sin(vUv.x * 18.0 + uTime * 2.3) * 0.004
                + sin(vUv.x * 41.0 - uTime * 3.1) * 0.002;
            float lineDist = nearP.y - waveLine;
            if (lineDist > 0.0) {
                vec4 above = texture2D(tDiffuse, vUv);
                // Thin wet meniscus just above the waterline.
                float meniscus = exp(-lineDist * 900.0);
                gl_FragColor = vec4(mix(above.rgb, uWaterColor * 0.6, meniscus * 0.7), above.a);
                return;
            }

            // Wobble, like looking through moving water.
            vec2 uv = vUv + uDistortion * vec2(
                sin(vUv.y * 23.0 + uTime * 1.7) + sin(vUv.y * 9.0 - uTime * 1.1),
                cos(vUv.x * 19.0 + uTime * 1.3) + cos(vUv.x * 7.0 + uTime * 0.9)
            );
            uv = clamp(uv, vec2(0.001), vec2(0.999));

            float depth = texture2D(tDepth, uv).r;
            bool sky = depth >= 1.0;
            vec3 P = worldFromDepth(uv, sky ? 0.9999 : depth);
            float dist = sky ? 40.0 : length(P - uCamPos);

            // Blur that gets stronger with distance (water is never crystal clear).
            vec2 px = 1.0 / uResolution;
            float r = uBlur * clamp(dist / 4.0, 0.2, 1.5);
            vec3 col = texture2D(tDiffuse, uv).rgb * 0.4;
            col += texture2D(tDiffuse, uv + vec2( r,  r) * px).rgb * 0.15;
            col += texture2D(tDiffuse, uv + vec2(-r,  r) * px).rgb * 0.15;
            col += texture2D(tDiffuse, uv + vec2( r, -r) * px).rgb * 0.15;
            col += texture2D(tDiffuse, uv + vec2(-r, -r) * px).rgb * 0.15;

            // Only the under-water part of the ray is fogged.
            float pathLen = dist;
            if (P.y > uWaterY && uCamPos.y < uWaterY) {
                pathLen = dist * (uWaterY - uCamPos.y) / max(P.y - uCamPos.y, 1e-4);
            }

            float depthBelow = max(uWaterY - P.y, 0.0);

            // Caustics on submerged surfaces, mostly on the ones facing up.
            if (!sky && depthBelow > 0.0) {
                vec3 n = normalize(cross(dFdx(P), dFdy(P)));
                float facing = 0.35 + 0.65 * abs(n.y);
                float c = caustic(P.xz * 0.45, uTime * 0.6);
                float c2 = caustic(P.xz * 0.45 + 0.13, uTime * 0.6 + 0.4); // second sample = slight colour split
                vec3 cc = vec3(c, (c + c2) * 0.5, c2);
                float fade = exp(-depthBelow * 0.35) * smoothstep(0.0, 0.08, depthBelow);
                col += col * cc * uCaustics * facing * fade;
            }

            // Light also loses colour on its way down from the surface to the object.
            vec3 transmittance = exp(-uAbsorption * (pathLen + depthBelow * 0.5));
            col *= transmittance;

            // Scattered light: brighter looking up toward the surface, darker the deeper we are.
            vec3 viewDir = normalize(P - uCamPos);
            float camDepth = max(uWaterY - uCamPos.y, 0.0);
            vec3 scatter = uWaterColor * (0.55 + 0.75 * smoothstep(-0.4, 1.0, viewDir.y)) * exp(-camDepth * 0.2);
            float fog = 1.0 - exp(-uDensity * pathLen);
            col = mix(col, scatter, fog);

            // Soft darkening toward the edges, and right under the waterline a touch of light.
            vec2 vc = vUv - 0.5;
            col *= 1.0 - dot(vc, vc) * 0.9;
            col += uWaterColor * exp(lineDist * 300.0) * 0.6;

            gl_FragColor = vec4(col, 1.0);
        }
    `,
};

export class UnderwaterPass extends Pass {
    constructor(camera, opts = {}) {
        super();
        const {
            waterColor = new THREE.Color(0.008, 0.05, 0.32), // linear colour: deep blue
            absorption = new THREE.Vector3(0.9, 0.42, 0.04), // red and green die off fast, blue survives
            density = 0.42,
            caustics = 1.6,
            distortion = 0.0025,
            blur = 1.5,
        } = opts;

        this.camera = camera;
        this.waterY = 0;
        this.quad = new FullScreenQuad(new THREE.ShaderMaterial({
            uniforms: THREE.UniformsUtils.clone(underwaterShader.uniforms),
            vertexShader: underwaterShader.vertexShader,
            fragmentShader: underwaterShader.fragmentShader,
            depthTest: false,
            depthWrite: false,
        }));

        const u = this.uniforms;
        u.uWaterColor.value.copy(waterColor);
        u.uAbsorption.value.copy(absorption);
        u.uDensity.value = density;
        u.uCaustics.value = caustics;
        u.uDistortion.value = distortion;
        u.uBlur.value = blur;
    }

    // Tweak at runtime, e.g. wts.underwaterPass.uniforms.uDensity.value = 0.5
    get uniforms() { return this.quad.material.uniforms; }

    setSize(width, height) {
        this.uniforms.uResolution.value.set(width, height);
    }

    render(renderer, writeBuffer, readBuffer, deltaTime) {
        const u = this.uniforms;
        const camera = this.camera;
        camera.updateMatrixWorld();
        u.tDiffuse.value = readBuffer.texture;
        u.tDepth.value = readBuffer.depthTexture;
        u.uProjInv.value.copy(camera.projectionMatrixInverse);
        u.uCamWorld.value.copy(camera.matrixWorld);
        u.uCamPos.value.setFromMatrixPosition(camera.matrixWorld);
        u.uTime.value += deltaTime;
        u.uWaterY.value = this.waterY;

        renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
        if (this.clear) renderer.clear();
        this.quad.render(renderer);
    }

    dispose() {
        this.quad.material.dispose();
        this.quad.dispose();
    }
}
