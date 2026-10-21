import { Mesh, MeshPhysicalMaterial, TextureLoader, Vector3, Matrix4, Matrix3, Box3 , Group, BoxGeometry, MeshBasicMaterial, DoubleSide, MeshStandardMaterial, CylinderGeometry, PointLight, Vector2, PlaneGeometry, Color, BufferGeometry, Float32BufferAttribute, RepeatWrapping } from "three";
import { DRACOLoader, GLTFLoader } from "three/examples/jsm/Addons.js";
import { Water } from "three/examples/jsm/objects/Water2.js";
import { metalness, roughness } from "three/tsl";


const LOADERS = {
    draco: new DRACOLoader(),
    gltf: new GLTFLoader(),
    texture: new TextureLoader(),
    loadersByExtension: {
        "gltf": "gltf",
        "glb": "gltf",
        "jpg": "texture",
        "png": "texture",
        "webp": "texture"
    }
}
LOADERS.gltf.setDRACOLoader(LOADERS.draco);


class Asset extends Group {
    constructor() {
        super();
        if (this.data?.scene) {
            for (let child of this.data.scene.children) {
                this.add(child.clone());
            }
        }
    }


    get data() {
        return this.constructor.data;
    }


    static get url() {
        return "";
    }

    static get extension() {
        const parts = this.url.split(".");
        return parts[parts.length - 1].toLowerCase();
    }

    static async load(progress) {
        if (this.loading) return;
        this.loading = true;
        const loaderKey = LOADERS.loadersByExtension[this.extension];
        if (loaderKey) {
            const loader = LOADERS[loaderKey];
            const modelData = await loader.loadAsync(this.url, (p) => {
                if (progress instanceof Function) {
                    progress(p.loaded / p.total);
                }
            });
            this.data = modelData;
        }
    }
}

class AssetGroup extends Group {
    static get usedAssets() {
        return [];
    }

    static async load(progress) {
        let progs = new Array(this.usedAssets.length).fill(0);
        await Promise.all(this.usedAssets.map((asset, i) => asset.load((p) => {
            progs[i] = p;
            
            if (progress instanceof Function) {
                progress(progs.reduce((a, b) => a + b, 0) / progs.length);
            }
        })));
    }
}


class Pole extends Asset {
    static get url() {
        return import.meta.resolve("../assets/pole.glb");
    }
}

class Crabs extends Asset {
    static get url() {
        return import.meta.resolve("../assets/candy-crabs.glb");
    }
}

class Chair extends Asset {
    static get url() {
        return import.meta.resolve("../assets/chair.glb");
    }
}

class CarouselModel extends Asset {
    static get url() {
        return import.meta.resolve("../assets/carousel-2.glb");
    }
}

class Carousel extends AssetGroup {
    crabInfo = {
        height: 2.7,
        radius: 2,
        scale: 6,
    }

    poleInfo = {
        height: 2.3,
        radius: 2,
        scale: 0.8,
        delta: 0.2
    }

    constructor() {
        super();
        const carousel = new CarouselModel();
        this.add(carousel);
        this.carousel = carousel;


        this.poles = new Array(4).fill().map(() => {
            let p = new Pole()
            this.add( p );
            return p;
        });

        this.crabs = new Crabs();
        this.add(this.crabs);   
        
        this.scale.set(0.47,0.47,0.47);  
    }

    set on(value) {
        this._on = value;
    }

    set time(value) {
        value = this._on ? value : 0;
        this.rotation.y = value / 4;
        this.positionCrabs(value);
    }

    positionCrabs(t) {
        for (let i = 0; i < 4; i++) {
            let x = Math.cos((i/4) * Math.PI * 2);
            let z = Math.sin((i/4) * Math.PI * 2);

            const deltaPolH = Math.cos(t + Math.PI * i / 2) * this.poleInfo.delta;

            const phi = Math.cos(t + i / 10 ) * Math.PI/4;

            const radius = this.crabInfo.radius;
            const height = this.crabInfo.height + deltaPolH;
            const scale = this.crabInfo.scale;
            let mid = new Vector3(0, height, 0);
            let pos = new Vector3(x * radius, 0, z * radius);
            
            pos.add(mid);
            let newYAxis = mid.clone().sub(pos).normalize();    
            let newXAxis = new Vector3(pos.z, 0, -pos.x).normalize();
            let newRot = new Matrix4();
            newRot.makeRotationAxis(newYAxis, phi);
            newXAxis.applyMatrix4(newRot);
            let newZAxis = new Vector3().crossVectors(newYAxis, newXAxis).normalize();
            let crabT = new Matrix4();
            crabT.makeBasis(newXAxis, newYAxis, newZAxis);
            crabT.setPosition(pos);
            crabT.scale(new Vector3(scale, scale, scale));
            const crab = this.crabs.children[i];
            crab.matrix.copy(crabT);
            crab.matrixAutoUpdate = false;

            const poleRadius = this.poleInfo.radius;
            const poleHeight = this.poleInfo.height + deltaPolH;
            const poleScale = this.poleInfo.scale;
            const polPos = new Vector3(x * poleRadius, poleHeight, z * poleRadius);
            const poleT = new Matrix4();
            poleT.lookAt(polPos, new Vector3(0, poleHeight, 0), new Vector3(0, 1, 0));
            poleT.setPosition(polPos);
            poleT.multiply(new Matrix4().makeRotationY(Math.PI / 2));
            poleT.scale(new Vector3(poleScale, poleScale, poleScale));
            this.poles[i].matrix.copy(poleT);
            this.poles[i].matrixAutoUpdate = false;
            
            this.traverse((o) => {
                if (o.isMesh) o.castShadow = true;
            });
        }
    }

