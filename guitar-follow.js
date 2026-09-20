(function GuitarFollowModule() {
  const api = window.GuitarDrumAPI;
  if (!api) return;

  const intensity = document.querySelector('#intensity');
  const intensityLabel = document.querySelector('#intensityLabel');
  const drummer = document.querySelector('.drummer');
  if (!intensity || !drummer) return;

  const STORAGE_KEY = 'guitar-drum-follow-v1';
  const ANALYSIS_MS = 80;
  const STATE_HOLD_MS = 520;
  const APPLY_COOLDOWN_MS = 900;
  const SILENCE_HOLD_MS = 1400;

  let audioCtx = null;
  let stream = null;
  let source = null;
  let analyser = null;
  let buffer = null;
  let running = false;
  let raf = 0;
  let lastAnalysisAt = 0;

  let smoothedEnergy = 0;
  let ambientDb = -58;
  let peakDb = -24;
  let currentState = 'silent';
  let candidateState = 'silent';
  let candidateSince = 0;
  let lastAppliedAt = 0;
  let silentSince = 0;
  let onsetEnvelope = 0;
  let onsetCount = 0;
  let onsetWindowStartedAt = performance.now();
  let lastOnsetAt = 0;

  injectStyles();
  const ui = buildUi();
  restoreSettings();
  renderState('silent', 0, -80, 0);
  attachListeners();

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .gd-follow{margin-top:12px;padding:12px;border:1px solid var(--border);border-radius:14px;background:var(--panel)}
      .gd-follow-head{display:flex;justify-content:space-between;gap:10px;align-items:center}
      .gd-follow-title{font-size:13px;font-weight:800}
      .gd-follow-pill{padding:4px 8px;border-radius:999px;background:var(--card);border:1px solid var(--border);font-size:11px;font-weight:800;color:var(--muted);text-transform:uppercase}
      .gd-follow-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;margin-top:10px}
      .gd-follow-meter{height:10px;border-radius:999px;background:#e5e7ea;overflow:hidden}
      .gd-follow-meter>div{height:100%;width:0;background:var(--accent);transition:width .12s linear}
      .gd-follow-value{min-width:54px;text-align:right;color:var(--muted);font-size:12px;font-variant-numeric:tabular-nums}
      .gd-follow-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:9px}
      .gd-follow-stat{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:7px 8px}
      .gd-follow-stat span{display:block;font-size:9px;color:var(--muted);font-weight:800;text-transform:uppercase}
      .gd-follow-stat strong{display:block;margin-top:2px;font-size:13px}
      .gd-follow-controls{display:grid;grid-template-columns:auto minmax(110px,1fr);gap:10px;align-items:end;margin-top:10px}
      .gd-follow-controls button{min-width:134px;min-height:40px;padding:0 12px}
      .gd-follow-controls label{font-size:11px;margin:0}
      .gd-follow-controls input{margin-top:5px}
      .gd-follow-hint{margin-top:8px;color:var(--muted);font-size:11px;line-height:1.4}
      @media(max-width:560px){.gd-follow-controls{grid-template-columns:1fr}.gd-follow-controls button{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function buildUi() {
    const host = document.createElement('div');
    host.className = 'gd-follow';
    host.innerHTML = `
      <div class="gd-follow-head">
        <div class="gd-follow-title">🎸 Follow guitar · POC</div>
        <div id="gdFollowPill" class="gd-follow-pill">OFF</div>
      </div>
      <div class="gd-follow-row">
        <div class="gd-follow-meter"><div id="gdFollowBar"></div></div>
        <div id="gdFollowValue" class="gd-follow-value">0%</div>
      </div>
      <div class="gd-follow-stats">
        <div class="gd-follow-stat"><span>Guitar</span><strong id="gdFollowState">Silent</strong></div>
        <div class="gd-follow-stat"><span>Mic</span><strong id="gdFollowDb">— dB</strong></div>
        <div class="gd-follow-stat"><span>Strum</span><strong id="gdFollowStrums">0.0/s</strong></div>
      </div>
      <div class="gd-follow-controls">
        <button type="button" id="gdFollowToggle">🎙 Bật Auto Follow</button>
        <div>
          <label for="gdFollowSensitivity">Độ nhạy mic</label>
          <input id="gdFollowSensitivity" type="range" min="-12" max="12" value="0" step="1" />
        </div>
      </div>
      <div id="gdFollowHint" class="gd-follow-hint">POC: mic chỉ điều khiển lực drummer (Intensity). BPM và section vẫn theo bài. Nếu meter bị ảnh hưởng bởi loa iPad, giảm loa hoặc dùng tai nghe.</div>
    `;
    const hint = drummer.querySelector('.drumHint');
    if (hint) hint.insertAdjacentElement('afterend', host);
    else drummer.appendChild(host);

    return {
      host,
      pill: host.querySelector('#gdFollowPill'),
      bar: host.querySelector('#gdFollowBar'),
      value: host.querySelector('#gdFollowValue'),
      state: host.querySelector('#gdFollowState'),
      db: host.querySelector('#gdFollowDb'),
      strums: host.querySelector('#gdFollowStrums'),
      toggle: host.querySelector('#gdFollowToggle'),
      sensitivity: host.querySelector('#gdFollowSensitivity'),
      hint: host.querySelector('#gdFollowHint')
    };
  }

  function attachListeners() {
    ui.toggle.addEventListener('click', () => {
      if (running) stopListening('Auto Follow đã tắt.');
      else startListening();
    });
    ui.sensitivity.addEventListener('input', saveSettings);

    document.querySelector('#songSelect')?.addEventListener('change', () => {
      smoothedEnergy = 0;
      currentState = 'silent';
      candidateState = 'silent';
      silentSince = 0;
      renderState('silent', 0, -80, 0);
    });

    document.querySelector('#gdToneMic')?.addEventListener('click', () => {
      if (running) stopListening('Auto Follow tạm tắt để dùng mic tìm tone.');
    });

    window.addEventListener('pagehide', cleanupAudio);
  }

  function restoreSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      if (saved.sensitivity != null) ui.sensitivity.value = String(Math.max(-12, Math.min(12, Number(saved.sensitivity) || 0)));
    } catch {}
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({sensitivity:Number(ui.sensitivity.value) || 0}));
    } catch {}
  }

  async function startListening() {
    cleanupAudio();
    if (!navigator.mediaDevices?.getUserMedia) {
      setHint('Trình duyệt này không hỗ trợ microphone.');
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio:{
          echoCancellation:true,
          noiseSuppression:false,
          autoGainControl:false,
          channelCount:1
        },
        video:false
      });
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      source = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0;
      buffer = new Float32Array(analyser.fftSize);
      source.connect(analyser);

      running = true;
      lastAnalysisAt = 0;
      smoothedEnergy = 0;
      ambientDb = -58;
      peakDb = -24;
      currentState = 'silent';
      candidateState = 'silent';
      candidateSince = performance.now();
      silentSince = performance.now();
      onsetEnvelope = 0;
      onsetCount = 0;
      onsetWindowStartedAt = performance.now();
      lastOnsetAt = 0;
      ui.toggle.textContent = '■ Tắt Auto Follow';
      ui.pill.textContent = 'LISTENING';
      setHint('Đang nghe guitar. Hãy quạt nhẹ → vừa → mạnh để kiểm tra drummer phản ứng.');
      raf = requestAnimationFrame(frame);
    } catch (error) {
      cleanupAudio();
      ui.pill.textContent = 'MIC ERROR';
      setHint('Không mở được microphone. Kiểm tra quyền mic của Safari/iPad.');
      api.setStatus?.('Không mở được mic cho Auto Follow.');
    }
  }

  function stopListening(message) {
    cleanupAudio();
    ui.toggle.textContent = '🎙 Bật Auto Follow';
    ui.pill.textContent = 'OFF';
    candidateState = 'silent';
    currentState = 'silent';
    renderState('silent', 0, -80, 0);
    if (message) setHint(message + ' Intensity trở lại điều khiển tay.');
  }

  function cleanupAudio() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      stream = null;
    }
    if (audioCtx) {
      audioCtx.close().catch(() => {});
      audioCtx = null;
    }
    source = null;
    analyser = null;
    buffer = null;
  }

  function frame(ts) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    if (ts - lastAnalysisAt < ANALYSIS_MS) return;
    lastAnalysisAt = ts;

    analyser.getFloatTimeDomainData(buffer);
    const rms = rmsOf(buffer);
    const rawDb = rms > 0 ? 20 * Math.log10(rms) : -100;
    const sensitivity = Number(ui.sensitivity.value) || 0;
    const db = rawDb + sensitivity;

    updateAdaptiveRange(db);
    const energy = normalizeEnergy(db);
    smoothedEnergy = smoothedEnergy * 0.80 + energy * 0.20;
    const strumRate = updateOnsetRate(ts, smoothedEnergy);
    const state = stateForEnergy(smoothedEnergy, ts);
    updateState(state, ts);
    renderState(currentState, smoothedEnergy, db, strumRate);
  }

  function rmsOf(data) {
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    return Math.sqrt(sum / Math.max(1, data.length));
  }

  function updateAdaptiveRange(db) {
    if (db < -75) return;
    if (db < ambientDb) ambientDb = ambientDb * 0.90 + db * 0.10;
    else ambientDb = ambientDb * 0.998 + db * 0.002;

    if (db > peakDb) peakDb = peakDb * 0.72 + db * 0.28;
    else peakDb = peakDb * 0.998 + db * 0.002;

    ambientDb = clamp(ambientDb, -70, -34);
    peakDb = clamp(peakDb, -36, -8);
    if (peakDb - ambientDb < 18) peakDb = ambientDb + 18;
  }

  function normalizeEnergy(db) {
    const floor = Math.min(-34, ambientDb + 6);
    const ceiling = Math.max(floor + 18, peakDb - 2);
    return clamp((db - floor) / (ceiling - floor), 0, 1);
  }

  function updateOnsetRate(now, energy) {
    const rise = energy - onsetEnvelope;
    onsetEnvelope = onsetEnvelope * 0.84 + energy * 0.16;
    if (rise > 0.11 && energy > 0.20 && now - lastOnsetAt > 120) {
      onsetCount++;
      lastOnsetAt = now;
    }
    const elapsed = now - onsetWindowStartedAt;
    if (elapsed >= 2400) {
      const rate = onsetCount / (elapsed / 1000);
      ui.strums.dataset.rate = String(rate);
      onsetCount = 0;
      onsetWindowStartedAt = now;
    }
    return Number(ui.strums.dataset.rate || 0);
  }

  function stateForEnergy(energy, now) {
    if (energy < 0.12) {
      if (!silentSince) silentSince = now;
      if (now - silentSince >= SILENCE_HOLD_MS) return 'silent';
    } else {
      silentSince = 0;
    }

    if (currentState === 'big') {
      if (energy >= 0.56) return 'big';
      return energy >= 0.30 ? 'medium' : 'soft';
    }
    if (currentState === 'medium') {
      if (energy >= 0.72) return 'big';
      if (energy < 0.24) return 'soft';
      return 'medium';
    }
    if (currentState === 'soft') {
      if (energy >= 0.70) return 'big';
      if (energy >= 0.42) return 'medium';
      return 'soft';
    }

    if (energy >= 0.70) return 'big';
    if (energy >= 0.40) return 'medium';
    if (energy >= 0.14) return 'soft';
    return 'silent';
  }

  function updateState(next, now) {
    if (next !== candidateState) {
      candidateState = next;
      candidateSince = now;
      return;
    }
    if (next === currentState) return;

    const hold = next === 'silent' ? 0 : STATE_HOLD_MS;
    if (now - candidateSince < hold) return;
    if (now - lastAppliedAt < APPLY_COOLDOWN_MS && next !== 'silent') return;

    currentState = next;
    lastAppliedAt = now;
    const level = {silent:1, soft:2, medium:3, big:5}[next] || 3;
    applyIntensity(level, next);
  }

  function applyIntensity(level, state) {
    intensity.value = String(level);
    intensityLabel.textContent = String(level);
    intensity.dispatchEvent(new Event('input', {bubbles:true}));
    const label = {silent:'nghỉ',soft:'nhẹ',medium:'vừa',big:'mạnh'}[state] || state;
    api.setStatus?.('🎸 Guitar ' + label + ' → Drummer Intensity ' + level + '.');
  }

  function renderState(state, energy, db, strumRate) {
    const pct = Math.round(clamp(energy, 0, 1) * 100);
    ui.bar.style.width = pct + '%';
    ui.value.textContent = pct + '%';
    ui.state.textContent = ({silent:'Silent',soft:'Soft',medium:'Medium',big:'Big'})[state] || state;
    ui.db.textContent = Number.isFinite(db) ? db.toFixed(0) + ' dB' : '— dB';
    ui.strums.textContent = (Number(strumRate) || 0).toFixed(1) + '/s';
    if (running) ui.pill.textContent = state === 'silent' ? 'LISTENING' : state.toUpperCase();
  }

  function setHint(text) {
    ui.hint.textContent = text;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  window.GuitarFollowAPI = {
    start:startListening,
    stop:() => stopListening('Auto Follow đã tắt.'),
    isRunning:() => running,
    getState:() => ({state:currentState, energy:smoothedEnergy, ambientDb, peakDb})
  };
})();
