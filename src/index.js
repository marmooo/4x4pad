import { Midy } from "https://cdn.jsdelivr.net/gh/marmooo/midy@0.4.2/dist/midy.min.js";

loadConfig();

function loadConfig() {
  if (localStorage.getItem("darkMode") == 1) {
    document.documentElement.setAttribute("data-bs-theme", "dark");
  }
}

function toggleDarkMode() {
  if (localStorage.getItem("darkMode") == 1) {
    localStorage.setItem("darkMode", 0);
    document.documentElement.setAttribute("data-bs-theme", "light");
  } else {
    localStorage.setItem("darkMode", 1);
    document.documentElement.setAttribute("data-bs-theme", "dark");
  }
}

function toggleHandMode(event) {
  panel.classList.toggle("single");
  if (handMode === 1) {
    handMode = 2;
    event.target.textContent = "2⃣";
  } else {
    handMode = 1;
    event.target.textContent = "1⃣";
  }
}

function changeLang() {
  const langObj = document.getElementById("lang");
  const lang = langObj.options[langObj.selectedIndex].value;
  location.href = `/4x4pad/${lang}/`;
}

async function setProgramChange(event) {
  const target = event.target;
  const host = target.getRootNode().host;
  const programNumber = target.selectedIndex;
  const channelNumber = (host.id === "instrument-first") ? 0 : 1;
  const channel = midy.channels[channelNumber];
  const bankNumber = channel.isDrum ? 128 : channel.bankLSB;
  const index = midy.soundFontTable[programNumber][bankNumber];
  if (index === undefined) {
    const program = programNumber.toString().padStart(3, "0");
    const baseName = bankNumber === 128 ? "128" : program;
    const path = `${soundFontURL}/${baseName}.sf3`;
    await midy.loadSoundFont(path);
  }
  midy.setProgramChange(channelNumber, programNumber);
}

function getGlobalCSS() {
  let cssText = "";
  for (const stylesheet of document.styleSheets) {
    for (const rule of stylesheet.cssRules) {
      cssText += rule.cssText;
    }
  }
  const css = new CSSStyleSheet();
  css.replaceSync(cssText);
  return css;
}

function initMIDIInstrumentElement() {
  class MIDIInstrument extends HTMLElement {
    constructor() {
      super();
      const template = document.getElementById("midi-instrument");
      const shadow = this.attachShadow({ mode: "open" });
      shadow.adoptedStyleSheets = [globalCSS];
      shadow.appendChild(template.content.cloneNode(true));

      const select = shadow.querySelector("select");
      select.onchange = setProgramChange;
    }
  }
  customElements.define("midi-instrument", MIDIInstrument);
}

function initMIDIDrumElement() {
  class MIDIDrum extends HTMLElement {
    constructor() {
      super();
      const template = document.getElementById("midi-drum");
      const shadow = this.attachShadow({ mode: "open" });
      shadow.adoptedStyleSheets = [globalCSS];
      shadow.appendChild(template.content.cloneNode(true));

      const select = shadow.querySelector("select");
      select.onchange = setProgramChange;
    }
  }
  customElements.define("midi-drum", MIDIDrum);
}

const globalCSS = getGlobalCSS();
initMIDIInstrumentElement();
initMIDIDrumElement();

function setKeyColor(key, velocity, isActive) {
  if (isActive) {
    const lightness = 30 + (velocity / 127) * 40;
    const color = `hsl(200, 80%, ${lightness}%)`;
    key.style.setProperty("background", color);
  } else {
    key.style.removeProperty("background");
  }
}

function noteOn(channelNumber, target, pressure, pressed) {
  const noteNumber = Number(target.dataset.index);
  if (pressed[noteNumber]) return;
  pressed[noteNumber] = true;
  const velocity = Math.ceil(pressure * 127) || 64;
  const padView = target.parentNode.querySelector(".pad-view");
  setKeyColor(padView, velocity, true);
  target.setAttribute("aria-pressed", "true");
  midy.noteOn(channelNumber, noteNumber, velocity);
  // midy.setPolyphonicKeyPressure(channelNumber, noteNumber, velocity);
}

function noteOff(channelNumber, target, pressure, pressed) {
  const noteNumber = Number(target.dataset.index);
  if (!pressed[noteNumber]) return;
  pressed[noteNumber] = false;
  const velocity = Math.ceil(pressure * 127) || 64;
  const padView = target.parentNode.querySelector(".pad-view");
  setKeyColor(padView, 0, false);
  target.setAttribute("aria-pressed", "false");
  midy.noteOff(channelNumber, noteNumber, velocity);
}

