/**
 * Web Audio & Audio FX Service for Teen Patti Table
 */
class TeenPattiSoundService {
  private enabled: boolean = true;
  private audioCtx: AudioContext | null = null;
  private soundCache: Map<string, HTMLAudioElement> = new Map();

  constructor() {
    // Pre-cache sounds
    if (typeof window !== 'undefined') {
      const sounds = [
        'card_deal',
        'card_flip',
        'chip_toss',
        'timer_tick',
        'fold',
        'win',
      ];
      sounds.forEach((name) => {
        try {
          const audio = new Audio(`/audio/teen_patti/${name}.mp3`);
          audio.preload = 'auto';
          this.soundCache.set(name, audio);
        } catch (_) {}
      });
    }
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  public isSoundEnabled(): boolean {
    return this.enabled;
  }

  public toggleSound(): boolean {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  private playAudioFile(name: string, volume: number = 1.0): Promise<void> {
    if (!this.enabled || typeof window === 'undefined') return Promise.resolve();
    const audio = this.soundCache.get(name);
    if (audio) {
      audio.volume = volume;
      audio.currentTime = 0;
      return audio.play().catch(() => {
        // Fallback to Web Audio Synth if autoplay prevented or file loading issue
        this.playSynthesizedFallback(name);
      });
    }
    this.playSynthesizedFallback(name);
    return Promise.resolve();
  }

  private playSynthesizedFallback(name: string) {
    if (!this.enabled) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      if (name === 'card_deal' || name === 'card_flip') {
        // Short white noise burst for card swish
        const bufferSize = ctx.sampleRate * 0.08;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.02));
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(name === 'card_flip' ? 3200 : 1800, now);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        noise.start(now);
      } else if (name === 'chip_toss') {
        // High ping metallic chip clink
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(2400, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.09);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.09);
      } else if (name === 'timer_tick') {
        // Crisp clock tick
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1200, now);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.04);
      } else if (name === 'fold') {
        // Low muffled whoosh
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(350, now);
        osc.frequency.exponentialRampToValueAtTime(90, now + 0.15);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (name === 'win') {
        // Triumphant chord C5 -> E5 -> G5 -> C6
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const startTime = now + idx * 0.12;
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, startTime);
          gain.gain.setValueAtTime(0.28, startTime);
          gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.4);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(startTime);
          osc.stop(startTime + 0.4);
        });
      }
    } catch (_) {}
  }

  public playCardDeal() {
    this.playAudioFile('card_deal', 0.85);
  }

  public playCardFlip() {
    this.playAudioFile('card_flip', 1.0);
  }

  public playChipToss() {
    this.playAudioFile('chip_toss', 0.9);
  }

  public playTimerTick() {
    this.playAudioFile('timer_tick', 0.6);
  }

  public playFold() {
    this.playAudioFile('fold', 0.8);
  }

  public playWin() {
    this.playAudioFile('win', 1.0);
  }
}

export const teenPattiSound = new TeenPattiSoundService();
