
# SvgPlus

SvgPlus is a JavaScript framework for building HTML/SVG interfaces. Rather than wrapping elements, `SvgPlus` **extends its prototype directly onto an existing DOM element**, giving the element all of the class's methods and properties in-place.

The framework consists of three modules:

| File | Export(s) | Purpose |
|---|---|---|
| `4.js` | `SvgPlus`, `Vector`, `parseVector` | Core element class |
| `vector.js` | `Vector`, `parseVector` | 2D vector math |
| `shadow-element.js` | `ShadowElement` | Shadow DOM wrapper |

---

## SvgPlus

`SvgPlus` is the base class for all elements in the framework. Constructing it with an element, id string, or tag name string will return a DOM element extended with all `SvgPlus` methods.

```js
import { SvgPlus } from "./4.js";

new SvgPlus(element);      // extend an existing Element
new SvgPlus("my-id");      // look up by id, then extend
new SvgPlus("div");        // create a new <div> and extend it
```

> The constructor returns the **DOM element itself** (not a wrapper). The element is mutated to have all `SvgPlus` methods, so `instanceof Element` checks still pass.

### Subclassing

Extend `SvgPlus` to create reusable components. The constructor's first argument is the element to extend — pass it to `super()`.

```js
class RedSquare extends SvgPlus {
    constructor(el = "div", size = 100) {
        super(el);
        this.styles = {
            width:      size + "px",
            height:     size + "px",
            background: "red",
        };
    }

    set size(size) {
        this._size = size;
        this.styles = { width: size + "px", height: size + "px" };
    }
    get size() { return this._size; }
}

const square = new RedSquare("div", 50);
document.body.appendChild(square);
```

### Properties

#### `styles` (get/set)
Set CSS styles from a plain object. `null` removes a property.

```js
el.styles = { color: "red", "font-size": "16px" };
el.styles = { color: null }; // removes color
console.log(el.styles);      // { "font-size": "16px" }
```

#### `props` (get/set)
Set element attributes from a plain object. Special keys are handled automatically:

| Key | Behaviour |
|---|---|
| `style` / `styles` | Forwarded to the `styles` setter |
| `events` | Forwarded to the `events` setter |
| `innerHTML` / `content` | Sets `innerHTML` |
| anything else | Set as an attribute via `setAttribute` |

```js
el.props = {
    id:     "my-el",
    class:  "box",
    styles: { background: "blue" },
    events: { click: () => console.log("clicked") },
};
```

#### `events` (set)
Attach event listeners from a plain object where keys are event names and values are callbacks.

```js
el.events = {
    click:     e => console.log("click"),
    mouseover: e => console.log("hover"),
};
```

#### `class` (get/set)
Shorthand for getting/setting the `class` attribute.

```js
el.class = "box active";
console.log(el.class); // "box active"
```

#### `bbox`
Returns `[position, size]` as `Vector` instances using `getBoundingClientRect()` (viewport coordinates).

```js
const [pos, size] = el.bbox;
```

#### `svgBBox`
Returns `[position, size]` as `Vector` instances using `getBBox()` (SVG local coordinates).

```js
const [pos, size] = el.svgBBox;
```

### Methods

#### `createChild(type, props, ...args)`
Create, configure, and append a child element in one call. Returns the new child.

