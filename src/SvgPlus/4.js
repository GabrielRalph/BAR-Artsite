import {BBox, Vector, parseVector} from "./vector.js";

/**
 * @typedef {('animate'|'animateMotion'|'animateTransform'|'circle'|'clipPath'|'color-profile'|'defs'|'desc'|'discard'|'ellipse'|'feBlend'|'feColorMatrix'|'feComponentTransfer'|'feComposite'|'feConvolveMatrix'|'feDiffuseLighting'|'feDisplacementMap'|'feDistantLight'|'feDropShadow'|'feFlood'|'feFuncA'|'feFuncB'|'feFuncG'|'feFuncR'|'feGaussianBlur'|'feImage'|'feMerge'|'feMergeNode'|'feMorphology'|'feOffset'|'fePointLight'|'feSpecularLighting'|'feSpotLight'|'feTile'|'feTurbulence'|'filter'|'foreignObject'|'g'|'hatch'|'hatchpath'|'image'|'line'|'linearGradient'|'marker'|'mask'|'mesh'|'meshgradient'|'meshpatch'|'meshrow'|'metadata'|'mpath'|'path'|'pattern'|'polygon'|'polyline'|'radialGradient'|'rect'|'script'|'set'|'solidcolor'|'stop'|'style'|'svg'|'switch'|'symbol'|'text'|'textPath'|'title'|'tspan'|'unknown'|'use'|'view')} SVGTagName
 * @typedef {(Element|string)} ElementLike
 * @typedef {{toString(): string}} Serializable
 * @typedef {?(string|number|Serializable)} StringLike
 * @typedef {new (...args: any[]) => SvgPlus} SvgPlusClass
 * 
 * 
 * @typedef {function(Event): void} EventCallback
 * @typedef {Object.<string, EventCallback>} Events
 * 
 * @typedef {Object.<string, StringLike>} Styles styles are css styles where the keys are the style names and the values are the style values.
 * 
 * @typedef {?(StringLike|Styles|Events)} PropValue 
 * 
 * @typedef Props the props of a html element are the attributes of that element. 
 * @type {Object}
 * @property {Styles} [styles] an object containing styles to be set on the element.
 * @property {Styles} [style] an object containing styles to be set on the element.
 * @property {Events} [events] an object containing event listeners to be added to the element.
 * @property {string} [content] a string to be set as the innerHTML of the element.
 * @property {string} [innerHTML] a string to be set as the innerHTML of the element.
 * @property {string} [class] a string to be set as the class of the element.
 * @property {StringLike} [*]
 * 
 */

/**
 * @type {Object<SVGTagName, boolean>}
 * @ignore
 */
const SVGTagNames = {
  animate: SVGAnimateElement,
  animateMotion: SVGAnimateMotionElement,
  animateTransform: SVGAnimateTransformElement,
  circle: SVGCircleElement,
  clipPath: SVGClipPathElement,
  "color-profile": true,
  defs: true,
  desc: true,
  discard: true,
  ellipse: true,
  feBlend: true,
  feColorMatrix: true,
  feComponentTransfer: true,
  feComposite: true,
  feConvolveMatrix: true,
  feDiffuseLighting: true,
  feDisplacementMap: true,
  feDistantLight: true,
  feDropShadow: true,
  feFlood: true,
  feFuncA: true,
  feFuncB: true,
  feFuncG: true,
  feFuncR: true,
  feGaussianBlur: true,
  feImage: true,
  feMerge: true,
  feMergeNode: true,
  feMorphology: true,
  feOffset: true,
  fePointLight: true,
  feSpecularLighting: true,
  feSpotLight: true,
  feTile: true,
  feTurbulence: true,
  filter: true,
  foreignObject: true,
  g: true,
  hatch: true,
  hatchpath: true,
  image: true,
  line: true,
  linearGradient: true,
  marker: true,
  mask: true,
  mesh: true,
  meshgradient: true,
  meshpatch: true,
  meshrow: true,
  metadata: true,
  mpath: true,
  path: true,
  pattern: true,
  polygon: true,
  polyline: true,
  radialGradient: true,
  rect: true,
  script: true,
  set: true,
  solidcolor: true,
  stop: true,
  style: true,
  svg: true,
  switch: true,
  symbol: true,
  text: true,
  textPath: true,
  title: true,
  tspan: true,
  unknown: true,
  use: true,
  view: true,
};


