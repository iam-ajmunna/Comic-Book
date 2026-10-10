// Index 0 is the cover; indices 1–40 are the paired story scenes.
export const SCENE_CUES = [
  "soft",
  "soft",
  "soft",
  "soft",
  "memory",
  "memory",
  "silence",
  "memory",
  "memory",
  "silence",
  "silence",
  "wonder",
  "soft",
  "wonder",
  "wonder",
  "memory",
  "wonder",
  "soft",
  "silence",
  "soft",
  "wonder",
  "wonder",
  "cinematic",
  "cinematic",
  "cinematic",
  "memory",
  "silence",
  "memory",
  "silence",
  "silence",
  "wonder",
  "cinematic",
  "memory",
  "cinematic",
  "cinematic",
  "cinematic",
  "silence",
  "memory",
  "silence",
  "silence",
  "memory",
];
export const cueForPage = (page) => SCENE_CUES[Math.ceil(page / 2)] ?? "soft";
const CUES = {
  soft: {
    label: "Soft piano",
    seconds: 9,
    chords: [
      [48, 55, 60, 64],
      [45, 52, 59, 64],
      [41, 48, 55, 60],
      [43, 50, 57, 62],
    ],
    melody: [0, 2, 1, 3],
    pad: 0.1,
  },
  memory: {
    label: "Quiet reflection",
    seconds: 12,
    chords: [
      [45, 52, 59, 60],
      [41, 48, 55, 57],
      [48, 55, 59, 64],
      [43, 50, 57, 62],
    ],
    melody: [2, 0, 3, 1],
    pad: 0.09,
  },
  wonder: {
    label: "Distant light",
    seconds: 10,
    chords: [
      [38, 45, 52, 57],
      [41, 48, 55, 60],
      [45, 52, 59, 64],
      [43, 50, 57, 62],
    ],
    melody: [3, 1, 2, 0],
    pad: 0.15,
  },
  cinematic: {
    label: "Cinematic",
    seconds: 8,
    chords: [
      [38, 45, 50, 57],
      [34, 41, 48, 53],
      [41, 48, 53, 60],
      [36, 43, 50, 55],
    ],
    melody: [0, 1, 3, 2],
    pad: 0.19,
  },
  silence: { label: "A moment of silence" },
};
const frequency = (midi) => 440 * 2 ** ((midi - 69) / 12);
export class AmbientScore {
  constructor(onStatus = () => {}) {
    this.onStatus = onStatus;
    this.enabled = false;
    this.cue = "soft";
    this.volume = 0.15;
    this.nodes = new Set();
    this.timer = null;
    this.bar = 0;
    this.active = true;
  }
  setup() {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) throw new Error("Audio unavailable");
    this.context = new Context();
    this.master = this.context.createGain();
    this.master.gain.value = 0;
    const compressor = this.context.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.08;
    compressor.release.value = 0.6;
    this.master.connect(compressor);
    compressor.connect(this.context.destination);
    this.reverb = this.context.createConvolver();
    const length = Math.floor(this.context.sampleRate * 3.2),
      impulse = this.context.createBuffer(2, length, this.context.sampleRate);
    let seed = 193703;
    for (let ch = 0; ch < 2; ch++) {
      const samples = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        seed = (seed * 16807) % 2147483647;
        samples[i] = (seed / 1073741823.5 - 1) * (1 - i / length) ** 3 * 0.35;
      }
    }
    this.reverb.buffer = impulse;
    const wet = this.context.createGain();
    wet.gain.value = 0.3;
    this.reverb.connect(wet);
    wet.connect(this.master);
  }
  async toggle() {
    if (!this.context) this.setup();
    this.enabled = !this.enabled;
    if (this.enabled) {
      await this.context.resume();
      this.restart();
    } else this.stop();
    this.status();
  }
  setCue(cue) {
    if (cue === this.cue) return;
    this.cue = cue;
    this.bar = 0;
    if (this.enabled) this.restart();
    this.status();
  }
  setVolume(value) {
    this.volume = Math.max(0, Math.min(0.35, value));
    if (this.context && this.enabled && this.active && this.cue !== "silence")
      this.master.gain.setTargetAtTime(
        this.volume * 0.9,
        this.context.currentTime,
        0.25,
      );
    this.status();
  }
  setActive(value) {
    if (this.active === value) return;
    this.active = value;
    if (this.enabled) {
      if (value) this.restart();
      else this.stop();
    }
    this.status();
  }
  status() {
    this.onStatus({
      enabled: this.enabled,
      cue: this.cue,
      label: !this.enabled
        ? "Soundtrack off"
        : !this.active
          ? "Paused outside the book"
          : this.volume === 0
            ? "Soundtrack muted"
            : CUES[this.cue].label,
    });
  }
  stop() {
    clearInterval(this.timer);
    this.timer = null;
    if (!this.context) return;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(0, now, 0.18);
    this.master.gain.setValueAtTime(0, now + 1);
    for (const n of this.nodes) {
      n.gain.gain.cancelScheduledValues(now);
      n.gain.gain.setTargetAtTime(0, now, 0.15);
      try {
        n.oscillator.stop(now + 0.9);
      } catch {
        /* Already stopped. */
      }
    }
    this.nodes.clear();
  }
  restart() {
    this.stop();
    if (!this.enabled || !this.active || this.cue === "silence") return;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.nextTime = now + 0.65;
    this.master.gain.setTargetAtTime(this.volume * 0.9, now, 0.7);
    this.schedule();
    this.timer = setInterval(() => this.schedule(), 250);
  }
  note(midi, start, duration, level, pad = false, pan = 0) {
    const ctx = this.context,
      gain = ctx.createGain(),
      tone = ctx.createBiquadFilter(),
      panner = ctx.createStereoPanner();
    tone.type = "lowpass";
    tone.frequency.value = pad ? 1100 : 1900;
    panner.pan.value = pan;
    gain.connect(tone);
    tone.connect(panner);
    panner.connect(this.master);
    panner.connect(this.reverb);
    gain.gain.setValueAtTime(0.00001, start);
    gain.gain.exponentialRampToValueAtTime(level, start + (pad ? 2.3 : 0.025));
    gain.gain.exponentialRampToValueAtTime(0.00001, start + duration);
    const oscillator = ctx.createOscillator();
    oscillator.type = pad ? "triangle" : "sine";
    oscillator.frequency.value = frequency(midi);
    oscillator.connect(gain);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.1);
    const entry = { oscillator, gain };
    this.nodes.add(entry);
    oscillator.onended = () => {
      this.nodes.delete(entry);
      oscillator.disconnect();
      gain.disconnect();
      tone.disconnect();
      panner.disconnect();
    };
    if (!pad) {
      const oscillator = ctx.createOscillator(),
        gain = ctx.createGain();
      oscillator.frequency.value = frequency(midi) * 2;
      gain.gain.setValueAtTime(level * 0.12, start);
      gain.gain.exponentialRampToValueAtTime(0.00001, start + duration * 0.6);
      oscillator.connect(gain);
      gain.connect(tone);
      oscillator.start(start);
      oscillator.stop(start + duration * 0.6);
      const partial = { oscillator, gain };
      this.nodes.add(partial);
      oscillator.onended = () => {
        this.nodes.delete(partial);
        oscillator.disconnect();
        gain.disconnect();
      };
    }
  }
  schedule() {
    if (
      !this.enabled ||
      !this.active ||
      this.cue === "silence" ||
      this.nextTime > this.context.currentTime + 1
    )
      return;
    const cue = CUES[this.cue],
      chord = cue.chords[this.bar % cue.chords.length],
      at = this.nextTime;
    chord.forEach((n, i) =>
      this.note(
        n,
        at + i * 0.12,
        cue.seconds + 2,
        cue.pad / 4,
        true,
        (i - 1.5) * 0.28,
      ),
    );
    cue.melody.forEach((index, i) =>
      this.note(
        chord[index] + 12,
        at + (i * cue.seconds) / 4,
        5.2,
        0.11,
        false,
        i % 2 ? 0.22 : -0.22,
      ),
    );
    if (this.cue === "cinematic")
      this.note(chord[0] - 12, at, cue.seconds + 1, 0.065, true, 0);
    this.bar++;
    this.nextTime += cue.seconds;
  }
}
export function initAmbience() {
  const $ = (id) => document.getElementById(id),
    toggle = $("sound-button"),
    label = $("sound-label"),
    volume = $("volume");
  const score = new AmbientScore((state) => {
    toggle.setAttribute("aria-pressed", String(state.enabled));
    toggle.textContent = state.enabled ? "Turn sound off" : "Turn sound on";
    label.textContent = state.label;
    document.body.dataset.sound =
      state.enabled &&
      score.active &&
      state.cue !== "silence" &&
      score.volume > 0
        ? "playing"
        : "quiet";
  });
  toggle.addEventListener("click", async () => {
    toggle.disabled = true;
    try {
      await score.toggle();
    } catch {
      score.enabled = false;
      score.stop();
      label.textContent = "Sound is unavailable. You can keep reading.";
      toggle.textContent = "Try sound again";
      toggle.setAttribute("aria-pressed", "false");
    } finally {
      toggle.disabled = false;
    }
  });
  volume.addEventListener("input", () => {
    score.setVolume(+volume.value / 100);
    $("volume-value").textContent = `${volume.value}%`;
  });
  let inReader = false;
  const sync = () =>
    score.setActive(inReader && !$("reading-view").hidden && document.visibilityState === "visible");
  document.addEventListener("visibilitychange", sync);
  window.addEventListener("pagehide", () => score.stop());
  window.addEventListener("pageshow", () => { score.active = false; sync(); });
  const update = (page, requestedCue) => {
    const cue = requestedCue && CUES[requestedCue] ? requestedCue : cueForPage(page);
    score.setCue(cue);
  };
  update.setActive = (active) => { inReader = active; sync(); };
  return update;
}
