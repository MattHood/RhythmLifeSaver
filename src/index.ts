import * as Tone from 'tone'

const SVGNamespace = "http://www.w3.org/2000/svg";
const LilypondSVGScaleFactor = 8;
const LilypondSVGId = "lilysvg";
const DifficultyExponent = 1;
const EarlyPercentage = 80;
const LatePercentage = 120;
const PlayedRestScore = 50;
const MissedNoteScore = 50;
const BigCountSize = 3.2;
const NormalCountSize = 2.4696;

const curry = ( fn: (i: number) => void, index: number ) => ( () => fn(index) );

// DONE Move visual elements into component
// DONE Style with Bulma
// DONE Add durations to note structure
// TODO Work out the required format for each of: 1) Calculating the scoring window from Count 2) Length of note playback from Note
// DONE Use them for note playback length
// TODO Use them for window calculation
// TODO Triplets
// DONE Last notes aren't greyed out from a miss. Transition()? Stop()?
// DONE Make onMiss trigger
// DONE Figure out why the score isn't updating

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



function removeEmptyGTags(doc: SVGElement): void {
  let g = filterNodeList<SVGGElement>(doc, "g");
  g.forEach( (el) => {
    if(el.childElementCount == 0) {
      el.remove();
    }
  });
}

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

function positionScore(el: Element, width: number): number {
  const w = width;
  const x = getXTransform(el);
  const y = getYTransform(el);
  return y*w + x;
}

function sortByPosition(doc: SVGElement):void {
  let gEls = filterNodeList<SVGGElement>(doc, "g");
  const width = parseFloat(doc.getAttribute("width"));
  gEls.sort( function(g1, g2) {
    let a = positionScore(<Element>g1.firstElementChild, width);
    let b = positionScore(<Element>g2.firstElementChild, width);
    return a - b;
  });
  gEls.forEach( (el) => doc.appendChild(el) );
}

type CountElement = SVGTextElement;

interface Moment {
  moment: number;
};

interface LilypondEvent {
  moment: number,
  origin: string,
  type: string,
  id: string,
  duration: number
}

interface Count {
  text: CountElement,
  duration: number
}

function isHands(input: string): input is Hands {
  return ["RH", "LH", "AH"].includes(input);
}

interface Item {
  type: "note" | "rest",
  origin: Hands,
  duration: number,
  grob: SVGPathElement
}


interface Step {
  moment: number,
  count: Count,
  items: Item[]
}

function lilypondNoteToTone(lilynote: string) {
  return lilynote + "n";
}

// Format:  Moment  Origin Type Id Duration
function parseLilypondEvents(allEvents: string): LilypondEvent[] {
  const parse = (t: string[]): LilypondEvent => 
    ({moment: parseFloat(t[0]),
      origin: t[1],
      type: t[2],
      id: t[3],
      duration: parseFloat(t[4])});
  return allEvents
    .split(   '\n' )
    .filter(  (line: string) => line.trim().length > 0 )
    .map(     (line: string): string[] => line.split('\t') )
    .filter(  (tokens) => tokens.length >= 3 )
    .map(     parse )
    .filter(  (evt) => !isNaN(evt.moment) && evt.origin != "undefined" )
}

// This function relies on the fact that elements have already been properly sorted by flow position
// TODO: Move sorting here
function getCounts(events: LilypondEvent[], parent: SVGElement): (Count & Moment)[] {
  const countEvents = events.filter( (evt) => evt.origin == "Counts");
  const countElements = filterNodeList<CountElement>(parent, "g.LyricText > text");
  console.assert(countEvents.length == countElements.length);
  return countEvents.map( (evt, i) => ({text: countElements[i], moment: evt.moment, duration: evt.duration}));
}

