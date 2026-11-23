/**
 * Web Audio API Synthesizer for 《騎遍台灣》 V2.0
 */
(function (global) {
  'use strict';

  class RehabAudio {
    constructor() {
      this.ctx = null;
      this.muted = false;
    }

    _ensure() {
      if (this.muted) return null;
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        this.ctx = new AC();
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    }

    setMuted(m) {
      this.muted = !!m;
    }

    _tone(freq, startTime, duration, type = 'sine', gainPeak = 0.14) {
      const ctx = this._ensure();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.exponentialRampToValueAtTime(gainPeak, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration + 0.02);
    }

    playCollect() {
      const ctx = this._ensure();
      if (!ctx) return;
      const t = ctx.currentTime;
      this._tone(523.25, t, 0.1, 'triangle', 0.14);
      this._tone(659.25, t + 0.06, 0.14, 'triangle', 0.16);
    }

    playBoost() {
      const ctx = this._ensure();
      if (!ctx) return;
      const t = ctx.currentTime;
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        this._tone(f, t + i * 0.05, 0.16, 'triangle', 0.14);
      });
    }

    playBump() {
      const ctx = this._ensure();
      if (!ctx) return;
      const t = ctx.currentTime;
      this._tone(160, t, 0.14, 'sawtooth', 0.09);
      this._tone(115, t + 0.08, 0.16, 'sine', 0.11);
    }

    playBell() {
      const ctx = this._ensure();
      if (!ctx) return;
      const t = ctx.currentTime;
      this._tone(1174.66, t, 0.12, 'sine', 0.1);
      this._tone(1396.91, t + 0.09, 0.16, 'sine', 0.1);
    }

    playLaneSwitch() {
      const ctx = this._ensure();
      if (!ctx) return;
      const t = ctx.currentTime;
      this._tone(380, t, 0.05, 'sine', 0.04);
    }

    playStamp() {
      const ctx = this._ensure();
      if (!ctx) return;
      const t = ctx.currentTime;
      [587.33, 739.99, 880, 1174.66].forEach((n, idx) => {
        this._tone(n, t + idx * 0.08, 0.24, 'triangle', 0.15);
      });
    }
  }

  global.RehabAudio = new RehabAudio();
})(window);
