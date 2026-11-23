/**
 * Web Audio API Synthesizer for 《騎遍台灣》
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
      this._tone(523.25, t, 0.12, 'triangle', 0.16);
      this._tone(659.25, t + 0.07, 0.14, 'triangle', 0.16);
      this._tone(783.99, t + 0.14, 0.22, 'sine', 0.18);
    }

    playLaneSwitch() {
      const ctx = this._ensure();
      if (!ctx) return;
      const t = ctx.currentTime;
      this._tone(360, t, 0.06, 'sine', 0.05);
    }

    playCenterReady() {
      const ctx = this._ensure();
      if (!ctx) return;
      const t = ctx.currentTime;
      this._tone(440, t, 0.09, 'sine', 0.07);
    }

    playUnlock() {
      const ctx = this._ensure();
      if (!ctx) return;
      const t = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((n, idx) => {
        this._tone(n, t + idx * 0.09, 0.28, 'triangle', 0.16);
      });
    }
  }

  global.RehabAudio = new RehabAudio();
})(window);
