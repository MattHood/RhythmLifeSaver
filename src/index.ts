import {readFileSync} from 'fs'
import { last, toInteger } from 'lodash';
import * as Tone from 'tone'
import { Effect } from 'tone/build/esm/effect/Effect';

const SVGNamespace = "http://www.w3.org/2000/svg";
const LilypondSVGScaleFactor = 8;
const LilypondSVGId = "lilysvg";
const DifficultyExponent = 0.25;
const PlayedRestScore = 50;
const MissedNoteScore = 50;
const BigCountSize = 3.2;
const NormalCountSize = 2.4696;

const curry = ( fn: (i: number) => void, index: number ) => ( () => fn(index) );

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

function positionScore2(el: Element, width: number): number {
  const w = width;
  const x = getXTransform(el);
  const y = getYTransform(el);
  return y*w + x;
}

function sortByPosition(doc: SVGElement):void {
  let gEls = filterNodeList<SVGGElement>(doc, "g");
  const width = parseFloat(doc.getAttribute("width"));
  gEls.sort( function(g1, g2) {
    let a = positionScore2(<Element>g1.firstElementChild, width);
    let b = positionScore2(<Element>g2.firstElementChild, width);
    return a - b;
  });
  gEls.forEach( (el) => doc.appendChild(el) );
}

type CountElement = SVGTextElement;
type NoteheadElement = SVGPathElement;
type RestElement = SVGPathElement;

interface StaffEvent 
{
  id: "NoteHead" | "Rest",
  element: SVGPathElement;
}

interface Count {
  display: string;
  beat: number;
  text: CountElement;
  note: NoteheadElement | RestElement | null;
  isPlayed: boolean;
  hasNote: boolean;
}
type PartialCountFromLilypondEvents = Omit<Count, "text" | "note" | "isPlayed" | "hasNote">
type PartialCountFromDom = Omit<Count, "display" | "beat">


interface Moment {
  moment: number;
};

interface LilypondEvent {
  moment: number,
  origin: string,
  type: string
}

interface Count2 {
  text: CountElement
}

function isHands(input: string): input is Hands {
  return ["RH", "LH", "AH"].includes(input);
}

interface Item {
  type: "note" | "rest",
  origin: Hands,
  grob: SVGPathElement
}


interface Step {
  moment: number,
  count: Count2,
  items: Item[]
}

function parseLilypondEvents2(allEvents: string): LilypondEvent[] {
  const parse = (t: string[]): LilypondEvent => 
    ({moment: parseFloat(t[0]),
      origin: t[1],
      type: t[2]});
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
function getCounts(events: LilypondEvent[], parent: SVGElement): (Count2 & Moment)[] {
  const countEvents = events.filter( (evt) => evt.origin == "Counts");
  const countElements = filterNodeList<CountElement>(parent, "g.LyricText > text");
  console.assert(countEvents.length == countElements.length);
  return countEvents.map( (evt, i) => ({text: countElements[i], moment: evt.moment}));
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
      grob: itemElements[i]})
  console.assert(itemEvents.length == itemElements.length);
    return itemEvents.map( transformer );
}


function makeSteps(counts: (Count2 & Moment)[], ...items: (Item & Moment)[][]): Step[] {
  return counts.map( (c) => {
    //const finder: (im: (Item & Moment)[]) => (Item & Moment) = (seq) => seq.find((item) => item.moment == c.moment);
    //const reducer: (im: Item & Moment) => Item = (im) => ({  type: im.type, origin: im.origin, grob: im.grob });
    function finder (seq: (Item & Moment)[]): (Item & Moment) { 
      const ret = seq.find((item) => item.moment == c.moment)
      return ret;
    }
    function reducer (im: Item & Moment): Item {
      return {  type: im.type, origin: im.origin, grob: im.grob };
    };
    const filtered = items.filter((arr) => arr.length != 0);
    const found = filtered.map(finder).filter((i) => i != undefined);
    return {
      moment: c.moment,
      count: {text: c.text},
      items: found.length == 0 ? [] : found.map(reducer)
    };
  });
}

function isPlayed(item: Item): boolean {
  return item.type == "note";
}