// This function relies on the fact that elements have already been properly sorted by flow position
// TODO: Move sorting here
function getItemsWithId(events: LilypondEvent[], parent: SVGElement, id: string): (Item & Moment)[] {
  const itemEvents = events.filter( (evt) => ["note", "rest"].includes(evt.type) && evt.origin == id);
  const itemElements = filterNodeList<SVGPathElement>(parent, `g.NoteHead#${id} > path, g.Rest#${id} > path`);
  const transformer = (evt: LilypondEvent,i: number): (Item & Moment) => 
    ({type: evt.type as "note" | "rest",
      origin: isHands(evt.origin) ? evt.origin : undefined,
      moment: evt.moment,
      duration: evt.duration, 
      grob: itemElements[i]})
  console.assert(itemEvents.length == itemElements.length);
    return itemEvents.map( transformer );
}


function makeSteps(counts: (Count & Moment)[], ...items: (Item & Moment)[][]): Step[] {
  return counts.map( (c) => {
    //const finder: (im: (Item & Moment)[]) => (Item & Moment) = (seq) => seq.find((item) => item.moment == c.moment);
    //const reducer: (im: Item & Moment) => Item = (im) => ({  type: im.type, origin: im.origin, grob: im.grob });
    function finder (seq: (Item & Moment)[]): (Item & Moment) { 
      const ret = seq.find((item) => item.moment == c.moment)
      return ret;
    }
    function reducer (im: Item & Moment): Item {
      return {  type: im.type, origin: im.origin, grob: im.grob, duration: im.duration };
    };
    const filtered = items.filter((arr) => arr.length != 0);
    const found = filtered.map(finder).filter((i) => i != undefined);
    return {
      moment: c.moment,
      count: {text: c.text, duration: c.duration},
      items: found.length == 0 ? [] : found.map(reducer)
    };
  });
}

function isPlayed(item: Item): boolean {
  return item.type == "note";
}


class StepContainer {
  steps: Step[];
  target: number = 0;
  constructor(_steps: Step[]) {
    this.steps = _steps;
  }
  advanceTarget() {
    if(this.target < this.steps.length - 1) {
      this.target += 1;
    } 
  }

  get elapsedPlayableNotes(): number {
    return this.steps.map((s) => s.items.length).reduce((a,b) => a + b);
  }

  stepTimes(beatLengthMs: number, beatsPerBar: number): number[] {
    return this.steps.map((s) => s.moment * beatsPerBar * beatLengthMs)
  }

  reset() {
    this.target = 0;
  }

  get currentCount(): Count {
    return this.steps[this.target].count;
  }

  get previousCount(): Count | null {
    if(this.target > 0) {
      return this.steps[this.target - 1].count;
    }
    else {
      return null;
    }
  }

  get currentGoalMoment(): number {
    return this.steps[this.target].moment;
  }

  get currentNotes(): Item[] {
    return this.steps[this.target].items;
  }

  applyToCounts(func: (c: Count) => void) {
    this.steps.map((s) => s.count).forEach(func);
  }

  applyToNotes(func: (n: Item) => void) {
    this.steps.map((s) => s.items).flat().filter((i) => i.type == "note").forEach(func);
  }

  currentStepHasHand(hand: Hands): boolean {
    return this.steps[this.target].items.map((i) => i.origin).includes(hand);
  }
}

interface ParsedData {
  container: StepContainer;
  sortedSVG: SVGElement;
}

// Mutates the SVG
function parseData(svg: SVGElement, events: string, handIDs: string[]): ParsedData {
  const parsedEvents = parseLilypondEvents(events);
  removeEmptyGTags(svg);
  sortByPosition(svg);
  sizeSVGByContent(svg);
  
  const items = handIDs.map( (id) => getItemsWithId(parsedEvents, svg, id) );
  const counts = getCounts(parsedEvents, svg);
  const steps = makeSteps(counts, ...items);

  return { container: new StepContainer(steps), sortedSVG: svg };
}










// Animation:
// Array, note times in ms, setTimout() for each
// Array, switchover times; halfway between each note + edge case for last element, setTimeout() for each
// Number, Index pointing to currentGoal note
// Number Start time in ms from Date.prototype.getMilliseconds()?
// Event handler, keypress, check current time - start time compared to current goal note.

