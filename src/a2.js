import { Mesh, MeshPhysicalMaterial, TextureLoader, Vector3, Matrix4, Matrix3, Box3 , Group, BoxGeometry, MeshBasicMaterial, DoubleSide, MeshStandardMaterial, CylinderGeometry, PointLight, Vector2, PlaneGeometry, Color, BufferGeometry, Float32BufferAttribute, RepeatWrapping, EquirectangularReflectionMapping, SRGBColorSpace } from "three";
import { DRACOLoader, GLTFLoader } from "three/examples/jsm/Addons.js";
import { Water } from "three/examples/jsm/objects/Water2.js";

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

class WaterBox extends Group {
    maxHeight = 0.3;
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
        let color = new Color().setHSL(0.61, 1, 0.3);

        this.surface.material.uniforms.color.value.copy(color);
        this.add(this.surface);
        this.raycast = () => {}
        this.surface.raycast = this.raycast;
    }

    set height(value) {
        this.surface.position.y = Math.min(value, this.maxHeight);
        this.surface.visible = value !== undefined && value > 0;
    }

    get height() {
        return this.surface.position.y;
    }
}

class LabScene extends Asset {
    constructor() {
        super();
        let map = {};
        this.name = "LabScene";
        let rec = (obj, path = []) => {
            if (path.length > 0) map[path.join("/")] = obj;
            for (let child of obj.children) {
                rec(child, [...path, child.name]);
            }
        };
        rec(this, []);
        this.nMap = map;

        const room = this.getNodePath("Room");
        const box = new Box3().setFromObject(room);
        const size = box.getSize(new Vector3());
        const waterBox = new WaterBox(size.x, size.z)
        waterBox.height = 0;
        const center = box.getCenter(new Vector3())
        center.y = 0;
        waterBox.position.copy(center);
        this.add(waterBox); 

        this.nMap["Water"] = waterBox;
    }

    async setupWindowView() {
        const view = await LOADERS.texture.loadAsync(import.meta.resolve('../assets/env2.jpg'));
        view.mapping = EquirectangularReflectionMapping; //EquirectangularRefractionMapping; 
        view.colorSpace = SRGBColorSpace
        this.getNodePath("StaticObjects/Window").traverse((o) => {
            if (o.isMesh && o.material.name === 'Mirror') {
                o.material.envMap = view;
                o.material.envMapRotation.set(0,0, 0);
                o.material.roughness = 0;
                o.material.metalness = 1;
            }
        });
    }

    /**
     * Retrieves a node from the scene graph based on its path.
     * @param {string | string[]} path - The path to the node, either as a string with segments separated by "/" or as an array of segment names.
     * @returns {THREE.Object3D | undefined} The node at the specified path, or undefined if not found.
     */
    getNodePath(path) {
        path = Array.isArray(path) ? path : [path];
        return this.nMap[path.join("/")];
    }



    set carouselTheta(theta) {
        const maxA = Math.PI / 4;
        const carousel = this.getNodePath("CarouselGroup");
        if (carousel) carousel.rotation.y = theta;

        let deltaY = 1.5 + Math.sin(theta) * 0.1;
        const crabs = this.getNodePath("CarouselGroup/Crabs");
        const poles = this.getNodePath("CarouselGroup/Poles");
        if (crabs) crabs.position.y = deltaY;
        if (poles) poles.position.y = deltaY;

        let crabTs = crabs?.children || []
        crabTs.forEach((crabT, i) => {
            const crab = crabT.children[0];
            crab.rotation.y =  Math.sin(theta + Math.PI * i / crabTs.length ) * maxA;
        })
    }

    static get url() {
        return import.meta.resolve('../assets/lab-scene-full.glb');
    }
}

export { LabScene };