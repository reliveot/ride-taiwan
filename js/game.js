/**
 * 《騎遍台灣》V2.3 — 5-Level Difficulty, Shifting Road Offset & Asymmetric Biome Scenery
 */
(function () {
  'use strict';

  const { LANDMARKS, PENGHU_SPECIAL, SPRINT_ROUTES, COLLECTIBLES, BUMP_SKINS, CYCLIST_SKINS, BIKES, CHARACTERS, SPRITE_PATHS, UNITS_PER_STATION } = window.RideTaiwanData;
  const { TiltSensorEngine, RehabLink, requestWakeLock } = window.TiltRehabKit;
  const AudioFX = window.RehabAudio;
  const STORAGE_KEY = 'rtw_v2_save_data';

  const LEVEL_CONFIG = {
    L1: { name: 'L1 啟動練習', desc: 'L1 啟動練習：速度慢、單一補給與避障，適合動作建立。', speed: 95, cap: 1, gapZ: 0.44, segs: 2, allowWave: false, allowConstr: false, allowCyclist: false },
    L2: { name: 'L2 穩定巡航', desc: 'L2 穩定巡航：速度稍快，加入雙道水窪、慢速車友與短通道。', speed: 120, cap: 2, gapZ: 0.56, segs: 2, allowWave: true, allowConstr: false, allowCyclist: true },
    L3: { name: 'L3 進階復健', desc: 'L3 進階復健：中等速度、含施工停車引導與 3 段單線通道。', speed: 145, cap: 3, gapZ: 0.66, segs: 3, allowWave: true, allowConstr: true, allowCyclist: true },
    L4: { name: 'L4 一般玩家', desc: 'L4 一般玩家：偏快節奏、S 形蛇行波、4 連補給與加速帶！', speed: 175, cap: 4, gapZ: 0.74, segs: 3, allowWave: true, allowConstr: true, allowCyclist: true },
    L5: { name: 'L5 街機挑戰', desc: 'L5 街機挑戰：高速密集反應、4–5 連拍蛇行與短預警施工！', speed: 215, cap: 5, gapZ: 0.80, segs: 4, allowWave: true, allowConstr: true, allowCyclist: true }
  };

  const $ = (id) => document.getElementById(id);

  // --- Preload Watercolor Transparent PNG Sprites ---
  const SPRITES = {};
  if (SPRITE_PATHS) {
    Object.keys(SPRITE_PATHS).forEach((k) => {
      const img = new Image();
      img.src = SPRITE_PATHS[k];
      SPRITES[k] = img;
    });
  }
  function drawSprite(ctx, key, x, y, w, h) {
    const img = SPRITES[key];
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, x - w * 0.5, y - h * 0.5, w, h);
      return true;
    }
    return false;
  }


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
    timedMinutes: 2,
    sprintRouteId: 'west_coast',
    level: 'L1',
    baseSpeedLevel: 'medium',
    eventFreq: 'medium',
    speedControl: 'auto',
    safetyAssist: true,
    lowMotion: false,
    bikeId: 'ubike',
    charId: 'ming',
    corridorSnackTimer: 0,
    corridorWaitSec: 0,
    firstTryTotal: 0,
    firstTrySuccess: 0,
    assistedCount: 0,
    snacksEaten: 0,
    consecutiveHits: 0,
    hasMovedSinceSpawn: false,
    bridgeStartDist: -1,
    bridgeEndDist: -1,
    pendingPostcardIdx: -1,
    directorSegIdx: 0,
    directorPlan: [],
    stationStartUnits: 0, // world-coordinate offset for continued tour and sprint routes
    snackStyle: 'local',
    steeringMode: 'smooth',
    steerInput: 0,
    steerVel: 0,
    stoppedAtCorridor: false,
    corridorTransition: 0,
    corridorCurL: -0.5,
    corridorCurR: 0.5,
    corridorInitSec: 0,
    corridorExiting: false,
    corridorExitSec: 0,
    prevStationIdx: 0,
    curStationIdx: 0,
    biomeFade: 1,
    emptyRoadSec: 0,
    touchMode: 'hold',
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
    roadOffset: 0, // Smoothly lerps to current county's roadOffset!
    stamina: 100,
    distance: 0,
    elapsedSec: 0,
    currentSpeedUnits: 95,
    combo: 0,
    maxCombo: 0,
    boostTimer: 0,
    boostCooldown: 0,
    bumpTimer: 0,
    followingCyclist: false,
    stoppedAtConstruction: false,
    constructionWaitSec: 0,

    // Event Cooldowns & Mutual Exclusion
    cyclistCooldown: 0,
    constructionCooldown: 0,
    lastSpecialType: '',

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

    events: [],
    waveQueue: [],
    rng: Math.random,
    particles: [],
    floatingTexts: [],
    clouds: [
      { x: 0.18, y: 0.12, s: 1.0 },
      { x: 0.55, y: 0.08, s: 0.75 },
      { x: 0.85, y: 0.16, s: 0.9 }
    ],

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

  function renderGarage() {
    const bikeGrid = $('bikeGrid');
    const charGrid = $('charGrid');
    if (!bikeGrid || !charGrid) return;

    bikeGrid.innerHTML = '';
    BIKES.forEach((bk) => {
      const unlocked = saveData.tourUnits >= bk.unlockDist;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip' + (state.bikeId === bk.id ? ' selected' : '');
      if (!unlocked) btn.style.opacity = '0.58';
      btn.innerHTML = '<div style="font-size:1.3rem;">' + bk.icon + '</div><div>' + bk.name.split(' ')[0] + '</div>' +
        '<div style="font-size:0.65rem;color:' + (unlocked ? '#0f766e' : '#dc2626') + ';">' +
        (unlocked ? bk.tag : '🔒 需 ' + bk.unlockDist + ' 里程') + '</div>';
      btn.addEventListener('click', () => {
        if (unlocked) {
          state.bikeId = bk.id;
          renderGarage();
        } else {
          $('bikeDescText').textContent = '🔒 尚未解鎖「' + bk.name + '」：累計騎乘達 ' + bk.unlockDist + ' 單位即可解鎖！（目前 ' + saveData.tourUnits + '）';
        }
      });
      bikeGrid.appendChild(btn);
    });
    const curBike = BIKES.find((b) => b.id === state.bikeId) || BIKES[0];
    $('bikeDescText').textContent = curBike.icon + ' ' + curBike.name + '｜' + curBike.desc;

    charGrid.innerHTML = '';
    CHARACTERS.forEach((ch) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip' + (state.charId === ch.id ? ' selected' : '');
      btn.innerHTML = '<div style="font-size:1.25rem;">' + ch.icon + '</div><div>' + ch.name + '</div><div style="font-size:0.65rem;color:#64748b;">' + ch.role + '</div>';
      btn.addEventListener('click', () => {
        state.charId = ch.id;
        renderGarage();
      });
      charGrid.appendChild(btn);
    });
  }

  function refreshHomeStats() {
    const albumItems = [...LANDMARKS, PENGHU_SPECIAL];
    const albumCount = albumItems.filter((item) => saveData.unlockedIds.includes(item.id)).length;
    $('openAlbumBtn').textContent = '📖 景點收藏冊 (' + albumCount + ' / ' + albumItems.length + ')';
    const loopPct = Math.round(((saveData.tourUnits % (UNITS_PER_STATION * LANDMARKS.length)) / (UNITS_PER_STATION * LANDMARKS.length)) * 100);
    $('homeTourBadge').textContent = '第 ' + (saveData.loopsCompleted + 1) + ' 圈 ' + loopPct + '%';
    if ($('homeTotalDistText')) {
      $('homeTotalDistText').textContent = '累計總里程：' + saveData.tourUnits + ' 單位 · 已收集 ' + albumCount + ' / ' + albumItems.length + ' 處景點';
    }
    renderGarage();
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
    const base = window.location.protocol.startsWith('http') ? (window.location.origin + window.location.pathname) : '';
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
          if (state.steeringMode === 'smooth') state.steerInput = data.lane; else setLane(data.lane);
          if (state.speedControl === 'manual' && typeof data.throttle === 'number') setThrottle(data.throttle);
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
      state.hasMovedSinceSpawn = true;
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

  function setupLocalGyro() {
    if (!localSensor) {
      localSensor = new TiltSensorEngine({
        thresholdDeg: state.thresholdDeg,
        enablePitch: state.localPitchEnabled,
        onUpdate: (data) => {
          if (state.running && !state.paused) {
            state.controlMethod = 'local_tilt';
            if (state.steeringMode === 'smooth') state.steerInput = data.lane; else setLane(data.lane);
            if (state.speedControl === 'manual' && state.localPitchEnabled) setThrottle(data.throttle);
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
    $('manualSpeedBar').classList.remove('hidden');
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
    state.steerInput = 0;
    state.steerVel = 0;
    state.stoppedAtCorridor = false;
    state.corridorTransition = 0;
    state.corridorCurL = -0.5;
    state.corridorCurR = 0.5;
    state.corridorInitSec = 0;
    state.corridorExiting = false;
    state.corridorExitSec = 0;
    state.emptyRoadSec = 0;
    state.stoppedAtConstruction = false;
    state.constructionWaitSec = 0;
    state.cyclistCooldown = 5;
    state.constructionCooldown = 8;
    state.lastSpecialType = '';

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
    state.corridorWaitSec = 0;
    state.firstTryTotal = 0;
    state.firstTrySuccess = 0;
    state.assistedCount = 0;
    state.snacksEaten = 0;
    state.consecutiveHits = 0;
    state.hasMovedSinceSpawn = false;
    state.bridgeStartDist = -1;
    state.bridgeEndDist = -1;
    state.pendingPostcardIdx = -1;
    state.directorSegIdx = 0;

    state.events = [];
    state.waveQueue = [];
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

    const sprintRoute = state.mode === 'sprint'
      ? (SPRINT_ROUTES.find((r) => r.id === state.sprintRouteId) || SPRINT_ROUTES[0]) : null;
    state.stationStartUnits = sprintRoute
      ? sprintRoute.startStation * UNITS_PER_STATION
      : saveData.tourUnits;
    state.completedStationsCount = Math.floor(state.stationStartUnits / UNITS_PER_STATION);

    const startIdx = getCurrentStationIndex();
    state.prevStationIdx = startIdx;
    state.curStationIdx = startIdx;
    state.biomeFade = 1;
    const startLm = getActiveStationObj(startIdx);
    state.directorPlan = buildDirectorPlan(startLm);
    state.roadOffset = state.lowMotion ? 0 : startLm.roadOffset;

    showView('game');
    resizeCanvas();
    spawnNextEvent(0.95);
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

    const successRate = state.firstTryTotal > 0 ? Math.round((state.firstTrySuccess / state.firstTryTotal) * 100) : 100;
    const condKey = [state.mode, state.mode === 'sprint' ? state.sprintRouteId : state.timedMinutes, state.level, state.bikeId, state.controlMethod, state.speedControl, state.safetyAssist].join('|');

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
      assistedCount: state.assistedCount,
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

  // --- Multi-Scale Deterministic 1D Value Noise (no fixed sine repetition!) ---
  function hash1D(n) {
    let x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
    return x - Math.floor(x);
  }
  function smoothNoise1D(x) {
    const i = Math.floor(x);
    const f = x - i;
    const u = f * f * (3 - 2 * f);
    return hash1D(i) * (1 - u) + hash1D(i + 1) * u;
  }
  function terrainNoise(worldDist) {
    return smoothNoise1D(worldDist * 0.0012) * 0.6 +
           smoothNoise1D(worldDist * 0.0031) * 0.28 +
           smoothNoise1D(worldDist * 0.0073) * 0.12;
  }

  // Choose a valid snack for the current stage. V3.1 called pickSnack() without
  // defining it, which threw a ReferenceError as soon as the game started.
  function pickSnack() {
    if (state.snackStyle === 'local') {
      const station = getActiveStationObj(getCurrentStationIndex());
      if (station && station.localSnack) return station.localSnack;
    }
    const pool = state.snackStyle === 'basic'
      ? COLLECTIBLES.filter((item) => item.id === 'banana' || item.id === 'water')
      : COLLECTIBLES;
    const choices = pool.length ? pool : COLLECTIBLES;
    return choices[Math.floor(state.rng() * choices.length)] || COLLECTIBLES[0];
  }

  // --- Stage Director: 3 Varied Micro-Segment Rhythms per Station ---
  function buildDirectorPlan(lm) {
    const r = state.rng;
    const variant = Math.floor(r() * 3);
    if (variant === 0) {
      return [
        { pEnd: 0.16, type: 'open_cruise' },
        { pEnd: 0.48, type: 'main_challenge' },
        { pEnd: 0.78, type: 'terrain_feature' },
        { pEnd: 1.00, type: 'open_stamp' }
      ];
    } else if (variant === 1) {
      return [
        { pEnd: 0.15, type: 'open_cruise' },
        { pEnd: 0.45, type: 'terrain_feature' },
        { pEnd: 0.80, type: 'main_challenge' },
        { pEnd: 1.00, type: 'open_stamp' }
      ];
    }
    return [
      { pEnd: 0.14, type: 'open_cruise' },
      { pEnd: 0.40, type: 'main_challenge' },
      { pEnd: 0.56, type: 'open_cruise' },
      { pEnd: 0.82, type: 'main_challenge' },
      { pEnd: 1.00, type: 'open_stamp' }
    ];
  }

  function getActiveStationObj(idx) {
    if (state.mode === 'sprint' && state.sprintRouteId === 'penghu_island') return PENGHU_SPECIAL;
    return LANDMARKS[idx % LANDMARKS.length] || LANDMARKS[0];
  }

  // --- Stage Director & 5-Level Event Pattern Generator ---
  function enqueueWavePattern() {
    const r = state.rng;
    const cfg = LEVEL_CONFIG[state.level] || LEVEL_CONFIG.L1;
    const stationProgress = ((state.stationStartUnits + state.distance) % UNITS_PER_STATION) / UNITS_PER_STATION;
    const seg = state.directorPlan.find((p) => stationProgress <= p.pEnd) || { type: 'open_cruise' };
    state.hasMovedSinceSpawn = false;

    // L5 Mercy Recovery after 2 consecutive hits
    if (state.consecutiveHits >= 2) {
      state.consecutiveHits = 0;
      state.waveQueue.push({ template: 'collect', lane: Math.floor(r() * 3) - 1, item: pickSnack() });
      return;
    }

    // Open Cruise or Open Stamp: low-density scenic riding
    if (seg.type === 'open_cruise' || seg.type === 'open_stamp') {
      const sideLane = r() < 0.5 ? -1 : 1;
      state.waveQueue.push({ template: 'collect', lane: sideLane, item: pickSnack() });
      return;
    }

    // Terrain Feature: Bridge Shadow Zone or Single-Lane Corridor
    if (seg.type === 'terrain_feature') {
      const curLm = getActiveStationObj(state.curStationIdx);
      if ((curLm.biome === 'river_left' || curLm.biome === 'oldtown_asym') && state.bridgeEndDist < state.distance && r() < 0.55) {
        state.bridgeStartDist = state.distance + 450;
        state.bridgeEndDist = state.distance + 1350;
        state.waveQueue.push({ template: 'collect', lane: Math.floor(r() * 3) - 1, item: pickSnack() });
        return;
      }
      if (state.lastSpecialType !== 'construction') {
        const segCount = cfg.segs;
        const seq = [];
        let cur = Math.floor(r() * 3) - 1;
        for (let i = 0; i < segCount; i++) {
          seq.push(cur);
          const nextChoices = [-1, 0, 1].filter((l) => Math.abs(l - cur) <= 1);
          cur = nextChoices[Math.floor(r() * nextChoices.length)];
        }
        state.waveQueue.push({ template: 'corridor', seq });
        state.lastSpecialType = 'corridor';
        return;
      }
    }

    // L1: Active Operation Required (Side snacks + Center-lane puddle so staying motionless doesn't score!)
    if (!cfg.allowWave) {
      if (r() < 0.55) {
        const sideLane = r() < 0.5 ? -1 : 1;
        state.waveQueue.push({ template: 'collect', lane: sideLane, item: pickSnack() });
      } else {
        state.waveQueue.push({ template: 'obstacle', kind: 'bump', blockedLanes: [0], requireActive: true });
      }
      state.lastSpecialType = '';
      return;
    }

    // L4 & L5 Choice Dilemma (Snack vs Cyclist vs Safe Road simultaneously!)
    const roll = r();
    if ((state.level === 'L4' || state.level === 'L5') && roll < 0.28 && state.cyclistCooldown <= 0) {
      state.cyclistCooldown = 15;
      const lanes = [-1, 0, 1];
      const snackL = lanes.splice(Math.floor(r() * lanes.length), 1)[0];
      const cycL = lanes.splice(Math.floor(r() * lanes.length), 1)[0];
      state.waveQueue.push({ template: 'collect', lane: snackL, item: pickSnack(), tight: true });
      state.waveQueue.push({ template: 'obstacle', kind: 'cyclist', lane: cycL, tight: true });
      state.lastSpecialType = 'cyclist';
      return;
    }

    if (roll < 0.48) {
      const steps = state.level === 'L2' ? 3 : 4;
      const puddleLane = Math.floor(r() * 3) - 1;
      for (let i = 0; i < steps; i++) {
        state.waveQueue.push({ template: 'obstacle', kind: 'bump', blockedLanes: [puddleLane], tight: true });
      }
      state.lastSpecialType = '';
    } else if (roll < 0.68) {
      const steps = state.level === 'L5' ? 3 : 2;
      let safe = Math.floor(r() * 3) - 1;
      for (let i = 0; i < steps; i++) {
        const choices = [-1, 0, 1].filter((l) => Math.abs(l - safe) <= 1);
        safe = choices[Math.floor(r() * choices.length)];
        state.waveQueue.push({ template: 'obstacle', kind: 'bump', blockedLanes: [-1, 0, 1].filter((l) => l !== safe), tight: false });
      }
      state.lastSpecialType = '';
    } else if (roll < 0.82 && cfg.allowCyclist && state.cyclistCooldown <= 0) {
      state.cyclistCooldown = 15;
      state.waveQueue.push({ template: 'obstacle', kind: 'cyclist', lane: Math.floor(r() * 3) - 1, tight: true });
      state.lastSpecialType = 'cyclist';
    } else if (cfg.allowConstr && state.constructionCooldown <= 0 && state.lastSpecialType !== 'corridor') {
      state.constructionCooldown = 20;
      const safeLane = Math.floor(r() * 3) - 1;
      state.waveQueue.push({ template: 'obstacle', kind: 'construction', safeLane, blockedLanes: [-1, 0, 1].filter((l) => l !== safeLane) });
      state.lastSpecialType = 'construction';
    } else {
      state.waveQueue.push({ template: 'collect', lane: Math.floor(r() * 3) - 1, item: pickSnack() });
      state.lastSpecialType = '';
    }
  }

  function spawnNextEvent(initialZ = 1.0) {
    if (state.waveQueue.length === 0) enqueueWavePattern();
    const next = state.waveQueue.shift();
    if (!next) return;

    if (next.template === 'collect') {
      state.events.push({ template: 'collect', lane: next.lane, item: next.item, z: initialZ, resolved: false, tight: !!next.tight });
    } else if (next.template === 'boostpad') {
      state.events.push({ template: 'boostpad', lane: next.lane, z: initialZ, resolved: false, tight: !!next.tight });
    } else if (next.template === 'obstacle') {
      if (next.kind === 'construction') {
        const dirText = next.safeLane === -1 ? '左側' : (next.safeLane === 0 ? '中央' : '右側');
        showBanner('🚧 前方施工，請靠' + dirText + '通行！', 'warn');
        state.events.push({ template: 'obstacle', kind: 'construction', safeLane: next.safeLane, blockedLanes: next.blockedLanes, z: initialZ, resolved: false });
      } else if (next.kind === 'cyclist') {
        const cSkin = CYCLIST_SKINS[Math.floor(state.rng() * CYCLIST_SKINS.length)];
        state.events.push({ template: 'obstacle', kind: 'cyclist', lane: next.lane, skin: cSkin, z: initialZ, resolved: false, tight: !!next.tight });
      } else {
        const bSkin = BUMP_SKINS[Math.floor(state.rng() * BUMP_SKINS.length)];
        state.events.push({ template: 'obstacle', kind: 'bump', blockedLanes: next.blockedLanes, skin: bSkin, z: initialZ, resolved: false, tight: !!next.tight });
      }
    } else if (next.template === 'corridor') {
      state.events = [];
      state.corridorCurL = -0.5;
      state.corridorCurR = 0.5;
      state.corridorInitSec = 0;
      state.corridorExiting = false;
      state.corridorExitSec = 0;
      state.corridorTransition = 0;
      state.corridorSnackTimer = 0.8;
      state.events.push({ template: 'corridor', seq: next.seq, segIndex: 0, segProgress: 0, failed: false, z: initialZ });
      showBanner('⚠️ 前方道路縮減！請準備進入安全車道', 'warn');
    }
  }

  function showBanner(msg, cls) {
    const el = $('eventBanner');
    el.textContent = msg;
    el.className = 'event-banner' + (cls ? ' ' + cls : '');
    el.classList.remove('hidden');
  }

  function hideBanner() { $('eventBanner').classList.add('hidden'); }

  function recordEventOutcome(success, laneHint, isFirstTry = true, isActive = true) {
    state.eventsTotal += 1;
    if (isFirstTry) {
      state.firstTryTotal += 1;
      if (success && isActive) state.firstTrySuccess += 1;
    } else {
      state.assistedCount += 1;
    }
    if (laneHint === -1) { state.leftTotal += 1; if (success) state.leftSuccess += 1; }
    else if (laneHint === 1) { state.rightTotal += 1; if (success) state.rightSuccess += 1; }

    if (success) {
      state.consecutiveHits = 0;
      if (isActive && isFirstTry) {
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
      }
    } else {
      state.combo = 0;
      state.consecutiveHits += 1;
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
    const lm = getActiveStationObj(idx);
    if (!lm) return;
    // Unlock immediately on crossing the station boundary; defer only the toast.
    if (!saveData.unlockedIds.includes(lm.id)) {
      saveData.unlockedIds.push(lm.id);
      state.newUnlockedThisRun.push(lm);
      writeSave(saveData);
    }
    const obsClose = state.events.some((e) => e.template === 'obstacle' && e.z < 0.45);
    if (obsClose) {
      state.pendingPostcardIdx = idx;
      return;
    }
    state.pendingPostcardIdx = -1;
    AudioFX.playStamp();
    if (lm.image) {
      $('postcardImg').src = lm.image;
      $('postcardImg').classList.remove('hidden');
      $('postcardEmojiBox').classList.add('hidden');
    } else {
      $('postcardImg').classList.add('hidden');
      $('postcardEmojiBox').textContent = lm.icon;
      $('postcardEmojiBox').classList.remove('hidden');
    }
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
    if (state.cyclistCooldown > 0) state.cyclistCooldown = Math.max(0, state.cyclistCooldown - dt);
    if (state.constructionCooldown > 0) state.constructionCooldown = Math.max(0, state.constructionCooldown - dt);

    if (!state.lowMotion) {
      state.clouds.forEach((c) => { c.x = (c.x + dt * 0.012 * c.s) % 1.15; });
    }

    const curBike = BIKES.find((b) => b.id === state.bikeId) || BIKES[0];
    const minIdx = Math.floor(state.elapsedSec / 60);
    const baseFormula = 0.55 + 0.08 * minIdx;
    const actionMult = (state.stoppedAtConstruction || state.stoppedAtCorridor) ? 0.4 : (state.throttle === 1 ? 1.4 : 1.0);
    const drainRate = baseFormula * curBike.drainMult * actionMult;
    state.stamina = Math.max(0, state.stamina - drainRate * dt);

    if (state.mode === 'timed' && state.elapsedSec >= state.timedMinutes * 60) { endGame('timeup'); return; }
    if (state.mode === 'endurance' && state.stamina <= 0) { endGame('exhausted'); return; }
    if (state.mode === 'sprint') {
      const route = SPRINT_ROUTES.find((r) => r.id === state.sprintRouteId) || SPRINT_ROUTES[0];
      if (state.distance >= route.distanceUnits) { endGame('finished'); return; }
    }

    const prevX = state.bikeXNorm;
    if (state.steeringMode === 'smooth') {
      const targetVel = state.steerInput * 1.35;
      state.steerVel += (targetVel - state.steerVel) * Math.min(1, dt * 10);
      state.bikeXNorm = Math.max(-1.05, Math.min(1.05, state.bikeXNorm + state.steerVel * dt));
      state.bikeLean = state.lowMotion ? 0 : state.steerVel * 0.14;
      if (Math.abs(state.steerVel) > 0.15) state.hasMovedSinceSpawn = true;
      state.lane = state.bikeXNorm < -0.34 ? -1 : (state.bikeXNorm > 0.34 ? 1 : 0);
    } else {
      state.bikeXNorm += (state.lane - state.bikeXNorm) * Math.min(1, dt * 13);
      state.bikeLean = state.lowMotion ? 0 : (state.lane - prevX) * 0.22;
    }

    const corridorActive = state.events.some((e) => e.template === 'corridor');
    if (!corridorActive) {
      const curIdx = getCurrentStationIndex();
      if (curIdx !== state.curStationIdx) {
        state.prevStationIdx = state.curStationIdx;
        state.curStationIdx = curIdx;
        state.biomeFade = 0;
        // Stage director needs a new plan on every location change.
        state.directorPlan = buildDirectorPlan(getActiveStationObj(curIdx));
      }
      if (state.biomeFade < 1) state.biomeFade = Math.min(1, state.biomeFade + dt / 1.8);
      const curLm = LANDMARKS[curIdx] || LANDMARKS[0];
      const targetOffset = state.lowMotion ? 0 : curLm.roadOffset;
      state.roadOffset += (targetOffset - state.roadOffset) * Math.min(1, dt * 0.9);
    }

    const cfg = LEVEL_CONFIG[state.level] || LEVEL_CONFIG.L1;
    const spdScale = state.baseSpeedLevel === 'slow' ? 0.85 : (state.baseSpeedLevel === 'fast' ? 1.18 : 1.0);
    const baseSpd = cfg.speed * spdScale * curBike.speedMult;
    const staminaFactor = 0.55 + 0.45 * (state.stamina / 100);
    let speedMult = staminaFactor;

    if (state.speedControl === 'manual') {
      if (state.throttle === 1) speedMult *= 1.55;
      else if (state.throttle === -1) speedMult *= 0.45;
    } else if (state.throttle !== 0) {
      speedMult *= (state.throttle === 1 ? 1.45 : 0.65);
    }

    const frontObs = state.events.find((e) => e.template === 'obstacle' && e.z < 0.40 && e.z > 0.16);
    if (state.safetyAssist && frontObs) {
      const inDanger = (frontObs.kind === 'bump' && frontObs.blockedLanes.includes(state.lane)) ||
        (frontObs.kind === 'cyclist' && frontObs.lane === state.lane) ||
        (frontObs.kind === 'construction' && state.lane !== frontObs.safeLane);
      if (inDanger) speedMult *= 0.68;
    }

    if (state.stoppedAtConstruction || state.stoppedAtCorridor) speedMult = 0;
    else if (state.followingCyclist) speedMult = Math.min(speedMult, 0.48);
    else if (state.bumpTimer > 0) speedMult *= 0.80;
    else if (state.boostTimer > 0) speedMult *= 1.20;

    state.currentSpeedUnits = baseSpd * speedMult;
    state.distance += state.currentSpeedUnits * dt;
    state.pedalPhase += dt * (state.currentSpeedUnits * 0.065);
    state.roadScroll = (state.roadScroll + dt * (state.currentSpeedUnits * 0.013)) % 1;

    const completed = Math.floor((state.stationStartUnits + state.distance) / UNITS_PER_STATION);
    if (completed > state.completedStationsCount) {
      // Starting midway through a station must not shift the stamp position.
      for (let station = state.completedStationsCount; station < completed; station++) {
        triggerPassingLandmark(((station % LANDMARKS.length) + LANDMARKS.length) % LANDMARKS.length);
      }
      state.completedStationsCount = completed;
    }

    updateEventsQueue(dt);
    if (state.pendingPostcardIdx >= 0 &&
        !state.events.some((e) => e.template === 'obstacle' && e.z < 0.45)) {
      const pending = state.pendingPostcardIdx;
      state.pendingPostcardIdx = -1;
      triggerPassingLandmark(pending);
    }

    if (state.events.length === 0) {
      state.emptyRoadSec += dt;
      if (state.emptyRoadSec > 2.2) {
        state.stoppedAtCorridor = false;
        state.stoppedAtConstruction = false;
        state.followingCyclist = false;
        state.emptyRoadSec = 0;
        spawnNextEvent(1.0);
      }
    } else {
      state.emptyRoadSec = 0;
    }
    const hasCorridor = state.events.some((e) => e.template === 'corridor');
    if (!hasCorridor) {
      const freqShift = state.eventFreq === 'low' ? -0.10 : (state.eventFreq === 'high' ? 0.08 : 0);
      const inWave = state.waveQueue.length > 0 && state.waveQueue[0].tight;
      const baseGap = inWave ? 0.81 : cfg.gapZ;
      const spawnGapZ = Math.min(0.86, Math.max(0.38, baseGap + freqShift));
      const maxZ = state.events.reduce((m, e) => Math.max(m, e.z), 0);
      if (state.events.length < cfg.cap && (state.events.length === 0 || maxZ <= spawnGapZ)) {
        spawnNextEvent(1.0);
      }
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

  function updateEventsQueue(dt) {
    const approachRate = Math.max(0.06, state.currentSpeedUnits / 255);

    for (let i = state.events.length - 1; i >= 0; i--) {
      const ev = state.events[i];

      if (ev.template === 'boostpad') {
        ev.z -= approachRate * dt;
        if (!ev.resolved && ev.z <= 0.17 && Math.abs(state.bikeXNorm - ev.lane) < 0.42) {
          ev.resolved = true;
          state.boostTimer = 1.5;
          state.accelCount += 1;
          AudioFX.playBoost();
          spawnFeedback(ev.lane, '⚡ 順風加速帶！', '#0284c7');
          state.events.splice(i, 1);
          continue;
        }
        if (ev.z <= 0.02) state.events.splice(i, 1);
        continue;
      }

      if (ev.template === 'collect') {
        ev.z -= approachRate * dt;
        if (!ev.resolved && ev.z <= 0.17 && Math.abs(state.bikeXNorm - ev.lane) < 0.42) {
          ev.resolved = true;
          state.snacksEaten += 1;
          const heal = state.mode === 'endurance' ? Math.max(4, Math.round(ev.item.stamina - state.snacksEaten * 0.45)) : ev.item.stamina;
          state.stamina = Math.min(100, state.stamina + heal);
          state.collectedCount += 1;
          AudioFX.playCollect();
          spawnFeedback(ev.lane, '+' + heal + '% 體力 ' + ev.item.icon, ev.item.color);
          state.events.splice(i, 1);
          continue;
        }
        if (ev.z <= 0.02) state.events.splice(i, 1);
        continue;
      }

      if (ev.template === 'obstacle') {
        if (ev.kind === 'construction') {
          if (!state.stoppedAtConstruction) {
            ev.z -= approachRate * dt;
            if (ev.z <= 0.22 && state.lane !== ev.safeLane) {
              state.stoppedAtConstruction = true;
              state.constructionWaitSec = 0;
              state.stopCount += 1;
              ev.hadToStop = true;
              recordEventOutcome(false, ev.safeLane, true, false);
              AudioFX.playBump();
              const dirText = ev.safeLane === -1 ? '左側' : (ev.safeLane === 0 ? '中央' : '右側');
              showBanner('🛑 施工停車！請換到' + dirText + '車道繼續前進', 'warn');
            } else if (ev.z <= 0.05 && !ev.resolved) {
              ev.resolved = true;
              recordEventOutcome(true, ev.safeLane);
              hideBanner();
              state.events.splice(i, 1);
            }
          } else {
            state.constructionWaitSec += dt;
            if (state.lane === ev.safeLane || state.constructionWaitSec >= 6.0) {
              state.assistedCount += 1; // correction or automatic assisted passage
              if (state.constructionWaitSec >= 6.0) showBanner('👷 辛苦了！工作人員幫您開便道通過～', '');
              else hideBanner();
              state.stoppedAtConstruction = false;
              state.events.splice(i, 1);
            }
          }
          continue;
        }

        if (ev.kind === 'cyclist') {
          if (!state.followingCyclist) {
            ev.z -= (approachRate * 0.72) * dt;
            if (ev.z <= 0.24 && state.lane === ev.lane) {
              state.followingCyclist = true;
              state.decelCount += 1;
              state.combo = 0;
              AudioFX.playBell();
              const lbl = ev.skin ? ev.skin.label : '慢速車友';
              showBanner((ev.skin ? ev.skin.icon : '🚴') + ' 被' + lbl + '擋住了！請換道超車', 'warn');
            } else if (ev.z <= 0.04 && !ev.resolved) {
              ev.resolved = true;
              recordEventOutcome(true, state.lane, true, state.level !== 'L1' || state.hasMovedSinceSpawn);
              state.events.splice(i, 1);
            }
          } else if (state.lane !== ev.lane) {
            state.followingCyclist = false;
            hideBanner();
            spawnFeedback(state.lane, '順利超車！', '#0f766e');
            state.events.splice(i, 1);
          }
          continue;
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
            recordEventOutcome(true, state.lane, true, state.level !== 'L1' || state.hasMovedSinceSpawn);
          }
        }
        if (ev.z <= 0.02) state.events.splice(i, 1);
        continue;
      }

      if (ev.template === 'corridor') {
        if (state.corridorExiting) {
          state.corridorExitSec += dt;
          state.corridorCurL += (-0.5 - state.corridorCurL) * Math.min(1, dt * 2.5);
          state.corridorCurR += (0.5 - state.corridorCurR) * Math.min(1, dt * 2.5);
          if (state.corridorExitSec >= 1.2) {
            state.corridorExiting = false;
            state.corridorTransition = 0;
            hideBanner();
            state.events.splice(i, 1);
          }
          continue;
        }

        const laneOffsets = { '-1': [-0.5, -0.165], '0': [-0.165, 0.165], '1': [0.165, 0.5] };
        const targetLane = ev.seq[ev.segIndex];
        const [tL, tR] = laneOffsets[String(targetLane)];
        const dirName = targetLane === -1 ? '左側' : (targetLane === 0 ? '中央' : '右側');

        state.corridorInitSec += dt;
        state.corridorTransition = Math.min(1, state.corridorInitSec / 1.8);
        const glideSpeed = state.corridorTransition < 1 ? 1.8 : 1.15;
        state.corridorCurL += (tL - state.corridorCurL) * Math.min(1, dt * glideSpeed);
        state.corridorCurR += (tR - state.corridorCurR) * Math.min(1, dt * glideSpeed);

        const curCenterLane = ((state.corridorCurL + state.corridorCurR) * 0.5) * 3;
        if (state.corridorTransition < 1) {
          showBanner('⚠️ 道路縮減中！請移至' + dirName + '安全車道', 'warn');
        } else {
          const inSafe = Math.abs(state.bikeXNorm - curCenterLane) < 0.58;
          if (!inSafe) {
            ev.hadCorrection = true;
            state.stoppedAtCorridor = true;
            state.corridorWaitSec += dt;
            if (state.corridorWaitSec >= 6.0) {
              state.stoppedAtCorridor = false;
              state.corridorWaitSec = 0;
              state.corridorExiting = true;
              state.corridorExitSec = 0;
              recordEventOutcome(false, state.lane, true, false);
              state.assistedCount += 1;
              showBanner('👷 辛苦了！已開啟便道協助通過', '');
            } else if (state.corridorWaitSec >= 3.0) {
              showBanner('👉👉 請往' + dirName + '移動！(' + Math.ceil(6 - state.corridorWaitSec) + '秒後協助放行)', 'warn');
            } else {
              showBanner('🛑 路已縮減！請切入' + dirName + '車道才可前進', 'warn');
            }
          } else {
            state.corridorWaitSec = 0;
            state.stoppedAtCorridor = false;
            showBanner('🛣️ 順著單線彎道前進 (' + (ev.segIndex + 1) + '/' + ev.seq.length + ' → ' + dirName + ')', 'boost');
            state.corridorSnackTimer -= dt;
            if (state.corridorSnackTimer <= 0) {
              state.corridorSnackTimer = 1.6;
              state.events.push({ template: 'collect', lane: targetLane, item: pickSnack(), z: 0.95, resolved: false });
            }
            ev.segProgress += dt * 0.36;
            if (ev.segProgress >= 1.0) {
              ev.segProgress = 0;
              ev.segIndex += 1;
              if (ev.segIndex >= ev.seq.length) {
                state.stoppedAtCorridor = false;
                state.corridorExiting = true;
                state.corridorExitSec = 0;
                const firstTry = !ev.hadCorrection && (state.level !== 'L1' || state.hasMovedSinceSpawn);
                recordEventOutcome(firstTry, state.lane, true, firstTry);
                if (ev.hadCorrection) state.assistedCount += 1;
                state.boostTimer = firstTry ? 1.0 : 0;

                if (firstTry) {
                  state.accelCount += 1;
                  AudioFX.playBoost();
                  spawnFeedback(state.lane, '✨ 單線彎道通過！加速 1 秒', '#0f766e');
                } else {
                  spawnFeedback(state.lane, '已完成通道調整', '#0f766e');
                }
                showBanner('🛣️ 道路恢復寬闊三線道！', 'boost');
              }
            }
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
    const idx = state.curStationIdx;
    const lm = LANDMARKS[idx] || LANDMARKS[0];
    $('hudStageTitle').textContent = lm.icon + ' ' + lm.county + '路段 → ' + lm.name;

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

  function roadCenterX(depth, width) {
    const curve = state.lowMotion ? 0 : Math.sin(state.distance * 0.0018) * 0.05 * depth;
    return width * (0.5 + state.roadOffset * (0.45 + 0.55 * (1 - depth)) + curve);
  }

  function laneToScreenX(lane, depth, width) {
    const spreadBottom = width * 0.25;
    const spreadTop = width * 0.05;
    const spread = spreadBottom * (1 - depth) + spreadTop * depth;
    return roadCenterX(depth, width) + lane * spread;
  }

  function lerpHex(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
    const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
    const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }

  function drawCountyHorizon(ctx, lm, prevLm, fade, w, horizonY, t) {
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
    state.clouds.forEach((c) => {
      const cx = (c.x * w) % (w + 60) - 30;
      const cy = c.y * horizonY * 1.4;
      ctx.beginPath();
      ctx.arc(cx, cy, 14 * c.s, 0, Math.PI * 2);
      ctx.arc(cx + 12 * c.s, cy - 4 * c.s, 11 * c.s, 0, Math.PI * 2);
      ctx.arc(cx + 22 * c.s, cy + 1 * c.s, 12 * c.s, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.fillStyle = lerpHex(prevLm.theme.hillBack, lm.theme.hillBack, fade);
    ctx.beginPath();
    ctx.moveTo(0, horizonY + 10);
    for (let sx = 0; sx <= w; sx += 24) {
      const n = terrainNoise(state.distance * 0.35 + sx * 1.4);
      const mh = 14 + n * 58;
      ctx.lineTo(sx, horizonY - mh);
    }
    ctx.lineTo(w, horizonY + 10);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = fade;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.24)';
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.28)';
    if (lm.id === 'keelung_zhengbin') {
      ['#f87171', '#fbbf24', '#34d399', '#60a5fa', '#f472b6'].forEach((col, i) => {
        ctx.fillStyle = col; ctx.fillRect(w * (0.08 + i * 0.07), horizonY - 26 - (i % 2) * 8, 18, 26 + (i % 2) * 8);
      });
    } else if (lm.id === 'taipei_101') {
      ctx.fillRect(w * 0.72, horizonY - 34, 14, 34); ctx.fillRect(w * 0.78, horizonY - 76, 16, 76); ctx.fillRect(w * 0.83, horizonY - 94, 6, 18);
    } else if (lm.id === 'tamsui_wharf') {
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(w * 0.12, horizonY); ctx.lineTo(w * 0.24, horizonY - 54); ctx.lineTo(w * 0.36, horizonY); ctx.stroke();
    } else if (lm.id === 'daxi_oldstreet' || lm.id === 'beigang_temple') {
      ctx.fillStyle = 'rgba(185, 28, 28, 0.45)';
      ctx.fillRect(w * 0.14, horizonY - 34, 48, 34);
      ctx.beginPath(); ctx.moveTo(w * 0.10, horizonY - 34); ctx.lineTo(w * 0.22, horizonY - 50); ctx.lineTo(w * 0.34, horizonY - 34); ctx.fill();
    } else if (lm.id === 'nanliao' || lm.id === 'gaomei') {
      [0.64, 0.82].forEach((fx) => {
        const tx = w * fx, ty = horizonY - 48;
        ctx.fillRect(tx - 2, ty, 4, 48);
        ctx.save(); ctx.translate(tx, ty); ctx.rotate(t * 1.4);
        for (let b = 0; b < 3; b++) { ctx.rotate((Math.PI * 2) / 3); ctx.fillRect(-1.5, 0, 3, 18); }
        ctx.restore();
      });
    } else if (lm.id === 'longteng_bridge') {
      ctx.fillStyle = 'rgba(180, 83, 9, 0.5)';
      for (let a = 0; a < 4; a++) ctx.fillRect(w * (0.58 + a * 0.08), horizonY - 36, 12, 36);
    } else if (lm.id === 'baguashan') {
      ctx.beginPath(); ctx.arc(w * 0.78, horizonY - 34, 18, 0, Math.PI * 2); ctx.fillRect(w * 0.72, horizonY - 22, 34, 22); ctx.fill();
    } else if (lm.id === 'sun_moon_lake') {
      ctx.fillStyle = 'rgba(15, 118, 110, 0.45)'; ctx.fillRect(w * 0.22, horizonY - 56, 10, 56);
    } else if (lm.id === 'alishan_forest') {
      [0.65, 0.75, 0.85].forEach((tx) => {
        ctx.fillStyle = 'rgba(21, 128, 61, 0.55)';
        ctx.beginPath(); ctx.moveTo(w * tx, horizonY - 64); ctx.lineTo(w * tx - 14, horizonY); ctx.lineTo(w * tx + 14, horizonY); ctx.fill();
      });
    } else if (lm.id === 'anping') {
      ctx.fillStyle = 'rgba(180, 83, 9, 0.35)'; ctx.fillRect(w * 0.65, horizonY - 24, 64, 24);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.65)'; ctx.fillRect(w * 0.74, horizonY - 52, 18, 28);
    } else if (lm.id === 'dragon_tiger') {
      [0.14, 0.25].forEach((px) => {
        ctx.fillStyle = 'rgba(217, 119, 6, 0.42)';
        ctx.fillRect(w * px, horizonY - 52, 16, 52); ctx.fillRect(w * px - 3, horizonY - 38, 22, 5); ctx.fillRect(w * px - 3, horizonY - 54, 22, 5);
      });
    } else if (lm.id === 'eluanbi') {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.88)'; ctx.fillRect(w * 0.78, horizonY - 54, 14, 54);
      ctx.fillStyle = 'rgba(254, 240, 138, 0.45)';
      ctx.beginPath(); ctx.moveTo(w * 0.80, horizonY - 50); ctx.lineTo(w * 0.55, horizonY - 78); ctx.lineTo(w * 0.58, horizonY - 38); ctx.closePath(); ctx.fill();
    } else if (lm.id === 'sanxiantai' || lm.id === 'penghu_bridge') {
      ctx.lineWidth = 3;
      for (let a = 0; a < 5; a++) { ctx.beginPath(); ctx.arc(w * (0.58 + a * 0.07), horizonY, 12, Math.PI, 0); ctx.stroke(); }
    } else if (lm.id === 'qixingtan') {
      ctx.fillStyle = 'rgba(4, 120, 87, 0.35)';
      ctx.beginPath(); ctx.moveTo(0, horizonY); ctx.lineTo(w * 0.22, horizonY - 72); ctx.lineTo(w * 0.45, horizonY); ctx.fill();
    } else if (lm.id === 'waiao') {
      ctx.beginPath(); ctx.moveTo(w * 0.62, horizonY); ctx.quadraticCurveTo(w * 0.74, horizonY - 32, w * 0.88, horizonY); ctx.fill();
    }
    ctx.restore();
  }

  // Asymmetric Biome Ground & Side Feature Painting!
  function drawAsymmetricBiome(ctx, lm, prevLm, fade, w, h, horizonY, roadTopW, roadBotW) {
    const topCX = roadCenterX(1, w);
    const botCX = roadCenterX(0, w);

    ctx.fillStyle = lerpHex(prevLm.theme.ground, lm.theme.ground, fade);
    ctx.fillRect(0, horizonY, w, h - horizonY);

    const drawSide = (b, alpha) => {
      if (alpha <= 0.02) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      if (b.biome === 'river_left' || b.biome === 'harbor_left') {
        ctx.fillStyle = b.biome === 'river_left' ? '#38bdf8' : '#0ea5e9';
        ctx.beginPath();
        ctx.moveTo(0, horizonY); ctx.lineTo(topCX - roadTopW * 0.65, horizonY);
        ctx.lineTo(botCX - roadBotW * 0.65, h); ctx.lineTo(0, h);
        ctx.closePath(); ctx.fill();
      } else if (b.biome === 'ocean_right' || b.biome === 'wetland_right' || b.biome === 'cliff_ocean' || b.biome === 'paddy_ocean') {
        ctx.fillStyle = b.biome === 'wetland_right' ? '#fdba74' : '#0284c7';
        ctx.beginPath();
        ctx.moveTo(topCX + roadTopW * 0.65, horizonY); ctx.lineTo(w, horizonY);
        ctx.lineTo(w, h); ctx.lineTo(botCX + roadBotW * 0.65, h);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(topCX + roadTopW * 0.68, horizonY); ctx.lineTo(botCX + roadBotW * 0.68, h); ctx.stroke();
        if (b.biome === 'cliff_ocean') {
          ctx.fillStyle = '#065f46';
          ctx.beginPath(); ctx.moveTo(0, horizonY); ctx.lineTo(topCX - roadTopW * 0.55, horizonY); ctx.lineTo(0, h * 0.72); ctx.closePath(); ctx.fill();
        }
      }
      ctx.restore();
    };
    if (fade < 1) drawSide(prevLm, 1 - fade);
    drawSide(lm, fade);
  }

  function renderScene() {
    const canvas = $('gameCanvas');
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const lm = getActiveStationObj(state.curStationIdx);
    const prevLm = getActiveStationObj(state.prevStationIdx);
    const fade = state.biomeFade;
    const th = lm.theme;

    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.42);
    sky.addColorStop(0, lerpHex(prevLm.theme.skyTop, th.skyTop, fade));
    sky.addColorStop(1, lerpHex(prevLm.theme.skyBottom, th.skyBottom, fade));
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h * 0.44);

    const horizonY = h * 0.40;
    drawCountyHorizon(ctx, lm, prevLm, fade, w, horizonY, state.elapsedSec);

    const roadTopW = w * 0.20;
    const roadBotW = w * 0.76;
    drawAsymmetricBiome(ctx, lm, prevLm, fade, w, h, horizonY, roadTopW, roadBotW);

    const topCX = roadCenterX(1, w);
    const botCX = roadCenterX(0, w);
    const activeCorridor = state.events.find((e) => e.template === 'corridor');

    if (activeCorridor) {
      // During the corridor exit animation segIndex is already past the last segment.
      const safeLane = activeCorridor.seq[Math.min(activeCorridor.segIndex, activeCorridor.seq.length - 1)] ?? 0;
      const tr = state.corridorTransition;
      const fL = state.corridorCurL;
      const fR = state.corridorCurR;

      // Fading closed road area
      ctx.fillStyle = 'rgba(15, 23, 42, ' + (0.35 * (1 - tr)).toFixed(2) + ')';
      ctx.beginPath();
      ctx.moveTo(topCX - roadTopW * 0.5, horizonY); ctx.lineTo(topCX + roadTopW * 0.5, horizonY);
      ctx.lineTo(botCX + roadBotW * 0.5, h); ctx.lineTo(botCX - roadBotW * 0.5, h);
      ctx.closePath(); ctx.fill();

      ctx.fillStyle = th.road;
      ctx.beginPath();
      ctx.moveTo(topCX + roadTopW * fL, horizonY); ctx.lineTo(topCX + roadTopW * fR, horizonY);
      ctx.lineTo(botCX + roadBotW * fR, h); ctx.lineTo(botCX + roadBotW * fL, h);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = tr < 1 ? '#f59e0b' : '#22c55e'; ctx.lineWidth = 4; ctx.stroke();

      ctx.fillStyle = 'rgba(74, 222, 128, 0.75)';
      for (let i = 0; i < 4; i++) {
        const z = ((i + state.roadScroll) / 4);
        const p = Math.pow(z, 1.5);
        const ay = horizonY + p * (h - horizonY);
        const ax = laneToScreenX(safeLane, 1 - p, w);
        ctx.font = Math.round(12 + p * 16) + 'px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('▲', ax, ay);
      }
    } else {
      ctx.fillStyle = th.road;
      ctx.beginPath();
      ctx.moveTo(topCX - roadTopW * 0.5, horizonY); ctx.lineTo(topCX + roadTopW * 0.5, horizonY);
      ctx.lineTo(botCX + roadBotW * 0.5, h); ctx.lineTo(botCX - roadBotW * 0.5, h);
      ctx.closePath(); ctx.fill();

      ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = 2.5;
      for (let i = 0; i < 8; i++) {
        const z0 = ((i + state.roadScroll) / 8);
        const z1 = Math.min(1, z0 + 0.06);
        const p0 = Math.pow(z0, 1.55), p1 = Math.pow(z1, 1.55);
        const y0 = horizonY + p0 * (h - horizonY), y1 = horizonY + p1 * (h - horizonY);
        const cx0 = roadCenterX(1 - p0, w), cx1 = roadCenterX(1 - p1, w);
        const half0 = (roadTopW + (roadBotW - roadTopW) * p0) * 0.5;
        const half1 = (roadTopW + (roadBotW - roadTopW) * p1) * 0.5;
        // Bike-path subtle single center dashed line
        ctx.beginPath(); ctx.moveTo(cx0, y0); ctx.lineTo(cx1, y1); ctx.stroke();
      }
    }

    // Asymmetric Roadside Props (Left vs Right differ!)
    for (let i = 0; i < 7; i++) {
      const z = ((i + state.roadScroll) / 7);
      const p = Math.pow(z, 1.6);
      const y = horizonY + p * (h - horizonY);
      const cx = roadCenterX(1 - p, w);
      const halfRoad = (roadTopW + (roadBotW - roadTopW) * p) * 0.5;
      const scale = 0.25 + p * 0.95;

      // Left prop
      const lx = cx - halfRoad - 22 * scale;
      if (lm.biome === 'river_left' || lm.biome === 'harbor_left') {
        ctx.fillStyle = '#0284c7'; ctx.fillRect(lx, y - 14 * scale, 4 * scale, 14 * scale); // Railing post
      } else if (lm.biome === 'oldtown_asym') {
        ctx.fillStyle = '#b45309'; ctx.fillRect(lx - 14 * scale, y - 24 * scale, 20 * scale, 24 * scale); // Red brick house
      } else {
        ctx.fillStyle = '#78350f'; ctx.fillRect(lx - 3 * scale, y - 16 * scale, 6 * scale, 16 * scale);
        ctx.fillStyle = th.accent; ctx.beginPath(); ctx.arc(lx, y - 24 * scale, 14 * scale, 0, Math.PI * 2); ctx.fill();
      }

      // Right prop
      const rx = cx + halfRoad + 22 * scale;
      if (lm.biome === 'ocean_right' || lm.biome === 'cliff_ocean' || lm.biome === 'paddy_ocean') {
        ctx.fillStyle = '#94a3b8'; ctx.beginPath(); ctx.arc(rx + 6 * scale, y - 6 * scale, 9 * scale, 0, Math.PI * 2); ctx.fill(); // Coastal rocks/tetrapods
      } else {
        const tKey = (lm.id === 'taipei_101' || lm.id === 'alishan_forest') ? 'prop_sakura' : 'prop_palm';
        if (!drawSprite(ctx, tKey, rx, y - 28 * scale, 56 * scale, 56 * scale)) {
          ctx.fillStyle = '#78350f'; ctx.fillRect(rx - 3 * scale, y - 16 * scale, 6 * scale, 16 * scale);
          ctx.fillStyle = th.accent; ctx.beginPath(); ctx.arc(rx, y - 24 * scale, 14 * scale, 0, Math.PI * 2); ctx.fill();
        }
      }
    }

    if ((state.boostTimer > 0 || state.throttle === 1) && !state.lowMotion) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'; ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const lx = (i % 2 === 0 ? 18 : w - 18) + (Math.random() * 14 - 7);
        const ly = h * 0.2 + Math.random() * h * 0.6;
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx, ly + 45); ctx.stroke();
      }
    }

    const sorted = [...state.events].sort((a, b) => b.z - a.z);
    sorted.forEach((ev) => {
      if (ev.template === 'boostpad') {
        const p = 1 - ev.z;
        const y = horizonY + Math.pow(p, 1.45) * (h * 0.78 - horizonY);
        const x = laneToScreenX(ev.lane, ev.z, w);
        const r = 14 + p * 20;
        ctx.fillStyle = '#0ea5e9'; ctx.strokeStyle = '#e0f2fe'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.roundRect(x - r, y - r * 0.6, r * 2, r * 1.2, 8); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold ' + Math.round(r * 0.9) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('⚡', x, y);
      } else if (ev.template === 'collect') {
        const p = 1 - ev.z;
        const y = horizonY + Math.pow(p, 1.45) * (h * 0.78 - horizonY);
        const x = laneToScreenX(ev.lane, ev.z, w);
        const r = 14 + p * 20;
        ctx.save();
        ctx.fillStyle = 'rgba(250, 204, 21, 0.38)';
        ctx.beginPath(); ctx.arc(x, y, r * 1.32, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fefce8'; ctx.strokeStyle = '#eab308'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        const snackMap = { '🍌': 'item_banana', '🧋': 'item_boba', '🧴': 'item_water', '🍙': 'item_onigiri' };
        const skey = snackMap[ev.item.icon];
        if (!skey || !drawSprite(ctx, skey, x, y, r * 1.85, r * 1.85)) {
          ctx.font = Math.round(r * 1.15) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(ev.item.icon, x, y + 2);
        }
        ctx.restore();
      } else if (ev.template === 'obstacle') {
        const p = 1 - ev.z;
        const y = horizonY + Math.pow(p, 1.45) * (h * 0.78 - horizonY);
        const r = 14 + p * 20;
        if (ev.kind === 'bump') {
          const sk = ev.skin || BUMP_SKINS[0];
          ev.blockedLanes.forEach((bl) => {
            const x = laneToScreenX(bl, ev.z, w);
            ctx.save();
            ctx.fillStyle = sk.bg || '#fee2e2';
            ctx.strokeStyle = sk.border || '#ef4444';
            ctx.lineWidth = 3;
            ctx.beginPath();
            if (sk.ellipse) ctx.ellipse(x, y, r * 1.15, r * 0.58, 0, 0, Math.PI * 2);
            else ctx.arc(x, y, r * 0.9, 0, Math.PI * 2);
            ctx.fill(); ctx.stroke();
            const bMap = { puddle: 'obs_puddle', rock: 'obs_rock', cone: 'obs_cone' };
            if (!bMap[sk.id] || !drawSprite(ctx, bMap[sk.id], x, y, r * 2.1, r * 2.1)) {
              ctx.font = Math.round(r) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
              ctx.fillText(sk.icon, x, y);
            }
            ctx.restore();
          });
        } else if (ev.kind === 'cyclist') {
          const sk = ev.skin || CYCLIST_SKINS[0];
          const x = laneToScreenX(ev.lane, ev.z, w);
          const vMap = { cyclist: 'veh_cyclist', scooter: 'veh_scooter', grandma: 'veh_grandma' };
          if (!drawSprite(ctx, vMap[sk.id] || 'veh_cyclist', x, y - r * 0.25, r * 2.7, r * 2.7)) {
            ctx.fillStyle = sk.bg; ctx.strokeStyle = sk.border; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.font = Math.round(r * 1.15) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(sk.icon, x, y + 1);
          }
        } else if (ev.kind === 'construction') {
          ev.blockedLanes.forEach((bl) => {
            const x = laneToScreenX(bl, ev.z, w);
            ctx.fillStyle = '#fee2e2'; ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            if (!drawSprite(ctx, 'obs_construction', x, y - r * 0.2, r * 2.4, r * 2.4)) {
              ctx.font = Math.round(r * 1.1) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
              ctx.fillText('🚧', x, y + 1);
            }
          });
          const sx = laneToScreenX(ev.safeLane, ev.z, w);
          ctx.fillStyle = '#22c55e'; ctx.font = 'bold ' + Math.round(r * 1.1) + 'px sans-serif'; ctx.textAlign = 'center';
          ctx.fillText('⬆️', sx, y);
        }
      }
    });

    if (state.distance >= state.bridgeStartDist && state.distance <= state.bridgeEndDist) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.36)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#334155';
      ctx.fillRect(0, horizonY - 46, w, 24);
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
    const bob = (state.stoppedAtConstruction || state.stoppedAtCorridor) ? 0 : Math.sin(pedalPhase) * 2.5;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.22)';
    ctx.beginPath(); ctx.ellipse(0, 38, 34, 10, 0, 0, Math.PI * 2); ctx.fill();
    const spriteKey = 'rider_' + (state.charId || 'ming');
    if (!drawSprite(ctx, spriteKey, 0, -14 + bob, 118, 118)) {
      const curBike = BIKES.find((b) => b.id === state.bikeId) || BIKES[0];
      const curChar = CHARACTERS.find((c) => c.id === state.charId) || CHARACTERS[0];
      ctx.strokeStyle = curBike.frameColor; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(0, 12); ctx.lineTo(0, -14); ctx.stroke();
      ctx.fillStyle = curChar.jersey; ctx.beginPath(); ctx.roundRect(-16, -40 + bob, 32, 32, 11); ctx.fill();
      ctx.fillStyle = curChar.helmet; ctx.beginPath(); ctx.arc(0, -52 + bob, 13, 0, Math.PI * 2); ctx.fill();
    }
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
    [...LANDMARKS, PENGHU_SPECIAL].forEach((lm) => {
      const ok = saveData.unlockedIds.includes(lm.id);
      const card = document.createElement('div');
      card.className = 'album-item' + (ok ? '' : ' locked');
      const thumb = lm.image
        ? '<img src="' + lm.image + '" alt="' + lm.name + '">'
        : '<div style="aspect-ratio:4/3;display:flex;align-items:center;justify-content:center;font-size:2rem;background:linear-gradient(135deg,#ccfbf1,#fef3c7);border-radius:8px;">' + lm.icon + '</div>';
      card.innerHTML = thumb + '<div class="lbl">' + (ok ? '✅ ' : '🔒 ') + lm.county + '<br>' + lm.name + '</div>';
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
    $('calibrateLocalGyroBtn').addEventListener('click', () => { if (localSensor) localSensor.calibrateNeutral(); });
    $('hudCalibrateBtn').addEventListener('click', () => { if (localSensor) localSensor.calibrateNeutral(); });
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
        const cfg = LEVEL_CONFIG[state.level];
        if (cfg && $('levelDescText')) $('levelDescText').textContent = cfg.desc;
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
    document.querySelectorAll('[data-snack]').forEach((b) => {
      b.addEventListener('click', () => {
        state.snackStyle = b.dataset.snack;
        document.querySelectorAll('[data-snack]').forEach((x) => x.classList.toggle('selected', x === b));
      });
    });
    document.querySelectorAll('[data-steer]').forEach((b) => {
      b.addEventListener('click', () => {
        state.steeringMode = b.dataset.steer;
        document.querySelectorAll('[data-steer]').forEach((x) => x.classList.toggle('selected', x === b));
        if ($('laneTouchConfigRow')) $('laneTouchConfigRow').classList.toggle('hidden', state.steeringMode !== 'lanes');
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

    const applySteerDown = (dir) => {
      state.controlMethod = 'touch';
      if (state.steeringMode === 'smooth') {
        state.steerInput = dir;
      } else {
        setLane(Math.max(-1, Math.min(1, state.lane + dir)));
      }
    };
    const applySteerUp = (dir) => {
      if (state.steeringMode === 'smooth' && state.steerInput === dir) {
        state.steerInput = 0;
      }
    };

    const bindSplitTouch = (el, dir) => {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        el.classList.add('pressed');
        applySteerDown(dir);
      });
      const release = () => {
        el.classList.remove('pressed');
        applySteerUp(dir);
      };
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('pointerleave', release);
    };
    bindSplitTouch($('touchZoneLeft'), -1);
    bindSplitTouch($('touchZoneRight'), 1);

    document.querySelectorAll('.lane-btn').forEach((btn) => {
      const dir = Number(btn.dataset.lane);
      btn.addEventListener('pointerdown', () => applySteerDown(dir));
      btn.addEventListener('pointerup', () => applySteerUp(dir));
      btn.addEventListener('pointerleave', () => applySteerUp(dir));
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
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        if (state.steeringMode === 'smooth') state.steerInput = -1;
        else if (!e.repeat) setLane(Math.max(-1, state.lane - 1));
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        if (state.steeringMode === 'smooth') state.steerInput = 1;
        else if (!e.repeat) setLane(Math.min(1, state.lane + 1));
      } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        setThrottle(1);
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        setThrottle(-1);
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        if (state.steerInput === -1) state.steerInput = 0;
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        if (state.steerInput === 1) state.steerInput = 0;
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'w' || e.key === 'W' || e.key === 's' || e.key === 'S') {
        setThrottle(0);
      }
    });
    window.addEventListener('resize', () => { if (state.view === 'game') resizeCanvas(); });
  }

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