function createTimersFromTimes(times: number[], callback: (i: number) => void): Timer[] {
  return times.map(
    (time, index) => window.setTimeout(curry(callback, index), time)
  );
}

type Timer = number;

interface TimerCallbacks {
  onPrimaryChange: () => void,
  onMidpointChange: () => void,
  onFinish: (early?: boolean) => void
}

interface TimerCollection {
  primaryTimers: Timer[],
  midpointTimers: Timer[],
  finishTimer: Timer,
  onFinish: (early?: boolean) => void
}

// The first time is the origin. Probably should be 0.
function setTimers(times: number[], callbacks: TimerCallbacks, finishDelay: number): TimerCollection {
  const midpointTimes = times
    .slice(0, -1)
    .map( (t, i) => (t + times[i + 1]) / 2);
  const primaryChangeTimes = times.slice(1);
  const finishTime = times[times.length - 1] + finishDelay;

  return { 
    primaryTimers:  createTimersFromTimes(primaryChangeTimes, callbacks.onPrimaryChange),
    midpointTimers: createTimersFromTimes(midpointTimes, callbacks.onMidpointChange),
    finishTimer:    window.setTimeout(callbacks.onFinish, finishTime),
    onFinish: callbacks.onFinish
  }
}

function cancelTimers(timers: TimerCollection, doFinish: boolean = true) {
  timers.primaryTimers.forEach(window.clearTimeout);
  timers.midpointTimers.forEach(window.clearTimeout);
  window.clearTimeout(timers.finishTimer);
  if(doFinish) {
    timers.onFinish(true);
  }
}

type EventHandler = (evt: Event) => void;
type EventCanceller = () => void;
type Hands = "LH" | "RH" | "AH";
const RHKeys = ["m"];
const LHKeys = ["z"];
const KeyEventType = "keydown";
const TouchEventType = "touchstart";

const handToNote: {[key in Hands]: string} = { "LH": "C4", "RH": "G4", "AH": "C4" };

function xyProportions(x: number = 0, y: number = 0): {x: number, y: number} {
  const width = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;
  const height = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;
  return {x: x / width, y: y / height};
}

function convertEventToHands(evt: Event): Hands[] {
  let hands: Hands[] = ["AH"];
  if(evt.type == KeyEventType) {
    let k: KeyboardEvent = evt as KeyboardEvent;
    if(RHKeys.includes(k.key)) hands.push("RH");
    if(LHKeys.includes(k.key)) hands.push("LH");
  }
  else if (evt.type == TouchEventType) {
    let t: Touch = (evt as TouchEvent).touches.item(0);
    if(xyProportions(t.pageX).x > 0.5) hands.push("RH");
    else hands.push("LH");
  }
  return hands;
}

function registerInputEvents(func: EventHandler): EventCanceller {
  document.addEventListener(KeyEventType, func);
  document.addEventListener(TouchEventType, func);
  return () => {
    document.removeEventListener(KeyEventType, func);
    document.removeEventListener(TouchEventType, func);
  }
}

function tempoToBeatLength(tempo): number { return (60 / tempo) * 1000 }
function momentToMs(moment: number, tempo: number): number { return tempoToBeatLength(tempo) * moment * 4 }

class Metronome {
  synth: Tone.MembraneSynth;
  times: number[];
  constructor(bars: number, beatsPerBar: number, tempo: number) {
    this.synth = new Tone.MembraneSynth().toDestination();
    const numberOfBeats = Math.ceil(bars) * beatsPerBar;
    const beatLength = tempoToBeatLength(tempo);
    this.times = [...Array(numberOfBeats).keys()].map((unused: any, index: number) => index * beatLength);
  }

  start() {
    const now = Tone.context.currentTime;
    this.times.forEach(
      (time) => {
        this.synth.triggerAttackRelease("C3", "32n", now + (time / 1000));
      }
    )
  }