function handleMove(channelNumber, event, pressed) {
  if (event.buttons === 0) return;
  if (!pointerMap.has(event.pointerId)) {
    pointerMap.set(event.pointerId, new Set());
  }
  const activeHits = pointerMap.get(event.pointerId);
  const elements = document.elementsFromPoint(event.clientX, event.clientY);
  const currentHits = new Set();
  for (let i = 0; i < elements.length; i++) {
    if (elements[i].classList.contains("pad-hit")) {
      currentHits.add(elements[i]);
    }
  }
  for (const element of currentHits) {
    if (!activeHits.has(element)) {
      noteOn(channelNumber, element, event.pressure, pressed);
    }
  }
  for (const element of activeHits) {
    if (!currentHits.has(element)) {
      noteOff(channelNumber, element, event.pressure, pressed);
    }
  }
  pointerMap.set(event.pointerId, currentHits);
}

function isInsidePanel(event) {
  const rect = panel.getBoundingClientRect();
  return (
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom
  );
}

function setKeyEvents(channelNumber, key) {
  const pressed = new Array(128).fill(false);
  key.addEventListener("pointerdown", (event) => {
    if (!isInsidePanel(event)) return;
    key.setPointerCapture(event.pointerId);
    handleMove(channelNumber, event, pressed);
  });
  key.addEventListener("pointermove", (event) => {
    if (isInsidePanel(event)) {
      handleMove(channelNumber, event, pressed);
    } else {
      releasePointer(channelNumber, event, pressed);
    }
  });
  function releasePointer(channelNumber, event, pressed) {
    const activeHits = pointerMap.get(event.pointerId);
    if (activeHits) {
      for (const element of activeHits) {
        noteOff(channelNumber, element, event.pressure, pressed);
      }
      activeHits.clear();
      pointerMap.delete(event.pointerId);
    }
    try {
      key.releasePointerCapture(event.pointerId);
    } catch { /* skip */ }
  }
  key.addEventListener("pointerup", (event) => {
    releasePointer(channelNumber, event, pressed);
  });
  key.addEventListener("pointercancel", (event) => {
    releasePointer(channelNumber, event, pressed);
  });
  panel.addEventListener("pointerleave", () => {
    if (midy.isPlaying) return;
    midy.stopNotes(0, true, midy.audioContext.currentTime);
    pressed.fill(false);
    pointerMap.forEach((activeHits) => {
      activeHits.clear();
    });
    pointerMap.clear();
    document.querySelectorAll(".pad-view").forEach((view) => {
      view.style.removeProperty("background");
    });
  });
}

function getTranslatedLabel(engLabel) {
  if (engLabel === "⬇" || engLabel === "⬆") return engLabel;
  const map = noteMap[htmlLang];
  return map[engLabel[0]] + engLabel.slice(1);
}

function setChangeOctaveEvents(channelNumber, octaveButton) {
  octaveButton.addEventListener("pointerdown", () => {
    const direction = (octaveButton.name === "⬆") ? 1 : -1;
    const nextOctave = currOctaves[channelNumber] + direction;
    if (nextOctave <= 0 || 11 <= nextOctave) return;
    currOctaves[channelNumber] = nextOctave;
    const buttons = allKeys[channelNumber];
    for (let i = 0; i < buttons.length; i++) {
      const button = buttons[i];
      const padView = button.querySelector(".pad-view");
      const padHit = button.querySelector(".pad-hit");
      const noteNumber = Number(padHit.dataset.index);
      const { name, octave } = parseNote(padView.name);
      const newNameEn = `${name}${octave + direction}`;
      padView.name = newNameEn;
      padView.textContent = getTranslatedLabel(newNameEn);
      padHit.dataset.index = (noteNumber + direction * 12).toString();
    }
  });
}

