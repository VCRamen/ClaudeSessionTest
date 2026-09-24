// WebAudio で合成する効果音（音声ファイル不要）

import type { WeaponId } from './Weapons';

export class Sfx {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private lastPlayTimes = new Map<string, number>();

  /** ユーザー操作のタイミングで呼び出して音声を有効化する */
  Unlock(): void {
    if (this.context) {
      if (this.context.state === 'suspended') void this.context.resume();
      return;
    }
    const context = new AudioContext();
    this.context = context;
    this.master = context.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(context.destination);
    const length = context.sampleRate;
    this.noiseBuffer = context.createBuffer(1, length, context.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  }

  PlayShot(id: WeaponId): void {
    switch (id) {
      case 'handgun':
        this.Noise(0.12, 2200, 0.5);
        this.Tone(180, 60, 0.08, 'triangle', 0.4);
        break;
      case 'smg':
        this.Noise(0.07, 3000, 0.35);
        this.Tone(220, 90, 0.05, 'square', 0.12);
        break;
      case 'shotgun':
        this.Noise(0.3, 1200, 0.8);
        this.Tone(120, 40, 0.2, 'triangle', 0.6);
        break;
      case 'rifle':
        this.Noise(0.1, 2600, 0.45);
        this.Tone(160, 60, 0.07, 'triangle', 0.3);
        break;
      case 'sniper':
        this.Noise(0.45, 1500, 0.8);
        this.Tone(90, 30, 0.35, 'sawtooth', 0.35);
        break;
      case 'rocket':
        this.Noise(0.5, 700, 0.5);
        this.Tone(300, 80, 0.4, 'sawtooth', 0.15);
        break;
    }
  }

  PlayExplosion(): void {
    this.Noise(1.0, 500, 1.0);
    this.Tone(70, 25, 0.8, 'sine', 0.9);
  }

  PlayEnemyShot(): void {
    if (!this.Throttle('enemyShot', 0.05)) return;
    this.Tone(500, 180, 0.2, 'sine', 0.12);
  }

  PlayHit(): void {
    if (!this.Throttle('hit', 0.03)) return;
    this.Tone(1400, 900, 0.05, 'square', 0.08);
  }

  PlayKill(): void {
    this.Tone(700, 1200, 0.12, 'triangle', 0.2);
  }

  PlayHurt(): void {
    if (!this.Throttle('hurt', 0.1)) return;
    this.Tone(200, 90, 0.2, 'sawtooth', 0.25);
  }

  PlayPickup(): void {
    this.Tone(600, 900, 0.08, 'sine', 0.25);
    this.Tone(900, 1300, 0.1, 'sine', 0.2, 0.07);
  }

  PlayPowerUp(): void {
    this.Tone(523, 523, 0.1, 'square', 0.12);
    this.Tone(659, 659, 0.1, 'square', 0.12, 0.08);
    this.Tone(784, 784, 0.1, 'square', 0.12, 0.16);
    this.Tone(1047, 1047, 0.25, 'square', 0.12, 0.24);
  }

  PlayCoin(): void {
    if (!this.Throttle('coin', 0.05)) return;
    this.Tone(1300, 1300, 0.05, 'square', 0.08);
    this.Tone(1750, 1750, 0.12, 'square', 0.08, 0.05);
  }

  PlayReload(): void {
    this.Noise(0.05, 4000, 0.3);
    this.Noise(0.05, 3000, 0.3, 0.2);
  }

  PlayEmpty(): void {
    if (!this.Throttle('empty', 0.2)) return;
    this.Tone(900, 900, 0.03, 'square', 0.1);
  }

  PlayBarrelBreak(): void {
    this.Noise(0.25, 900, 0.5);
    this.Tone(140, 70, 0.15, 'triangle', 0.3);
  }

  PlayWaveStart(): void {
    this.Tone(220, 220, 0.25, 'sawtooth', 0.15);
    this.Tone(330, 330, 0.3, 'sawtooth', 0.15, 0.2);
  }

  PlayWaveClear(): void {
    this.Tone(523, 523, 0.15, 'triangle', 0.25);
    this.Tone(659, 659, 0.15, 'triangle', 0.25, 0.12);
    this.Tone(784, 784, 0.3, 'triangle', 0.25, 0.24);
  }

  private Throttle(key: string, interval: number): boolean {
    if (!this.context) return false;
    const now = this.context.currentTime;
    const last = this.lastPlayTimes.get(key) ?? -1;
    if (now - last < interval) return false;
    this.lastPlayTimes.set(key, now);
    return true;
  }

  private Noise(duration: number, filterFrequency: number, volume: number, delay = 0): void {
    if (!this.context || !this.master || !this.noiseBuffer) return;
    const start = this.context.currentTime + delay;
    const source = this.context.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.playbackRate.value = 0.8 + Math.random() * 0.4;
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFrequency;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(start, Math.random() * 0.5, duration + 0.05);
  }

  private Tone(fromFrequency: number, toFrequency: number, duration: number, type: OscillatorType, volume: number, delay = 0): void {
    if (!this.context || !this.master) return;
    const start = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(fromFrequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, toFrequency), start + duration);
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.05);
  }
}
