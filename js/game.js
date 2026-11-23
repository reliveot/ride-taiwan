/**
 * 《騎遍台灣》V2.0 — Complete Marathon & Rehab Game Engine (Fixed Controls & Scenery-First Landmarks)
 */
(function () {
  'use strict';

  const { LANDMARKS, SPRINT_ROUTES, COLLECTIBLES, UNITS_PER_STATION } = window.RideTaiwanData;
  const { TiltSensorEngine, RehabLink, requestWakeLock } = window.TiltRehabKit;
  const AudioFX = window.RehabAudio;
  const STORAGE_KEY = 'rtw_v2_save_data';

  const $ = (id) => document.getElementById(id);

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function loadSave() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          tourUnits: parsed.tourUnits || 0,
          loopsCompleted: parsed.loopsCompleted || 0,
          unlockedIds: Array.isArray(parsed.unlockedIds) ? parsed.unlockedIds : [],
          records: Array.isArray(parsed.records) ? parsed.records : []
        };
      }
    } catch (e) {}
    return { tourUnits: 0, loopsCompleted: 0, unlockedIds: [], records: [] };
  }

  function writeSave(data) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) {}
  }

  let saveData = loadSave();

  const state = {
    view: 'home',
    running: false,
    paused: false,
    pausedByDisconnect: false,
    muted: false,

    mode: 'timed',
    timedMinutes: 3,
    sprintRouteId: 'west_coast',
    level: 'L1',
    baseSpeedLevel: 'medium',
    eventFreq: 'medium',
    speedControl: 'auto',
    safetyAssist: true,
    lowMotion: false,
    touchMode: 'hold', // 'hold' | 'tap'
    thresholdDeg: 16,
    localGyroActive: false,
    localPitchEnabled: false,
    controlMethod: 'keyboard',

    lane: 0,
    throttle: 0,
    bikeXNorm: 0,
    bikeLean: 0,
    pedalPhase: 0,
    roadScroll: 0,
    stamina: 100,
    distance: 0,
    elapsedSec: 0,
    currentSpeedUnits: 120,
    combo: 0,
    maxCombo: 0,
    boostTimer: 0,
    boostCooldown: 0,
    bumpTimer: 0,
    followingCyclist: false,
    stoppedAtConstruction: false,
    constructionWaitSec: 0,

    collectedCount: 0,
    eventsTotal: 0,
    eventsSuccess: 0,
    leftTotal: 0,
    leftSuccess: 0,
    rightTotal: 0,
    rightSuccess: 0,
    accelCount: 0,
    decelCount: 0,
    stopCount: 0,
    newUnlockedThisRun: [],
    completedStationsCount: 0,

    activeEvent: null,
    spawnCooldown: 1.5,
    rng: Math.random,
    particles: [],
    floatingTexts: [],

    roomCode: RehabLink.generateRoomCode(),
    phoneConnected: false
  };

  let link = new RehabLink();
  let controllerSensor = null;
  let localSensor = null;
  let rafId = 0;
  let lastFrameMs = 0;
  let toastTimeout = 0;
  let wakeLock = null;

  function showView(v) {
    state.view = v;
    $('homeView').classList.toggle('hidden', v !== 'home');
    $('gameView').classList.toggle('hidden', v !== 'game');
    $('controllerView').classList.toggle('hidden', v !== 'controller');
    $('topActions').classList.toggle('hidden', v === 'controller');
    if (v === 'home') refreshHomeStats();
  }

  function refreshHomeStats() {
    $('openAlbumBtn').textContent = '📖 景點收藏冊 (' + saveData.unlockedIds.length + ' / ' + LANDMARKS.length + ')';
    const loopPct = Math.round(((saveData.tourUnits % (UNITS_PER_STATION * LANDMARKS.length)) / (UNITS_PER_STATION * LANDMARKS.length)) * 100);
    $('homeTourBadge').textContent = '第 ' + (saveData.loopsCompleted + 1) + ' 圈 ' + loopPct + '%';
  }

  function updateConnectionUI() {
    const pill = $('connStatusPill');
    if (state.phoneConnected) {
      pill.textContent = '📱 手機已連線';
      pill.className = 'pill connected';
      $('homeConnText').textContent = '✅ 手機控制器已連線！可切換傾斜或觸控遙控電腦。';
    } else if (state.localGyroActive) {
      pill.textContent = '🧭 本機陀螺儀';
      pill.className = 'pill connected';
    } else {
      pill.textContent = '⌨️ 單機 / 觸控';
      pill.className = 'pill sim';
      $('homeConnText').textContent = '掃描 QR Code 或輸入房號即可用手機遙控（也可直接單機遊玩）。';
    }
  }

  function renderQRCode() {
    const base = window.location.protocol.startsWith('http')
      ? (window.location.origin + window.location.pathname)
      : '';
    const ctrlUrl = base ? (base + '?mode=controller&room=' + state.roomCode) : ('RTW-ROOM:' + state.roomCode);
    const qrWrap = $('qrContainer');
    if (!qrWrap) return;
    qrWrap.innerHTML = '';
    if (typeof QRCode !== 'undefined') {
      new QRCode(qrWrap, { text: ctrlUrl, width: 100, height: 100, colorDark: '#0f766e', colorLight: '#ffffff' });
    } else {
      qrWrap.innerHTML = '<div style="font-size:11px;color:#64748b;text-align:center;">房號配對<br><strong style="font-size:16px;color:#0f766e;">' + state.roomCode + '</strong></div>';
    }
  }

  function initHostPairing() {
    $('roomCodeDisplay').textContent = state.roomCode;
    renderQRCode();
    // Retry QRCode & PeerJS if async CDN finishes slightly after boot
    let retries = 0;
    const cdnWait = setInterval(() => {
      retries += 1;
      if (typeof QRCode !== 'undefined') renderQRCode();
      if (typeof Peer !== 'undefined' && !link.peer) {
        startHostLink();
        clearInterval(cdnWait);
      } else if (retries > 12) {
        clearInterval(cdnWait);
      }
    }, 500);
    startHostLink();
  }

  function startHostLink() {
    link.createHost(state.roomCode, {
      onConnect: () => {
        state.phoneConnected = true;
        if (state.pausedByDisconnect && state.running) {
          state.paused = false;
          state.pausedByDisconnect = false;
          $('disconnectBanner').classList.add('hidden');
        }
        updateConnectionUI();
      },
      onDisconnect: () => {
        state.phoneConnected = false;
        if (state.running && (state.controlMethod === 'phone_tilt' || state.controlMethod === 'phone_touch')) {
          state.paused = true;
          state.pausedByDisconnect = true;
          $('disconnectBanner').classList.remove('hidden');
        }
        updateConnectionUI();
      },
      onMessage: (data) => {
        if (!data) return;
        if (data.type === 'ctrl') {
          state.controlMethod = data.source === 'touch' ? 'phone_touch' : 'phone_tilt';
          setLane(data.lane);
          if (state.speedControl === 'manual' && typeof data.throttle === 'number') {
            setThrottle(data.throttle);
          }
        } else if (data.type === 'calibrate') {
          setLane(0);
          setThrottle(0);
        }
      }
    });
  }

  function setLane(newLane) {
    const clamped = newLane < 0 ? -1 : (newLane > 0 ? 1 : 0);
    if (clamped !== state.lane) {
      state.lane = clamped;
      if (state.running && !state.paused) AudioFX.playLaneSwitch();
    }
    document.querySelectorAll('.lane-btn').forEach((b) => {
      b.classList.toggle('active', Number(b.dataset.lane) === state.lane);
    });
  }

  function setThrottle(thr) {
    state.throttle = thr > 0 ? 1 : (thr < 0 ? -1 : 0);
    $('btnThrottle').classList.toggle('active-thr', state.throttle === 1);
    $('btnBrake').classList.toggle('active-brk', state.throttle === -1);
  }

  // --- Local Phone Gyroscope (Direct Play on Phone) ---
  function setupLocalGyro() {
    if (!localSensor) {
      localSensor = new TiltSensorEngine({
        thresholdDeg: state.thresholdDeg,
        enablePitch: state.localPitchEnabled,
        onUpdate: (data) => {
          if (state.running && !state.paused) {
            state.controlMethod = 'local_tilt';
            setLane(data.lane);
            if (state.speedControl === 'manual' && state.localPitchEnabled) {
              setThrottle(data.throttle);
            }
          }
        },
        onStatus: (st) => {
          $('localGyroBadge').textContent = st.supported ? '✅ 已啟用' : '⚠️ 不支援';
          $('localGyroBadge').className = st.supported ? 'pill connected' : 'pill warn';
        }
      });
    }
  }

  function startGame() {
    state.running = true;
    state.paused = false;
    state.pausedByDisconnect = false;
    $('disconnectBanner').classList.add('hidden');
    $('manualSpeedBar').classList.toggle('hidden', state.speedControl !== 'manual');
    $('hudCalibrateBtn').classList.toggle('hidden', !state.localGyroActive);

    state.lane = 0;
    state.throttle = 0;
    state.bikeXNorm = 0;
    state.stamina = 100;
    state.distance = 0;
    state.elapsedSec = 0;
    state.combo = 0;
    state.maxCombo = 0;
    state.boostTimer = 0;
    state.boostCooldown = 0;
    state.bumpTimer = 0;
    state.followingCyclist = false;
    state.stoppedAtConstruction = false;
    state.constructionWaitSec = 0;

    state.collectedCount = 0;
    state.eventsTotal = 0;
    state.eventsSuccess = 0;
    state.leftTotal = 0;
    state.leftSuccess = 0;
    state.rightTotal = 0;
    state.rightSuccess = 0;
    state.accelCount = 0;
    state.decelCount = 0;
    state.stopCount = 0;
    state.newUnlockedThisRun = [];
    state.completedStationsCount = 0;

    state.activeEvent = null;
    state.spawnCooldown = 1.2;
    state.particles = [];
    state.floatingTexts = [];
    $('eventBanner').classList.add('hidden');
    $('postcardToast').classList.add('hidden');

    if (state.mode === 'sprint') {
      const route = SPRINT_ROUTES.find((r) => r.id === state.sprintRouteId) || SPRINT_ROUTES[0];
      state.rng = mulberry32(route.seed);
    } else {
      state.rng = Math.random;
    }

    showView('game');
    resizeCanvas();
    updateHUD();

    if (rafId) cancelAnimationFrame(rafId);
    lastFrameMs = performance.now();
    rafId = requestAnimationFrame(gameLoop);
  }

  function endGame(reason) {
    state.running = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }

    const loopTotal = UNITS_PER_STATION * LANDMARKS.length;
    if (state.mode !== 'sprint') {
      saveData.tourUnits += Math.round(state.distance);
      saveData.loopsCompleted = Math.floor(saveData.tourUnits / loopTotal);
    }

    const successRate = state.eventsTotal > 0 ? Math.round((state.eventsSuccess / state.eventsTotal) * 100) : 100;
    const condKey = [state.mode, state.mode === 'sprint' ? state.sprintRouteId : state.timedMinutes, state.level, state.controlMethod, state.speedControl, state.safetyAssist].join('|');

    const record = {
      id: Date.now(),
      date: new Date().toLocaleDateString('zh-TW'),
      mode: state.mode,
      condKey,
      level: state.level,
      controlMethod: state.controlMethod,
      speedControl: state.speedControl,
      safetyAssist: state.safetyAssist,
      elapsedSec: Math.round(state.elapsedSec),
      distance: Math.round(state.distance),
      collectedCount: state.collectedCount,
      maxCombo: state.maxCombo,
      successRate,
      leftSuccess: state.leftSuccess,
      leftTotal: state.leftTotal,
      rightSuccess: state.rightSuccess,
      rightTotal: state.rightTotal,
      accelCount: state.accelCount,
      decelCount: state.decelCount,
      stopCount: state.stopCount,
      reason
    };

    const sameCond = saveData.records.filter((r) => r.condKey === condKey);
    let isBest = false;
    if (sameCond.length > 0) {
      if (state.mode === 'sprint' && reason === 'finished') {
        const bestTime = Math.min(...sameCond.filter((r) => r.reason === 'finished').map((r) => r.elapsedSec));
        if (!isFinite(bestTime) || record.elapsedSec < bestTime) isBest = true;
      } else if (state.mode !== 'sprint') {
        const bestDist = Math.max(...sameCond.map((r) => r.distance));
        if (record.distance > bestDist) isBest = true;
      }
    }

    saveData.records.unshift(record);
    if (saveData.records.length > 30) saveData.records.length = 30;
    writeSave(saveData);
    showSummaryModal(record, isBest, sameCond.length > 0);
  }

  function spawnNextEvent() {
    const r = state.rng;
    state.spawnCooldown = state.eventFreq === 'low' ? 1.2 : (state.eventFreq === 'high' ? 0.6 : 0.9);
    const roll = r();
    let type = 'collect';
    if (state.stamina < 45 && roll < 0.42) type = 'collect';
    else if (roll < 0.30) type = 'collect';
    else if (roll < 0.78 || state.level === 'L1') type = 'obstacle';
    else type = 'corridor';

    if (type === 'collect') {
      const item = COLLECTIBLES[Math.floor(r() * COLLECTIBLES.length)];
      const lane = state.level === 'L1' ? (r() < 0.5 ? -1 : 1) : (Math.floor(r() * 3) - 1);
      state.activeEvent = { template: 'collect', lane, item, z: 1.0, resolved: false };
      return;
    }

    if (type === 'obstacle') {
      const kindRoll = r();
      let kind = 'bump';
      if (state.level !== 'L1') {
        if (kindRoll > 0.80) kind = 'construction';
        else if (kindRoll > 0.55) kind = 'cyclist';
      } else if (kindRoll > 0.75) {
        kind = 'cyclist';
      }

      if (kind === 'construction') {
        const safeLane = Math.floor(r() * 3) - 1;
        state.activeEvent = { template: 'obstacle', kind: 'construction', safeLane, blockedLanes: [-1, 0, 1].filter((l) => l !== safeLane), z: 1.0, resolved: false };
        const dirText = safeLane === -1 ? '左側' : (safeLane === 0 ? '中央' : '右側');
        showBanner('🚧 前方施工，請靠' + dirText + '通行！', 'warn');
        return;
      }
      if (kind === 'cyclist') {
        const occLane = Math.floor(r() * 3) - 1;
        state.activeEvent = { template: 'obstacle', kind: 'cyclist', lane: occLane, z: 1.0, resolved: false };
        showBanner('🚴 前方有慢速車友，準備換道超車！', '');
        return;
      }
      const count = (state.level === 'L3' && r() < 0.45) ? 2 : 1;
      const allLanes = [-1, 0, 1];
      const blocked = [];
      for (let i = 0; i < count; i++) blocked.push(allLanes.splice(Math.floor(r() * allLanes.length), 1)[0]);
      state.activeEvent = { template: 'obstacle', kind: 'bump', blockedLanes: blocked, z: 1.0, resolved: false };
      return;
    }

    const segCount = state.level === 'L2' ? 3 : 4;
    const seq = [];
    let cur = Math.floor(r() * 3) - 1;
    for (let i = 0; i < segCount; i++) {
      seq.push(cur);
      const nextChoices = [-1, 0, 1].filter((l) => Math.abs(l - cur) <= 1);
      cur = nextChoices[Math.floor(r() * nextChoices.length)];
    }
    state.activeEvent = { template: 'corridor', seq, segIndex: 0, segProgress: 0, failed: false, z: 1.0 };
    showBanner('✨ 沿著發光安全車道前進！', 'boost');
  }

  function showBanner(msg, cls) {
    const el = $('eventBanner');
    el.textContent = msg;
    el.className = 'event-banner' + (cls ? ' ' + cls : '');
    el.classList.remove('hidden');
  }

  function hideBanner() { $('eventBanner').classList.add('hidden'); }

  function recordEventOutcome(success, laneHint) {
    state.eventsTotal += 1;
    if (laneHint === -1) { state.leftTotal += 1; if (success) state.leftSuccess += 1; }
    else if (laneHint === 1) { state.rightTotal += 1; if (success) state.rightSuccess += 1; }

    if (success) {
      state.eventsSuccess += 1;
      state.combo += 1;
      if (state.combo > state.maxCombo) state.maxCombo = state.combo;
      if (state.combo % 3 === 0 && state.boostCooldown <= 0) {
        state.boostTimer = 1.0;
        state.boostCooldown = 5.0;
        state.accelCount += 1;
        AudioFX.playBoost();
        showBanner('🔥 連擊 ' + state.combo + '！順風加速 1 秒！', 'boost');
      }
    } else {
      state.combo = 0;
    }
  }

  function gameLoop(now) {
    if (!state.running) return;
    const dt = Math.min(0.05, (now - lastFrameMs) / 1000);
    lastFrameMs = now;
    if (!state.paused) updatePhysics(dt);
    renderScene();
    rafId = requestAnimationFrame(gameLoop);
  }

  function getCurrentStationIndex() {
    if (state.mode === 'sprint') {
      const route = SPRINT_ROUTES.find((r) => r.id === state.sprintRouteId) || SPRINT_ROUTES[0];
      return (route.startStation + Math.floor(state.distance / UNITS_PER_STATION)) % LANDMARKS.length;
    }
    return Math.floor(((saveData.tourUnits + state.distance) % (UNITS_PER_STATION * LANDMARKS.length)) / UNITS_PER_STATION);
  }

  function triggerPassingLandmark(idx) {
    const lm = LANDMARKS[idx];
    if (!lm) return;
    if (!saveData.unlockedIds.includes(lm.id)) {
      saveData.unlockedIds.push(lm.id);
      state.newUnlockedThisRun.push(lm);
      writeSave(saveData);
    }
    AudioFX.playStamp();
    $('postcardImg').src = lm.image;
    $('postcardTitle').textContent = lm.county + ' · ' + lm.name;
    $('postcardToast').classList.remove('hidden');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => $('postcardToast').classList.add('hidden'), 4200);
  }

  function updatePhysics(dt) {
    state.elapsedSec += dt;
    if (state.boostTimer > 0) state.boostTimer = Math.max(0, state.boostTimer - dt);
    if (state.boostCooldown > 0) state.boostCooldown = Math.max(0, state.boostCooldown - dt);
    if (state.bumpTimer > 0) state.bumpTimer = Math.max(0, state.bumpTimer - dt);

    const drainRate = state.stoppedAtConstruction ? 0.2 : 0.4;
    state.stamina = Math.max(0, state.stamina - drainRate * dt);

    if (state.mode === 'timed' && state.elapsedSec >= state.timedMinutes * 60) { endGame('timeup'); return; }
    if (state.mode === 'endurance' && state.stamina <= 0) { endGame('exhausted'); return; }
    if (state.mode === 'sprint') {
      const route = SPRINT_ROUTES.find((r) => r.id === state.sprintRouteId) || SPRINT_ROUTES[0];
      if (state.distance >= route.distanceUnits) { endGame('finished'); return; }
    }

    const prevX = state.bikeXNorm;
    state.bikeXNorm += (state.lane - state.bikeXNorm) * Math.min(1, dt * 11);
    state.bikeLean = state.lowMotion ? 0 : (state.lane - prevX) * 0.22;

    const baseSpeedMap = { slow: 85, medium: 120, fast: 158 };
    const baseSpd = baseSpeedMap[state.baseSpeedLevel] || 120;
    const staminaFactor = 0.55 + 0.45 * (state.stamina / 100);
    let speedMult = staminaFactor;

    if (state.speedControl === 'manual') {
      if (state.throttle === 1) speedMult *= 1.25;
      else if (state.throttle === -1) speedMult *= 0.45;
    }

    if (state.safetyAssist && state.activeEvent && state.activeEvent.template === 'obstacle') {
      const ev = state.activeEvent;
      if (ev.z < 0.42 && ev.z > 0.16) {
        const inDanger = (ev.kind === 'bump' && ev.blockedLanes.includes(state.lane)) ||
          (ev.kind === 'cyclist' && ev.lane === state.lane) ||
          (ev.kind === 'construction' && state.lane !== ev.safeLane);
        if (inDanger) speedMult *= 0.68;
      }
    }

    if (state.stoppedAtConstruction) speedMult = 0;
    else if (state.followingCyclist) speedMult = Math.min(speedMult, 0.48);
    else if (state.bumpTimer > 0) speedMult *= 0.80;
    else if (state.boostTimer > 0) speedMult *= 1.20;

    state.currentSpeedUnits = baseSpd * speedMult;
    state.distance += state.currentSpeedUnits * dt;
    state.pedalPhase += dt * (state.currentSpeedUnits * 0.065);
    state.roadScroll = (state.roadScroll + dt * (state.currentSpeedUnits * 0.012)) % 1;

    // Scenery first! Stamp postcard AFTER completing each 1000-unit stretch of that county
    const completed = Math.floor(state.distance / UNITS_PER_STATION);
    if (completed > state.completedStationsCount) {
      const finishedIdx = (getCurrentStationIndex() - 1 + LANDMARKS.length) % LANDMARKS.length;
      state.completedStationsCount = completed;
      triggerPassingLandmark(finishedIdx);
    }

    if (!state.activeEvent) {
      state.spawnCooldown -= dt;
      if (state.spawnCooldown <= 0) spawnNextEvent();
    } else {
      updateActiveEvent(dt);
    }

    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 220 * dt; p.life -= dt;
      if (p.life <= 0) state.particles.splice(i, 1);
    }
    for (let i = state.floatingTexts.length - 1; i >= 0; i--) {
      const ft = state.floatingTexts[i];
      ft.y -= 34 * dt; ft.life -= dt;
      if (ft.life <= 0) state.floatingTexts.splice(i, 1);
    }

    updateHUD();
  }

  function updateActiveEvent(dt) {
    const ev = state.activeEvent;
    const approachRate = Math.max(0.05, state.currentSpeedUnits / 360);

    if (ev.template === 'collect') {
      ev.z -= approachRate * dt;
      if (!ev.resolved && ev.z <= 0.17 && Math.abs(state.bikeXNorm - ev.lane) < 0.42) {
        ev.resolved = true;
        state.stamina = Math.min(100, state.stamina + ev.item.stamina);
        state.collectedCount += 1;
        AudioFX.playCollect();
        spawnFeedback(ev.lane, '+' + ev.item.stamina + '% 體力 ' + ev.item.icon, ev.item.color);
        state.activeEvent = null;
        return;
      }
      if (ev.z <= 0.02) state.activeEvent = null;
      return;
    }

    if (ev.template === 'obstacle') {
      if (ev.kind === 'construction') {
        if (!state.stoppedAtConstruction) {
          ev.z -= approachRate * dt;
          if (ev.z <= 0.22 && state.lane !== ev.safeLane) {
            state.stoppedAtConstruction = true;
            state.constructionWaitSec = 0;
            state.stopCount += 1;
            state.combo = 0;
            AudioFX.playBump();
            const dirText = ev.safeLane === -1 ? '左側' : (ev.safeLane === 0 ? '中央' : '右側');
            showBanner('🛑 施工停車！請換到' + dirText + '車道繼續前進', 'warn');
          } else if (ev.z <= 0.06 && !ev.resolved) {
            ev.resolved = true;
            recordEventOutcome(true, ev.safeLane);
            hideBanner();
            state.activeEvent = null;
          }
        } else {
          state.constructionWaitSec += dt;
          if (state.lane === ev.safeLane || state.constructionWaitSec >= 6.0) {
            if (state.constructionWaitSec >= 6.0) showBanner('👷 辛苦了！工作人員幫您開便道通過～', '');
            else { hideBanner(); recordEventOutcome(true, ev.safeLane); }
            state.stoppedAtConstruction = false;
            ev.resolved = true;
            state.activeEvent = null;
          }
        }
        return;
      }

      if (ev.kind === 'cyclist') {
        if (!state.followingCyclist) {
          ev.z -= (approachRate * 0.72) * dt;
          if (ev.z <= 0.24 && state.lane === ev.lane) {
            state.followingCyclist = true;
            state.decelCount += 1;
            state.combo = 0;
            AudioFX.playBell();
            showBanner('🚴 被慢速車友擋住了！請換道超車', 'warn');
          } else if (ev.z <= 0.04 && !ev.resolved) {
            ev.resolved = true;
            recordEventOutcome(true, state.lane);
            hideBanner();
            state.activeEvent = null;
          }
        } else if (state.lane !== ev.lane) {
          state.followingCyclist = false;
          hideBanner();
          spawnFeedback(state.lane, '順利超車！', '#0f766e');
          state.activeEvent = null;
        }
        return;
      }

      ev.z -= approachRate * dt;
      if (!ev.resolved && ev.z <= 0.16) {
        ev.resolved = true;
        if (ev.blockedLanes.includes(state.lane)) {
          state.bumpTimer = 1.0;
          state.decelCount += 1;
          recordEventOutcome(false, state.lane);
          AudioFX.playBump();
          spawnFeedback(state.lane, '💦 顛簸減速 1 秒', '#dc2626');
        } else {
          recordEventOutcome(true, state.lane);
        }
      }
      if (ev.z <= 0.02) state.activeEvent = null;
      return;
    }

    if (ev.template === 'corridor') {
      ev.z = Math.max(0.14, ev.z - approachRate * dt);
      if (ev.z <= 0.20) {
        ev.segProgress += dt * 0.75;
        if (state.lane !== ev.seq[ev.segIndex]) ev.failed = true;
        if (ev.segProgress >= 1.0) {
          ev.segProgress = 0;
          ev.segIndex += 1;
          if (ev.segIndex >= ev.seq.length) {
            hideBanner();
            if (!ev.failed) {
              recordEventOutcome(true, state.lane);
              state.boostTimer = 1.0;
              state.accelCount += 1;
              AudioFX.playBoost();
              spawnFeedback(state.lane, '✨ 路線完美！加速 1 秒', '#0f766e');
            } else {
              recordEventOutcome(false, state.lane);
            }
            state.activeEvent = null;
          }
        }
      }
    }
  }

  function spawnFeedback(lane, text, color) {
    const canvas = $('gameCanvas');
    const px = laneToScreenX(lane, 0.12, canvas.width);
    const py = canvas.height * 0.72;
    state.floatingTexts.push({ x: px, y: py, text, life: 1.0, color });
    for (let i = 0; i < 10; i++) {
      const a = (Math.PI * 2 * i) / 10;
      state.particles.push({ x: px, y: py, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90 - 30, life: 0.55, maxLife: 0.55, color });
    }
  }

  function updateHUD() {
    const idx = getCurrentStationIndex();
    const lm = LANDMARKS[idx] || LANDMARKS[0];
    $('hudStageTitle').textContent = lm.icon + ' ' + lm.county + '風景 → 前往 ' + lm.name;

    if (state.mode === 'timed') {
      const rem = Math.max(0, state.timedMinutes * 60 - Math.floor(state.elapsedSec));
      $('hudModeInfo').textContent = '剩餘 ' + String(Math.floor(rem / 60)).padStart(2, '0') + ':' + String(rem % 60).padStart(2, '0');
    } else if (state.mode === 'sprint') {
      const route = SPRINT_ROUTES.find((r) => r.id === state.sprintRouteId) || SPRINT_ROUTES[0];
      $('hudModeInfo').textContent = '衝線進度 ' + Math.min(100, Math.round((state.distance / route.distanceUnits) * 100)) + '%';
    } else {
      $('hudModeInfo').textContent = '已撐 ' + String(Math.floor(state.elapsedSec / 60)).padStart(2, '0') + ':' + String(Math.floor(state.elapsedSec) % 60).padStart(2, '0');
    }

    $('hudStaminaText').textContent = Math.round(state.stamina) + '%';
    $('hudStaminaFill').style.width = Math.max(0, Math.min(100, state.stamina)) + '%';
    $('hudDistText').textContent = Math.round(state.distance);
    $('hudComboBadge').textContent = '🔥 ' + state.combo + ' 連擊';
  }

  function resizeCanvas() {
    const canvas = $('gameCanvas');
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = Math.max(320, Math.floor(rect.width));
    canvas.height = Math.max(380, Math.floor(rect.height));
  }

  function laneToScreenX(lane, depth, width) {
    const spreadBottom = width * 0.29;
    const spreadTop = width * 0.05;
    const spread = spreadBottom * (1 - depth) + spreadTop * depth;
    return width * 0.5 + lane * spread;
  }

  function renderScene() {
    const canvas = $('gameCanvas');
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const lm = LANDMARKS[getCurrentStationIndex()] || LANDMARKS[0];
    const th = lm.theme;

    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.42);
    sky.addColorStop(0, th.skyTop);
    sky.addColorStop(1, th.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h * 0.44);

    const horizonY = h * 0.40;
    ctx.fillStyle = th.hillBack;
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.quadraticCurveTo(w * 0.25, horizonY - 52, w * 0.5, horizonY - 12);
    ctx.quadraticCurveTo(w * 0.78, horizonY - 58, w, horizonY - 8);
    ctx.lineTo(w, horizonY + 10);
    ctx.lineTo(0, horizonY + 10);
    ctx.closePath();
    ctx.fill();

    // County Scenery Landmark Silhouette on Horizon (before stamp!)
    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.14)';
    if (lm.id === 'taipei_101') {
      ctx.fillRect(w * 0.76, horizonY - 70, 16, 70);
      ctx.fillRect(w * 0.81, horizonY - 88, 6, 18);
    } else if (lm.id === 'gaomei' || lm.id === 'nanliao') {
      [0.2, 0.75].forEach((fx) => {
        ctx.fillRect(w * fx - 2, horizonY - 46, 4, 46);
      });
    }
    ctx.restore();

    ctx.fillStyle = th.ground;
    ctx.fillRect(0, horizonY, w, h - horizonY);

    const roadTopW = w * 0.22;
    const roadBotW = w * 0.92;
    ctx.fillStyle = th.road;
    ctx.beginPath();
    ctx.moveTo(w * 0.5 - roadTopW * 0.5, horizonY);
    ctx.lineTo(w * 0.5 + roadTopW * 0.5, horizonY);
    ctx.lineTo(w * 0.5 + roadBotW * 0.5, h);
    ctx.lineTo(w * 0.5 - roadBotW * 0.5, h);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 8; i++) {
      const z0 = ((i + state.roadScroll) / 8);
      const z1 = Math.min(1, z0 + 0.06);
      const y0 = horizonY + Math.pow(z0, 1.55) * (h - horizonY);
      const y1 = horizonY + Math.pow(z1, 1.55) * (h - horizonY);
      const half0 = (roadTopW + (roadBotW - roadTopW) * Math.pow(z0, 1.55)) * 0.5;
      const half1 = (roadTopW + (roadBotW - roadTopW) * Math.pow(z1, 1.55)) * 0.5;
      [-0.33, 0.33].forEach((f) => {
        ctx.beginPath();
        ctx.moveTo(w * 0.5 + half0 * f, y0);
        ctx.lineTo(w * 0.5 + half1 * f, y1);
        ctx.stroke();
      });
    }

    // Roadside Scenery Trees scrolling toward player
    for (let i = 0; i < 6; i++) {
      const z = ((i + state.roadScroll) / 6);
      const p = Math.pow(z, 1.6);
      const y = horizonY + p * (h - horizonY);
      const halfRoad = (roadTopW + (roadBotW - roadTopW) * p) * 0.5;
      const scale = 0.25 + p * 0.95;
      [-1, 1].forEach((side) => {
        const tx = w * 0.5 + side * (halfRoad + 26 * scale);
        ctx.fillStyle = '#78350f';
        ctx.fillRect(tx - 3 * scale, y - 16 * scale, 6 * scale, 16 * scale);
        ctx.fillStyle = lm.id === 'taipei_101' ? '#f9a8d4' : th.accent;
        ctx.beginPath();
        ctx.arc(tx, y - 24 * scale, 14 * scale, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    if (state.boostTimer > 0 && !state.lowMotion) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const lx = (i % 2 === 0 ? 18 : w - 18) + (Math.random() * 14 - 7);
        const ly = h * 0.2 + Math.random() * h * 0.6;
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx, ly + 45); ctx.stroke();
      }
    }

    if (state.activeEvent) {
      const ev = state.activeEvent;
      if (ev.template === 'collect') {
        const p = 1 - ev.z;
        const y = horizonY + Math.pow(p, 1.45) * (h * 0.78 - horizonY);
        const x = laneToScreenX(ev.lane, ev.z, w);
        const r = 14 + p * 20;
        ctx.fillStyle = '#ffffff'; ctx.strokeStyle = ev.item.color; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.font = Math.round(r * 1.15) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(ev.item.icon, x, y + 2);
      } else if (ev.template === 'obstacle') {
        const p = 1 - ev.z;
        const y = horizonY + Math.pow(p, 1.45) * (h * 0.78 - horizonY);
        const r = 14 + p * 20;
        if (ev.kind === 'bump') {
          ev.blockedLanes.forEach((bl) => {
            const x = laneToScreenX(bl, ev.z, w);
            ctx.fillStyle = '#38bdf8';
            ctx.beginPath(); ctx.ellipse(x, y, r * 1.15, r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
            ctx.font = Math.round(r) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('💦', x, y);
          });
        } else if (ev.kind === 'cyclist') {
          const x = laneToScreenX(ev.lane, ev.z, w);
          ctx.fillStyle = '#fef3c7'; ctx.strokeStyle = '#d97706'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.font = Math.round(r * 1.15) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('🚴', x, y + 1);
        } else if (ev.kind === 'construction') {
          ev.blockedLanes.forEach((bl) => {
            const x = laneToScreenX(bl, ev.z, w);
            ctx.fillStyle = '#fee2e2'; ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.font = Math.round(r * 1.1) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('🚧', x, y + 1);
          });
          const sx = laneToScreenX(ev.safeLane, ev.z, w);
          ctx.fillStyle = '#22c55e'; ctx.font = 'bold ' + Math.round(r * 1.1) + 'px sans-serif'; ctx.textAlign = 'center';
          ctx.fillText('⬆️', sx, y);
        }
      } else if (ev.template === 'corridor') {
        const targetLane = ev.seq[ev.segIndex];
        const x = laneToScreenX(targetLane, 0.25, w);
        ctx.save();
        ctx.fillStyle = 'rgba(34, 197, 94, 0.35)'; ctx.strokeStyle = '#16a34a'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.roundRect(x - 42, horizonY + 30, 84, h * 0.45, 16); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('安全車道 ' + (ev.segIndex + 1) + '/' + ev.seq.length, x, horizonY + 60);
        ctx.restore();
      }
    }

    const bikeY = state.bumpTimer > 0 ? h * 0.81 + Math.sin(state.elapsedSec * 40) * 4 : h * 0.81;
    drawCyclist(ctx, laneToScreenX(state.bikeXNorm, 0.08, w), bikeY, state.bikeLean, state.pedalPhase);

    state.particles.forEach((p) => {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;
    state.floatingTexts.forEach((ft) => {
      ctx.globalAlpha = Math.min(1, ft.life);
      ctx.font = 'bold 18px sans-serif'; ctx.fillStyle = ft.color || '#ea580c'; ctx.textAlign = 'center';
      ctx.fillText(ft.text, ft.x, ft.y);
    });
    ctx.globalAlpha = 1;
  }

  function drawCyclist(ctx, x, y, lean, pedalPhase) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(lean);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.24)';
    ctx.beginPath(); ctx.ellipse(0, 34, 28, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1e293b';
    ctx.beginPath(); ctx.roundRect(-7, 4, 14, 32, 6); ctx.fill();
    ctx.strokeStyle = '#0f766e'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(0, 12); ctx.lineTo(0, -14); ctx.stroke();
    ctx.strokeStyle = '#334155'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(-22, -22); ctx.lineTo(22, -22); ctx.stroke();
    const bob = state.stoppedAtConstruction ? 0 : Math.sin(pedalPhase) * 2;
    ctx.fillStyle = '#ea580c'; ctx.beginPath(); ctx.roundRect(-16, -40 + bob, 32, 32, 11); ctx.fill();
    ctx.fillStyle = '#f59e0b'; ctx.beginPath(); ctx.roundRect(-11, -36 + bob, 22, 22, 7); ctx.fill();
    ctx.fillStyle = '#0d9488'; ctx.beginPath(); ctx.arc(0, -52 + bob, 13, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function showSummaryModal(rec, isBest, hasSameCond) {
    $('sumTime').textContent = String(Math.floor(rec.elapsedSec / 60)).padStart(2, '0') + ':' + String(rec.elapsedSec % 60).padStart(2, '0');
    $('sumDist').textContent = '+' + rec.distance + ' 單位';
    $('sumCombo').textContent = rec.maxCombo + ' 連擊';
    $('sumSuccess').textContent = rec.successRate + '%';
    $('sumLR').textContent = '左 ' + rec.leftSuccess + '/' + rec.leftTotal + ' · 右 ' + rec.rightSuccess + '/' + rec.rightTotal;

    if (isBest) {
      $('sumBestBadge').textContent = '🏆 相同設定下創下個人最佳紀錄！';
      $('sumBestBadge').className = 'pill connected';
    } else if (hasSameCond) {
      $('sumBestBadge').textContent = '已儲存至本機騎乘紀錄';
      $('sumBestBadge').className = 'pill sim';
    } else {
      $('sumBestBadge').textContent = '新條件組合首筆紀錄（不同設定不直接比對）';
      $('sumBestBadge').className = 'pill warn';
    }
    $('sumAdvDetail').textContent = '加減速與停車統計：加速 ' + rec.accelCount + ' 次 · 減速 ' + rec.decelCount + ' 次 · 施工停車 ' + rec.stopCount + ' 次（模式：' + rec.mode + ' / 分級：' + rec.level + '）';

    const list = $('sumNewLandmarks');
    list.innerHTML = '';
    if (state.newUnlockedThisRun.length === 0) {
      list.innerHTML = '<span style="font-size:0.82rem;color:#64748b;">本次無新增景點，繼續騎乘即可解鎖下一站！</span>';
    } else {
      state.newUnlockedThisRun.forEach((lm) => {
        const b = document.createElement('span');
        b.className = 'pill connected';
        b.textContent = lm.icon + ' ' + lm.county + ' ' + lm.name;
        list.appendChild(b);
      });
    }
    $('summaryModal').classList.remove('hidden');
  }

  function showAlbumModal() {
    const grid = $('albumGrid');
    grid.innerHTML = '';
    LANDMARKS.forEach((lm) => {
      const ok = saveData.unlockedIds.includes(lm.id);
      const card = document.createElement('div');
      card.className = 'album-item' + (ok ? '' : ' locked');
      card.innerHTML = '<img src="' + lm.image + '" alt="' + lm.name + '"><div class="lbl">' + (ok ? '✅ ' : '🔒 ') + lm.county + '<br>' + lm.name + '</div>';
      if (ok) {
        card.addEventListener('click', () => {
          $('albumDetailTitle').textContent = lm.icon + ' ' + lm.county + ' · ' + lm.name;
          $('albumDetailDesc').textContent = lm.description;
          $('albumDetailBox').classList.remove('hidden');
        });
      }
      grid.appendChild(card);
    });
    $('albumDetailBox').classList.add('hidden');
    $('albumModal').classList.remove('hidden');
  }

  function showHistoryModal() {
    const list = $('historyList');
    list.innerHTML = '';
    if (saveData.records.length === 0) {
      list.innerHTML = '<div style="font-size:0.85rem;color:#64748b;">尚無騎乘紀錄，快去騎一趟吧！</div>';
    } else {
      saveData.records.slice(0, 10).forEach((r) => {
        const item = document.createElement('div');
        item.className = 'panel-card';
        item.style.padding = '9px';
        item.innerHTML = '<div style="display:flex;justify-content:space-between;font-size:0.82rem;font-weight:800;"><span>' + r.date + ' · ' + r.mode + ' (' + r.level + ')</span><span style="color:#0f766e;">距離 ' + r.distance + '</span></div>' +
          '<div style="font-size:0.76rem;color:#64748b;">時間 ' + r.elapsedSec + '秒 · 連擊 ' + r.maxCombo + ' · 成功率 ' + r.successRate + '% · 控制：' + r.controlMethod + '</div>';
        list.appendChild(item);
      });
    }
    $('historyModal').classList.remove('hidden');
  }

  function initControllerMode(roomFromUrl) {
    showView('controller');
    if (roomFromUrl) $('ctrlRoomInput').value = roomFromUrl;

    controllerSensor = new TiltSensorEngine({
      thresholdDeg: state.thresholdDeg,
      enablePitch: false,
      onUpdate: (data) => {
        $('ctrlAngleReadout').textContent = Math.round(data.relativeRoll) + '°';
        const pct = Math.max(5, Math.min(95, 50 + (data.relativeRoll / 45) * 45));
        $('ctrlAngleDot').style.left = pct + '%';
        ['ctrlZoneLeft', 'ctrlZoneCenter', 'ctrlZoneRight'].forEach((id, idx) => {
          $(id).classList.toggle('active', data.lane === idx - 1);
        });
        link.send({ type: 'ctrl', source: 'tilt', lane: data.lane, throttle: data.throttle });
      },
      onStatus: (st) => { $('ctrlSensorStatus').textContent = st.message; }
    });

    const connectRoom = () => {
      const code = $('ctrlRoomInput').value.trim();
      if (!code) return;
      $('ctrlConnStatus').textContent = '連線中...';
      link.connectController(code, {
        onConnect: ({ transport }) => {
          $('ctrlConnStatus').textContent = transport === 'webrtc' ? '✅ 已透過網路配對' : '✅ 已透過本機分頁配對';
          $('ctrlConnStatus').className = 'pill connected';
        },
        onDisconnect: () => { $('ctrlConnStatus').textContent = '連線中斷'; $('ctrlConnStatus').className = 'pill'; },
        onError: () => { $('ctrlConnStatus').textContent = '連線失敗，請確認房號'; }
      });
    };

    $('ctrlConnectBtn').addEventListener('click', connectRoom);
    if (roomFromUrl) connectRoom();

    $('ctrlStartSensorBtn').addEventListener('click', async () => {
      await controllerSensor.requestPermissionAndStart();
      wakeLock = await requestWakeLock();
    });
    $('ctrlCalibrateBtn').addEventListener('click', () => {
      controllerSensor.calibrateNeutral();
      link.send({ type: 'calibrate' });
    });
    $('ctrlPitchToggle').addEventListener('change', (e) => {
      controllerSensor.setConfig({ enablePitch: e.target.checked });
    });
    document.querySelectorAll('.ctrl-touch-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const lane = Number(btn.dataset.lane);
        ['ctrlZoneLeft', 'ctrlZoneCenter', 'ctrlZoneRight'].forEach((id, idx) => {
          $(id).classList.toggle('active', idx - 1 === lane);
        });
        link.send({ type: 'ctrl', source: 'touch', lane, throttle: 0 });
      });
    });
  }

  function bindEvents() {
    $('startGameBtn').addEventListener('click', startGame);
    $('endGameBtn').addEventListener('click', () => endGame('manual'));
    $('openAlbumBtn').addEventListener('click', showAlbumModal);
    $('openHistoryBtn').addEventListener('click', showHistoryModal);
    $('closeAlbumBtn').addEventListener('click', () => $('albumModal').classList.add('hidden'));
    $('closeHistoryBtn').addEventListener('click', () => $('historyModal').classList.add('hidden'));
    $('sumReplayBtn').addEventListener('click', () => { $('summaryModal').classList.add('hidden'); startGame(); });
    $('sumHomeBtn').addEventListener('click', () => { $('summaryModal').classList.add('hidden'); showView('home'); });

    $('muteBtn').addEventListener('click', () => {
      state.muted = !state.muted;
      AudioFX.setMuted(state.muted);
      $('muteBtn').textContent = state.muted ? '🔇 靜音' : '🔊 音效';
    });

    // Local Phone Gyroscope Enable & Calibrate
    $('enableLocalGyroBtn').addEventListener('click', async () => {
      setupLocalGyro();
      const ok = await localSensor.requestPermissionAndStart();
      if (ok) {
        state.localGyroActive = true;
        state.controlMethod = 'local_tilt';
        localSensor.calibrateNeutral();
        updateConnectionUI();
        wakeLock = await requestWakeLock();
      }
    });
    $('calibrateLocalGyroBtn').addEventListener('click', () => {
      if (localSensor) localSensor.calibrateNeutral();
    });
    $('hudCalibrateBtn').addEventListener('click', () => {
      if (localSensor) localSensor.calibrateNeutral();
    });
    $('localPitchToggle').addEventListener('change', (e) => {
      state.localPitchEnabled = e.target.checked;
      if (localSensor) localSensor.setConfig({ enablePitch: state.localPitchEnabled });
    });

    document.querySelectorAll('[data-mode]').forEach((b) => {
      b.addEventListener('click', () => {
        state.mode = b.dataset.mode;
        document.querySelectorAll('[data-mode]').forEach((x) => x.classList.toggle('selected', x === b));
        $('timedConfigRow').classList.toggle('hidden', state.mode !== 'timed');
        $('sprintConfigRow').classList.toggle('hidden', state.mode !== 'sprint');
      });
    });
    document.querySelectorAll('[data-mins]').forEach((b) => {
      b.addEventListener('click', () => {
        state.timedMinutes = Number(b.dataset.mins);
        document.querySelectorAll('[data-mins]').forEach((x) => x.classList.toggle('selected', x === b));
      });
    });
    $('sprintRouteSelect').addEventListener('change', (e) => { state.sprintRouteId = e.target.value; });
    document.querySelectorAll('[data-level]').forEach((b) => {
      b.addEventListener('click', () => {
        state.level = b.dataset.level;
        document.querySelectorAll('[data-level]').forEach((x) => x.classList.toggle('selected', x === b));
      });
    });
    document.querySelectorAll('[data-basespd]').forEach((b) => {
      b.addEventListener('click', () => {
        state.baseSpeedLevel = b.dataset.basespd;
        document.querySelectorAll('[data-basespd]').forEach((x) => x.classList.toggle('selected', x === b));
      });
    });
    document.querySelectorAll('[data-freq]').forEach((b) => {
      b.addEventListener('click', () => {
        state.eventFreq = b.dataset.freq;
        document.querySelectorAll('[data-freq]').forEach((x) => x.classList.toggle('selected', x === b));
      });
    });
    document.querySelectorAll('[data-spdctrl]').forEach((b) => {
      b.addEventListener('click', () => {
        state.speedControl = b.dataset.spdctrl;
        document.querySelectorAll('[data-spdctrl]').forEach((x) => x.classList.toggle('selected', x === b));
      });
    });
    document.querySelectorAll('[data-touchmode]').forEach((b) => {
      b.addEventListener('click', () => {
        state.touchMode = b.dataset.touchmode;
        document.querySelectorAll('[data-touchmode]').forEach((x) => x.classList.toggle('selected', x === b));
      });
    });

    $('safetyAssistCheck').addEventListener('change', (e) => { state.safetyAssist = e.target.checked; });
    $('lowMotionCheck').addEventListener('change', (e) => { state.lowMotion = e.target.checked; });

    $('openControllerBtn').addEventListener('click', () => {
      if (window.location.protocol.startsWith('http')) {
        window.open(window.location.pathname + '?mode=controller&room=' + state.roomCode, '_blank');
      } else {
        initControllerMode(state.roomCode);
      }
    });
    $('ctrlBackHomeBtn').addEventListener('click', () => {
      if (controllerSensor) controllerSensor.stop();
      initHostPairing();
      showView('home');
    });

    // Split-Screen Canvas Touch (Left Half / Right Half)
    const bindSplitTouch = (el, targetLane) => {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        state.controlMethod = 'touch';
        el.classList.add('pressed');
        if (state.touchMode === 'tap' && state.lane === targetLane) setLane(0);
        else setLane(targetLane);
      });
      const release = () => {
        el.classList.remove('pressed');
        if (state.touchMode === 'hold') setLane(0);
      };
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('pointerleave', release);
    };
    bindSplitTouch($('touchZoneLeft'), -1);
    bindSplitTouch($('touchZoneRight'), 1);

    // Bottom Lane Buttons
    document.querySelectorAll('.lane-btn').forEach((btn) => {
      const targetLane = Number(btn.dataset.lane);
      btn.addEventListener('pointerdown', () => { state.controlMethod = 'touch'; setLane(targetLane); });
      btn.addEventListener('pointerup', () => { if (state.touchMode === 'hold' && targetLane !== 0) setLane(0); });
      btn.addEventListener('pointerleave', () => { if (state.touchMode === 'hold' && targetLane !== 0) setLane(0); });
    });

    $('btnThrottle').addEventListener('pointerdown', () => setThrottle(1));
    $('btnThrottle').addEventListener('pointerup', () => setThrottle(0));
    $('btnBrake').addEventListener('pointerdown', () => setThrottle(-1));
    $('btnBrake').addEventListener('pointerup', () => setThrottle(0));

    $('exportSaveBtn').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(saveData, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'ride-taiwan-save.json';
      a.click();
    });
    $('importSaveInput').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result);
          if (parsed && Array.isArray(parsed.records)) {
            saveData = parsed;
            writeSave(saveData);
            refreshHomeStats();
            showHistoryModal();
          }
        } catch (err) {}
      };
      reader.readAsText(file);
    });

    window.addEventListener('keydown', (e) => {
      if (state.view !== 'game' || !state.running || state.paused) return;
      state.controlMethod = 'keyboard';
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') setLane(-1);
      else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') setLane(1);
      else if (e.key === ' ' || e.key === 's' || e.key === 'S') setLane(0);
      else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') setThrottle(1);
      else if (e.key === 'ArrowDown') {
        if (state.speedControl === 'manual') setThrottle(-1);
        else setLane(0);
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'w' || e.key === 'W') setThrottle(0);
    });
    window.addEventListener('resize', () => { if (state.view === 'game') resizeCanvas(); });
  }

  // Boot immediately without waiting for external CDN scripts!
  function boot() {
    bindEvents();
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'controller') {
      initControllerMode(params.get('room') || '');
    } else {
      initHostPairing();
      updateConnectionUI();
      showView('home');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
