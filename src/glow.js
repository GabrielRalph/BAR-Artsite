// glow.js — soft halo + fresnel rim glow for any three.js mesh
// Usage:
//   import { addGlow } from './glow.js';
//   const glow = addGlow(coinMesh, { color: 0xcfe6ff });
//   // in your render loop:
//   glow.update(clock.getElapsedTime());

import * as THREE from 'three';

/* ------------------------------------------------------------------ */
/* 1. HALO — a camera-facing quad behind the object with a radial fade */
/* ------------------------------------------------------------------ */

const haloVertex = /* glsl */ `
  uniform float uSize;        // halo radius in world units
  uniform float uDepthOffset; // push halo behind the object
  varying vec2 vPos;

  void main() {
    vPos = position.xy;                       // plane is -1..1
    // billboard: start at the object's centre in view space...
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    // ...then expand the quad in screen-aligned axes
    mv.xy += position.xy * uSize;
    mv.z  -= uDepthOffset;
    gl_Position = projectionMatrix * mv;
  }
`;

const haloFragment = /* glsl */ `
  uniform vec3  uColor;
  uniform float uIntensity;
  uniform float uInner;    // where the glow starts (0..1 of halo radius)
  uniform float uFalloff;  // higher = tighter glow
  uniform float uTime;
  uniform float uPulse;    // 0 = no pulse
  varying vec2 vPos;

  void main() {
    float d = length(vPos);
    if (d > 1.0) discard;

    float t = clamp((d - uInner) / (1.0 - uInner), 0.0, 1.0);
    float glow = pow(1.0 - t, uFalloff);

    // a little extra hot band right at the object's edge
    glow += 0.6 * exp(-pow((d - uInner) * 18.0, 2.0));

    glow *= uIntensity * (1.0 + uPulse * sin(uTime * 2.0));

    gl_FragColor = vec4(uColor * glow, glow);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/* ------------------------------------------------------------------ */
/* 2. RIM — fresnel overlay drawn on the object's own surface          */
/* ------------------------------------------------------------------ */

const rimVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewDir;
//   varying float delta;

  void main() {
    vec3 transformed = position + normal * 0.5;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  }
`;

const rimFragment = /* glsl */ `
  uniform vec3  uColor;
  uniform float uIntensity;
  uniform float uPower;  // rim sharpness
  uniform float uBase;   // overall surface brightening
  uniform float uTime;
  uniform float uPulse;
  varying vec3 vNormal;
  varying vec3 vViewDir;
//   varying float delta;

  void main() {
    // float f = 1.0 - abs(dot(normalize(vNormal), normalize(vViewDir)));
    // float rim = pow(f, uPower) + uBase;
    // rim *= uIntensity * (1.0 + uPulse * sin(uTime * 2.0));
    gl_FragColor = vec4(uColor, 1);
   
  }
`;

/* ------------------------------------------------------------------ */

class Halo extends THREE.Mesh {
    #objectMesh = null;
    haloScale = 1.7;
    constructor(mesh, opts = {}) {
        const {
            color = 0xd8ecff,     // cool white, like the reference
            haloScale = 1.7,      // halo radius relative to object radius
            haloIntensity = 0.9,
            haloFalloff = 2.2,
            pulse = 0.06,         // set 0 for a steady glow
        } = opts;
        const col = new THREE.Color(color);

        super(
            new THREE.PlaneGeometry(2, 2), 
            new THREE.ShaderMaterial({
                uniforms: {
                uColor: { value: col },
                uIntensity: { value: haloIntensity },
                uInner: { value: (1 / haloScale) * 0.92 },
                uFalloff: { value: haloFalloff },
                uSize: { value: 1 * haloScale },
                uDepthOffset: { value: 1 * 0.5 },
                uTime: { value: 0 },
                uPulse: { value: pulse },
                },
                vertexShader: haloVertex,
                fragmentShader: haloFragment,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            })
        )
        this.#objectMesh = mesh;
        this.frustumCulled = false;   // the vertex shader moves it, so skip culling
        this.renderOrder = 1;
        this.haloScale = haloScale;
        this.raycast = () => {};      // don't block clicks/picking
    }

    set time(value) {
        this.material.uniforms.uTime.value = value;
    }

    set radius(value) {
        this.material.uniforms.uSize.value = value * this.haloScale;
        this.material.uniforms.uDepthOffset.value = value * 0.5;
    }

    update(time, updatePos = true, recomputeBoundingSphere = true) {
        this.time = time;
        if (updatePos) {
            const mesh = this.#objectMesh;
            if (recomputeBoundingSphere) mesh.geometry.computeBoundingSphere();
            const ws = new THREE.Vector3();
            mesh.getWorldScale(ws);
            const radius = mesh.geometry.boundingSphere.radius * Math.max(ws.x, ws.y, ws.z);
            this.position.copy(mesh.geometry.boundingSphere.center);
            this.radius = radius;
        }
    }
}

class Rim extends THREE.Mesh {
    constructor(mesh, opts = {}) {
        const {
            rimIntensity = 5,
            rimPower = 5,
            rimBase = 0.1,
            pulse = 0.06,         // set 0 for a steady glow
            color = 0xd8ecff,
        } = opts;
        const col = new THREE.Color(color);

        super(
            mesh.geometry, 
            new THREE.ShaderMaterial({
                uniforms: {
                uColor: { value: col },
                uIntensity: { value: rimIntensity },
                uPower: { value: rimPower },
                uBase: { value: rimBase },
                uTime: { value: 0 },
                uPulse: { value: pulse },
                },
                vertexShader: rimVertex,
                fragmentShader: rimFragment,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                polygonOffset: true,        // sit on top of the surface without z-fighting
                polygonOffsetFactor: -1,
                polygonOffsetUnits: -1,
            })
        );

        mesh.geometry.computeBoundingSphere();
        const ws = new THREE.Vector3();
        mesh.getWorldScale(ws);
        const radius = mesh.geometry.boundingSphere.radius * Math.max(ws.x, ws.y, ws.z);
        console.log(radius);
        this.renderOrder = 0;
        this.raycast = () => {};
    }

    set time(value) {
        this.material.uniforms.uTime.value = value;
    }
}

class Glow extends THREE.Group {
    #objectMesh = null;
    constructor(mesh, opts = {}) {
        super();
        // this.halo = new Halo(mesh, opts);
        this.rim = new Rim(mesh, opts);
        // this.add(this.halo);
        this.add(this.rim);
        mesh.add(this); 
        mesh.glow = this;
        this.#objectMesh = mesh;
        // mesh.visible = false;
        // mesh.material.opacity = 0;

    }

    setVisible(v) {
        this.children.forEach(child => child.visible = v);
    }

    set time(value) {
        // this.halo.time = value;
        this.rim.time = value;
    }

    update(time) {
        // this.halo.update(time);
        this.rim.time = time
    }


    dispose() {
        // this.halo.dispose();
        this.rim.dispose();
        this.#objectMesh.remove(this);
    }
}


export { Glow };