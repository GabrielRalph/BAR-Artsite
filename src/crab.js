import { Mesh, MeshPhysicalMaterial, TextureLoader, Vector3 } from "three";
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
        console.log(this.data)
        this.base = this.model.children[0];

        // this.model = this.base;

        // for (let child of this.base.children) {
        //     this[child.name] = child;
        //     console.log(child.name);
        // }
        

        // this.Handle.material = new GoldMaterial();
        // this.Center.material = new MeshPhysicalMaterial({
        //     color: 0xffaa00, // white color
        //     metalness: 0.3,
        //     roughness: 0.2,
        //     // wireframe: true
        // })





        // let hPos = this.Handle.position.clone();
        // const crab = new Crab();
        // let cPos = hPos.multiply(new Vector3(3.1, 1, 3.1));
        // crab.model.position.copy(cPos);
        // crab.model.rotation.y = Math.atan2(cPos.x, cPos.z) + Math.PI / 2;
        // crab.model.rotation.z = 0.9 * Math.PI / 2;
        // this.model.add(crab.model);

        // // make 3 copies of the handle rotated around the center
        // for (let i = 0; i < 3; i++) {
        //     const handleCopy = this.Handle.clone();
        //     hPos.applyAxisAngle(new Vector3(0, 1, 0), (i + 1) * (Math.PI / 2));
        //     handleCopy.position.copy(hPos);
        //     this.base.add(handleCopy);

        //     const crabCopy = new Crab();
        //     let cPosCopy = hPos.clone().multiply(new Vector3(3.1, 1, 3.1));
        //     crabCopy.model.position.copy(cPosCopy);
        //     crabCopy.model.rotation.y = Math.atan2(cPosCopy.x, cPosCopy.z) + Math.PI / 2;
        //     crabCopy.model.rotation.z = 0.9 * Math.PI / 2;
        //     this.model.add(crabCopy.model);
        // }


    }

    static get url() {
        return import.meta.resolve("../assets/carousel-2.glb");
    }
}
export {Crab, Carousel}