const ObjectClass = Object.getPrototypeOf(Object);

function isNonNullObject(obj) {return typeof obj === "object" && obj !== null;}



/**
 * Make a HTML or SVG element by providing the tag name
 * @type {{
 * (name: SVGTagName, doc: Document) => SVGElement;
 * (name: string, doc: Document) => HTMLElement;
 * }}
 * @ignore
 */
const make = (name, doc = document) => {
  let element = null;
  if (name in SVGTagNames) {
    element = doc.createElementNS("http://www.w3.org/2000/svg", name);
  } else if (typeof name === "string"){
    element = doc.createElement(name);
  }
  return element;
}


/**
 * @type {SVGSVGElement}
 * @ignore
 */
const Points = make("svg");

/*
e.g.
c1 = C: C<-B<-A
c2 = B:    B<-A
c2 is a sub class of c1 i.e. isSubClass(c2, c1) => true

an instance c of C is an instanceof B as B is a subclass of C
*/
function isSubClass(subcls, cls) {
  while (cls && subcls !== cls) {
    cls = Object.getPrototypeOf(cls);
  }
  return cls === subcls;
}

function is(obj, cdef, plus = "__+") {
  let res = false;
  if (isNonNullObject(obj)) {
    res = isSubClass(cdef, obj[plus]);
  }
  return res;
}

function printChain(cdef) {
  let i = 5;
  let str = "";
  while (cdef && i > 0) {
    if (str) str += " <- ";
    // console.log(cdef);
    let name = cdef.name;
    if (cdef === ObjectClass) {
      str += "o";
      break;
    }
    str += name;
    cdef = Object.getPrototypeOf(cdef);
    i--;
  }
  return str;
}

/**
 * Copies properties of prototype onto another object.
 * If a property exists then it is set otherwise
 * the property is defined. 
 * 
 * @param {SvgPlusClass} cdef
 * @param {Object} obj
 * @param {string} [plus="__+"]
 * @ignore
 */
function addPrototype(cdef, obj, plus = "__+") {
  if (obj == null || cdef == null) return;
  let proto = cdef.prototype;
  // console.log("+", { proto.prototype });

  // for every property of the prototype
  let protoPropNames = Object.getOwnPropertyNames(proto);
  for (let propName of protoPropNames) {
    var prop = Object.getOwnPropertyDescriptor(proto, propName);

    if (propName == 'constructor'){
      // if the property is the constructor we will store it in the object
      obj[plus] = proto.constructor;
    } else {
      // otherwise the property isn't the constructor
      if (propName in obj) {
        // if the property exists then try set it
        try {
          obj[propName] = proto[propName]
        } catch(e) {
          console.warn("error setting " + propName)
        }
      } else {
        // if it doesn't exist then define it
        Object.defineProperty(obj, propName, prop);
      }
    }
  }
}

/**
 * Extends the prototype of one class onto another object
 * by copying all properties of that prototype onto the object.
 * @param {Object} obj
 * @param {SvgPlusClass} cdef
 * @param {string} [plus="__+"]
 * 
 * @return {boolean}
 * @ignore
 */
function extend(obj, cdef, plus = "__+"){
  if (isNonNullObject(obj)) {
      if (!(plus in obj)) obj[plus] = ObjectClass;

    // extend recursively down the prototype chain until the objent is an
    // instance of the prototype
    if (extendable(obj, cdef, plus)) {
      extend(obj, Object.getPrototypeOf(cdef), plus);
      addPrototype(cdef, obj, plus);
      return true;
    }
  }
  return false;
}