function isPlaceholder(step: Step): boolean {
  return step.items.length == 0;
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

  get currentCount(): Count2 {
    return this.steps[this.target].count;
  }

  get previousCount(): Count2 | null {
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

  applyToCounts(func: (c: Count2) => void) {
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
  const parsedEvents = parseLilypondEvents2(events);
  removeEmptyGTags(svg);
  sortByPosition(svg);
  sizeSVGByContent(svg);
  
  const items = handIDs.map( (id) => getItemsWithId(parsedEvents, svg, id) );
  const counts = getCounts(parsedEvents, svg);
  const steps = makeSteps(counts, ...items);

  return { container: new StepContainer(steps), sortedSVG: svg };
}


function parseLilypondEvents(allEvents: string): PartialCountFromLilypondEvents[] {
  let tokenized = allEvents.split('\n').map((line) => line.split('\t'));
  let textEvents = tokenized.filter((line) => line[1] == "lyric");
  return textEvents.map( (e) => ({ display: e[2], beat: parseFloat(e[0])}) );
}

function truncateToOneSequence(textEvents: PartialCountFromLilypondEvents[]): PartialCountFromLilypondEvents[] {
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

// This function relies on the parent being a <g> tag.
// TODO: Move classes to the actual elements?
function isRest(el: NoteheadElement | RestElement): boolean {
  const parentG = el.parentElement;
  return parentG.classList.contains("Rest");
}

function hasNote(el: CountElement): boolean {
  const parentG = el.parentElement;
  return !parentG.hasAttribute("data-placeholder");
}

// This function relies on the fact that elements have already been properly sorted by flow position
// TODO: Move sorting here
// This a mess :(
function getDomCounts(parent: SVGElement): PartialCountFromDom[] {
  const textElements = filterNodeList<CountElement>(parent, "g.LyricText > text");
  const noteElements = filterNodeList<NoteheadElement | RestElement>(parent, "g.NoteHead > path, g.Rest > path");
  let offset = 0;
  return textElements.map((d, i) => {
    let count: PartialCountFromDom;
    if(hasNote(d)) {
      count = {
        text: d,
        note: noteElements[i - offset],
        hasNote: true,
        isPlayed: !isRest(noteElements[i - offset])
      }
    }
    else {
      count = {
        text: d,
        note: null,
        hasNote: false,
        isPlayed: false
      }
      offset += 1;
    }
    return count;
  });
}





function zipLilypondEventsAndDom(e: PartialCountFromLilypondEvents[], d: PartialCountFromDom[]): Count[] {
  if(e.length != d.length) {
    console.error("Lengths of Lilypond text events and corresponding DOM elements are mismatched.");
  }
  return e.map( (evt, index) => ({...evt, ...d[index]}));
}

class RenderedMusic {
    musicSVG: SVGElement;
    counts: Count[];

    noteObjects: Note[];
    constructor(_musicSVG: SVGElement, _lilypondEvents: string) {
      this.musicSVG = _musicSVG;
      removeEmptyGTags(this.musicSVG);
      sortByPosition(this.musicSVG);
      sizeSVGByContent(this.musicSVG);
      
      const lilyEvents = truncateToOneSequence(parseLilypondEvents(_lilypondEvents));
      const domCounts = getDomCounts(this.musicSVG);
      this.counts = zipLilypondEventsAndDom(lilyEvents, domCounts);

      // console.log(this.counts);
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
    const now = Tone.now();
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
  numerator: number;
  denominator: number;
  element: HTMLDivElement;
  window: number;

  constructor(element: HTMLDivElement, window: number) {
    (this.element = element).innerHTML = '';
    this.window = window;
  }

  updateScore() {
    if(this.numerator && this.denominator) {
      const percentage = (this.numerator / this.denominator) * 100;
      this.element.innerHTML = `Score: ${percentage.toFixed(2)}%`
    }
  }
  onRedundant() {
    this.numerator += PlayedRestScore;
    this.denominator += 1;
    this.updateScore();
  }

  onMiss() {
    this.numerator += MissedNoteScore;
    this.denominator += 1;
    this.updateScore();
  }

  onHit(pressTime: number, goalTime: number): number {
    const diff = pressTime - goalTime;
    const perc = 100 * diff / this.window;
    this.numerator += Math.abs(perc);
    this.updateScore();
    console.log(`diff: ${diff}, perc: ${perc}`);
    return perc;
  }

  static getColourForScore(score: number): string {
    if      ( score < 85 )                  { return "red"; }
    else if ( 85 <= score && score < 115 )  { return "darkGreen"; }
    else                                    { return "blue"; }
  }

}



function makeBoldWeight(el: SVGTextElement)         { el.setAttribute("font-weight", "bold"); }
function makeNormalWeight(el: SVGTextElement)       { el.setAttribute("font-weight", "normal"); }
function makeCountBig(el: SVGTextElement)           { el.setAttribute("font-size", BigCountSize.toString()); }
function makeCountNormal(el: SVGTextElement)        { el.setAttribute("font-size", NormalCountSize.toString()); }
function setColour(el: SVGElement, colour: string)  { el.setAttribute("fill", colour); }
function enlargeCount(c: Count2) {
  c.text.setAttribute("font-weight", "bold");
  c.text.setAttribute("font-size", BigCountSize.toString());
}

function restoreCount(c: Count2) {
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
  beatsPerBar
}

class Animator2 {
  context: AnimationContext;
  score: Score;
  scoreElement: HTMLDivElement;
  steps: StepContainer;
  tempo: number;
  beatsPerBar: number;
  callbacks: TimerCallbacks;
  metronome: Metronome;
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
    this.steps.applyToCounts( (c) => makeNormalWeight(c.text) );
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

    this.steps.advanceTarget();

  }

  stop() {
    this.context.cleanup();
    this.metronome.stop();
  }

  input(evt: Event) {
    const hands = convertEventToHands(evt);
    const activeNotes = this.steps.currentNotes;
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
           else {
             //redundant
             this.score.onRedundant();
           }
        }
      }
    );
    
    hands.forEach(this.context.addHand.bind(this.context));
  }
}




