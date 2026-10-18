import { Mesh, MeshPhysicalMaterial, TextureLoader, Vector3, Matrix4, Matrix3 } from "three";
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



class Asset {

    constructor() {
        this.model = this.data.scene;
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
            this.data = await loader.loadAsync(this.url, progress);
        }
    }
}


class GoldMaterial extends MeshPhysicalMaterial {
    constructor() {
        super();
        this.color.set(0xffd700); // gold color
        this.metalness = 0.3;
        this.roughness = 0.2;
    }
}

class Crabs extends Asset {
    static get url() {
        return import.meta.resolve("../assets/candy-crabs.glb");
    }
}



class Crab extends Asset {
    constructor() {
        super();
        console.log(this.data);
        this.model = this.data.scene.children[0].clone();

        let sceneTransform = this.data.scene
        this.model.scale.set(0.2, 0.2, 0.2);    
    }
    static get url() {
        return import.meta.resolve("../assets/crab.glb");
    }
}

class Carousel extends Asset {
    /** @type {Mesh} */
    Handle;
    constructor() {
        super();
        this.model.scale.set(0.8, 0.8, 0.8);  
        this.base = this.model.children[0];

        let crabs = new Crabs();
        this.model.add(crabs.model);    
        this.crabs = crabs;


    }

    positionCrabs(t) {
        const {crabs: {model}} = this;
        let radius = 2.2;
        let height = 2.7;
        let scale = 6;
        
        for (let i = 0; i < 4; i++) {
            let phi = Math.cos(t + i / 10 ) * Math.PI/4;

            let x = Math.cos((i/4) * Math.PI * 2);
            let z = Math.sin((i/4) * Math.PI * 2);
            let mid = new Vector3(0, height, 0);

            let pos = new Vector3(x * radius, 0, z * radius);
            pos.add(mid);

            let newYAxis = mid.clone().sub(pos).normalize();    
            let newXAxis = new Vector3(pos.z, 0, -pos.x).normalize();
            let newRot = new Matrix4();
            newRot.makeRotationAxis(newYAxis, phi);
            newXAxis.applyMatrix4(newRot);
        
            let newZAxis = new Vector3().crossVectors(newYAxis, newXAxis).normalize();

            let trans = new Matrix4();

            trans.makeBasis(newXAxis, newYAxis, newZAxis);
            trans.setPosition(pos);
            trans.scale(new Vector3(scale, scale, scale));

            /** @type {Mesh} */
            const crab = model.children[i];
            crab.matrix.copy(trans);
            crab.matrixAutoUpdate = false;

        }
    }



    static async load(p = () => {}) {
        let p1 = 0;
        let p2 = 0;
        await Promise.all([
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
export {Crab, Carousel}