**Parameters:**
- `type` — either a tag name string / existing `Element` (passed to `new SvgPlus(type)`), or an `SvgPlus` subclass constructor.
- `props` — a [props object](#props-getset) applied to the child before it is appended.
- `...args` — only used when `type` is a class: these are forwarded as the arguments to that class's constructor.

**Behaviour:**
- If `type` is an `SvgPlus` subclass, `new type(...args)` is called to construct the child.
- Otherwise, `new SvgPlus(type)` is called, accepting a tag name, element id, or existing `Element`.
- `props` is then set on the child.
- The child is appended to the element and returned.

```js
// Tag name — creates a <div> with a class and text content
const label = el.createChild("div", { class: "label", content: "Hello" });

// Existing element — extend and append it
const existing = document.getElementById("some-el");
const wrapped = el.createChild(existing, { styles: { color: "red" } });

// SvgPlus subclass — constructor args go after props
class RedSquare extends SvgPlus {
    constructor(el = "div", size = 100) {
        super(el);
        this.styles = { width: size + "px", height: size + "px", background: "red" };
    }
}
// props = {} (none needed), then constructor args: el="div", size=50
const sq = el.createChild(RedSquare, {}, "div", 50);

// Nesting — build a tree in one chain
const list = el.createChild("ul", { class: "list" });
list.createChild("li", { content: "Item 1" });
list.createChild("li", { content: "Item 2" });
```

#### `saveSvg(name)`
Serialises the element's `outerHTML` as a formatted `.svg` file and triggers a browser download.

```js
el.saveSvg("my-graphic"); // downloads "my-graphic.svg"
```

#### `watchMutations(config, callback)` / `stopMutationWatch()`
Observe DOM mutations via a `MutationObserver`. The element also dispatches a `"mutation"` event and calls `this.onmutation` if defined.

```js
el.watchMutations({ childList: true, subtree: true }, (mutations) => {
    console.log(mutations);
});

el.stopMutationWatch();
```

#### `waveTransition(update, duration, dir)`
Animate a value over time using a cosine ease. Returns a `Promise` that resolves when the transition ends.

- `update(progress)` — called each frame with a value from `0` to `1`.
- `duration` — milliseconds (default `500`).
- `dir` — `false`: `0 → 1`, `true`: `1 → 0`.

```js
await el.waveTransition(p => {
    el.styles = { opacity: p };
}, 300);
```

#### SVG point helpers

```js
el.getVectorAtLength(length)   // → Vector at path length
el.isVectorInFill(x, y)        // → boolean
el.isVectorInStroke(x, y)      // → boolean
el.makeSVGPoint(x, y)          // → SVGPoint
```

### Static Methods

#### `SvgPlus.make(tagName)`
Create a raw HTML or SVG element. The SVG namespace is applied automatically for valid SVG tag names.

```js
const circle = SvgPlus.make("circle"); // SVGCircleElement
const div    = SvgPlus.make("div");    // HTMLDivElement
```

#### `SvgPlus.parseElement(input)`
Resolve an element from a string (id lookup → tag creation) or return an existing `Element`. Returns `null` on failure.

#### `SvgPlus.parseSVGString(svgString)`
Parse an SVG markup string and return a new `<svg>` element containing the parsed content.

#### `SvgPlus.is(el, ClassDef)`
Returns `true` if `el` has already been extended by `ClassDef` or one of its subclasses.

#### `SvgPlus.extendable(el, ClassDef)`
Returns `true` if `el` can still be extended by `ClassDef` (shares a compatible prototype chain but hasn't been extended yet).

#### `SvgPlus.defineHTMLElement(ClassDef, className?)`
Register an `SvgPlus` subclass as a Custom Element. The tag name defaults to the class name converted to kebab-case.

Implement `static get observedAttributes()` on your class to have HTML attribute changes forwarded as property setters. Implement `onconnect`, `ondisconnect`, or `onadopt` to respond to lifecycle callbacks.

```js
class FancyButton extends SvgPlus {
    static get observedAttributes() { return ["label", "disabled"]; }

    set label(v)    { this.innerHTML = v; }
    set disabled(v) { this.styles = { opacity: v ? 0.5 : 1 }; }

    onconnect() { console.log("mounted"); }
}

SvgPlus.defineHTMLElement(FancyButton);
// Registers <fancy-button label="Click me"></fancy-button>
```

---

## Vector

A 2D vector class used throughout the framework. Import directly or via `SvgPlus`.

```js
import { Vector, parseVector } from "./vector.js";
```

### Construction

```js
new Vector()                // (0, 0)
new Vector(3)               // (3, 3)
new Vector(3, 4)            // (3, 4)
new Vector({ x: 1, y: 2 }) // from any object with x/y properties
new Vector([1, 2])          // from array [x, y]
new Vector([1, 2, 3], 1)    // from array at index → (2, 3)
```

`parseVector(x, y)` returns the input unchanged if it is already a `Vector`, otherwise constructs one.

### Arithmetic

All operations return a new `Vector`. Arguments can be `(x, y)`, a single number (applied to both axes), or another `Vector`.

```js
v.add(x, y)   v.sub(x, y)   v.mul(x, y)   v.div(x, y)
v.dot(x, y)                 // scalar dot product
v.addH(d)                   // add d to x component only
v.addV(d)                   // add d to y component only
```

### Geometry

```js
v.norm()               // magnitude
v.arg()                // angle from positive x-axis (0–2π, clockwise in SVG coords)
v.dir()                // unit vector
v.rotate(theta)        // rotate by angle in radians
v.lurpTo(v2, t)        // linear interpolate toward v2 (t: 0–1)
v.distance(v2)         // Euclidean distance to another vector
v.distToLine(p1, p2)   // perpendicular distance to a line segment
v.angleBetween(v2)     // angle between two vectors in radians
v.grad()               // slope (y/x), Infinity if vertical
v.reflect("V" | "H")   // reflect vertically or horizontally
```

### Utilities

```js
v.round(n)    v.floor()    v.ceil()    v.abs()    v.sqrt()
v.clone()
v.toString(dp)  // "x,y" rounded to dp decimal places (default 5)
v.isNaN         // true if either component is NaN
v.isZero        // true if both components are within zero tolerance
```

### Static

```js
Vector.intersection(a1, b1, a2, b2, onSegment?)
// Returns the intersection Vector of two line segments, or null if they don't intersect.
```

---

## ShadowElement

`ShadowElement` extends `SvgPlus` to automatically attach a Shadow DOM and load CSS stylesheets. Child elements are appended to an inner **root element** inside the shadow tree, keeping styles encapsulated.

```js
import { ShadowElement } from "./shadow-element.js";
```

### Subclassing

Override `static get usedStyleSheets()` to declare CSS files to load automatically on construction.

```js
class MyWidget extends ShadowElement {
    constructor(el = "my-widget") {
        super(el, "div"); // host tag, root tag
    }

    static get usedStyleSheets() {
        return ["./my-widget.css"];
    }

    onconnect() {
        this.createChild("p", { content: "Hello from shadow DOM" });
    }
}

SvgPlus.defineHTMLElement(MyWidget);
```

```html
<my-widget></my-widget>
```

### Constructor

```js
new ShadowElement(el, name?)
```

- `el` — element or tag name passed to `SvgPlus` (the host).
- `name` — tag name string or existing `SvgPlus` element to use as the inner root. Defaults to `el`.

### Properties & Methods

| Member | Description |
|---|---|
| `root` | The inner root element inside the shadow DOM. |
| `appendChild(...args)` | Appends to `root` instead of the host. |
| `createChild(type, props, ...args)` | Creates and appends a child on `root`. |
| `loadStyles(url?)` | Fetch and adopt stylesheets into the shadow root. Called automatically on construction. |
| `waitStyles()` | Returns a `Promise` that resolves once stylesheets have finished loading. |
| `static loadStyleSheets(urls)` | Fetch an array of CSS URLs and return `CSSStyleSheet` objects. Results are cached by URL. |
| `static usedStyleSheets` | Override to return an array of CSS URLs to load on construction. |
