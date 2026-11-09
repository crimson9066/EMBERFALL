/**
 * Synthesised audio: no assets. A low gothic drone for the Reach and short
 * oscillator/noise cues for combat, loot, UI and quest feedback.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private droneStarted = false;
  private chimeTimer: number | null = null;
  private lastPlayed = new Map<string, number>();

  muted = false;
  volume = 0.7;

  /** Must be called from a user gesture (click / key). Safe to call repeatedly. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.24;
      this.musicGain.connect(this.master);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.5;
      this.sfxGain.connect(this.master);

      this.startDrone();
      this.scheduleChimes();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.linearRampToValueAtTime(muted ? 0 : this.volume, this.ctx.currentTime + 0.12);
    }
  }

  toggleMuted(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  private startDrone(): void {
    if (!this.ctx || this.droneStarted) return;
    this.droneStarted = true;
    const ctx = this.ctx;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 340;
    filter.Q.value = 1.4;
    filter.connect(this.musicGain!);

    const freqs = [55, 82.5, 110, 164.8];
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = i % 2 === 0 ? "triangle" : "sine";
      osc.frequency.value = freq;
      osc.detune.value = (i - 1.5) * 4;
      const gain = ctx.createGain();
      gain.gain.value = i === 0 ? 0.15 : 0.055;
      osc.connect(gain);
      gain.connect(filter);
      osc.start();
    });

    // Breath-like swell.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.045;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.07;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();
  }

  private scheduleChimes(): void {
    if (this.chimeTimer !== null) return;
    const chime = () => {
      if (!this.muted && this.ctx) {
        const scale = [220, 246.9, 293.7, 329.6, 392, 440];
        const note = scale[Math.floor(Math.random() * scale.length)];
        this.bell(note, 0.08 + Math.random() * 0.05);
      }
      this.chimeTimer = window.setTimeout(chime, 7000 + Math.random() * 9000);
    };
    this.chimeTimer = window.setTimeout(chime, 5000);
  }

  private bell(freq: number, gain: number): void {
    if (!this.ctx || !this.musicGain) return;
    const t = this.ctx.currentTime;
    for (const [mult, amp] of [[1, 1], [2.01, 0.4], [3.02, 0.16]] as const) {
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq * mult;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain * amp, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
      osc.connect(g);
      g.connect(this.musicGain);
      osc.start(t);
      osc.stop(t + 3.3);
    }
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, slideTo?: number, delay = 0): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, gain: number, cutoff = 1200, type: BiquadFilterType = "lowpass"): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const frames = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = cutoff;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfxGain);
    src.start(t);
  }

  private throttled(kind: string, ms: number): boolean {
    const now = performance.now();
    const last = this.lastPlayed.get(kind) ?? 0;
    if (now - last < ms) return false;
    this.lastPlayed.set(kind, now);
    return true;
  }

  /** Play the sound that corresponds to a server fx message. */
  fx(kind: string, opts: { crit?: boolean; amount?: number } = {}): void {
    if (!this.ctx || this.muted) return;
    switch (kind) {
      case "damage":
        if (!this.throttled("damage", 55)) return;
        this.noise(0.09, 0.32, 900);
        this.tone(150, 0.1, "square", 0.1, 90);
        if (opts.crit) this.tone(520, 0.12, "sawtooth", 0.1, 180);
        break;
      case "heal":
      case "healBurst":
        if (!this.throttled("heal", 90)) return;
        this.tone(523.25, 0.16, "sine", 0.1);
        this.tone(659.25, 0.2, "sine", 0.08, undefined, 0.07);
        break;
      case "mana":
        this.tone(392, 0.18, "sine", 0.09, 587);
        break;
      case "shield":
        this.tone(880, 0.25, "triangle", 0.07, 1320);
        break;
      case "cast":
        if (!this.throttled("cast", 70)) return;
        this.noise(0.16, 0.12, 2200, "highpass");
        this.tone(300, 0.14, "triangle", 0.07, 620);
        break;
      case "slash":
        if (!this.throttled("slash", 70)) return;
        this.noise(0.1, 0.18, 2600, "bandpass");
        break;
      case "impact":
        if (!this.throttled("impact", 50)) return;
        this.noise(0.08, 0.14, 700);
        break;
      case "explosion":
        this.noise(0.32, 0.32, 400);
        this.tone(90, 0.32, "sawtooth", 0.12, 40);
        break;
      case "nova":
      case "ring":
      case "fan":
        this.noise(0.24, 0.14, 1800, "highpass");
        this.tone(660, 0.2, "sine", 0.05, 330);
        break;
      case "levelup":
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 0.5, "triangle", 0.09, undefined, i * 0.09));
        break;
      case "death":
        this.tone(180, 0.7, "sawtooth", 0.16, 45);
        this.noise(0.5, 0.2, 300);
        break;
      case "pickup":
        this.tone(880, 0.07, "square", 0.06, 1320);
        break;
      case "gold":
        this.tone(1046, 0.06, "square", 0.05);
        this.tone(1318, 0.08, "square", 0.04, undefined, 0.05);
        break;
      case "xp":
        this.tone(659, 0.1, "sine", 0.04, 880);
        break;
      case "teleport":
      case "blink":
        this.tone(220, 0.35, "sine", 0.09, 1400);
        break;
      case "respawn":
        [392, 523.25, 659.25].forEach((f, i) => this.tone(f, 0.6, "sine", 0.07, undefined, i * 0.1));
        break;
      case "summon":
        this.tone(110, 0.5, "sawtooth", 0.08, 55);
        break;
      default:
        break;
    }
  }

  quest(): void {
    if (!this.ctx || this.muted) return;
    [392, 523.25, 659.25, 783.99].forEach((f, i) => this.tone(f, 0.45, "triangle", 0.06, undefined, i * 0.08));
  }

  ui(): void {
    if (!this.ctx || this.muted) return;
    if (!this.throttled("ui", 45)) return;
    this.tone(1200, 0.035, "square", 0.025);
  }

  warn(): void {
    if (!this.ctx || this.muted) return;
    this.tone(220, 0.12, "square", 0.05, 180);
  }
}
