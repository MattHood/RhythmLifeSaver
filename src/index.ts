import abcjs from "../include/abcjs/index.js"
import {readFileSync} from 'fs'

const SVGNamespace = "http://www.w3.org/2000/svg";
const LilypondSVGScaleFactor = 8;

// New strategy for smooth scrolling: seperate moving and static elements into separate SVGs, then blit them seperately to a canvas.



// Turns the NodeList returned by querySelector into a regular array, 
// via a predicate which retains an element upon evaluating true.
function filterNodeList<T extends Element>(
    source: SVGElement | HTMLElement, 
    selector: string, 
    predicate: (t: T, index?: number) => boolean = (t: Element) => true): T[] {

        let all: NodeListOf<Element> = source.querySelectorAll(selector);
        let goal: T[] = [];
        for(let i = 0; i < all.length; i++) {
            if(predicate(all[i] as T, i)) {
                goal.push(all[i] as T);
            }
        }
        return goal;
}

function propogateClassToChildren(parent: SVGElement) {
    let parentClass = parent.classList;
    if(parent.hasChildNodes) {
        let children = parent.querySelectorAll("rect, line, path, text, polygon");
        children.forEach((n) => n.classList.add(parentClass.toString())); 
    }
}

//https://stackoverflow.com/questions/28282295/getbbox-of-svg-when-hidden
function svgBBox (svgEl) {
    let tempDiv = document.createElement('div')
    tempDiv.setAttribute('style', "position:absolute; visibility:hidden; width:0; height:0")
    document.body.appendChild(tempDiv)
    let tempSvg = document.createElementNS("http://www.w3.org/2000/svg", 'svg')
    tempDiv.appendChild(tempSvg)
    let tempEl = svgEl.cloneNode(true)
    tempSvg.appendChild(tempEl)
    let bb = tempEl.getBBox()
    document.body.removeChild(tempDiv)
    return bb
  }

function sizeSVGByContent(el: SVGElement): void {
    var bbox = svgBBox(el);
    el.setAttribute("width", bbox.width + "px");
    el.setAttribute("height", bbox.height + "px");
    el.setAttribute("viewBox", `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`);
    el.setAttribute("preserveAspectRatio", "none");
}

function extractBySelector(element: SVGElement, selector: string): SVGElement {
    let newSVG = <SVGElement>document.createElementNS(SVGNamespace, "svg");
    element.querySelectorAll(selector).forEach(
        (el: Element) => {
            newSVG.appendChild(el);
        }
    );
    sizeSVGByContent(newSVG);
    return newSVG;
}

function serializeSVG(element: SVGElement): string {
    let xml = new XMLSerializer().serializeToString(element);

    // The following was copy-pasted from https://developer.mozilla.org/en-US/docs/Glossary/Base64
    function b64EncodeUnicode(str) {
        return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function(match, p1) {
            return String.fromCharCode('0x' + p1);
        }));
    }

    let base64 = b64EncodeUnicode(xml);
    let output = `data:image/svg+xml;base64,${base64}`
    return output;
}

function SVG2Image(element: SVGElement, scale: number = 4): HTMLImageElement {
    let img = <HTMLImageElement>document.createElement("img");
    let oldWidth = parseFloat(element.getAttribute('width'));
    let oldHeight = parseFloat(element.getAttribute('height'));
    element.setAttribute('width', (oldWidth * scale).toString());
    element.setAttribute('height', (oldHeight * scale).toString());
    let text = serializeSVG(element);
    img.src = text;
    
    return img;
}

// Too blurry
function img2Canvas(img: HTMLImageElement): HTMLCanvasElement {
    let canvas = <HTMLCanvasElement>document.createElement("canvas");
    let ctx = canvas.getContext("2d");
    // Resize, compensating for HiDPI displays
    // https://stackoverflow.com/questions/41528103/drawimage-generates-bad-quality-compared-to-img-tag
    canvas.width = img.width * window.devicePixelRatio;
    canvas.height = img.height * window.devicePixelRatio;
    canvas.style.width = (canvas.width / window.devicePixelRatio).toString() + "px";
    canvas.style.height = (canvas.height / window.devicePixelRatio).toString() + "px";
    ctx.drawImage(img, 0, 0);
    return canvas;
}

function loadLilypondSVG(path: string): SVGElement {
    let containerDiv = document.createElement("div");
    let svg_string = readFileSync("Lilypond/test2.svg", 'utf8');
    containerDiv.innerHTML = svg_string;
    let tsvg = containerDiv.querySelector("svg") as SVGElement;
    //tsvg.querySelectorAll("g").forEach((gtag) => propogateClassToChildren(gtag));
    return tsvg;
}

function getMovingSprites(render: SVGElement): SVGElement[] {
    let moveable: SVGElement[] = filterNodeList(render, ":not(.StaffSymbol):not(.TimeSignature):not(.Clef):not(style):not(g):not(tspan)");
    return moveable;
}

