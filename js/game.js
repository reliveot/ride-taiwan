/**
 * 《騎遍台灣》單車環島復健遊戲 V1.0 — Main Game & Controller App
 */
(function () {
  'use strict';

  const { LANDMARKS, COLLECTIBLES } = window.RideTaiwanData;
  const { TiltSensorEngine, RehabLink, requestWakeLock } = window.TiltRehabKit;
  const AudioFX = window.RehabAudio;

  // --- App State ---
  const state = {
    view: 'home', // 'home' | 'game' | 'controller'
    running: false,
    paused: false,
    muted: false,
    lane: 0, // -1 Left, 0 Center, 1 Right
    bikeXNorm: 0, // Smooth interpolated [-1, 1]
    bikeLean: 0,
    pedalPhase: 0,
    roadScroll: 0,
    score: 0,
    collectedCount: 0,
    leftReps: 0,
    rightReps: 0,
    lastScoredLane: 0,
    stageIndex: 0,
    stageCollected: 0,
    unlockedIds: [],
    startTimeMs: 0,
    elapsedSec: 0,
    needsReturnCenter: false,
    currentTarget: null, // { lane, z, item, bobPhase, collectedAnim }
    particles: [],
    floatingTexts: [],
    // Settings
    thresholdDeg: 18,
    stability: 'medium', // 'low' | 'medium' | 'high'
    itemsPerStage: 5,
    requireCenterReturn: true,
    laneMode: 'lr', // 'lr' | 'lcr'
    // Pairing
    roomCode: RehabLink.generateRoomCode(),
    phoneConnected: false,
    phoneAngle: 0
  };

  let link = new RehabLink();
  let sensor = null;
  let rafId = 0;
  let lastFrameMs = 0;
  let wakeLock = null;

  // --- DOM Helpers ---
  const $ = (id) => document.getElementById(id);

  function showView(viewName) {
    state.view = viewName;
    $('homeView').classList.toggle('hidden', viewName !== 'home');
    $('gameView').classList.toggle('hidden', viewName !== 'game');
    $('controllerView').classList.toggle('hidden', viewName !== 'controller');
    $('topActions').classList.toggle('hidden', viewName === 'controller');
  }

  function updateConnectionUI() {
    const pill = $('connStatusPill');
    if (state.phoneConnected) {
      pill.textContent = '📱 手機已連線';
      pill.className = 'pill connected';
      if ($('homeConnText')) {
        $('homeConnText').textContent = '✅ 手機控制器已成功連線！傾斜手機即可控制單車。';
      }
    } else {
      pill.textContent = '⌨️ 單機測試模式';
      pill.className = 'pill sim';
      if ($('homeConnText')) {
        $('homeConnText').textContent = '等待手機掃描 QR Code 或輸入房號配對（也可直接單機測試）。';
      }
    }
  }

  // --- QR Code & Host Pairing ---
  function initHostPairing() {
    if ($('roomCodeDisplay')) {
      $('roomCodeDisplay').textContent = state.roomCode;
    }
    const base = window.location.protocol.startsWith('http')
      ? (window.location.origin + window.location.pathname)
      : '';
    const ctrlUrl = base ? (base + '?mode=controller&room=' + state.roomCode) : ('?mode=controller&room=' + state.roomCode);

    const qrWrap = $('qrContainer');
    if (qrWrap) {
      qrWrap.innerHTML = '';
      if (typeof QRCode !== 'undefined' && base) {
        new QRCode(qrWrap, {
          text: ctrlUrl,
          width: 104,
          height: 104,
          colorDark: '#0f766e',
          colorLight: '#ffffff'
        });
      } else {
        qrWrap.innerHTML = '<div style="font-size:11px;color:#64748b;text-align:center;line-height:1.35;">房號配對<br><strong style="font-size:16px;color:#0f766e;">' + state.roomCode + '</strong><br>部署後顯示QR</div>';
      }
    }

    link.createHost(state.roomCode, {
      onConnect: () => {
        state.phoneConnected = true;
        updateConnectionUI();
      },
      onDisconnect: () => {
        state.phoneConnected = false;
        updateConnectionUI();
      },
      onMessage: (data) => {
        if (!data) return;
        if (data.type === 'tilt') {
          state.phoneAngle = data.relativeAngle || 0;
          setLane(data.lane);
        } else if (data.type === 'calibrate') {
          setLane(0);
        }
      }
    });
  }

  // --- Lane Control ---
  function setLane(newLane) {
    const clamped = newLane < 0 ? -1 : (newLane > 0 ? 1 : 0);
    if (clamped !== state.lane) {
      state.lane = clamped;
      if (state.running && !state.paused) {
        AudioFX.playLaneSwitch();
      }
    }
    if (state.needsReturnCenter && clamped === 0) {
      state.needsReturnCenter = false;
      $('centerCue').classList.add('hidden');
      if (state.running && !state.paused) {
        AudioFX.playCenterReady();
        spawnTarget();
      }
    }
    syncLaneButtons();
  }

  function syncLaneButtons() {
    const btns = document.querySelectorAll('.lane-btn');
    btns.forEach((b) => {
      const l = Number(b.dataset.lane);
      b.classList.toggle('active', l === state.lane);
    });
  }

  // --- Game Logic ---
  function spawnTarget() {
    if (state.currentTarget || state.needsReturnCenter) return;
    let laneChoice;
    if (state.laneMode === 'lr') {
      laneChoice = Math.random() < 0.5 ? -1 : 1;
    } else {
      const lanes = [-1, 0, 1];
      laneChoice = lanes[Math.floor(Math.random() * lanes.length)];
    }
    const item = COLLECTIBLES[Math.floor(Math.random() * COLLECTIBLES.length)];
    state.currentTarget = {
      lane: laneChoice,
      z: 1.0, // 1.0 = horizon, 0.0 = player
      item,
      bobPhase: Math.random() * Math.PI * 2
    };
  }

  function startGame() {
    state.running = true;
    state.paused = false;
    state.score = 0;
    state.collectedCount = 0;
    state.leftReps = 0;
    state.rightReps = 0;
    state.stageIndex = 0;
    state.stageCollected = 0;
    state.unlockedIds = [];
    state.needsReturnCenter = false;
    state.currentTarget = null;
    state.particles = [];
    state.floatingTexts = [];
    state.lane = 0;
    state.bikeXNorm = 0;
    state.startTimeMs = performance.now();
    state.elapsedSec = 0;

    $('centerCue').classList.add('hidden');
    showView('game');
    resizeCanvas();
    updateHUD();
    spawnTarget();

    if (rafId) cancelAnimationFrame(rafId);
    lastFrameMs = performance.now();
    rafId = requestAnimationFrame(gameLoop);
  }

  function endGame() {
    state.running = false;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    state.elapsedSec = Math.max(1, Math.round((performance.now() - state.startTimeMs) / 1000));
    showSummaryModal();
  }

  function updateHUD() {
    const lm = LANDMARKS[state.stageIndex] || LANDMARKS[LANDMARKS.length - 1];
    $('hudStageTitle').textContent = lm.county + ' · ' + lm.name;
    $('hudStageProgress').textContent = state.stageCollected + ' / ' + state.itemsPerStage;
    const pct = Math.min(100, Math.round((state.stageCollected / state.itemsPerStage) * 100));
    $('hudProgressFill').style.width = pct + '%';
    $('hudScore').textContent = state.score;
    $('hudCount').textContent = state.collectedCount;
  }

  function collectCurrentTarget() {
    const t = state.currentTarget;
    if (!t) return;
    state.score += t.item.points;
    state.collectedCount += 1;
    state.stageCollected += 1;
    if (t.lane === -1) state.leftReps += 1;
    if (t.lane === 1) state.rightReps += 1;

    AudioFX.playCollect();

    // Particle burst
    const canvas = $('gameCanvas');
    const px = laneToScreenX(t.lane, 0.08, canvas.width);
    const py = canvas.height * 0.76;
    for (let i = 0; i < 14; i++) {
      const a = (Math.PI * 2 * i) / 14;
      const spd = 70 + Math.random() * 110;
      state.particles.push({
        x: px,
        y: py,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd - 40,
        life: 0.65,
        maxLife: 0.65,
        color: t.item.color
      });
    }
    state.floatingTexts.push({
      x: px,
      y: py - 24,
      text: '+' + t.item.points + ' ' + t.item.icon,
      life: 0.9
    });

    state.currentTarget = null;
    updateHUD();

    // Check Landmark Unlock
    if (state.stageCollected >= state.itemsPerStage) {
      const unlocked = LANDMARKS[state.stageIndex];
      if (unlocked && !state.unlockedIds.includes(unlocked.id)) {
        state.unlockedIds.push(unlocked.id);
      }
      state.paused = true;
      AudioFX.playUnlock();
      showUnlockModal(unlocked);
      return;
    }

    // Require Return-to-Center before next target (V1.0 rehab rule)
    if (state.requireCenterReturn && state.lane !== 0) {
      state.needsReturnCenter = true;
      $('centerCue').classList.remove('hidden');
    } else {
      spawnTarget();
    }
  }

  // --- Modals ---
  function showUnlockModal(lm) {
    $('unlockCounty').textContent = lm.county;
    $('unlockName').textContent = lm.name;
    $('unlockSubtitle').textContent = lm.subtitle;
    $('unlockDesc').textContent = lm.description;
    $('unlockImg').src = lm.image;
    $('unlockModal').classList.remove('hidden');
  }

  function closeUnlockAndContinue() {
    $('unlockModal').classList.add('hidden');
    if (state.stageIndex + 1 < LANDMARKS.length) {
      state.stageIndex += 1;
      state.stageCollected = 0;
      state.paused = false;
      updateHUD();
      if (state.requireCenterReturn && state.lane !== 0) {
        state.needsReturnCenter = true;
        $('centerCue').classList.remove('hidden');
      } else {
        spawnTarget();
      }
      lastFrameMs = performance.now();
    } else {
      // Completed all 9 landmarks!
      endGame();
    }
  }

  function showAlbumModal() {
    const grid = $('albumGrid');
    grid.innerHTML = '';
    LANDMARKS.forEach((lm) => {
      const unlocked = state.unlockedIds.includes(lm.id);
      const card = document.createElement('div');
      card.className = 'album-item' + (unlocked ? '' : ' locked');
      card.innerHTML =
        '<img src="' + lm.image + '" alt="' + lm.name + '">' +
        '<div class="lbl">' + (unlocked ? '✅ ' : '🔒 ') + lm.county + '<br>' + lm.name + '</div>';
      if (unlocked) {
        card.addEventListener('click', () => {
          $('albumDetailTitle').textContent = lm.county + ' · ' + lm.name;
          $('albumDetailDesc').textContent = lm.description;
          $('albumDetailBox').classList.remove('hidden');
        });
      }
      grid.appendChild(card);
    });
    $('albumDetailBox').classList.add('hidden');
    $('albumModal').classList.remove('hidden');
  }

  function showSummaryModal() {
    const mins = Math.floor(state.elapsedSec / 60);
    const secs = state.elapsedSec % 60;
    $('sumTime').textContent = String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
    $('sumCount').textContent = state.collectedCount + ' 個';
    $('sumReps').textContent = '左 ' + state.leftReps + ' 次 / 右 ' + state.rightReps + ' 次';
    $('sumProgress').textContent = state.unlockedIds.length + ' / ' + LANDMARKS.length + ' 縣市';

    const list = $('sumLandmarks');
    list.innerHTML = '';
    if (state.unlockedIds.length === 0) {
      list.innerHTML = '<div style="font-size:0.86rem;color:#64748b;">本次尚未解鎖新景點，下次再多收集幾個郵票吧！</div>';
    } else {
      state.unlockedIds.forEach((id) => {
        const lm = LANDMARKS.find((x) => x.id === id);
        if (!lm) return;
        const badge = document.createElement('div');
        badge.className = 'pill connected';
        badge.textContent = '🏅 ' + lm.county + ' ' + lm.name;
        list.appendChild(badge);
      });
    }
    $('summaryModal').classList.remove('hidden');
  }

  // --- 2.5D Canvas Rendering ---
  function resizeCanvas() {
    const canvas = $('gameCanvas');
    const wrap = canvas.parentElement;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    canvas.width = Math.max(320, Math.floor(rect.width));
    canvas.height = Math.max(380, Math.floor(rect.height));
  }

  function laneToScreenX(lane, depthFromPlayer, width) {
    // depthFromPlayer: 0 = bottom (player), 1 = horizon
    const spreadBottom = width * 0.29;
    const spreadTop = width * 0.05;
    const spread = spreadBottom * (1 - depthFromPlayer) + spreadTop * depthFromPlayer;
    return width * 0.5 + lane * spread;
  }

  function gameLoop(now) {
    if (!state.running) return;
    const dt = Math.min(0.05, (now - lastFrameMs) / 1000);
    lastFrameMs = now;

    if (!state.paused) {
      updatePhysics(dt);
    }
    renderScene();
    rafId = requestAnimationFrame(gameLoop);
  }

  function updatePhysics(dt) {
    // Smooth lane lerp
    const prevX = state.bikeXNorm;
    state.bikeXNorm += (state.lane - state.bikeXNorm) * Math.min(1, dt * 11);
    state.bikeLean = (state.lane - prevX) * 0.25;
    state.pedalPhase += dt * 7.5;
    state.roadScroll = (state.roadScroll + dt * 1.45) % 1;

    // Target movement (gentle, unhurried pace; pauses politely near player if waiting for player)
    if (state.currentTarget) {
      const t = state.currentTarget;
      t.bobPhase += dt * 4;
      // Approach smoothly, slow down near pickup zone so player never fails due to slow movement
      const speed = t.z > 0.25 ? 0.26 : 0.08;
      t.z = Math.max(0.08, t.z - dt * speed);

      // Generous pickup zone
      if (t.z <= 0.17 && Math.abs(state.bikeXNorm - t.lane) < 0.42) {
        collectCurrentTarget();
      }
    }

    // Particles
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 240 * dt;
      p.life -= dt;
      if (p.life <= 0) state.particles.splice(i, 1);
    }

    // Floating texts
    for (let i = state.floatingTexts.length - 1; i >= 0; i--) {
      const ft = state.floatingTexts[i];
      ft.y -= 36 * dt;
      ft.life -= dt;
      if (ft.life <= 0) state.floatingTexts.splice(i, 1);
    }
  }

  function renderScene() {
    const canvas = $('gameCanvas');
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const lm = LANDMARKS[state.stageIndex] || LANDMARKS[0];
    const th = lm.theme;

    // 1. Sky Gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.42);
    skyGrad.addColorStop(0, th.skyTop);
    skyGrad.addColorStop(1, th.skyBottom);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h * 0.44);

    // Sun
    ctx.fillStyle = 'rgba(255, 250, 210, 0.85)';
    ctx.beginPath();
    ctx.arc(w * 0.78, h * 0.16, 26, 0, Math.PI * 2);
    ctx.fill();

    // 2. Distant Taiwan Mountains
    const horizonY = h * 0.40;
    ctx.fillStyle = th.hillBack;
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.quadraticCurveTo(w * 0.22, horizonY - 56, w * 0.48, horizonY - 14);
    ctx.quadraticCurveTo(w * 0.76, horizonY - 64, w, horizonY - 10);
    ctx.lineTo(w, horizonY + 10);
    ctx.lineTo(0, horizonY + 10);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = th.hillFront;
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.quadraticCurveTo(w * 0.18, horizonY - 22, w * 0.40, horizonY - 5);
    ctx.quadraticCurveTo(w * 0.72, horizonY - 34, w, horizonY - 4);
    ctx.lineTo(w, horizonY + 10);
    ctx.lineTo(0, horizonY + 10);
    ctx.closePath();
    ctx.fill();

    // 3. Ground
    ctx.fillStyle = th.ground;
    ctx.fillRect(0, horizonY, w, h - horizonY);

    // 4. Perspective Road (Trapezoid)
    const roadTopW = w * 0.22;
    const roadBotW = w * 0.92;
    ctx.fillStyle = '#475569';
    ctx.beginPath();
    ctx.moveTo(w * 0.5 - roadTopW * 0.5, horizonY);
    ctx.lineTo(w * 0.5 + roadTopW * 0.5, horizonY);
    ctx.lineTo(w * 0.5 + roadBotW * 0.5, h);
    ctx.lineTo(w * 0.5 - roadBotW * 0.5, h);
    ctx.closePath();
    ctx.fill();

    // Road shoulders
    ctx.strokeStyle = '#fef3c7';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(w * 0.5 - roadTopW * 0.48, horizonY);
    ctx.lineTo(w * 0.5 - roadBotW * 0.48, h);
    ctx.moveTo(w * 0.5 + roadTopW * 0.48, horizonY);
    ctx.lineTo(w * 0.5 + roadBotW * 0.48, h);
    ctx.stroke();

    // 3-Lane Dashed Dividers (Left | Center | Right)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 8; i++) {
      const z0 = ((i + state.roadScroll) / 8);
      const z1 = Math.min(1, z0 + 0.06);
      const y0 = horizonY + Math.pow(z0, 1.55) * (h - horizonY);
      const y1 = horizonY + Math.pow(z1, 1.55) * (h - horizonY);
      const half0 = (roadTopW + (roadBotW - roadTopW) * Math.pow(z0, 1.55)) * 0.5;
      const half1 = (roadTopW + (roadBotW - roadTopW) * Math.pow(z1, 1.55)) * 0.5;

      // Dividers at -1/3 and +1/3 of road width
      [-0.33, 0.33].forEach((f) => {
        ctx.beginPath();
        ctx.moveTo(w * 0.5 + half0 * f, y0);
        ctx.lineTo(w * 0.5 + half1 * f, y1);
        ctx.stroke();
      });
    }

    // Roadside Trees scrolling toward player
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
        ctx.fillStyle = th.accent;
        ctx.beginPath();
        ctx.arc(tx, y - 24 * scale, 15 * scale, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // Center Return Highlight Ring when waiting for center return
    if (state.needsReturnCenter) {
      const cx = laneToScreenX(0, 0.14, w);
      const cy = h * 0.78;
      ctx.save();
      ctx.strokeStyle = 'rgba(234, 88, 12, 0.85)';
      ctx.lineWidth = 4;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.ellipse(cx, cy, 44, 16, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 5. Collectible Target
    if (state.currentTarget) {
      const t = state.currentTarget;
      const depth = t.z; // 1 = horizon, 0 = bottom
      const p = 1 - depth;
      const ty = horizonY + Math.pow(p, 1.45) * (h * 0.78 - horizonY) + Math.sin(t.bobPhase) * 6;
      const tx = laneToScreenX(t.lane, depth, w);
      const r = 16 + p * 22;

      // Ground shadow
      ctx.fillStyle = 'rgba(15, 23, 42, 0.22)';
      ctx.beginPath();
      ctx.ellipse(tx, ty + r * 0.95, r * 0.85, r * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();

      // Glowing badge
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = t.item.color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(tx, ty, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.font = Math.round(r * 1.15) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t.item.icon, tx, ty + 2);
    }

    // 6. Rear-view Cyclist
    drawCyclist(ctx, laneToScreenX(state.bikeXNorm, 0.08, w), h * 0.81, state.bikeLean, state.pedalPhase);

    // 7. Particles & Floating Texts
    state.particles.forEach((p) => {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    state.floatingTexts.forEach((ft) => {
      ctx.globalAlpha = Math.min(1, ft.life * 1.5);
      ctx.font = 'bold 20px sans-serif';
      ctx.fillStyle = '#ea580c';
      ctx.textAlign = 'center';
      ctx.fillText(ft.text, ft.x, ft.y);
    });
    ctx.globalAlpha = 1;
  }

  function drawCyclist(ctx, x, y, lean, pedalPhase) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(lean);

    // Shadow
    ctx.fillStyle = 'rgba(15, 23, 42, 0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 36, 30, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    // Rear tire
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.roundRect(-7, 4, 14, 34, 6);
    ctx.fill();

    // Bicycle frame & mudguard
    ctx.strokeStyle = '#0f766e';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 12);
    ctx.lineTo(0, -14);
    ctx.stroke();

    // Handlebars
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-24, -22);
    ctx.lineTo(24, -22);
    ctx.stroke();

    // Rider Torso (warm cycling jersey)
    const bob = Math.sin(pedalPhase) * 2.2;
    ctx.fillStyle = '#ea580c';
    ctx.beginPath();
    ctx.roundRect(-17, -42 + bob, 34, 34, 12);
    ctx.fill();

    // Backpack
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.roundRect(-12, -38 + bob, 24, 24, 8);
    ctx.fill();

    // Helmet
    ctx.fillStyle = '#0d9488';
    ctx.beginPath();
    ctx.arc(0, -54 + bob, 14, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // --- Controller Mode Logic ---
  function initControllerMode(roomFromUrl) {
    showView('controller');
    if (roomFromUrl) {
      $('ctrlRoomInput').value = roomFromUrl;
    }

    sensor = new TiltSensorEngine({
      thresholdDeg: state.thresholdDeg,
      onUpdate: (data) => {
        $('ctrlAngleReadout').textContent = Math.round(data.relativeAngle) + '°';
        const pct = Math.max(5, Math.min(95, 50 + (data.relativeAngle / 45) * 45));
        $('ctrlAngleDot').style.left = pct + '%';

        ['ctrlZoneLeft', 'ctrlZoneCenter', 'ctrlZoneRight'].forEach((id, idx) => {
          const targetLane = idx - 1;
          $(id).classList.toggle('active', data.lane === targetLane);
        });

        link.send({
          type: 'tilt',
          lane: data.lane,
          relativeAngle: data.relativeAngle,
          rawAngle: data.rawAngle
        });
      },
      onStatus: (st) => {
        $('ctrlSensorStatus').textContent = st.message;
      }
    });

    const connectToRoom = () => {
      const code = $('ctrlRoomInput').value.trim();
      if (!code) return;
      $('ctrlConnStatus').textContent = '連線中...';
      link.connectController(code, {
        onConnect: ({ transport }) => {
          $('ctrlConnStatus').textContent = transport === 'webrtc' ? '✅ 已透過網路配對連線' : '✅ 已透過本機分頁連線';
          $('ctrlConnStatus').className = 'pill connected';
        },
        onDisconnect: () => {
          $('ctrlConnStatus').textContent = '連線已中斷';
          $('ctrlConnStatus').className = 'pill';
        },
        onError: () => {
          $('ctrlConnStatus').textContent = '連線失敗，請確認房號';
        }
      });
    };

    $('ctrlConnectBtn').addEventListener('click', connectToRoom);
    if (roomFromUrl) {
      connectToRoom();
    }

    $('ctrlStartSensorBtn').addEventListener('click', async () => {
      await sensor.requestPermissionAndStart();
      wakeLock = await requestWakeLock();
    });

    $('ctrlCalibrateBtn').addEventListener('click', () => {
      sensor.calibrateNeutral();
      link.send({ type: 'calibrate' });
    });

    // Fallback touch buttons on phone controller
    document.querySelectorAll('.ctrl-touch-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const lane = Number(btn.dataset.lane);
        ['ctrlZoneLeft', 'ctrlZoneCenter', 'ctrlZoneRight'].forEach((id, idx) => {
          $(id).classList.toggle('active', idx - 1 === lane);
        });
        link.send({ type: 'tilt', lane, relativeAngle: lane * 20 });
      });
    });
  }

  // --- Event Bindings ---
  function bindEvents() {
    $('startGameBtn').addEventListener('click', startGame);
    $('endGameBtn').addEventListener('click', endGame);
    $('openAlbumBtn').addEventListener('click', showAlbumModal);
    $('hudAlbumBtn').addEventListener('click', () => {
      state.paused = true;
      showAlbumModal();
    });
    $('closeAlbumBtn').addEventListener('click', () => {
      $('albumModal').classList.add('hidden');
      if (state.running) {
        state.paused = false;
        lastFrameMs = performance.now();
      }
    });
    $('unlockContinueBtn').addEventListener('click', closeUnlockAndContinue);
    $('unlockAlbumBtn').addEventListener('click', () => {
      $('unlockModal').classList.add('hidden');
      showAlbumModal();
    });

    $('sumReplayBtn').addEventListener('click', () => {
      $('summaryModal').classList.add('hidden');
      startGame();
    });
    $('sumHomeBtn').addEventListener('click', () => {
      $('summaryModal').classList.add('hidden');
      showView('home');
    });

    $('muteBtn').addEventListener('click', () => {
      state.muted = !state.muted;
      AudioFX.setMuted(state.muted);
      $('muteBtn').textContent = state.muted ? '🔇 靜音' : '🔊 音效';
    });

    // Settings
    $('thresholdSlider').addEventListener('input', (e) => {
      state.thresholdDeg = Number(e.target.value);
      $('thresholdVal').textContent = state.thresholdDeg + '°';
    });

    document.querySelectorAll('[data-stability]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.stability = btn.dataset.stability;
        document.querySelectorAll('[data-stability]').forEach((b) => b.classList.toggle('selected', b === btn));
      });
    });

    document.querySelectorAll('[data-items]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.itemsPerStage = Number(btn.dataset.items);
        document.querySelectorAll('[data-items]').forEach((b) => b.classList.toggle('selected', b === btn));
      });
    });

    document.querySelectorAll('[data-center]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.requireCenterReturn = btn.dataset.center === 'true';
        document.querySelectorAll('[data-center]').forEach((b) => b.classList.toggle('selected', b === btn));
      });
    });

    document.querySelectorAll('[data-lanemode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.laneMode = btn.dataset.lanemode;
        document.querySelectorAll('[data-lanemode]').forEach((b) => b.classList.toggle('selected', b === btn));
      });
    });

    // Open controller mode in same window / new tab
    $('openControllerBtn').addEventListener('click', () => {
      if (window.location.protocol.startsWith('http')) {
        window.open(window.location.pathname + '?mode=controller&room=' + state.roomCode, '_blank');
      } else {
        initControllerMode(state.roomCode);
      }
    });

    $('ctrlBackHomeBtn').addEventListener('click', () => {
      if (sensor) sensor.stop();
      initHostPairing();
      showView('home');
    });

    // On-screen test buttons & simulated tilt slider
    document.querySelectorAll('.lane-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        setLane(Number(btn.dataset.lane));
      });
    });

    $('simTiltSlider').addEventListener('input', (e) => {
      const angle = Number(e.target.value);
      $('simTiltVal').textContent = angle + '°';
      if (angle <= -state.thresholdDeg) setLane(-1);
      else if (angle >= state.thresholdDeg) setLane(1);
      else setLane(0);
    });

    // Keyboard controls (ArrowLeft / ArrowDown / ArrowRight or A / S / D)
    window.addEventListener('keydown', (e) => {
      if (state.view !== 'game' || !state.running || state.paused) return;
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        setLane(-1);
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        setLane(1);
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S' || e.key === ' ') {
        setLane(0);
      }
    });

    window.addEventListener('resize', () => {
      if (state.view === 'game') resizeCanvas();
    });
  }

  // --- Boot ---
  window.addEventListener('load', () => {
    bindEvents();
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'controller') {
      initControllerMode(params.get('room') || '');
    } else {
      initHostPairing();
      updateConnectionUI();
      showView('home');
    }
  });
})();
