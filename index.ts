import abcjs from "./include/abcjs/index.js"

interface ABCParserParams {
    add_classes?: boolean
}

type ABCElement = SVGPathElement;

function filterNodeList<T extends Element>(
    source: SVGElement | HTMLElement, 
    selector: string, 
    predicate: (t: T, index?: number) => boolean = (t: Element) => true): T[] {

        let all: NodeListOf<Element> = source.querySelectorAll(selector);
        console.log(all);
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
let music: string = `
K: perc stafflines=1
L: 1/4
M: 4/4
|: B B/2B/2 B/4B/4B/4B/4 B :||: B B/2B/2 B/4B/4B/4B/4 B :|
`
var musicsvg = abc2svg(music, {add_classes: true });
musicsvg.setAttribute("id", "yourfriendthesvg");
let moving = getMovingSprites(musicsvg);


let notes = getPlayableNotes(musicsvg);
notes.forEach((n: SVGPathElement) => { n.setAttribute("fill", "red") });
//notes.map((n) => n.)


console.log(moving);
let anim = function(s: SVGElement[], max: number) {
    let t = 0;
    return function() {
        if(t < max) {
            t += 0.5;
        }
        console.log(notes[0].getBBox().x);
        s.forEach((el: SVGElement) => {
            el.setAttribute("transform", `translate(${-1*t} 0)`);
        })
    }
}


let scoreWidth: number = parseFloat(musicsvg.getAttribute("width"));
setInterval(anim(moving, scoreWidth), 1/30);
docsvg.appendChild(musicsvg);