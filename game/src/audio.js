// All sound is synthesized with WebAudio — engine hum, sirens, gunshots,
// pickup chimes, and three radio stations with their own chord loops.
// No audio files, no network.
import { RADIO_STATIONS } from './palette.js';

function noteFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Chord progressions per station (MIDI note numbers, one chord per bar).
const STATION_MUSIC = [
  { // Bay FM — bright pop: C Am F G
    chords: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]],
    bass: [48, 45, 41, 43], melody: [72, 76, 79, 76, 72, 67, 69, 72],
  },
  { // Harbor Rock — minor drive: Am F C G
    chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]],
    bass: [45, 41, 36, 43], melody: [69, 72, 76, 72, 69, 64, 67, 69],
  },
  { // Night Drive — lo-fi coast: Cmaj7 Am7 Dm7 G7
    chords: [[60, 64, 67, 71], [57, 60, 64, 67], [62, 65, 69, 72], [59, 62, 65, 71]],
    bass: [48, 45, 50, 43], melody: [67, 69, 72, 71, 69, 67, 64, 62],
  },
];

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null, engineGain = null, engineFilter = null;
  let sirenOsc = null, sirenGain = null;
  let muted = false;
  let radioStation = 0;
  let radioOn = true;
  let radioTimer = null;
  let step = 0;
  let nextStepTime = 0;

  function ensure() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    // engine: sawtooth through a lowpass
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 50;
    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter).connect(engineGain).connect(master);
    engineOsc.start();
    // siren: square wave alternating tones
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'square';
    sirenOsc.frequency.value = 700;
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain).connect(master);
    sirenOsc.start();
  }

  function resume() {
    ensure();
    if (ctx.state === 'suspended') ctx.resume();
  }

  function blip(freq, dur, type, vol, when = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noiseBurst(dur, vol, filterFreq) {
    if (!ctx) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(master);
    src.start();
  }

  function radioTick() {
    if (!ctx || !radioOn || muted) return;
    const st = STATION_MUSIC[radioStation];
    const tempo = RADIO_STATIONS[radioStation].tempo;
    const stepDur = 60 / tempo / 4;
    if (nextStepTime < ctx.currentTime - 0.5) nextStepTime = ctx.currentTime + 0.05;
    while (nextStepTime < ctx.currentTime + 0.15) {
      const bar = Math.floor(step / 16) % 4;
      const s16 = step % 16;
      const chord = st.chords[bar];
      // pad on the downbeat
      if (s16 === 0) {
        for (const n of chord) blip(noteFreq(n), stepDur * 15, 'triangle', 0.05, nextStepTime - ctx.currentTime);
        blip(noteFreq(st.bass[bar]), stepDur * 8, 'sine', 0.12, nextStepTime - ctx.currentTime);
      }
      // melody plucks on off-beats
      if (s16 % 4 === 2) {
        const m = st.melody[(step / 4 | 0) % st.melody.length];
        blip(noteFreq(m), stepDur * 2, 'sine', 0.06, nextStepTime - ctx.currentTime);
      }
      step++;
      nextStepTime += stepDur;
    }
  }

  return {
    resume,
    setMuted(m) {
      muted = m;
      if (master) master.gain.value = m ? 0 : 0.5;
    },
    isMuted() { return muted; },
    setEngine(speedMph, inCar) {
      if (!ctx) return;
      const target = inCar ? 0.05 + Math.min(0.16, speedMph / 600) : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(48 + speedMph * 1.4, ctx.currentTime, 0.1);
    },
    setSiren(on, wanted) {
      if (!ctx) return;
      sirenGain.gain.setTargetAtTime(on ? 0.028 + wanted * 0.004 : 0, ctx.currentTime, 0.2);
      sirenOsc.frequency.setTargetAtTime(
        Math.floor(performance.now() / 450) % 2 === 0 ? 700 : 950, ctx.currentTime, 0.05);
    },
    shot() { noiseBurst(0.14, 0.5, 1800); blip(160, 0.1, 'square', 0.25); },
    punch() { noiseBurst(0.08, 0.35, 500); blip(90, 0.12, 'sine', 0.4); },
    pickup() { blip(880, 0.12, 'sine', 0.2); blip(1320, 0.18, 'sine', 0.2, 0.09); },
    missionDone() {
      [523, 659, 784, 1047].forEach((f, i) => blip(f, 0.25, 'triangle', 0.22, i * 0.12));
    },
    busted() { [392, 330, 262].forEach((f, i) => blip(f, 0.3, 'sawtooth', 0.15, i * 0.18)); },
    click() { blip(1200, 0.05, 'square', 0.12); },
    setStation(i) {
      radioStation = i;
      step = 0;
      if (ctx) nextStepTime = ctx.currentTime + 0.05;
    },
    get station() { return radioStation; },
    startRadio() {
      ensure();
      nextStepTime = ctx.currentTime + 0.05;
      if (!radioTimer) radioTimer = setInterval(radioTick, 60);
    },
  };
}
