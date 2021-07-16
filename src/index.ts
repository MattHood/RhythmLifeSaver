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
  el.setAttribute("width", bbox.width*8 + "px");
  el.setAttribute("height", bbox.height*8 + "px");
  el.setAttribute("viewBox", `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`);
    //el.setAttribute("preserveAspectRatio", "none");
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

function loadLilypondSVG(path: string): SVGElement {
    let containerDiv = document.createElement("div");
    let svg_string = readFileSync("Lilypond/test3-2.svg", 'utf8');
    containerDiv.innerHTML = svg_string;
    let tsvg = containerDiv.querySelector("svg") as SVGElement;
    //tsvg.querySelectorAll("g").forEach((gtag) => propogateClassToChildren(gtag));
    return tsvg;
}

function getNoteheads(music: SVGElement): SVGRectElement[] {
    return filterNodeList<SVGRectElement>(music, "g.NoteHead > rect");
}

function removeEmptyGTags(doc: SVGElement): void {
  let g = filterNodeList<SVGGElement>(doc, "g");
  g.forEach( (el) => {
    if(el.childElementCount == 0) {
      el.remove();
    }
  });
}


var docsvg = document.querySelector("svg#parent");

interface Note { type: "A", x: number, y: number };

function getXTransform(el: Element): number | null {
  const transform = el.getAttribute("transform");
  let re = /translate\((-?\d*.\d*)\,\s*-?\d*\.\d*\)/;
  re.lastIndex = 0;
  const result = re.exec(transform);
  if(result) {
    return parseFloat(result[1]);
  }
  else {
    console.error("Tried to get the X-transform of an element that does not posess such an attribute. ");
    return null;
  }
}

function getYTransform(el: Element): number | null {
  const transform = el.getAttribute("transform");
  let re = /translate\(-?\d*.\d*\,\s*(-?\d*\.\d*)\)/;
  re.lastIndex = 0;
  const result = re.exec(transform);
  if(result) {
    return parseFloat(result[1]);
  }
  else {
    console.warn("Tried to get the Y-transform of an element that does not posess such an attribute. ");
    return null;
  }
}

function setXTransform(el: Element, updated: number) {
  let y = getYTransform(el);
  if(y == null) { y = 0; }
  
}

function setYTransform(el: Element, updated: number) {

}

function sortByXPosition(doc: SVGElement):void {
  let gEls = filterNodeList<SVGGElement>(doc, "g");
  gEls.sort( function(g1, g2) {
    let a = getXTransform(<Element>g1.firstElementChild);
    let b = getXTransform(<Element>g2.firstElementChild);
    return a - b;
  });
  gEls.forEach( (el) => doc.appendChild(el) );
}

function setCountBaseline(doc: SVGElement, baseline: number): void {
  let counts = filterNodeList<SVGTextElement>(doc, "g.TextScript > text");
  let noteheadPosition = getYTransform(<SVGPathElement>doc.querySelector("g.NoteHead > path"));
  counts.forEach( (c) => setYTransform(c, noteheadPosition + baseline) );
}

function parseNote(noteObject: SVGPathElement): Note {
  return { type: "A", x: getXTransform(noteObject), y: getYTransform(noteObject)};
}

function textBelowNote(note: Note, text: string) {
  let el = document.createElementNS(SVGNamespace, "text");
  el.innerHTML = text;
  el.setAttribute("transform", `translate(${note.x},${note.y + 5})`);
  el.setAttribute("font-size", "3");
  el.setAttribute("font-style", "bold");
  return el;
}

interface Count {
  display: string;
  beat: number;
  dom: SVGTextElement;
}

function parseLilypondEvents(allEvents: string): Omit<Count, "dom">[] {
  let tokenized = allEvents.split('\n').map((line) => line.split('\t'));
  let textEvents = tokenized.filter((line) => line[1] == "text");
  return textEvents.map( (e) => ({ display: e[2], beat: parseFloat(e[0])}) );
}

function zipLilypondEventsAndDom(e: Omit<Count, "dom">[], d: SVGTextElement[]): Count[] {
  if(e.length != d.length) {
    console.error("Lengths of Lilypond text events and corresponding DOM elements are mismatched.");
  }
  return e.map( (evt, index) => ({...evt, dom: d[index]}));
}

const movingGraphicsSelector = ":scope > :not(.StaffSymbol):not(.TimeSignature):not(.Clef):not(style):not(tspan)";
const fixedGraphicsSelector = ":scope > .StaffSymbol, .TimeSignature, .Clef";
const counting = ['1', '3', 'e', '+', 'a', '4', 'e', '+', 'e', 'a'];
const commonTimeDownbeats = ['1', '2', '3', '4'];


class RenderedMusic {
    musicSVG: SVGElement;

    noteObjects: Note[];
    constructor() {
      this.musicSVG = loadLilypondSVG("Lilypond/test2.svg");
      removeEmptyGTags(this.musicSVG);
      sortByXPosition(this.musicSVG);
      sizeSVGByContent(this.musicSVG);
      this.noteObjects = filterNodeList<SVGPathElement>(this.musicSVG, "g.Notehead > path")
        .map(parseNote)
        .sort((a, b) => a.x - b.x);
      console.log(this.noteObjects);
     /* this.noteObjects.forEach(
        (note, index) =>
          {
            console.log(note);
            this.musicSVG.appendChild(textBelowNote(note, counting[index]))
          });*/

    }

  get scoreWidth(): number {
        return parseFloat(this.musicSVG.getAttribute("width"));
  }

  get content(): SVGElement {
    return this.musicSVG;
  }

}


//let music1: RenderedMusic = new RenderedMusic();

// let noteOffsets: number[] = music1.metaNotes.map( (n: Note) => n.offset);
// const TARGET_X = music1.targetX;
// let targetNote = 0;

class Scene {
    parent: HTMLDivElement;
    music: RenderedMusic;


    constructor(_parent: HTMLDivElement) {
      this.parent = _parent;
      this.music = new RenderedMusic();
      this.parent.appendChild(this.music.content);
      
    }

}

const parent = <HTMLDivElement>document.querySelector("div#music-canvas");
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
