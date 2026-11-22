import { Mesh, TextureLoader, Color, Vector3, Group, Vector2, PlaneGeometry, BackSide, ShaderMaterial } from "three";
import { Water } from "three/examples/jsm/objects/Water2.js";

class WaterBox extends Group {
    maxHeight = 0.3;
    constructor(width = 1,depth = 1) {
        super();
        const loader = new TextureLoader();
        // Water2 reflects/refracts about a single plane, so it only works on a flat surface, not a box.
        this.surface = new Water(new PlaneGeometry(width, depth), {
            color: 0xa7fd0,
            scale: 2,
            flowDirection: new Vector2(1, 1),
            flowSpeed: 0.02,
            textureWidth: 512,
            textureHeight: 512,
            normalMap0: loader.load(import.meta.resolve("../assets/water_normal_1.jpg")),
            normalMap1: loader.load(import.meta.resolve("../assets/water_normal_2.jpg")),
        });
        this.surface.rotation.x = -Math.PI / 2;
        let color = new Color().setHSL(0.61, 1, 0.3);

        this.surface.material.uniforms.color.value.copy(color);
        this.add(this.surface);

        // Water2 is one-sided, so from below we draw our own underside.
        const uniforms = this.surface.material.uniforms;
        this.underside = new Mesh(this.surface.geometry, new ShaderMaterial({
            uniforms: {
                tNormal0: uniforms.tNormalMap0,
                tNormal1: uniforms.tNormalMap1,
                uFlow: uniforms.config, // Water2's flow animation state, so ripples match the top
                uFlowDir: uniforms.flowDirection,
                uWindowColor: { value: new Color(0.35, 0.6, 1.0) },
                uDeepColor: { value: new Color(0.004, 0.03, 0.2) },
            },
            vertexShader: /* glsl */ `
                varying vec2 vUv;
                varying vec3 vWorld;
                void main() {
                    vUv = uv;
                    vec4 w = modelMatrix * vec4(position, 1.0);
                    vWorld = w.xyz;
                    gl_Position = projectionMatrix * viewMatrix * w;
                }
            `,
            fragmentShader: /* glsl */ `
                uniform sampler2D tNormal0;
                uniform sampler2D tNormal1;
                uniform vec4 uFlow; // x,y = flow offsets, z = half cycle, w = scale
                uniform vec2 uFlowDir;
                uniform vec3 uWindowColor;
                uniform vec3 uDeepColor;
                varying vec2 vUv;
                varying vec3 vWorld;
                void main() {
                    vec2 uv = vUv * uFlow.w;
                    vec3 n0 = texture2D(tNormal0, uv + uFlowDir * uFlow.x).rgb * 2.0 - 1.0;
                    vec3 n1 = texture2D(tNormal1, uv + uFlowDir * uFlow.y).rgb * 2.0 - 1.0;
                    float flowLerp = abs(uFlow.z - uFlow.x) / uFlow.z;
                    vec2 ripple = mix(n0.xy, n1.xy, flowLerp) * 0.35;
                    vec3 N = normalize(vec3(ripple.x, -1.0, ripple.y)); // facing down at the viewer

                    vec3 V = normalize(cameraPosition - vWorld);
                    float cosI = max(dot(V, N), 0.0);

                    // Snell's window: inside ~48.6 deg from straight up you see out of the water,
                    // outside it the surface is a mirror (total internal reflection).
                    float inside = smoothstep(0.62, 0.70, cosI);
                    float rim = exp(-pow((cosI - 0.66) * 18.0, 2.0)); // bright ring at the window edge

                    float sparkle = pow(max(ripple.x + ripple.y, 0.0) * 1.6, 6.0);
                    vec3 windowCol = uWindowColor * (0.7 + sparkle);
                    vec3 col = mix(uDeepColor * (1.0 + sparkle * 0.5), windowCol, inside);
                    col += uWindowColor * rim * 0.8;

                    float alpha = mix(0.96, 0.18 + sparkle * 0.3, inside);
                    gl_FragColor = vec4(col, alpha);
                }
            `,
            side: BackSide,
            transparent: true,
            depthWrite: false,
        }));
        this.underside.visible = false;
        this.surface.add(this.underside);

        this.raycast = () => {}
        this.surface.raycast = this.raycast;
        this.underside.raycast = this.raycast;
    }

    /** World-space height of the water surface. */
    get worldHeight() {
        return this.surface.getWorldPosition(new Vector3()).y;
    }

    get hasWater() {
        return this._hasWater;
    }

    /**
     * Shows the top surface or the underside depending on which side of the water the camera is.
     * @returns {boolean} whether the camera is under the surface (and inside the water's footprint)
     */
    updateForCamera(camera) {
        const camPos = camera.getWorldPosition(new Vector3());
        const local = this.surface.worldToLocal(camPos.clone());
        const { width, height } = this.surface.geometry.parameters;
        const insideFootprint = Math.abs(local.x) < width / 2 && Math.abs(local.y) < height / 2;
        const waterY = this.worldHeight;
        const under = this._hasWater && insideFootprint && camPos.y < waterY;

        // The top surface is one-sided and Water2 skips its reflection renders from below,
        // so it can stay visible (it also keeps driving the ripple animation we share).
        this.underside.visible = under;
        // Near the surface the post pass draws the waterline per pixel, so tell it a little early.
        return this._hasWater && insideFootprint && camPos.y < waterY + 0.12;
    }

    set height(value) {
        this.surface.position.y = Math.min(value, this.maxHeight);
        this._hasWater = value !== undefined && value > 0;
        this.surface.visible = this._hasWater;
    }

    get height() {
        return this.surface.position.y;
    }
}

export {WaterBox}