class Animator {
  counts: Count[];
  noteTimes: number[];
  noteTimers: Timer[];
  transitionTimes: number[];
  transitionTimers: Timer[];
  metronome: Metronome;
  goalNote: number;
  startTime: number;
  inProgress: boolean = false;
  sumScore: number | null = null;
  elapsedPlayableNotes: number;
  scoreElement: HTMLDivElement;
  lastNoteWasAttempted: boolean = false;
  timingWindow: number;
  eventLoopTimer: Timer;
  onKeyDown: (evt: Event) => void;

  constructor(_counts: Count[], bpm: number, _scoreElement: HTMLDivElement) {
    this.counts = _counts;
    const beatLength = (60 / bpm) * 1000;
    this.scoreElement = _scoreElement;

    this.noteTimes = this.counts
      .map( (c: Count) => c.beat )
      .map( (t: number) => 4 * t * beatLength);
    this.transitionTimes = this.counts
      .slice(0, -1)
      .map( (c: Count, i: number) => (c.beat + this.counts[i + 1].beat) / 2 )
      .map( (t: number) => 4 * t * beatLength);
    const finalRightWindow = 
      this.noteTimes[this.noteTimes.length - 1] - 
      this.transitionTimes[this.transitionTimes.length - 1];
    this.transitionTimes[this.counts.length - 1] = this.noteTimes[this.noteTimes.length - 1] + finalRightWindow;

    // Set colour of count based on whether the player should play the note. Faint for a rest, dark for a playable note.
    this.counts.forEach( c => setColour(c.text, c.isPlayed ? "dark" : "lightGrey") );

    const lastBeat = this.counts[this.counts.length - 1].beat;
    this.metronome = new Metronome(lastBeat, 4, bpm);
    this.timingWindow = beatLength / 4; // Set timing window to semiquaver.
    this.onKeyDown = this.keyHandler.bind(this); // So the event listeners have a consistent reference.
  }

  start(event: Event) {
    
    if(this.inProgress) {
      this.stop();
    }

    this.goalNote = 0;
    this.sumScore = 0;
    this.scoreElement.innerHTML = "";

    this.counts
      .filter( c => c.hasNote)
      .forEach( c => setColour(c.note, "black") )
    this.counts.forEach( c => makeNormalWeight(c.text));
    
    this.startTime = event.timeStamp;
    this.elapsedPlayableNotes = 1;

    
    this.noteTimers = createTimersFromTimes(this.noteTimes, this.revealCount.bind(this));
    this.transitionTimers = createTimersFromTimes(this.transitionTimes, this.nextGoal.bind(this));
    this.metronome.start();

    document.addEventListener("keypress", this.onKeyDown);
    document.addEventListener("touchstart", this.onKeyDown);

    this.inProgress = true;
  }

  stop() {
    document.removeEventListener("keypress", this.onKeyDown);
    document.removeEventListener("touchstart", this.onKeyDown);
    this.metronome.stop();
    
    this.noteTimers.forEach( (t) => window.clearTimeout(t) );
    this.transitionTimers.forEach( (t) => window.clearTimeout(t) );
    this.inProgress = false;
  }

  revealCount(i: number) {
    makeBoldWeight(this.counts[i].text);
    makeCountBig(this.counts[i].text);

    if(i > 0) makeCountNormal(this.counts[i-1].text); 
  }

