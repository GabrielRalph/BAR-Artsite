import { Mesh, MeshPhysicalMaterial, TextureLoader, Vector3, Matrix4, Matrix3, Box3 , Group, BoxGeometry, MeshBasicMaterial, DoubleSide, MeshStandardMaterial, CylinderGeometry, PointLight } from "three";
import { DRACOLoader, GLTFLoader } from "three/examples/jsm/Addons.js";


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
            const modelData = await loader.loadAsync(this.url, progress);
            this.data = modelData;
        }
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

class Carousel extends Asset {
    
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
        this.scale.set(0.47,0.47,0.47);  
        // console.log([...this.children]);
        // this.base = this.children[0];
        
        this.poles = new Array(4).fill().map(() => {
            let p = new Pole()
            this.add( p );
            return p;
        });

        this.crabs = new Crabs();
        this.add(this.crabs);    

        // let bbox = new Box3().setFromObject(this.model);
        // console.log(bbox);

    }

    set on(value) {
        this._on = value;
    }

    set time(value) {
        // console.log(value)
        // if;
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



            // console.log(this.poles[i])
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

            

        }
    }



    static async load(p = () => {}) {
        let p1 = 0;
        let p2 = 0;
        await Promise.all([
            Pole.load(),
            Crabs.load((a) => {
                p1 = a;
                p((p1 + p2) / 2);
            }),
            super.load((a) => {
                p2 = a;
                p((p1 + p2) / 2);
            })
        ]);
    }

    static get url() {
        return import.meta.resolve("../assets/carousel-2.glb");
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
    constructor(length = 1.2, intensity = 5) {
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

class Room extends Asset {

    constructor(width, height, depth) {
        super();
        this.width = width;
        this.height = height;
        this.depth = depth;
        let geom = new BoxGeometry(width, height + 1, depth);
        let mat = new MeshStandardMaterial({
            color: 0xfbfbff,
            side: DoubleSide,
            roughness: 0.8,
         });
        this.walls = new Mesh(geom, mat);
        this.walls.position.y = ((height + 1) / 2) - 1;
        // Walls only receive; if they cast too, the closed box would block the lights inside it.
        this.walls.receiveShadow = true;
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
        this.door.position.set(0, 0, this.depth / 2 - 0.1);
        this.door.rotation.y = Math.PI/2;
        this.door.scale.set(0.75, 0.75, 0.75);
        this.door.traverse((o) => {
            if (o.isMesh) o.castShadow = true;
        });


        this.window = new Window();
        this.add(this.window);
        this.window.position.set(0, 1.15, -this.depth / 2 );
        // this.window.rotation.y = Math.PI/2;
        this.window.traverse((o) => {
            if (o.isMesh) o.castShadow = true;
        });


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
        console.log(x, z)
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
        


    static async load() {
        await Promise.all([
            super.load(),
            CoinSlot.load(),
            Chair.load(),
            Milker.load(),
            Door.load(),
            Window.load()
        ]);
    }
}


export {Carousel, CoinSlot, Room}