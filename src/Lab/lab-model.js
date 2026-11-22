import { Vector3, Matrix4, Box3, EquirectangularReflectionMapping, SRGBColorSpace, Object3D, TextureLoader, CanvasTexture } from "three";
import { Asset } from "../assets";
import { WaterBox } from "../water-box.js";

function deg(theta) { return Math.PI * theta / 180 }

class LabModel extends Asset {
    time = 0;
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


        let waypoints = this.getNodePath("Waypoints");
        for (let child of waypoints.children) {
            let name = child.name;
            let s = name.split("-");
            let key = s.slice(0, -1).join("-");
            let index = s[s.length - 1];
            let object = this.getNodePath(key);
            if (object) {
                if (!("waypoints" in object)) object.waypoints = {}
                object.waypoints[index] = child.matrix;
            }
            delete this.nMap[name]
        }
        delete this.nMap["Waypoints"]

        this.carouselMatrix = new Matrix4().copy(this.getNodePath("CarouselGroup").matrixWorld);

        this.doorAngle = 0;
        this.carouselTheta = 0;

        this.decolourCrabs()
    }


    decolourCrabs() {
        let pileOfCrabs = this.getNodePath("StaticObjects/CrabPile");
        if (!pileOfCrabs) return;

        // Instances of the same colour share a material, so convert each
        // unique material/texture once and reuse the result.
        const materialCache = new Map();
        const textureCache = new Map();

        const toGreyscale = (texture) => {
            if (textureCache.has(texture)) return textureCache.get(texture);

            const image = texture.image;
            const width = image.width;
            const height = image.height;
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(image, 0, 0, width, height);

            const imgData = ctx.getImageData(0, 0, width, height);
            const d = imgData.data;
            for (let i = 0; i < d.length; i += 4) {
                const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
                d[i] = d[i + 1] = d[i + 2] = l;
            }
            ctx.putImageData(imgData, 0, 0);

            // Brand new texture (not texture.clone(), which shares the image
            // source and would grey out the original used by other crabs).
            const grey = new CanvasTexture(canvas);
            grey.name = texture.name + "-BW";
            grey.colorSpace = texture.colorSpace;
            grey.flipY = texture.flipY;
            grey.wrapS = texture.wrapS;
            grey.wrapT = texture.wrapT;
            grey.magFilter = texture.magFilter;
            grey.minFilter = texture.minFilter;
            grey.anisotropy = texture.anisotropy;
            grey.channel = texture.channel;
            grey.offset.copy(texture.offset);
            grey.repeat.copy(texture.repeat);
            grey.center.copy(texture.center);
            grey.rotation = texture.rotation;
            textureCache.set(texture, grey);
            return grey;
        };

        // One new material per crab colour (4). The original materials are
        // never modified, so crabs outside the pile keep their colour.
        const convertMaterial = (material) => {
            if (!material.map) return material;
            if (materialCache.has(material)) return materialCache.get(material);
            const newMat = material.clone();
            newMat.name = material.name + "-BW";
            newMat.map = toGreyscale(material.map);
            materialCache.set(material, newMat);
            return newMat;
        };

        pileOfCrabs.traverse((o) => {
            if (!o.isMesh) return;
            o.material = Array.isArray(o.material)
                ? o.material.map(convertMaterial)
                : convertMaterial(o.material);
        });
    }

       
    set doorAngle(a) {
        this.getNodePath("RedMetalDoor/Door").rotation.y = -a;
    }

    get doorAngle() {
        return -this.getNodePath("RedMetalDoor/Door").rotation.y;
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
            if (crab) {
                crab.rotation.y =  Math.sin(theta + Math.PI * i / crabTs.length ) * maxA;
            }
        })
    }

    setupWindowView() {
        const view = new TextureLoader().load(
            import.meta.resolve('../../assets/env2.jpg')
        )
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

    openDoor() {
        this._openDoor = true;
    }

    /**
     * Retrieves a node from the scene graph based on its path.
     * @param {string | string[]} path - The path to the node, either as a string with segments separated by "/" or as an array of segment names.
     * @returns {Object3D | undefined} The node at the specified path, or undefined if not found.
     */
    getNodePath(path) {
        path = Array.isArray(path) ? path : [path];
        return this.nMap[path.join("/")];
    }
    

    animation(dt) {
        this.time += dt;
        this.carouselTheta = performance.now() * 0.001;
        this.getNodePath("Water").height += dt * 0.05;

        if (this._openDoor && this.doorAngle < deg(70)) {
            let da = this.doorAngle < deg(60) ? deg(45) : deg(10);
            this.doorAngle += dt * da;
        } else if (!this._openDoor) {
            this.doorAngle = Math.min(this.time / 2, 1) * Math.PI / 8
        }
    }


    static get url() {
        return import.meta.resolve('../../assets/lab-scene-h.glb');
    }
}

export { LabModel };