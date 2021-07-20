import {readFileSync} from 'fs'

const SVGNamespace = "http://www.w3.org/2000/svg";
const LilypondSVGScaleFactor = 8;
const LilypondSVGId = "lilysvg";
const DifficultyExponent = 8;

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
    let svg_string = readFileSync("Lilypond/test3.svg", 'utf8');
    containerDiv.innerHTML = svg_string;
    let tsvg = containerDiv.querySelector("svg") as SVGElement;
    tsvg.setAttribute("id", LilypondSVGId);
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

function getParentWithId(el: Element, id: string): Element | undefined {
  if(el == undefined) {
    console.warn("Ran out of parent nodes to trial.");
    return undefined;
  }
  else if(el.hasAttribute("id")) {
    if(el.getAttribute("id") == id) {
      return el;
    }
  }
  else {
    return getParentWithId(el.parentElement, id);
  }
  
}

function positionScore(el: Element): number {
  const parent = getParentWithId(el, LilypondSVGId);
  const w = parseFloat(parent.getAttribute("width"));
  const x = getXTransform(el);
  const y = getYTransform(el);
  return y*w + x;
}

function sortByPosition(doc: SVGElement):void {
  let gEls = filterNodeList<SVGGElement>(doc, "g");
  gEls.sort( function(g1, g2) {
    let a = positionScore(<Element>g1.firstElementChild);
    let b = positionScore(<Element>g2.firstElementChild);
    return a - b;
  });
  gEls.forEach( (el) => doc.appendChild(el) );
}


function parseNote(noteObject: SVGPathElement): Note {
  return { type: "A", x: getXTransform(noteObject), y: getYTransform(noteObject)};
}

interface Count {
  display: string;
  beat: number;
  dom: SVGTextElement;
}

function parseLilypondEvents(allEvents: string): Omit<Count, "dom">[] {
  let tokenized = allEvents.split('\n').map((line) => line.split('\t'));
  let textEvents = tokenized.filter((line) => line[1] == "lyric");
  return textEvents.map( (e) => ({ display: e[2], beat: parseFloat(e[0])}) );
}

function truncateToOneSequence(textEvents: Omit<Count, "dom">[]): Omit<Count, "dom">[] {
  // -1 So we match with 0 using the strict inequality;
  let maxBeat = -1;
  return textEvents.filter( (val) => {
    if(val.beat > maxBeat) {
      maxBeat = val.beat;
      return true;
    }
    else {
      return false;
    }
  });
}

function zipLilypondEventsAndDom(e: Omit<Count, "dom">[], d: SVGTextElement[]): Count[] {
  if(e.length != d.length) {
    console.error("Lengths of Lilypond text events and corresponding DOM elements are mismatched.");
  }
  return e.map( (evt, index) => ({...evt, dom: d[index]}));
}

const movingGraphicsSelector = ":scope > :not(.StaffSymbol):not(.TimeSignature):not(.Clef):not(style):not(tspan)";
const fixedGraphicsSelector = ":scope > .StaffSymbol, .TimeSignature, .Clef";


class RenderedMusic {
    musicSVG: SVGElement;
    counts: Count[];

    noteObjects: Note[];
    constructor() {
      this.musicSVG = loadLilypondSVG("Lilypond/test3.svg");
      const musicEventsFile = readFileSync("Lilypond/test3-unnamed-staff.notes");
      removeEmptyGTags(this.musicSVG);
      sortByPosition(this.musicSVG);
      sizeSVGByContent(this.musicSVG);
      
      const lilyEvents = truncateToOneSequence(parseLilypondEvents(musicEventsFile.toString()));
      const domCounts = filterNodeList<SVGTextElement>(this.musicSVG, "g.LyricText > text");
      this.counts = zipLilypondEventsAndDom(lilyEvents, domCounts);

      console.log(this.counts);
    }

  get scoreWidth(): number {
        return parseFloat(this.musicSVG.getAttribute("width"));
  }

  get content(): SVGElement {
    return this.musicSVG;
  }
}