  stop() {
    Tone.Transport.cancel();
  }
}

class Score {
  numerator: number = 0;
  denominator: number = 0;
  element: HTMLDivElement;
  window: number;

  constructor(element: HTMLDivElement, window: number) {
    (this.element = element).innerHTML = `Score:       `;
    console.log(this.element);
    this.window = window;
  }

  updateScore() {
    console.log(`N: ${this.numerator} D: ${this.denominator}`);
    if(this.denominator != 0) {
      const percentage = this.numerator / this.denominator;
      this.element.innerHTML = `Score: ${percentage.toFixed(2)}%`
    }
  }
  onRedundant() {
    console.log(`onRedundant`);
    this.numerator += PlayedRestScore;
    this.denominator += 1;
    this.updateScore();
  }

  onMiss() {
    console.log(`onMiss`);
    this.numerator += MissedNoteScore;
    this.denominator += 1;
    this.updateScore();
  }

  onHit(pressTime: number, goalTime: number): number {
    const diff = goalTime - pressTime; // Late is negative
    const ratio = 1 - diff / this.window; // Late is greater than 1

    // For the average score, we don't care about early/late - just the absolute value scaled with difficulty.
    const norm = 1 - Math.abs(ratio - 1);
    this.numerator += 100 * Math.pow(norm, DifficultyExponent);
    this.denominator += 1;
    this.updateScore();

    // For the immediate score, we care about early, late, and don't scale for difficulty as this can be set by the configured thresholds 'EarlyPercantage' and 'LatePercentage'
    // console.log(`diff: ${diff}, perc: ${ratio * 100}, norm: ${norm}, score: ${100 * Math.pow(norm, DifficultyExponent)}`);
    return ratio * 100;
  }

  static getColourForScore(score: number): string {
    if      ( score < EarlyPercentage )     { return "red"; }
    else if ( EarlyPercentage <= score && 
              score < LatePercentage      ) { return "darkGreen"; }
    else                                    { return "blue"; }
  }

}

function setColour(el: SVGElement, colour: string)  { el.setAttribute("fill", colour); }
function enlargeCount(c: Count) {
  c.text.setAttribute("font-weight", "bold");
  c.text.setAttribute("font-size", BigCountSize.toString());
}

function restoreCount(c: Count) {
  c.text.setAttribute("font-weight", "normal");
  c.text.setAttribute("font-size", NormalCountSize.toString());
}

class AnimationContext {
  startTime: number;
  handsPressed: Hands[];
  pressTime: number | null = null;
  timers: TimerCollection;
  inputCanceller: EventCanceller;
  
  constructor(startTime: number, timers: TimerCollection, inputCanceller: EventCanceller) {
    this.startTime = startTime;
    this.timers = timers;
    this.inputCanceller = inputCanceller;
    this.handsPressed = [];
  }

  advance() { 
    this.handsPressed = [];
    this.pressTime = null;
  }

  addHand(hand: Hands, time: number) { 
    this.handsPressed.push(hand);
    if(this.pressTime != null) this.pressTime = time;
  }

  cleanup() {
    cancelTimers(this.timers, false);
    this.inputCanceller();
  }
}

// TODO Add initialisation to step container

interface TimingInfo {
  tempo: number,
  beatsPerBar: number
}