    static get usedAssets() {
        return [Pole, Crabs, CarouselModel];
    }
}



class CoinSlot extends Asset {
    static get url() {
        return import.meta.resolve("../assets/coin-slot.glb");
    }
}

class Milker extends Asset {
    static get url() {
        return import.meta.resolve("../assets/milker.glb");
    }
}

class FluoroLight extends Group {
    constructor(length = 1.2, intensity = 27) {
        super();
        // Visible glowing tube, lying along the z axis.
        const tube = new Mesh(
            new CylinderGeometry(0.03, 0.03, length, 16),
            new MeshBasicMaterial({ color: 0xf4f8ff })
        );
        tube.rotation.x = Math.PI / 2;
        this.add(tube);

        // A tube light can't cast shadows in three.js, so a point light inside the tube does that job.
        this.light = new PointLight(0xf4f8ff, intensity, 0, 2);
        this.light.castShadow = true;
        this.light.shadow.mapSize.set(2048, 2048);
        this.light.shadow.camera.near = 0.05;
        this.light.shadow.camera.far = 20;
        this.light.shadow.bias = -0.0005;
        this.light.shadow.normalBias = 0.002;
        this.add(this.light);
    }
}

class Door extends Asset {
    static get url() {
        return import.meta.resolve("../assets/redmetaldoor.glb");
    }
}

class Window extends Asset {
    static get url() {
        return import.meta.resolve("../assets/window.glb");
    }
}

class WaterBox extends Group {
    maxHeight = 1;
    constructor(width = 1,depth = 1) {
        super();
        const loader = new TextureLoader();

        // Water2 reflects/refracts about a single plane, so it only works on a flat surface, not a box.
        this.surface = new Water(new PlaneGeometry(width, depth), {
            color: 0xa7fd0,
            scale: 2,
            flowDirection: new Vector2(1, 0.5),
            flowSpeed: 0.02,
            textureWidth: 512,
            textureHeight: 512,
            normalMap0: loader.load(import.meta.resolve("../assets/water_normal_1.jpg")),
            normalMap1: loader.load(import.meta.resolve("../assets/water_normal_2.jpg")),
        });

        this.surface.rotation.x = -Math.PI / 2;
        this.add(this.surface);
    }

    set height(value) {
        let color = new Color().setHSL(0.61, 1, 0.3);
        this.surface.material.uniforms.color.value.copy(color);
        this.surface.position.y = value;
    }
}


class TexMaterial extends MeshStandardMaterial {
    constructor(base, options = {}) {
        const textureLoader = new TextureLoader();
        const texNames = ["albedo", "bump", "metalic", "roughnessMap", "normal"];
        const textures = Object.fromEntries(texNames
            .filter(name => options[name] !== false)
            .map(name => {
                const url = `${base}/${name}.${options[name] ?? "jpg"}`
                const tex = textureLoader.load(url)
                tex.wrapS = RepeatWrapping;
                tex.wrapT = RepeatWrapping;
                tex.repeat.set(options.repeatX ?? 1, options.repeatY ?? 1);
                return [name, tex];
            }));
      
        super({
            map: textures.albedo,
            bumpMap: textures.bump,
            metalnessMap: textures.metalic,
            roughnessMap: textures.roughnessMap,
            normalMap: textures.normal,
            roughness: options.roughness ?? 1,
            metalness: options.metalness ?? 0,
            color: options.color ?? 0xffffff,
            side: options.side ?? DoubleSide,
        });
    }
}

class CeilingMaterial extends TexMaterial {
    constructor(w, d) {
       super(import.meta.resolve("../assets/ceiling-panel"), {
           repeatX: 3 * w / 1.5 / 4,
           repeatY: 3 * d / 1.5 / 4,
           roughness: 0.1,
           metalness: 1,
        //    normal: false,
       });
    }
}



