// Procedural sound and music (spec §9.5). Everything is synthesized with Web Audio at runtime,
// so there are no recorded assets (see assets/LICENSES.md).
import { settings, onSettings } from './settings';

type Mood = 'explore' | 'battle' | 'cutscene' | 'silent';

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private ambient!: GainNode;
  private wind!: GainNode;
  private noise!: AudioBuffer;
  private mood: Mood = 'silent';
  private nextNote = 0;
  private step = 0;
  private timer: number | null = null;
  private lastSfx = new Map<string, number>();

  /** Must be called from a user gesture (browser autoplay rules). */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = (this.ctx = new Ctx());
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.master);
    // Two seconds of white noise, reused by every noisy sound.
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let seed = 1;
    for (let i = 0; i < d.length; i++) {
      seed = (seed * 16807) % 2147483647;
      d[i] = (seed / 2147483647) * 2 - 1;
    }
    this.ambient = this.loopNoise(400, 0.04);
    this.wind = this.loopNoise(900, 0);
    onSettings((s) => {
      this.master.gain.value = s.master;
      this.sfxBus.gain.value = s.sfx;
      this.musicBus.gain.value = s.music * 0.6;
    });
    this.timer = window.setInterval(() => this.schedule(), 100);
  }

  private loopNoise(cutoff: number, gain: number): GainNode {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.value = gain;
    // Slow swell, like surf.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.12;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = cutoff * 0.4;
    lfo.connect(lfoGain).connect(f.frequency);
    lfo.start();
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start();
    return g;
  }

  private throttle(key: string, ms: number) {
    const now = performance.now();
    if (now - (this.lastSfx.get(key) ?? 0) < ms) return true;
    this.lastSfx.set(key, now);
    return false;
  }

  private burst(dur: number, cutoff: number, vol: number, type: BiquadFilterType = 'lowpass') {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t, Math.random() * 1.5, dur);
  }

  private tone(freq: number, dur: number, vol: number, type: OscillatorType = 'sine', when = 0, bus?: GainNode, slideTo?: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus ?? this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  click() {
    this.tone(880, 0.05, 0.08, 'triangle');
  }

  /** Short non-voice acknowledgement, three variants per side (no voice acting, spec §9.5). */
  respond(faction: string, variant: number) {
    if (this.throttle('respond', 150)) return;
    const zheng = faction === 'faction_zheng';
    const base = zheng ? [392, 440, 523][variant % 3] : [330, 370, 415][variant % 3];
    this.tone(base, 0.09, 0.07, zheng ? 'triangle' : 'square');
    this.tone(base * (zheng ? 1.5 : 1.25), 0.1, 0.05, zheng ? 'triangle' : 'square', 0.07);
  }

  /** Car horn, two short blasts (cheat vehicles). */
  horn() {
    if (this.throttle('horn', 500)) return;
    for (const when of [0, 0.22]) {
      this.tone(415, 0.16, 0.09, 'square', when);
      this.tone(523, 0.16, 0.07, 'square', when);
    }
  }

  musket(vol: number) {
    if (this.throttle('musket', 40)) return;
    this.burst(0.18, 2400, 0.25 * vol, 'highpass');
  }

  cannon(vol: number) {
    if (this.throttle('cannon', 80)) return;
    this.burst(0.7, 300, 0.6 * vol);
    this.tone(70, 0.5, 0.3 * vol, 'sine', 0, undefined, 35);
  }

  explosion(vol: number) {
    this.burst(1.6, 500, 0.8 * vol);
    this.tone(55, 1.2, 0.4 * vol, 'sine', 0, undefined, 25);
  }

  sail() {
    if (this.throttle('sail', 400)) return;
    this.burst(0.35, 1200, 0.08, 'bandpass');
  }

  setStorm(on: boolean) {
    if (!this.ctx) return;
    this.wind.gain.setTargetAtTime(on ? 0.35 : 0, this.ctx.currentTime, 1.5);
    this.ambient.gain.setTargetAtTime(on ? 0.1 : 0.04, this.ctx.currentTime, 1.5);
  }

  setMood(m: Mood) {
    this.mood = m;
  }

  // --- generative music ---------------------------------------------------------------------------
  private schedule() {
    const ctx = this.ctx;
    if (!ctx || this.mood === 'silent' || settings.music <= 0) return;
    // Look-ahead scheduler: queue notes for the next 0.3 s.
    if (this.nextNote < ctx.currentTime) this.nextNote = ctx.currentTime + 0.05;
    while (this.nextNote < ctx.currentTime + 0.3) {
      this.playStep(this.nextNote - ctx.currentTime);
      const beat = this.mood === 'battle' ? 0.25 : this.mood === 'cutscene' ? 1.2 : 0.6;
      this.nextNote += beat;
      this.step++;
    }
  }

  private playStep(when: number) {
    // D minor pentatonic for battle, D major pentatonic otherwise.
    const scale = this.mood === 'battle' ? [146.8, 174.6, 196, 220, 261.6, 293.7] : [146.8, 164.8, 185, 220, 246.9, 293.7];
    const s = this.step;
    const pick = (n: number) => scale[(n * 7 + Math.floor(n / 5)) % scale.length];
    if (this.mood === 'battle') {
      if (s % 4 === 0) this.tone(73, 0.25, 0.25, 'sine', when, this.musicBus, 45);
      if (s % 2 === 1) this.tone(pick(s) * 2, 0.18, 0.05, 'sawtooth', when, this.musicBus);
    } else if (this.mood === 'explore') {
      if (s % 8 === 0) this.tone(73.4, 4, 0.05, 'triangle', when, this.musicBus);
      if (s % 3 !== 2) this.tone(pick(s) * 2, 0.9, 0.06, 'triangle', when, this.musicBus);
    } else {
      this.tone(pick(s), 2.4, 0.05, 'sine', when, this.musicBus);
      this.tone(pick(s + 2) * 1.5, 2.4, 0.03, 'sine', when, this.musicBus);
    }
  }
}

export const audio = new AudioEngine();

/** Unlock on the first interaction; click sound for every button. */
export function installAudio() {
  const unlock = () => audio.unlock();
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  document.addEventListener('click', (e) => {
    if ((e.target as HTMLElement)?.closest('button')) audio.click();
  });
}
