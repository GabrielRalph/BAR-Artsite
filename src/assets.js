import { TextureLoader, Group } from "three";
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
            const modelData = await loader.loadAsync(this.url, (p) => {
                if (progress instanceof Function) {
                    progress(p.loaded / p.total);
                }
            });
            this.data = modelData;
        }
    }
}



export { Asset };