  indicateMissed(el: NoteheadElement) {
    setColour(el, "lightGrey");
  }

  nextGoal(i: number) {
    if(this.counts[this.goalNote].isPlayed) {
      this.elapsedPlayableNotes += 1;
    }

    const missedNote: boolean = !this.lastNoteWasAttempted && this.counts[this.goalNote].isPlayed;
    if(missedNote) {
      this.updateOverallScore(MissedNoteScore);
      this.indicateMissed(this.counts[this.goalNote].note);
    }
    this.lastNoteWasAttempted = false;
    if(i + 1 < this.counts.length) {
      this.goalNote = i + 1;
    }
    else {
      makeCountNormal(this.counts[i].text);
      this.stop();
    }
  }

  computeScore(pressTime) {
    const timeSinceStart = pressTime - this.startTime;
    //const window = this.transitionTimes[this.goalNote];
    const window = this.timingWindow * 3;
    const worstPossibleScore = this.goalNote == 0 ? window : window / 2;
    const rawScore = this.noteTimes[this.goalNote] - timeSinceStart - 150;
    const score = Math.pow(( 1 - (rawScore / worstPossibleScore)), DifficultyExponent);
    // console.log('/------------------')
    // console.log(`| TSS: ${timeSinceStart} PT: ${pressTime} ST: ${this.startTime}`)
    // console.log(`| GT: ${this.noteTimes[this.goalNote]}`);
    // console.log('\\------------------')

    return score * 100;
  }

  setNoteColourToScore(score) {
    let colour;
    if      ( score < 85 )                  { colour = "red"; }
    else if ( 85 <= score && score < 115 )  { colour = "darkGreen" }
    else if ( 115 <= score )                { colour = "blue" }
    setColour(this.counts[this.goalNote].note, colour);
  }

  updateOverallScore(newScore: number) {
    const absoluteScore = 100 - Math.abs(newScore - 100);
    
    this.sumScore += absoluteScore;
    const avg = this.sumScore / (this.elapsedPlayableNotes + 1);
    this.scoreElement.innerHTML = `${avg.toFixed(2)}%`
  }

  keyHandler(evt: Event) {
    if(this.counts[this.goalNote].isPlayed) {
      const score = this.computeScore(evt.timeStamp);
      this.updateOverallScore(score);
      this.setNoteColourToScore(score);
      console.log(`Score: ${score.toFixed(2)}%`);
      this.lastNoteWasAttempted = true;
    }
    else {
      // Add an extra one for this penalty
      this.elapsedPlayableNotes += 1;
      this.updateOverallScore(PlayedRestScore);
    }
  }

}

class Scene {
    parent: HTMLDivElement;
    music: RenderedMusic;
    animator: Animator;


    constructor(_parent: HTMLDivElement, musicGraphics: SVGElement, lilypondEvents: string) {
      this.parent = _parent;
      this.music = new RenderedMusic(musicGraphics, lilypondEvents);
      let score = document.createElement("div");
      
      this.animator = new Animator(this.music.counts, 50, score);
      let btn = document.createElement("button");
      btn.innerHTML = "Start"
      btn.onclick = this.animator.start.bind(this.animator);
      
      this.parent.appendChild(btn);
      this.parent.appendChild(score);
      this.parent.appendChild(document.createElement("br"));
      this.parent.appendChild(this.music.content);
    }

}

class Scene2 {
  parent: HTMLDivElement;
  animator: Animator2;


  constructor(_parent: HTMLDivElement, musicGraphics: SVGElement, lilypondEvents: string, timing: TimingInfo) {
    this.parent = _parent;
    const data = parseData(musicGraphics, lilypondEvents, ["LH", "RH", "AH"]);
    let score = document.createElement("div");
    
    this.animator = new Animator2(data.container, score, timing);
    let btn = document.createElement("button");
    btn.innerHTML = "Start"
    btn.onclick = this.animator.start.bind(this.animator);
    
    this.parent.appendChild(btn);
    this.parent.appendChild(score);
    this.parent.appendChild(document.createElement("br"));
    this.parent.appendChild(data.sortedSVG);
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
  scene: Scene2;

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
      const wrapper = document.createElement("div");
      this.scene = new Scene2(wrapper, 
                              resources.svg, 
                              resources.events, 
                              { beatsPerBar: beatsPerBar, tempo: tempo });
      this.shadowRoot.append(wrapper);
    }
    
  }
}

window.customElements.define("rhythm-game", RhythmGame);

//const parent = <HTMLDivElement>document.querySelector("div#music-canvas");
//const scene = new Scene(parent);