// Animation:
// Array, note times in ms, setTimout() for each
// Array, switchover times; halfway between each note + edge case for last element, setTimeout() for each
// Number, Index pointing to currentGoal note
// Number Start time in ms from Date.prototype.getMilliseconds()?
// Event handler, keypress, check current time - start time compared to current goal note.


//let music1: RenderedMusic = new RenderedMusic();

// let noteOffsets: number[] = music1.metaNotes.map( (n: Note) => n.offset);
// const TARGET_X = music1.targetX;
// let targetNote = 0;
type Timer = number;
class Animator {
  counts: Count[];
  noteTimes: number[];
  noteTimers: Timer[];
  transitionTimes: number[];
  transitionTimers: Timer[];
  goalNote: number;
  startTime: number;

  constructor(_counts: Count[], bpm: number) {
    this.counts = _counts;
    const beatLength = (60 / bpm) * 1000;
    this.noteTimes = this.counts
      .map( (c: Count) => c.beat )
      .map( (t: number) => 4 * t * beatLength);
    this.transitionTimes = this.counts
      .slice(0, -1)
      .map( (c: Count, i: number) => (c.beat + this.counts[i + 1].beat) / 2 )
      .map( (t: number) => 4 * t * beatLength);
    this.transitionTimes[this.counts.length - 1] = this.transitionTimes[this.counts.length - 1]
  }

  start() {
    this.goalNote = 0;
    this.counts
      .map( (c: Count) => c.dom)
      .forEach( (d: SVGTextElement) => d.setAttribute("fill", "darkGrey"));
    this.startTime = Date.now();

    type Func = (i: number) => void;
    const curry = ( fn: Func, index: number ) => ( () => fn(index) ).bind( this );
    const indexedTimer = ( time, index, fn ) => window.setTimeout( curry(fn, index), time );
    const mapper = (fn) => ( (time, index) => indexedTimer(time, index, fn.bind(this)) );
    this.noteTimers = this.noteTimes.map( mapper(this.revealCount) );
    this.transitionTimers = this.transitionTimes.map( mapper(this.nextGoal) );

    document.addEventListener("keydown", this.keyHandler.bind(this));
  }

  revealCount(i: number) {
    this.counts[i].dom.setAttribute("font-weight", "bold");
    this.counts[i].dom.setAttribute("font-size", "3.2");

    if(i > 0) {
      this.counts[i-1].dom.setAttribute("font-size", "2.4696");
    }
  }

  nextGoal(i: number) {
    this.goalNote = i + 1;
  }

  computeScore() {
    const pressTime = Date.now();
    const timeSinceStart = pressTime - this.startTime;
    const window = this.transitionTimes[this.goalNote];
    const worstPossibleScore = this.goalNote == 0 ? window : window / 2;
    const rawScore = this.noteTimes[this.goalNote] - timeSinceStart;
    console.log(`w: ${window} r: ${rawScore}`);
    const score = Math.pow(( 1 - (rawScore / worstPossibleScore)), DifficultyExponent);
    return score * 100;
  }

  setNoteColourToScore(score) {
    let colour;
    if(score < 95) {
      colour = "red";
    }
    if(95 <= score && score < 105) {
      colour = "darkGreen"
    }
    if(105 <= score) {
      colour = "blue"
    }
    this.counts[this.goalNote].dom.setAttribute("fill", colour);
  }

  keyHandler(evt) {
    const score = this.computeScore();
    this.setNoteColourToScore(score);
    console.log(`Score: ${score.toFixed(2)}%`);
  }

}

class Scene {
    parent: HTMLDivElement;
    music: RenderedMusic;
    animator: Animator;


    constructor(_parent: HTMLDivElement) {
      this.parent = _parent;
      this.music = new RenderedMusic();
      
      this.animator = new Animator(this.music.counts, 50);
      let btn = document.createElement("button");
      btn.innerHTML = "Start"
      btn.onclick = this.animator.start.bind(this.animator);
      
      this.parent.appendChild(btn);
      this.parent.appendChild(document.createElement("br"));
      this.parent.appendChild(this.music.content);
    }

}

const parent = <HTMLDivElement>document.querySelector("div#music-canvas");
const scene = new Scene(parent);