function getNoteheads(music: SVGElement): SVGRectElement[] {
    return filterNodeList<SVGRectElement>(music, "g.NoteHead > rect");
}

var docsvg = document.querySelector("svg#parent");

interface Note { type: "A", offset: number };

function getXTransform(el: SVGElement) {
    let transform = el.getAttribute("transform");
    let re = /translate\((\d*.\d*)\,\s*\d*\.\d*\)/g;
    return parseFloat(re.exec(transform)[1]);
}

function parseNote(noteObject: SVGRectElement): Note {
    return { type: "A", offset: getXTransform(noteObject)};
}

const movingGraphicsSelector = ":scope > :not(.StaffSymbol):not(.TimeSignature):not(.Clef):not(style):not(tspan)";
const fixedGraphicsSelector = ":scope > .StaffSymbol, .TimeSignature, .Clef";

class RenderedMusic {
    musicSVG: SVGElement;
    movingGraphics: SVGElement;
    fixedGraphics: SVGElement;
    movingRender: HTMLImageElement;
    fixedRender: HTMLImageElement;
    noteObjects: Note[];
    translation: number = 0;
    constructor() {
        this.musicSVG = loadLilypondSVG("Lilypond/test2.svg");
        
        this.movingGraphics = extractBySelector(this.musicSVG, movingGraphicsSelector);
        this.fixedGraphics = extractBySelector(this.musicSVG, fixedGraphicsSelector);
        this.movingRender = SVG2Image(this.movingGraphics, LilypondSVGScaleFactor);
        this.fixedRender = SVG2Image(this.fixedGraphics, LilypondSVGScaleFactor);

        window.debugMusic = this;
    }

    get scoreWidth(): number {
        return parseFloat(this.musicSVG.getAttribute("width"));
    }

    get metaNotes(): Note[] {
        return getNoteheads(this.movingGraphics).map(parseNote).sort((a, b) => a.offset - b.offset);
    }


    get targetX(): number {
        return this.metaNotes[0].offset - 10;
    }

}


//let music1: RenderedMusic = new RenderedMusic();

// let noteOffsets: number[] = music1.metaNotes.map( (n: Note) => n.offset);
// const TARGET_X = music1.targetX;
// let targetNote = 0;

class Scene {
    canvas: HTMLCanvasElement;
    music: RenderedMusic;
    ctx: CanvasRenderingContext2D;
    animationInProgress: boolean = false;
    elapsedTime: number = 0;
    timer: number;

    constructor(_canvas: HTMLCanvasElement) {
        this.canvas = _canvas;
        this.ctx = this.canvas.getContext("2d");
        this.music = new RenderedMusic();


        //document.addEventListener("keydown", this.animate.bind(this));
        this.draw();
        //this.beginAnimation();
    }

    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    draw() {
        this.clear();
        this.ctx.drawImage(this.music.fixedRender, 0, 0);
        this.ctx.drawImage(this.music.movingRender, -1 * this.music.translation, 0);
    }

    animate() {
        this.elapsedTime += 0.25;
        this.music.translation = this.elapsedTime;
        this.draw();
    }

    beginAnimation() {
        this.elapsedTime = 0;
        this.timer = window.setInterval((() => this.animate()).bind(this), 1/30);
        this.animationInProgress = true;
    }

    endAnimation() {
        window.clearInterval(this.timer);
        this.elapsedTime = 0;
        this.animationInProgress = false;
    }

    handler(event) {
        console.log("We got there");
        if(!this.animationInProgress) {
            this.beginAnimation();
        }
        else if(event.key == "b") {
            console.log("b");
        }
        else if(event.key == "s") {
            this.endAnimation();
        }
    }
}

const parent = <HTMLCanvasElement>document.querySelector("canvas#music-canvas");
const scene = new Scene(parent);




// Global
// let currentNoteDistance = 0;

// let anim = function(R: RenderedMusic) {
//     let t = 0;
//     let noteOffsets: number[] = R.metaNotes.map(n => n.offset)
//     return function() {
//         if(t < R.scoreWidth) {
//             t += 0.1;
//         }

//         const nextOffset = (n: number) => n + 1 < noteOffsets.length ? n + 1 : n;
//         currentNoteDistance = Math.abs((noteOffsets[targetNote] - t) - TARGET_X);
//         let nextIndex = nextOffset(targetNote);
//         let nextNoteDistance = Math.abs((noteOffsets[nextIndex] - t) - TARGET_X);

//         if(nextNoteDistance < currentNoteDistance) {
//             targetNote = nextOffset(targetNote);
//         }

//         R.translation = t;
//     }
// }

// let hasStarted: boolean = false;

// // Event listener for tapping note, read currentNoteDistance to get error.
// document.addEventListener("keydown", (event) => {
//     if(!hasStarted) {
//         setInterval(anim(music1), 1/30);
//         hasStarted = true;
//     }
//     else if(event.key == "b") {
//         console.log(currentNoteDistance);
//     }
// });

// document.querySelector("rect#targetLine").setAttribute("x", `${TARGET_X}`);