import { Asset } from "../assets";
import * as THREE from 'three';

const DIRECTIONS = {
    NY: new THREE.Vector3(0, -1, 0),
    PY: new THREE.Vector3(0, 1, 0),
    NX: new THREE.Vector3(-1, 0, 0),
    PX: new THREE.Vector3(1, 0, 0),
    NZ: new THREE.Vector3(0, 0, -1),
    PZ: new THREE.Vector3(0, 0, 1)
}
class CubeRegions extends Asset {
    constructor() {
        super();

        this.regions = [];
        this.regionsGroup = null;

        this.traverse((child) => {
            if (child.name === "GravityRegions") {
                this.regionsGroup = child;
            }
        });

        if (this.regionsGroup) {
            this.regionsGroup.traverse((child) => {
                if (child.isMesh) {
                    child.material.side = THREE.DoubleSide;

                    let name = child.name;
                    // clone: the shared DIRECTIONS vectors must not be rotated in place
                    let region = DIRECTIONS[name.split("_")[1]].clone();

                    // transform from blenders z-up to three.js y-up
                    region.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
                    

                    if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
                    const worldBox = child.geometry.boundingBox.clone().applyMatrix4(child.matrixWorld);
                    this.regions.push({
                        name, region, worldBox,
                        mesh: child,
                    });

                }
            });

            this.regions.forEach((r, i) => {
                r.index = i;
            });

            this.regionsGroup.visible = false;
            let regionSet = new Set(this.regions.map(r => r.mesh));
            let allOtherObjects = [];
            this.traverse((child) => {
                // check child is not contained inside the regions group
                if (child.isMesh && !regionSet.has(child)) {
                    allOtherObjects.push(child);
                }
            });
            this.objects = allOtherObjects;
        }
    }


    query(point) {
        // Use an off-axis direction to minimize hitting exact triangle edges/vertices
        const direction = new THREE.Vector3(0.73, 0.41, 0.54).normalize();
        const raycaster = new THREE.Raycaster();
        raycaster.set(point, direction);

        let pointRegion = [null, null];
        for (const {region, worldBox, mesh, index} of this.regions) {
            if (worldBox.containsPoint(point)) {
                const intersects = raycaster.intersectObject(mesh, false);
                if (intersects.length % 2 === 1) {
                    pointRegion = [ region, index ];
                    break;
                }
            }
        }

        return pointRegion;
    }


    static get url() {
        return import.meta.resolve("../../assets/Entrance/region-test.glb")
    }
}



export { CubeRegions };