function parseNote(note) {
  const match = note.match(/^([A-Ga-g][#b]?)(-?\d+)$/);
  if (!match) throw new Error(`Invalid note: ${note}`);
  const [, name, octave] = match;
  return {
    name: name.toUpperCase(),
    octave: parseInt(octave, 10),
  };
}

function toNoteNumber(note) {
  const regex = /^([A-Ga-g])([#b]?)(\d+)$/;
  const match = note.match(regex);
  if (!match) return -1;
  let [, pitch, accidental, octave] = match;
  pitch = pitch.toUpperCase();
  octave = parseInt(octave);
  const pitchMap = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  let noteNumber = pitchMap[pitch];
  if (accidental === "#") noteNumber += 1;
  if (accidental === "b") noteNumber -= 1;
  noteNumber += (octave + 1) * 12;
  return noteNumber;
}

function initButtons() {
  const allKeys = [[], []];
  document.querySelectorAll(".group").forEach((group, channelNumber) => {
    const octaveButtons = [];
    for (let i = 0; i < baseLabels.length; i++) {
      const label = baseLabels[i];
      const noteNumber = toNoteNumber(label);
      const button = document.createElement("div");
      button.role = "button";
      button.setAttribute("aria-pressed", "false");
      if (0 <= noteNumber) {
        button.className = "border rounded pad";
        const padHit = document.createElement("div");
        padHit.className = "pad-hit";
        padHit.dataset.index = noteNumber.toString();
        const padView = document.createElement("div");
        padView.className = "pad-view";
        padView.textContent = getTranslatedLabel(label);
        padView.name = label;
        button.append(padHit, padView);
        setKeyEvents(channelNumber, padHit);
        allKeys[channelNumber].push(button);
      } else {
        button.className = "btn btn-outline-info pad";
        button.textContent = label;
        button.name = label;
        octaveButtons.push(button);
      }
      group.appendChild(button);
    }
    for (let i = 0; i < octaveButtons.length; i++) {
      const btn = octaveButtons[i];
      setChangeOctaveEvents(channelNumber, btn);
    }
  });
  return allKeys;
}

function initConfig() {
  const handlers = [
    (i, v) => midy.setControlChange(i, 1, v),
    (i, v) => midy.setControlChange(i, 11, v),
    (i, v) => midy.setControlChange(i, 76, v),
    (i, v) => midy.setControlChange(i, 77, v),
    (i, v) => midy.setControlChange(i, 78, v),
    (i, v) => midy.setControlChange(i, 91, v),
    (i, v) => midy.setControlChange(i, 93, v),
  ];
  const configs = document.getElementById("config").querySelectorAll("div.col");
  configs.forEach((config, i) => {
    const drum = config.querySelector("input[type=checkbox]");
    drum.addEventListener("change", (event) => {
      const instrument = config.querySelector("midi-instrument");
      instrument.parentNode.classList.toggle("d-none");
      if (event.target.checked) {
        midy.setBankMSB(i, 120);
        midy.setProgramChange(i, 0);
      } else {
        midy.setBankMSB(i, 121);
        const select = instrument.shadowRoot.querySelector("select");
        select.selectedIndex = 0;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    const inputs = config.querySelectorAll("input[type=range]");
    inputs.forEach((input, j) => {
      const handler = handlers[j];
      if (!handler) return;
      input.addEventListener("change", (event) => {
        handler(i, event.target.value);
      });
    });
  });
}

// deno-fmt-ignore
const baseLabels = [
  "C#4", "D#4", "F#4", "⬇",
  "C4",  "D4",  "E4",  "F4",
  "G4",  "A4",  "B4",  "C5",
  "G#4", "A#4", "C#5", "⬆",
];
const htmlLang = document.documentElement.lang;
const noteMap = {
  ja: { C: "ド", D: "レ", E: "ミ", F: "ファ", G: "ソ", A: "ラ", B: "シ" },
  en: { C: "C", D: "D", E: "E", F: "F", G: "G", A: "A", B: "B" },
};
const pointerMap = new Map();
const currOctaves = [4, 4];
let handMode = 1;

const panel = document.getElementById("panel");
const allKeys = initButtons();

const soundFontURL = "https://soundfonts.pages.dev/GeneralUser_GS_v1.471";
const audioContext = new AudioContext();
const midy = new Midy(audioContext);
await Promise.all([
  midy.loadSoundFont(`${soundFontURL}/000.sf3`),
  midy.loadSoundFont(`${soundFontURL}/128.sf3`),
]);
initConfig();

document.getElementById("toggleDarkMode").onclick = toggleDarkMode;
document.getElementById("toggleHandMode").onclick = toggleHandMode;
document.getElementById("lang").onchange = changeLang;
document.addEventListener("visibilitychange", async () => {
  if (document.hidden) {
    if (midy.audioContext.state === "running") {
      await midy.audioContext.suspend();
    }
  } else {
    if (midy.audioContext.state === "suspended") {
      await midy.audioContext.resume();
    }
  }
});
if (CSS.supports("-webkit-touch-callout: default")) { // iOS
  // prevent double click zoom
  document.addEventListener("dblclick", (event) => event.preventDefault());
  // prevent text selection
  const preventDefault = (event) => event.preventDefault();
  const panel = document.getElementById("panel");
  panel.addEventListener("touchstart", () => {
    document.addEventListener("touchstart", preventDefault, {
      passive: false,
    });
  });
  panel.addEventListener("touchend", () => {
    document.removeEventListener("touchstart", preventDefault, {
      passive: false,
    });
  });
}