class RoomWalls extends Mesh {
    constructor(w, h, d, dh = 2.7, dw = 1.35, df = 4) {
        let m = 1;
        w /=2;
        d /=2;
        dw /= 2;
        
        /** Make Room Geometry like 
         *  _______________________
         * |                       |
         * |                       |
         * |                        ________
         * |                                |
         * |                        ________|
         * |                       |
         * |_______________________|
         * 
         */

        const p = (t) => [
            w,      t,      d,
            w,      t,     -d,
            -w,     t,     -d,
            -w,     t,      d,
            -dw,    t,      d,
            -dw,    t,      d + df,
             dw,    t,      d + df,
             dw,    t,      d,
        ]

        const cx = (i, m = 8, L0 = 0, L1 = 8) => {
            const M = (x) => x % m; 
            return [
                L0 + M(i),      L0 + M(i+1),    L1 + M(i+1), 
                L1 + M(i+1),    L1 + M(i),    L0 + M(i)
            ]
        }

        const geometry = new BufferGeometry();
        geometry.setAttribute('position', new Float32BufferAttribute([
            ...p(-m),
            ...p(dh),
            ...p(h).slice(0, 4 * 3)
        ], 3));
        geometry.setIndex([
            ...new Array(8).fill(0).flatMap((_, i) => cx(i)),
            ...new Array(4).fill(4).flatMap((_, i) => cx(i, 4, 8, 16)),
            16, 17, 18,
            18, 19, 16,
            12, 13, 14,
            14, 15, 12
        ]);
        super(geometry, new MeshStandardMaterial({
            color: 0xfbfbff,
            side: DoubleSide,
            roughness: 0.8,
            envMap: null,
        }));
        this.receiveShadow = true;
        this.castShadow = true;
    }
}

class Room extends AssetGroup {

    constructor(width, height, depth) {
        super();
        this.width = width;
        this.height = height;
        this.depth = depth;

        const ceiling = new Mesh(
            new PlaneGeometry(width, depth),
            new CeilingMaterial(width, depth)
        );
        ceiling.rotation.x = -Math.PI/2;
        ceiling.position.y = height - 0.01;
        this.add(ceiling);

        this.walls = new RoomWalls(width, height, depth);
        this.add(this.walls);

        let coinSlot = new CoinSlot();
        this.add(coinSlot);
        coinSlot.position.set(width / 2, 1.3, 0);
        coinSlot.rotation.y = Math.PI / 2;
        coinSlot.traverse((o) => {
            if (o.isMesh) o.castShadow = true;
        });

        this.chair = new Chair();
        this.add(this.chair);
        this.chair.position.set(-this.width / 2 + 1, 0, 0);
        this.chair.rotation.y = Math.PI/2;
        this.chair.traverse((o) => {
            if (o.isMesh) o.castShadow = true;
        });


        this.door = new Door();
        this.add(this.door);
        this.door.position.set(0, 0, this.depth / 2 + 0.1);
        this.door.rotation.y = Math.PI/2;
        this.door.scale.set(0.75, 0.75, 0.75);
        this.door.traverse((o) => {
            if (o.isMesh) o.castShadow = true;
        });

        this.door2 = new Door();
        this.add(this.door2);
        this.door2.scale.set(0.75, 0.75, 0.75);
        this.door2.position.set(0, 0, this.depth / 2 + 3);
        this.door2.rotation.y =- Math.PI/2;

        this.window = new Window();
        this.add(this.window);
        this.window.position.set(0, 1.15, -this.depth / 2 );
        // this.window.rotation.y = Math.PI/2;
        this.window.traverse((o) => {
            if (o.isMesh) o.castShadow = true;
        });

        this.waterBox = new WaterBox(this.width, this.depth);
        // this.add(this.waterBox);
        this.waterBox.height = 0.01;

        this.milker = new Milker();
        this.add(this.milker);
        this.milker.position.set(-this.width / 2 + 0.1, 0, -1.5);
        this.milker.rotation.y = Math.PI/2;
        this.milker.traverse((o) => {
            if (o.isMesh) o.castShadow = true;
        });

        this.lights = [-depth / 4, depth / 4].map((z) => {
            const fluoro = new FluoroLight();
            fluoro.position.set(0, height - 0.1, z);
            this.add(fluoro);
            return fluoro;
        });
    }

    isOutside(point) {
        const { x, y, z } = point;
        let padd = 0.3;
        return (
            x < padd-this.width / 2 ||
            x > this.width / 2-padd||
            z < padd-this.depth / 2 ||
            z > this.depth / 2-padd
        );
    }

    /** @param {Vector3} point */
    nearCoinSlot(point) {

        let distance = 0.5; // Define how close is considered "near"
        return point.distanceTo(new Vector3(this.width / 2, 1.3, 0)) < distance;
    }


    set on(value) {
        this._on = value;
        if (value) {
            this.add(this.waterBox)
        } else {
            this.remove(this.waterBox);
        }
    }
    get on() {
        return this._on;
    }


    set time(value) {
        if (this.on) {
            if (this.waterBox) this.waterBox.height = Math.min(value/100, 0.5);
        }
    }


    static get usedAssets() {
        return [Window, Door, Milker, CoinSlot, Chair];
    }
}


export {Carousel, CoinSlot, Room, TexMaterial}