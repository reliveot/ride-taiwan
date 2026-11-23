/**
 * TiltRehabKit v1.0 — Reusable Phone Tilt Sensor & Dual-Device Pairing Module
 * Designed for 吱吱復健 web rehabilitation games (GitHub Pages / HTTPS).
 *
 * Exports global `window.TiltRehabKit`:
 *  - TiltSensorEngine: DeviceOrientation / iOS permission / Neutral Calibration /
 *    Hysteresis & Debounce anti-jitter for 3-zone (-1 Left, 0 Center, +1 Right) control.
 *  - RehabLink: Dual-device pairing via PeerJS (WebRTC) + BroadcastChannel fallback.
 */
(function (global) {
  'use strict';

  class TiltSensorEngine {
    constructor(options = {}) {
      this.thresholdDeg = options.thresholdDeg ?? 18;
      this.hysteresisDeg = options.hysteresisDeg ?? 5;
      this.debounceMs = options.debounceMs ?? 120;
      this.smoothingAlpha = options.smoothingAlpha ?? 0.35;

      this.neutralAngle = 0;
      this.rawAngle = 0;
      this.smoothedAngle = 0;
      this.currentLane = 0; // -1: Left, 0: Center, 1: Right
      this._pendingLane = 0;
      this._pendingSince = 0;
      this._listening = false;
      this._hasReading = false;
      this._onUpdate = options.onUpdate || (() => {});
      this._onStatus = options.onStatus || (() => {});

      this._handleOrientation = this._handleOrientation.bind(this);
    }

    setConfig({ thresholdDeg, hysteresisDeg, debounceMs, smoothingAlpha }) {
      if (typeof thresholdDeg === 'number') this.thresholdDeg = thresholdDeg;
      if (typeof hysteresisDeg === 'number') this.hysteresisDeg = hysteresisDeg;
      if (typeof debounceMs === 'number') this.debounceMs = debounceMs;
      if (typeof smoothingAlpha === 'number') this.smoothingAlpha = smoothingAlpha;
    }

    async requestPermissionAndStart() {
      if (typeof DeviceOrientationEvent === 'undefined') {
        this._onStatus({ supported: false, message: '此裝置不支援方向感測器，請使用下方觸控按鈕測試。' });
        return false;
      }

      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
          const state = await DeviceOrientationEvent.requestPermission();
          if (state !== 'granted') {
            this._onStatus({ supported: false, message: '未取得動作感測器權限，請允許權限或使用觸控按鈕。' });
            return false;
          }
        } catch (err) {
          this._onStatus({ supported: false, message: '無法啟動感測器權限：' + (err && err.message ? err.message : '未知錯誤') });
          return false;
        }
      }

      if (!this._listening) {
        window.addEventListener('deviceorientation', this._handleOrientation, true);
        this._listening = true;
      }
      this._onStatus({ supported: true, message: '感測器已啟動，請保持自然握姿並點擊「校正中立位置」。' });
      return true;
    }

    stop() {
      if (this._listening) {
        window.removeEventListener('deviceorientation', this._handleOrientation, true);
        this._listening = false;
      }
    }

    calibrateNeutral() {
      this.neutralAngle = this.smoothedAngle;
      this.currentLane = 0;
      this._pendingLane = 0;
      this._onUpdate({
        lane: 0,
        relativeAngle: 0,
        rawAngle: this.rawAngle,
        neutralAngle: this.neutralAngle,
        calibrated: true
      });
      return this.neutralAngle;
    }

    _handleOrientation(e) {
      if (e.gamma === null || typeof e.gamma !== 'number') return;
      // Portrait gamma is [-90, 90]: negative = tilt left, positive = tilt right
      let angle = e.gamma;
      // Handle screen orientation if rotated to landscape
      const orient = (screen.orientation && typeof screen.orientation.angle === 'number')
        ? screen.orientation.angle
        : (typeof window.orientation === 'number' ? window.orientation : 0);

      if (orient === 90 && typeof e.beta === 'number') {
        angle = e.beta;
      } else if (orient === -90 && typeof e.beta === 'number') {
        angle = -e.beta;
      } else if (orient === 180) {
        angle = -e.gamma;
      }

      this.rawAngle = angle;
      if (!this._hasReading) {
        this.smoothedAngle = angle;
        this.neutralAngle = angle;
        this._hasReading = true;
      } else {
        this.smoothedAngle = this.smoothingAlpha * angle + (1 - this.smoothingAlpha) * this.smoothedAngle;
      }

      const rel = this.smoothedAngle - this.neutralAngle;
      const th = this.thresholdDeg;
      const exitTh = Math.max(4, th - Math.min(this.hysteresisDeg, th - 3));

      let targetLane = this.currentLane;
      if (this.currentLane === 0) {
        if (rel <= -th) targetLane = -1;
        else if (rel >= th) targetLane = 1;
      } else if (this.currentLane === -1) {
        if (rel >= th) targetLane = 1;
        else if (rel > -exitTh) targetLane = 0;
      } else if (this.currentLane === 1) {
        if (rel <= -th) targetLane = -1;
        else if (rel < exitTh) targetLane = 0;
      }

      const now = performance.now();
      if (targetLane !== this.currentLane) {
        if (this._pendingLane !== targetLane) {
          this._pendingLane = targetLane;
          this._pendingSince = now;
        } else if (now - this._pendingSince >= this.debounceMs) {
          this.currentLane = targetLane;
        }
      } else {
        this._pendingLane = this.currentLane;
      }

      this._onUpdate({
        lane: this.currentLane,
        relativeAngle: rel,
        rawAngle: this.rawAngle,
        neutralAngle: this.neutralAngle,
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
      this.role = null; // 'host' | 'controller'
      this.connected = false;
      this._callbacks = {};
    }

    static generateRoomCode() {
      return String(Math.floor(1000 + Math.random() * 9000));
    }

    _peerIdForRoom(code) {
      return 'reliveot-rtw-' + String(code).trim();
    }

    createHost(roomCode, callbacks = {}) {
      this.close();
      this.roomCode = String(roomCode).trim();
      this.role = 'host';
      this._callbacks = callbacks;

      // 1. BroadcastChannel for same-browser / same-device tab pairing
      if (typeof BroadcastChannel !== 'undefined') {
        try {
          this.bc = new BroadcastChannel('rehab_tilt_' + this.roomCode);
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
        } catch (e) { /* ignore */ }
      }

      // 2. PeerJS WebRTC for cross-device phone <-> PC/iPad pairing
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

      // 1. BroadcastChannel fallback
      if (typeof BroadcastChannel !== 'undefined') {
        try {
          this.bc = new BroadcastChannel('rehab_tilt_' + this.roomCode);
          this.bc.onmessage = (ev) => {
            if (ev && ev.data && ev.data.type === 'welcome') {
              this.connected = true;
              this._callbacks.onConnect && this._callbacks.onConnect({ transport: 'local' });
            }
          };
          this.bc.postMessage({ type: 'hello' });
        } catch (e) { /* ignore */ }
      }

      // 2. PeerJS WebRTC
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