class Animator {
  context: AnimationContext;
  score: Score;
  scoreElement: HTMLDivElement;
  steps: StepContainer;
  tempo: number;
  beatsPerBar: number;
  callbacks: TimerCallbacks;
  metronome: Metronome;
  synth: Tone.PolySynth;
  constructor(steps: StepContainer, scoreElement: HTMLDivElement, timing: TimingInfo) {
    this.steps = steps;
    this.callbacks = {
      onPrimaryChange: this.nextStep.bind(this),
      onMidpointChange: this.transition.bind(this),
      onFinish: this.stop.bind(this)
    }
    this.steps.steps.forEach( (s: Step) =>
      setColour(s.count.text,
                s.items.some(isPlayed) ? "darkGrey" : "lightGrey") );
    this.scoreElement = scoreElement;
    this.tempo = timing.tempo;
    this.beatsPerBar = timing.beatsPerBar;
    const lastTimestamp = this.steps.steps[this.steps.steps.length - 1].moment;
    this.metronome = new Metronome(lastTimestamp, this.beatsPerBar, this.tempo);
    Tone.getTransport().bpm.value = this.tempo;
    this.synth = new Tone.PolySynth().toDestination();
  
  }

  start(evt: Event) {
    const beatLengthMs = tempoToBeatLength(this.tempo);
    const stepTimes = this.steps.stepTimes(beatLengthMs, this.beatsPerBar);
    this.context = new AnimationContext(evt.timeStamp,
                                        setTimers(stepTimes, this.callbacks, beatLengthMs),
                                        registerInputEvents(this.input.bind(this)));
    this.score = new Score(this.scoreElement, beatLengthMs / 4);
    this.steps.reset();
    this.steps.applyToNotes( (i) => setColour(i.grob, "black") );
    this.steps.applyToCounts( (c) => restoreCount(c) );
    this.metronome.start();
    enlargeCount(this.steps.currentCount);
   
  }

  nextStep() {
    restoreCount(this.steps.previousCount!);
    enlargeCount(this.steps.currentCount);
  }

  transition() {
    this.steps.currentNotes.filter((i) => i.type == "note").forEach((i) => {
      const noneInput = this.context.handsPressed.length == 0;
      if(noneInput || !this.context.handsPressed.includes(i.origin)) {
        this.score.onMiss();
        setColour(i.grob, "lightGrey");
      }
    });
    this.context.advance();
    this.steps.advanceTarget();
    if(this.steps.target == this.steps.steps.length - 1) console.log("EQ");

  }

  stop() {
    this.steps.currentNotes.filter((i) => i.type == "note").forEach((i) => {
      const noneInput = this.context.handsPressed.length == 0;
      if(noneInput || !this.context.handsPressed.includes(i.origin)) {
        this.score.onMiss();
        setColour(i.grob, "lightGrey");
      }
    });
    restoreCount(this.steps.currentCount);
    this.context.cleanup();
    this.metronome.stop();
  }

  input(evt: Event) {
    const hands = convertEventToHands(evt);
    // This line needs work. Won't trigger a sound on anything but defined RH LH keys. This is due to the input system generating "AH" for all notes
    hands.filter((h) => h != "AH")
      .forEach( (h) => {
        const note = this.steps.currentNotes.filter(i => i.type == "note" && i.origin == h);
        let duration = note.length == 0 ? "16n" : (momentToMs(note[0].duration, this.tempo) / 1000) * 0.5;
        this.synth.triggerAttackRelease(handToNote[h], duration, Tone.context.currentTime)
      });

    const activeNotes = this.steps.currentNotes;
    if(activeNotes.length == 0) this.score.onRedundant();
    activeNotes.forEach( (i) => {
        if(hands.includes(i.origin)) {
          if(i.type == "note")
           {
             //hit
             const goalTime = tempoToBeatLength(this.tempo) * this.beatsPerBar * this.steps.currentGoalMoment;
             const pressTime = evt.timeStamp - this.context.startTime;
             const score = this.score.onHit(pressTime, goalTime);
             setColour(i.grob, Score.getColourForScore(score));
           }
           else if(i.type) {
             //redundant
             this.score.onRedundant();
           }
        }
      }
    );
    
    hands.forEach(this.context.addHand.bind(this.context));
  }
}

class Scene {
  parent: HTMLDivElement;
  animator: Animator;


