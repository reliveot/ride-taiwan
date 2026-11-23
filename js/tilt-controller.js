/**
 * TiltRehabKit v2.0 — Reusable Dual-Axis Phone Tilt Sensor & Pairing Module
 * Designed for 吱吱復健 web rehabilitation games (GitHub Pages / HTTPS).
 *
 * Features:
 *  - Independent Roll (Left/Center/Right: -1/0/1) & Pitch (Brake/Cruise/Throttle: -1/0/1)
 *  - Independent Pitch enable toggle & wider Pitch threshold to prevent synergy interference
 *  - Neutral position calibration + Hysteresis & Debounce anti-jitter
 *  - PeerJS (WebRTC) + BroadcastChannel dual-device pairing + Screen Wake Lock
 */
(function (global) {
  'use strict';

  class TiltSensorEngine {
    constructor(options = {}) {
      this.thresholdDeg = options.thresholdDeg ?? 16;
      this.pitchThresholdDeg = options.pitchThresholdDeg ?? 18;
      this.hysteresisDeg = options.hysteresisDeg ?? 5;
      this.debounceMs = options.debounceMs ?? 110;
      this.smoothingAlpha = options.smoothingAlpha ?? 0.35;
      this.enablePitch = options.enablePitch ?? false;

      this.neutralRoll = 0;
      this.neutralPitch = 0;
      this.rawRoll = 0;
      this.rawPitch = 0;
      this.smoothedRoll = 0;
      this.smoothedPitch = 0;

      this.currentLane = 0;     // -1 Left, 0 Center, 1 Right
      this.currentThrottle = 0; // -1 Brake, 0 Cruise, 1 Throttle
      this._pendingLane = 0;
      this._pendingLaneSince = 0;
      this._pendingThrottle = 0;
      this._pendingThrottleSince = 0;

      this._listening = false;
      this._hasReading = false;
      this._onUpdate = options.onUpdate || (() => {});
      this._onStatus = options.onStatus || (() => {});
      this._handleOrientation = this._handleOrientation.bind(this);
    }

    setConfig(cfg = {}) {
      if (typeof cfg.thresholdDeg === 'number') this.thresholdDeg = cfg.thresholdDeg;
      if (typeof cfg.pitchThresholdDeg === 'number') this.pitchThresholdDeg = cfg.pitchThresholdDeg;
      if (typeof cfg.hysteresisDeg === 'number') this.hysteresisDeg = cfg.hysteresisDeg;
      if (typeof cfg.debounceMs === 'number') this.debounceMs = cfg.debounceMs;
      if (typeof cfg.smoothingAlpha === 'number') this.smoothingAlpha = cfg.smoothingAlpha;
      if (typeof cfg.enablePitch === 'boolean') {
        this.enablePitch = cfg.enablePitch;
        if (!this.enablePitch) this.currentThrottle = 0;
      }
    }

    async requestPermissionAndStart() {
      if (typeof DeviceOrientationEvent === 'undefined') {
        this._onStatus({ supported: false, message: '此裝置不支援方向感測器，請使用觸控按鈕操作。' });
        return false;
      }
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
          const res = await DeviceOrientationEvent.requestPermission();
          if (res !== 'granted') {
            this._onStatus({ supported: false, message: '未取得動作感測器權限，請允許或改用觸控模式。' });
            return false;
          }
        } catch (err) {
          this._onStatus({ supported: false, message: '感測器授權失敗：' + (err && err.message ? err.message : '未知錯誤') });
          return false;
        }
      }
      if (!this._listening) {
        window.addEventListener('deviceorientation', this._handleOrientation, true);
        this._listening = true;
      }
      this._onStatus({ supported: true, message: '感測器已啟動！請採自然握姿並點擊「校正中立位置」。' });
      return true;
    }

    stop() {
      if (this._listening) {
        window.removeEventListener('deviceorientation', this._handleOrientation, true);
        this._listening = false;
      }
    }

    calibrateNeutral() {
      this.neutralRoll = this.smoothedRoll;
      this.neutralPitch = this.smoothedPitch;
      this.currentLane = 0;
      this.currentThrottle = 0;
      this._pendingLane = 0;
      this._pendingThrottle = 0;
      this._onUpdate({
        lane: 0,
        throttle: 0,
        relativeRoll: 0,
        relativePitch: 0,
        calibrated: true
      });
    }

    _resolveThreeZone(rel, current, th, exitTh) {
      if (current === 0) {
        if (rel <= -th) return -1;
        if (rel >= th) return 1;
        return 0;
      }
      if (current === -1) {
        if (rel >= th) return 1;
        if (rel > -exitTh) return 0;
        return -1;
      }
      if (rel <= -th) return -1;
      if (rel < exitTh) return 0;
      return 1;
    }

    _handleOrientation(e) {
      if (e.gamma === null || typeof e.gamma !== 'number') return;
      let roll = e.gamma;
      let pitch = typeof e.beta === 'number' ? e.beta : 0;

      const orient = (screen.orientation && typeof screen.orientation.angle === 'number')
        ? screen.orientation.angle
        : (typeof window.orientation === 'number' ? window.orientation : 0);

      if (orient === 90) {
        const tmp = roll;
        roll = pitch;
        pitch = -tmp;
      } else if (orient === -90) {
        const tmp = roll;
        roll = -pitch;
        pitch = tmp;
      } else if (orient === 180) {
        roll = -roll;
        pitch = -pitch;
      }

      this.rawRoll = roll;
      this.rawPitch = pitch;

      if (!this._hasReading) {
        this.smoothedRoll = roll;
        this.smoothedPitch = pitch;
        this.neutralRoll = roll;
        this.neutralPitch = pitch;
        this._hasReading = true;
      } else {
        this.smoothedRoll = this.smoothingAlpha * roll + (1 - this.smoothingAlpha) * this.smoothedRoll;
        this.smoothedPitch = this.smoothingAlpha * pitch + (1 - this.smoothingAlpha) * this.smoothedPitch;
      }

      const relRoll = this.smoothedRoll - this.neutralRoll;
      const relPitch = this.smoothedPitch - this.neutralPitch;
      const now = performance.now();

      // Roll (Left/Center/Right)
      const exitRoll = Math.max(4, this.thresholdDeg - Math.min(this.hysteresisDeg, this.thresholdDeg - 3));
      const targetLane = this._resolveThreeZone(relRoll, this.currentLane, this.thresholdDeg, exitRoll);
      if (targetLane !== this.currentLane) {
        if (this._pendingLane !== targetLane) {
          this._pendingLane = targetLane;
          this._pendingLaneSince = now;
        } else if (now - this._pendingLaneSince >= this.debounceMs) {
          this.currentLane = targetLane;
        }
      } else {
        this._pendingLane = this.currentLane;
      }

      // Pitch (Forward tilt = negative relPitch -> Throttle +1, Back tilt = positive -> Brake -1)
      if (this.enablePitch) {
        const exitPitch = Math.max(6, this.pitchThresholdDeg - 5);
        const mappedPitch = -relPitch; // forward tilt becomes positive throttle direction
        const targetThr = this._resolveThreeZone(mappedPitch, this.currentThrottle, this.pitchThresholdDeg, exitPitch);
        if (targetThr !== this.currentThrottle) {
          if (this._pendingThrottle !== targetThr) {
            this._pendingThrottle = targetThr;
            this._pendingThrottleSince = now;
          } else if (now - this._pendingThrottleSince >= this.debounceMs) {
            this.currentThrottle = targetThr;
          }
        } else {
          this._pendingThrottle = this.currentThrottle;
        }
      } else {
        this.currentThrottle = 0;
      }

      this._onUpdate({
        lane: this.currentLane,
        throttle: this.currentThrottle,
        relativeRoll: relRoll,
        relativePitch: relPitch,
        calibrated: false
      });
    }
  }

  class RehabLink {
    constructor() {
      this.peer = null;
      this.conn = null;
      this.bc = null;
      this.roomCode = '';
      this.role = null;
      this.connected = false;
      this._callbacks = {};
    }

    static generateRoomCode() {
      return String(Math.floor(1000 + Math.random() * 9000));
    }

    _peerIdForRoom(code) {
      return 'reliveot-rtw2-' + String(code).trim();
    }

    createHost(roomCode, callbacks = {}) {
      this.close();
      this.roomCode = String(roomCode).trim();
      this.role = 'host';
      this._callbacks = callbacks;

      if (typeof BroadcastChannel !== 'undefined') {
        try {
          this.bc = new BroadcastChannel('rehab_tilt_v2_' + this.roomCode);
          this.bc.onmessage = (ev) => {
            if (!ev || !ev.data) return;
            if (ev.data.type === 'hello') {
              this.connected = true;
              this.bc.postMessage({ type: 'welcome' });
              this._callbacks.onConnect && this._callbacks.onConnect({ transport: 'local' });
            } else {
              this._callbacks.onMessage && this._callbacks.onMessage(ev.data);
            }
          };
        } catch (e) {}
      }

      if (typeof Peer !== 'undefined') {
        try {
          this.peer = new Peer(this._peerIdForRoom(this.roomCode), { debug: 0 });
          this.peer.on('open', () => {
            this._callbacks.onReady && this._callbacks.onReady(this.roomCode);
          });
          this.peer.on('connection', (conn) => {
            if (this.conn) {
              try { this.conn.close(); } catch (e) {}
            }
            this.conn = conn;
            conn.on('open', () => {
              this.connected = true;
              this._callbacks.onConnect && this._callbacks.onConnect({ transport: 'webrtc' });
            });
            conn.on('data', (data) => {
              this._callbacks.onMessage && this._callbacks.onMessage(data);
            });
            conn.on('close', () => {
              this.connected = false;
              this._callbacks.onDisconnect && this._callbacks.onDisconnect();
            });
          });
          this.peer.on('error', (err) => {
            this._callbacks.onError && this._callbacks.onError(err);
          });
        } catch (err) {
          this._callbacks.onError && this._callbacks.onError(err);
        }
      } else {
        this._callbacks.onReady && this._callbacks.onReady(this.roomCode);
      }
    }

    connectController(roomCode, callbacks = {}) {
      this.close();
      this.roomCode = String(roomCode).trim();
      this.role = 'controller';
      this._callbacks = callbacks;

      if (typeof BroadcastChannel !== 'undefined') {
        try {
          this.bc = new BroadcastChannel('rehab_tilt_v2_' + this.roomCode);
          this.bc.onmessage = (ev) => {
            if (ev && ev.data && ev.data.type === 'welcome') {
              this.connected = true;
              this._callbacks.onConnect && this._callbacks.onConnect({ transport: 'local' });
            }
          };
          this.bc.postMessage({ type: 'hello' });
        } catch (e) {}
      }

      if (typeof Peer !== 'undefined') {
        try {
          this.peer = new Peer(undefined, { debug: 0 });
          this.peer.on('open', () => {
            const conn = this.peer.connect(this._peerIdForRoom(this.roomCode), { reliable: false });
            this.conn = conn;
            conn.on('open', () => {
              this.connected = true;
              this._callbacks.onConnect && this._callbacks.onConnect({ transport: 'webrtc' });
            });
            conn.on('close', () => {
              this.connected = false;
              this._callbacks.onDisconnect && this._callbacks.onDisconnect();
            });
            conn.on('error', (err) => {
              this._callbacks.onError && this._callbacks.onError(err);
            });
          });
          this.peer.on('error', (err) => {
            this._callbacks.onError && this._callbacks.onError(err);
          });
        } catch (err) {
          this._callbacks.onError && this._callbacks.onError(err);
        }
      }
    }

    send(payload) {
      if (this.conn && this.conn.open) {
        try { this.conn.send(payload); } catch (e) {}
      }
      if (this.bc) {
        try { this.bc.postMessage(payload); } catch (e) {}
      }
    }

    close() {
      this.connected = false;
      if (this.conn) {
        try { this.conn.close(); } catch (e) {}
        this.conn = null;
      }
      if (this.peer) {
        try { this.peer.destroy(); } catch (e) {}
        this.peer = null;
      }
      if (this.bc) {
        try { this.bc.close(); } catch (e) {}
        this.bc = null;
      }
    }
  }

  async function requestWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        return await navigator.wakeLock.request('screen');
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  global.TiltRehabKit = {
    TiltSensorEngine,
    RehabLink,
    requestWakeLock
  };
})(window);