/**
 * Returns whether an object can be extended by another class
 * e.g. consider the following chains
 * C<-B<-A<-o
 * X<-Y<-A<-o
 * B is extendable by C but not by X or Y
 * 
 * @param {Object} obj
 * @param {SvgPlusClass} cdef
 * @param {string} [plus="__+"]
 * 
 * @return {boolean}
 * @ignore
*/
function extendable(obj, cdef, plus = "__+") {
  let res = false;
  if (isNonNullObject(obj)) {
    if (!is(obj, cdef, plus)) {
      res = isSubClass(obj[plus], cdef);
    }
  }
  return res;
}

/**
 * @class
 * @ignore
 */
function Root(){

}


/**
 * @extends Element
 * 
 */
class SvgPlus extends Root{
  /**
   * @param {ElementLike} el
   */
  constructor(el){
    super()
    el = SvgPlus.parseElement(el);
    if (el == null) {
      throw new Error("null element")
    }
    let proto = Object.getPrototypeOf(this);
    let res = extend(el, proto.constructor);
    if (!res) {
      throw "failed to extend element with constructor chain\n" + printChain(el["__+"]) + "\n with \n" + printChain(proto.constructor);
    }
    return el;
  }


  // ~~~~~~~~~~~~~~~~~~~~~ HELPFUL SET GET PROPERTIES ~~~~~~~~~~~~~~~~~~~~~~~~

  /**
   * Set styles as object were keys represent the style name and the value at those keys is style value.
   * @param {Styles} styles
   */
  set styles(styles){
    if (typeof styles !== 'object' || styles === null){
      throw `Error setting styles:\nStyles must be set to an object, not ${typeof styles}`
    }
    this._style_set = typeof this._style_set != 'object' ? {} : this._style_set;
    for (let style in styles){
      var value = styles[style];
      if (value === null || value === undefined) {
        this.style.removeProperty(style);
        delete this._style_set[style];
      } else {
        this.style.setProperty(style, value);
        this._style_set[style] = value;
      }
    }
  }

  /**
   * @return {Styles}
   */
  get styles(){
    return this._style_set;
  }


  /**
   * @param {Props} props
   */
  set props (props){
    if (typeof props !== 'object' || props === null){
      throw `Error setting props:\nsProps must be set to an object, not ${typeof props}`
    }
    this._prop_set = typeof this._prop_set != 'object' ? {} : this._prop_set;
    for (let prop in props){
      var value = props[prop]
      switch (prop) {
        case "style":
        case "styles":
          this.styles = value;
          break;
        case "events":
          this.events = value;
          break;
        case "innerHTML":
        case "content":
          this.innerHTML = value;
          break;
        default:
          this.setAttribute(prop,value);
          this._prop_set[prop] = value;
          break;
      }
    }
  }

  /**
   * @return {Object.<string, StringLike>}
   */
  get props(){
    return this._prop_set;
  }

  /**
   * @param {Events} events
   */
  set events(events) {
    if (typeof events !== 'object' || events === null){
      throw `Error setting events:\nEvents must be set to an object, not ${typeof events}`
    }
    // Check that all events provide valid callbacks
    for (let key in events) {
      if (!(events[key] instanceof Function)){
        throw `Error setting events:\nThe event ${key} is not a valid event`
      }
    }

    for (let key in events) {
      this.addEventListener(key, events[key])
    }
  }

  /**
   * @param {string} val
   */
  set class(val){
    this.props = {class: val}
  }

  /**
   * @return {string}
   */
  get class(){
    return this.getAttribute('class');
  }

  /**
   * @return {BBox}
   */
  get bbox(){
    let bbox = this.getBoundingClientRect();
    let pos = new Vector(bbox);
    let size = new Vector(bbox.width, bbox.height);
    return new BBox(pos, size);
  }

   /**
   * @return {BBox}
   */
  get svgBBox(){
    let bbox = this.getBBox();
    let pos = new Vector(bbox);
    let size = new Vector(bbox.width, bbox.height);
    return new BBox(pos, size);
  }