  constructor(_parent: HTMLDivElement, musicGraphics: SVGElement, lilypondEvents: string, timing: TimingInfo) {
    this.parent = _parent;
    const data = parseData(musicGraphics, lilypondEvents, ["LH", "RH", "AH"]);
    let score = document.createElement("div");
    
    this.animator = new Animator(data.container, score, timing);
    let btn = document.createElement("button");
    btn.innerHTML = "Start"
    btn.onclick = this.animator.start.bind(this.animator);
    
    //this.parent.appendChild(btn);
    this.parent.appendChild(score);
    this.parent.appendChild(document.createElement("br"));
    this.parent.appendChild(data.sortedSVG);
  }

  start() {
    this.animator.start.bind(this.animator)();
  }

}

// TODO Handle 404
async function loadLilypondSVG(path: string): Promise<SVGElement> {
  return fetch(path)
    .then(r => {
      if(r.ok) return r.text()
      else return Promise.reject(`Error ${r.status} when fetching "${path}"`)
    })
    .then(text => {
      let containerDiv = document.createElement("div");
      containerDiv.innerHTML = text;
      let tsvg = containerDiv.querySelector("svg") as SVGElement;
      tsvg.setAttribute("id", LilypondSVGId);
      return tsvg;
    })
}

// TODO Handle 404
async function loadLilypondEvents(path: string): Promise<string> {
  return fetch(path)
  .then(r => {
    if(r.ok) return r.text()
    else return Promise.reject(`Error ${r.status} when fetching "${path}"`)
  })
}

// TODO Add more lifecycle methods
class RhythmGame extends HTMLElement {
  //scene: Scene;
  animator: Animator;
  

  constructor() {
    super();
    this.attachShadow({mode: 'open'});
  }

  async getResources(svg: string, events: string): Promise<{svg: SVGElement, events: string}> {
    return Promise.all([loadLilypondSVG(svg), loadLilypondEvents(events)])
      .then((values) => ({svg: values[0], events: values[1]}));
  }

  async connectedCallback() {
    let beatsPerBar = 4;
    let tempo = 60;

    if(this.hasAttribute("data-beatsperbar")) {
      beatsPerBar = parseInt(this.getAttribute("data-beatsperbar"));
    }

    if(this.hasAttribute("data-tempo")) {
      tempo = parseFloat(this.getAttribute("data-tempo"));
    }

    if(this.hasAttribute("data-name")) {
      const prefix = this.getAttribute("data-name");
      const resources = await this.getResources(`${prefix}.svg`, `${prefix}.notes`);
      const data = parseData(resources.svg, resources.events, ["LH", "RH", "AH"]);
      //const wrapper = this.shadowRoot.querySelector("div#wrapper") as HTMLDivElement;
      // this.scene = new Scene(wrapper, 
      //                         resources.svg, 
      //                         resources.events, 
      //                         { beatsPerBar: beatsPerBar, tempo: tempo });
      //this.shadowRoot.append(wrapper);
      const timing = { beatsPerBar: beatsPerBar, tempo: tempo };

      const template = document.createElement("template");
      template.innerHTML = `
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bulma@0.9.3/css/bulma.min.css">
        <div class="container">
          <div class="box">
            <button class="button is-success" id="start">Start</button>
            <div id="score">Score: </div>
          </div></br>
          <div id="svg" class="container box is-outlined"></div>
        </div>

      `
      this.shadowRoot.appendChild(template.content.cloneNode(true));
      
      const QS = (selector: string) => this.shadowRoot.querySelector(selector); 

      const SVGWrapper = QS("div#svg") as HTMLDivElement;
      SVGWrapper.appendChild(data.sortedSVG);
      const scoreWrapper = QS("div#score") as HTMLDivElement;
      this.animator = new Animator(data.container, scoreWrapper, timing);
      const button = QS("button#start") as HTMLButtonElement;
      button.innerHTML = "Start"
      button.onclick = this.animator.start.bind(this.animator);
      
    }
    
  }
}

window.customElements.define("rhythm-game", RhythmGame);
