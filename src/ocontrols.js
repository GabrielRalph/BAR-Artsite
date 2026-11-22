import {Vector4, Matrix4} from "three";

let SPACE_PRESSED = false;
window.addEventListener("keydown", (e) => {
    if (e.key === " ") {
        e.preventDefault();
        SPACE_PRESSED = true;
    }
});
window.addEventListener("keyup", (e) => {
    if (e.key === " ") {
        e.preventDefault();
        SPACE_PRESSED = false;
    }
})


function logM(m) {
    let e = m.elements.map(e=>e.toPrecision(3))
    console.log(`${[0,4,8,12].map(i => [0,1,2,3].map(j => e[i+j]).join(", ")).join(",\n")}`);
}


class ObjectControls {
    /** @type {TouchList} */
    lastTouches = [];
    positionDelta = [0, 0];
    angleDelta = [0, 0];
    zoomDelta = 0;
    rotationFactor = 100;
    movementFactor = 100;
    showMat = false;
    moveFlag = 0;

    constructor(clickBoxElement, isCached = true) {
        clickBoxElement.addEventListener("touchmove", (e) => {
            this.touchmove(e);
        })

        clickBoxElement.addEventListener("touchend", (e) => {
            this.lastTouches = e.touches;
            if (e.touches.length == 0) this.moveFlag = 0;
        })

        clickBoxElement.addEventListener("mousemove", (e) => {
            let {movementFactor, rotationFactor} = this;
           if (e.buttons) {
                this.angleDelta = [e.movementX/rotationFactor, e.movementY/rotationFactor];
                this.positionDelta = [e.movementX/movementFactor, e.movementY/movementFactor]
                e.preventDefault();
           }
        });

        clickBoxElement.addEventListener("wheel", (e) => {
            this.zoomDelta = e.deltaY / 100;
            
            e.preventDefault();
        });


        clickBoxElement.addEventListener("dblclick", () => {
            this.hardSet = true
            this._matrix = new Matrix4().identity();
        });

        clickBoxElement.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            this.showMat = true;
        });

        this.isCached = isCached;
        if (isCached) this.matrix = JSON.parse(localStorage.getItem("matrix")) || new Matrix4().identity();
    }



    /** @param {TouchList} touches */
    touchesToPoints(touches) {
        return [...touches].map(t => [t.clientX, t.clientY])
    }

    /** @param {TouchEvent} e */
    touchmove(e) {
        let {touches} = e;
        let {lastTouches, rotationFactor, movementFactor} = this;

        if (touches.length == 1 && lastTouches.length == 1) {
            let lp = this.touchesToPoints(lastTouches)[0];
            let p = this.touchesToPoints(touches)[0];
            this.angleDelta = p.map((c,i)=>(c - lp[i])/rotationFactor);
            this.positionDelta = this.angleDelta.map(c => 2*rotationFactor*c/movementFactor);
            if (this.moveFlag == 1) this.moveFlag = 2;
        } else if (touches.length == 2 && lastTouches.length == 2) {

            let [p1, p2] = this.touchesToPoints(touches);
            let [lp1, lp2] = this.touchesToPoints(lastTouches);

            let cp = p1.map((c,i)=>(c + p2[i])/2);
            let lcp = lp1.map((c,i)=>(c + lp2[i])/2);
            
            this.positionDelta = cp.map((c,i)=>(c - lcp[i])/(movementFactor/2));

            let lent = p1.map((c,i)=>(c - p2[i])**2).reduce((a,b)=>a+b);
            let lenl = lp1.map((c,i)=>(c - lp2[i])**2).reduce((a,b)=>a+b);
            this.zoomDelta = lent/lenl - 1;
            this.moveFlag = 1;
        }

        this.lastTouches = touches;
        e.preventDefault();
    }

    update(threeObject){
        let m;
        let {angleDelta, positionDelta} = this;
        if (this.moveFlag > 0 || SPACE_PRESSED) {
            let [ddx, ddy] = positionDelta;
            m = new Matrix4(); 
            m.set(
                1, 0, 0, ddx, 
                0, 1, 0, -ddy, 
                0, 0, 1, 0, 
                0, 0, 0, 1, 
            )
            threeObject.applyMatrix4(m);
        } 

        if (!SPACE_PRESSED && this.moveFlag < 2) {
            let [dx, dy] = angleDelta;
            let rot_v = new Vector4(dy, dx, 0, 0);
            m = new Matrix4(); 
            m.identity();
            m = m.multiply((new Matrix4().makeRotationX(rot_v.x)))
            m = m.multiply((new Matrix4().makeRotationY(rot_v.y)))
            m = m.multiply((new Matrix4().makeRotationZ(rot_v.z)))
            m = m.multiplyScalar(1 + this.zoomDelta);
            threeObject.applyMatrix4(m);
        }


        if (this.hardSet) {
            threeObject.matrix.copy(this._matrix);
            threeObject.matrixAutoUpdate = false;
            this.hardSet = false;
        } else {
            threeObject.matrixAutoUpdate = true;
        }


        if (this.showMat) {
            let m = threeObject.matrix.clone();
            // m.transpose();
            let e = m.elements.map(e=>e.toPrecision(3)).join(", ");
            console.log(e);
            this.showMat = false;
        }


        if (this.isCached)
            localStorage.setItem("matrix", JSON.stringify(threeObject.matrix.clone().transpose().elements));

        this.showMat = false
        this.angleDelta = angleDelta.map(c => c*0.5)
        this.positionDelta = positionDelta.map(c => c*0.5)
        this.zoomDelta *= 0.5;
    }

    set matrix(m) {
        if (m instanceof Matrix4) {
            m = m.clone();
        } else if (Array.isArray(m)) {
            m = new Matrix4().set(...m);
        } else {
            throw new Error("Matrix must be a Matrix4 or an array");
        }
        this._matrix = m;
        this.hardSet = true;
    }
}

export { ObjectControls };