  /** Creates a child SvgPlus element, sets its properties and appends it to itself
  
   * @template {new (...args: any[]) => SvgPlus} TypeClass
   * 
   * @param {ElementLike | TypeClass} type type Can be provided as an element tag name or an SvgPlus class.
   * @param {Props} props props element properties will be set before appending the newly created element.
   * @param {...ConstructorParameters<T>} args args if a type is given as an SvgPlusClass then the params will be passed to the 
   *                      constructor of that class when constructing the element.
   * @return {SvgPlus | InstanceType<TypeClass>} the newly created child element.
   * 
   * @overload
   * @param {TypeClass} type class definition of the element to be created.
   * @param {Props} props properties to be set on the element before it is appended to the DOM.
   * @param {...ConstructorParameters<TypeClass>} args if a type is given as an SvgPlusClass then the params will be passed to the 
   * @returns {InstanceType<TypeClass}
   *
   * 
   * @overload
   * @param {ElementLike} type tag name of the element to be created.
   * @param {Props} props properties to be set on the element before it is appended to the DOM.
   * @returns {SvgPlus}
   *
   */
  createChild(type, props = {}, ...args){
    let child;
    if (type instanceof Function && type.prototype instanceof SvgPlus){
      child = new type(...args);
    }else{
      child = new SvgPlus(type);
    }
    child.props = props;

    this.appendChild(child);
    return child;
  }

  // ~~~~~~~~~~~~~~~~~~~~~~~  HELPFUL FUNCTIONS  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  /**
   * @param {string} [name="default"]
   */
  saveSvg(name = 'default'){
    let output = this.outerHTML;

    // Remove excess white space
    output = output.replace(/ ( +)/g, '').replace(/^(\n)/gm, '')
    output = output.replace(/></g, '>\n<')

    //Autoindent
    output = output.split('\n');
    var depth = 0;
    var newOutput = ''
    for (var i = 0; i < output.length; i++){
      depth += (output[i].search(/<\/(g|svg)>/) == -1)?0:-1;
      for (var j = 0; j < depth; j++){
        newOutput += '\t'
      }
      newOutput += output[i] + '\n';
      depth += (output[i].search(/<(g|svg)(\s|\S)*?>/) == -1)?0:1;
    }


    var blob = new Blob([newOutput], {type: "text/plain"});
    var url = null;

    if (url == null){
      url = window.URL.createObjectURL(blob);

      var a = document.createElement('a')
      a.setAttribute('href', url)
      a.setAttribute('download', name + '.svg')
      document.body.prepend(a);
      a.click()
      a.remove();
    }
  }

  /**
   * @param {MutationObserverInit} config
   * @param {function(MutationRecord[], MutationObserver): void} callback
   */
  watchMutations(config, callback){
    this._mutationObserver = new MutationObserver((mutation, observer) => {
        if (callback instanceof Function) callback(mutation, observer);
        if (this.onmutation instanceof Function) this.onmutation(mutation, observer);
        let event = new Event("mutation");
        this.dispatchEvent(event);
    })

    this._mutationObserver.observe(this, config);
  }

  stopMutationWatch(){
    if (this._mutationObserver instanceof MutationObserver){
      this._mutationObserver.disconnect();
    }
  }

   /**
   * @param {number} l
   * 
   * @return {Vector}
   */
  getVectorAtLength(l) {
    return new Vector(this.getPointAtLength(l));
  }

   /**
   * @param {...number|Vector} values
   * 
   * @return {boolean}
   */
  isVectorInFill(...values) {
    return this.isPointInFill(this.makeSVGPoint(...values));
  }

  /**
   * @param {...number|Vector} values
   * 
   * @return {boolean}
   */
  isVectorInStroke(...values) {
    return this.isPointInStroke(this.makeSVGPoint(...values));
  }


  /**
   * @param {...number|Vector} values
   * 
   * @return {SVGPoint}
   */
  makeSVGPoint(...values) {
    let v = parseVector(...values);
    let p = Points.createSVGPoint();
    p.x = v.x;
    p.y = v.y;
    return p;
  }

