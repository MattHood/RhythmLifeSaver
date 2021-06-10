import abcjs from "./include/abcjs/index.js"

interface ABCParserParams {
    add_classes?: boolean
}

type ABCElement = SVGPathElement;

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

function abc2svg(abc: string, options?: ABCParserParams): SVGElement {
    let containerDiv = document.createElement("div");
    abcjs.renderAbc(containerDiv, abc, options);
    let svg = containerDiv.querySelector("svg") as SVGElement;
    return svg;
}

function getMovingSprites(render: SVGElement): ABCElement[] {
    let moveable: ABCElement[] = filterNodeList(render, "path:not(.abcjs-staff-extra):not(.abcjs-staff)");
    return moveable;
}

function getPlayableNotes(render: SVGElement): ABCElement[] {
    return filterNodeList(render, ".abcjs-note");
}

var docsvg = document.querySelector("svg#parent");
let testABCMusic: string = `
K: perc stafflines=1
L: 1/4
M: 4/4
z z z z |: B B/2B/2 B/4B/4B/4B/4 B :||: B B/2B/2 B/4B/4B/4B/4 B :|
`


interface Note { type: "A", offset: number };

function parseNote(noteObject: ABCElement): Note {
    return { type: "A", offset: noteObject.getBBox().x }
}

class RenderedMusic {
    musicSVG: SVGElement;
    moving: ABCElement[];
    noteObjects: ABCElement[];
    constructor(music: string) {
        this.musicSVG = abc2svg(music, {add_classes: true});
        this.musicSVG.setAttribute("class", "RLS-musicrender");

        this.moving = getMovingSprites(this.musicSVG);
        this.noteObjects = getPlayableNotes(this.musicSVG);
    }

    get scoreWidth(): number {
        return parseFloat(this.musicSVG.getAttribute("width"));
    }

    get metaNotes(): Note[] {
        return this.noteObjects.map(parseNote);
    }

    get content(): SVGElement {
        return this.musicSVG;
    }

    get targetX(): number {
        return this.moving[0].getBBox().x;
    }

    // Can the moving notes be added to a group and translated together?
    set translation(extent: number) {
        this.moving.forEach((el: SVGElement) => {
            el.setAttribute("transform", `translate(${-1*extent} 0)`);
        })
    }


}


let music1: RenderedMusic = new RenderedMusic(testABCMusic);
docsvg.appendChild(music1.content);

let noteOffsets: number[] = music1.metaNotes.map( (n: Note) => n.offset);
const TARGET_X = music1.targetX;
let targetNote = 0;

namespace Scene {

};

// Global
let currentNoteDistance = 0;

let anim = function(R: RenderedMusic) {
    let t = 0;
    let noteOffsets: number[] = R.metaNotes.map(n => n.offset)
    return function() {
        if(t < R.scoreWidth) {
            t += 0.5;
        }

        const nextOffset = (n: number) => n + 1 < noteOffsets.length ? n + 1 : n;
        currentNoteDistance = Math.abs((noteOffsets[targetNote] - t) - TARGET_X);
        let nextIndex = nextOffset(targetNote);
        let nextNoteDistance = Math.abs((noteOffsets[nextIndex] - t) - TARGET_X);

        if(nextNoteDistance < currentNoteDistance) {
            targetNote = nextOffset(targetNote);
        }

        R.translation = t;
    }
}

let hasStarted: boolean = false;

// Event listener for tapping note, read currentNoteDistance to get error.
document.addEventListener("keydown", (event) => {
    if(!hasStarted) {
        setInterval(anim(music1), 1/30);
        hasStarted = true;
    }
    else if(event.key == "b") {
        console.log(currentNoteDistance);
    }
});

document.querySelector("rect#targetLine").setAttribute("x", `${TARGET_X}`);