  /**
    Wave transistion

    @param {function(number): void} update update(progress) function to be called on each animation frame
      update function will be passed a number from 0 to 1 which will be the
      ellapsed time mapped to a wave.

    @param {boolean} dir
      true:  0 -> 1,
      false: 1 -> 0

    @param {number} duration in milliseconds


  */
  async waveTransition(update, duration = 500, dir = false){
    if (!(update instanceof Function)) return 0;

    duration = parseInt(duration);
    if (Number.isNaN(duration)) return 0;

    return new Promise((resolve, reject) => {
      let t0;
      let end = false;

      let next = (t) => {
        let dt = t - t0;

        if (dt > duration) {
          end = true;
          dt = duration;
        }

        let theta = Math.PI * ( dt / duration  +  (dir ? 1 : 0) );
        let progress =  ( Math.cos(theta) + 1 ) / 2;

        let stop = update(progress);

        if (!end && !stop){
          window.requestAnimationFrame(next);
        }else{
          resolve(progress);
        }
      };
      window.requestAnimationFrame((t) => {
        t0 = t;
        window.requestAnimationFrame(next);
      })
    })
  }


  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~ STATIC METHODS ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  /**
   * Make a HTML or SVG element by providing the tag name
   * @param {string} name
   * 
   * @return {Element}
   */
  static make(name){
    return make(name);
  }

  /**
   * @param {ElementLike} input
   * 
   * @return {Element}
   */
  static parseElement(input = null) {
    let parsed = input;

    // if input is a string
    if (typeof input === "string") {
      // first get the element by id from the document
      parsed = document.getElementById(input);

      // if that does not work try and make an element with tag name of input
      if (parsed == null) {
        parsed = SvgPlus.make(input);
      }
    }

    if (!(parsed instanceof Element)) {
      parsed = null;
    }

    return parsed;
  }

  /**
   * @param {string} string
   * 
   * @return {SVGSVGElement}
   */
  static parseSVGString(string){
    let parser = new DOMParser()
    let doc = parser.parseFromString(string, "image/svg+xml");
    let errors = doc.getElementsByTagName('parsererror');
    let dsvg = doc.querySelector("svg");
    if (errors && errors.length > 0){
      throw doc;
    }
    let svg = make("svg");
    svg.setAttribute("viewBox", dsvg.getAttribute("viewBox"));
    svg.innerHTML = dsvg.innerHTML;
    return svg;
  }

  /**
   * @param {Element} el
   * @param {SvgPlusClass} cdef
   * 
   * @return {boolean}
   */
  static is(el, cdef) {
    return is(el, cdef);
  }

  /**
   * @param {Element} el
   * @param {SvgPlusClass} cdef
   * 
   * @return {boolean}
   */
  static extendable(el, cdef) {
    return extendable(el, cdef);
  }

    /**
   * @param {SvgPlusClass} subcls
   * @param {SvgPlusClass} cls
   * 
   * @return {boolean}
   */
  static isSubClass(subcls, cls) {
    return isSubClass(subcls, cls);
  }

  /**
   * @param {SvgPlusClass} classDef
   */
  static defineHTMLElement(classDef, className = null) {
    if (!className) {
      className = classDef.name.replace(/(\w)([A-Z][^A-Z])/g, "$1-$2").toLowerCase();
    }
    
    let setters = classDef.observedAttributes;

    let htmlClass = class extends HTMLElement{
      constructor(){
        super();
        if (!SvgPlus.is(this, classDef)) {
          new classDef(this);
        }
      }

      applyAttributes(){
        for (let setter of setters) {
          let value = this.getAttribute(setter);
          if (value != null) {
            this[setter] = value;
          }
        }
      }

      connectedCallback(){
        if (this.isConnected) {
          if (this.onconnect instanceof Function) {
            this.onconnect();
          }
        }
      }

      disconnectedCallback(){
        if (this.ondisconnect instanceof Function) {
          this.ondisconnect();
        }
      }

      adoptedCallback(){
        if (this.onadopt instanceof Function) {
          this.onadopt();
        }
      }

      attributeChangedCallback(name, oldv, newv){
        this[name] = newv;
      }

      static get observedAttributes() { return setters; }
    }

    console.log(className+ " custom element defined");
    customElements.define(className, htmlClass);
  }

  /**
   * @return {Object.<string, boolean>} 
   */
  static get SVGTagNames() {
    return SVGTagNames;
  }
}

export {Vector, parseVector, SvgPlus}
