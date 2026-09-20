(function GuitarFollowModule() {
  const api = window.GuitarDrumAPI;
  if (!api) return;

  const intensity = document.querySelector('#intensity');
  const intensityLabel = document.querySelector('#intensityLabel');
  const bpmInput = document.querySelector('#bpm');
  const bpmLabel = document.querySelector('#bpmLabel');
  const drummer = document.querySelector('.drummer');
  if (!intensity || !bpmInput || !drummer) return;

  const STORAGE_KEY = 'guitar-drum-follow-v1';
  const ANALYSIS_MS = 80;
  const STATE_HOLD_MS = 520;
  const APPLY_COOLDOWN_MS = 900;
  const SILENCE_HOLD_MS = 1400;
  const TEMPO_WINDOW_MS = 8000;
  const TEMPO_MIN_ONSETS = 6;
  const TEMPO_CONFIDENCE_MIN = 0.62;
  const TEMPO_STABLE_MS = 2400;
  const TEMPO_APPLY_MS = 850;
  const BAR_WINDOW_MS = 12000;
  const BAR_CONFIDENCE_MIN = 0.66;
  const BAR_MIN_ALIGNED = 10;
  const BAR_STABLE_MS = 2600;
  const BAR_SYNC_COOLDOWN_MS = 7000;
  const SECTION_ENERGY_WINDOW_MS = 7000;
  const SECTION_CONFIDENCE_MIN = 0.72;
  const SECTION_STABLE_MS = 1400;
  const SECTION_ACTION_COOLDOWN_MS = 10000;
  const SECTION_MIN_BEATS_AWAY = 5;
  const SECTION_MAX_BEATS_AWAY = 14;
  const CHROMA_ANALYSIS_MS = 120;
  const CHORD_STABLE_MS = 480;
  const CHORD_SCORE_MIN = 0.58;
  const CHORD_MARGIN_MIN = 0.035;
  const HARMONIC_MIN_EVENTS = 3;
  const HARMONIC_MATCH_MIN = 0.80;
  const HARMONIC_MARGIN_MIN = 0.09;
  const HARMONIC_ANCHOR_COOLDOWN_MS = 10000;
  const FUSION_LOCK_MIN = 0.68;
  const FUSION_ACTION_MIN = 0.79;
  const FUSION_STABLE_MS = 1400;
  const FUSION_ACTION_COOLDOWN_MS = 9000;
  const NOTES_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const NOTES_FLAT = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
  const NOTE_MAP = {C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11};

  let audioCtx = null;
  let stream = null;
  let source = null;
  let analyser = null;
  let buffer = null;
  let frequencyBuffer = null;
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
  let onsetTimes = [];
  let onsetEvents = [];
  let tempoEstimate = null;
  let tempoConfidence = 0;
  let tempoCandidate = null;
  let tempoCandidateSince = 0;
  let lastTempoApplyAt = 0;
  let barEstimate = null;
  let barConfidence = 0;
  let barCandidateBase = null;
  let barCandidateSince = 0;
  let lastBarSyncAt = 0;
  let energyHistory = [];
  let sectionPrediction = null;
  let sectionCandidateIndex = null;
  let sectionCandidateSince = 0;
  let sectionArmedIndex = null;
  let lastSectionActionAt = 0;
  let lastChromaAt = 0;
  let chromaEma = new Array(12).fill(0);
  let chordCandidate = null;
  let chordCandidateSince = 0;
  let currentChord = null;
  let chordEvents = [];
  let harmonicMatch = null;
  let lastHarmonicShift = null;
  let lastHarmonicAnchorAt = 0;
  let performanceState = {mode:'acquiring',confidence:0,reason:'waiting'};
  let fusionCandidateKey = null;
  let fusionCandidateSince = 0;
  let lastFusionActionAt = 0;

  injectStyles();
  const ui = buildUi();
  restoreSettings();
  renderState('silent', 0, -80, 0);
  renderTempo();
  renderBar();
  renderSection();
  renderHarmonic();
  renderFusion();
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
      .gd-follow-controls{display:grid;grid-template-columns:auto minmax(110px,1fr) auto auto auto;gap:10px;align-items:end;margin-top:10px}
      .gd-follow-controls button{min-width:134px;min-height:40px;padding:0 12px}
      .gd-follow-controls label{font-size:11px;margin:0}
      .gd-follow-controls input[type=range]{margin-top:5px}
      .gd-follow-tempo-option{display:flex!important;align-items:center;gap:7px;min-height:40px;padding:0 10px;border:1px solid var(--border);border-radius:10px;background:var(--card);white-space:nowrap;font-weight:750!important}
      .gd-follow-tempo-option input{width:18px;height:18px;margin:0}
      .gd-follow-hint{margin-top:8px;color:var(--muted);font-size:11px;line-height:1.4}
      @media(max-width:560px){
        .gd-follow-stats{grid-template-columns:repeat(2,1fr)}
        .gd-follow-controls{grid-template-columns:1fr}
        .gd-follow-controls button{width:100%}
      }
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
        <div class="gd-follow-stat"><span>Tempo</span><strong id="gdFollowTempo">— BPM</strong><span id="gdFollowTempoConfidence">chưa đủ onset</span></div>
        <div class="gd-follow-stat"><span>Bar</span><strong id="gdFollowBarState">—</strong><span id="gdFollowBarConfidence">chưa thấy beat 1</span></div>
        <div class="gd-follow-stat"><span>Section</span><strong id="gdFollowSectionState">—</strong><span id="gdFollowSectionConfidence">theo song map</span></div>
        <div class="gd-follow-stat"><span>Chord</span><strong id="gdFollowChord">—</strong><span id="gdFollowHarmonic">chưa đủ chord</span></div>
        <div class="gd-follow-stat"><span>Follow</span><strong id="gdFollowFusion">ACQUIRE</strong><span id="gdFollowFusionDetail">đang gom tín hiệu</span></div>
      </div>
      <div class="gd-follow-controls">
        <button type="button" id="gdFollowToggle">🎙 Bật Auto Follow</button>
        <div>
          <label for="gdFollowSensitivity">Độ nhạy mic</label>
          <input id="gdFollowSensitivity" type="range" min="-12" max="12" value="0" step="1" />
        </div>
        <label class="gd-follow-tempo-option" for="gdTempoFollow"><input id="gdTempoFollow" type="checkbox" checked /> Follow BPM</label>
        <label class="gd-follow-tempo-option" for="gdBarFollow"><input id="gdBarFollow" type="checkbox" checked /> Sync beat 1</label>
        <label class="gd-follow-tempo-option" for="gdSectionFollow"><input id="gdSectionFollow" type="checkbox" checked /> Follow section</label>
        <label class="gd-follow-tempo-option" for="gdHarmonicFollow"><input id="gdHarmonicFollow" type="checkbox" checked /> Follow chords</label>
      </div>
      <div id="gdFollowHint" class="gd-follow-hint">POC: Sensor Fusion gom dynamics + BPM + beat 1 + section + chord position thành một Follow state duy nhất. Chỉ bộ fusion được quyền fill/re-position; detector riêng chỉ cung cấp evidence.</div>
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
      tempo: host.querySelector('#gdFollowTempo'),
      tempoConfidence: host.querySelector('#gdFollowTempoConfidence'),
      barState: host.querySelector('#gdFollowBarState'),
      barConfidence: host.querySelector('#gdFollowBarConfidence'),
      sectionState: host.querySelector('#gdFollowSectionState'),
      sectionConfidence: host.querySelector('#gdFollowSectionConfidence'),
      chord: host.querySelector('#gdFollowChord'),
      harmonic: host.querySelector('#gdFollowHarmonic'),
      fusion: host.querySelector('#gdFollowFusion'),
      fusionDetail: host.querySelector('#gdFollowFusionDetail'),
      toggle: host.querySelector('#gdFollowToggle'),
      sensitivity: host.querySelector('#gdFollowSensitivity'),
      tempoToggle: host.querySelector('#gdTempoFollow'),
      barToggle: host.querySelector('#gdBarFollow'),
      sectionToggle: host.querySelector('#gdSectionFollow'),
      harmonicToggle: host.querySelector('#gdHarmonicFollow'),
      hint: host.querySelector('#gdFollowHint')
    };
  }

  function attachListeners() {
    ui.toggle.addEventListener('click', () => {
      if (running) stopListening('Auto Follow đã tắt.');
      else startListening();
    });
    ui.sensitivity.addEventListener('input', saveSettings);
    ui.tempoToggle.addEventListener('change', () => {
      saveSettings();
      resetTempoTracking();
      renderTempo();
      renderBar();
      resetSectionTracking();
      renderSection();
      resetHarmonicTracking();
      renderHarmonic();
      resetFusionTracking();
      renderFusion();
    });
    ui.barToggle.addEventListener('change', () => {
      saveSettings();
      barEstimate = null;
      barConfidence = 0;
      resetSectionTracking();
      renderBar();
      renderSection();
      resetFusionTracking();
      renderFusion();
    });
    ui.sectionToggle.addEventListener('change', () => {
      saveSettings();
      resetSectionTracking();
      renderSection();
      resetFusionTracking();
      renderFusion();
    });
    ui.harmonicToggle.addEventListener('change', () => {
      saveSettings();
      resetHarmonicTracking();
      renderHarmonic();
      resetFusionTracking();
      renderFusion();
    });

    document.querySelector('#songSelect')?.addEventListener('change', () => {
      smoothedEnergy = 0;
      currentState = 'silent';
      candidateState = 'silent';
      silentSince = 0;
      resetTempoTracking();
      renderState('silent', 0, -80, 0);
      renderTempo();
      renderBar();
      resetSectionTracking();
      renderSection();
      resetHarmonicTracking();
      renderHarmonic();
      resetFusionTracking();
      renderFusion();
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
      if (saved.tempoFollow != null) ui.tempoToggle.checked = Boolean(saved.tempoFollow);
      if (saved.barFollow != null) ui.barToggle.checked = Boolean(saved.barFollow);
      if (saved.sectionFollow != null) ui.sectionToggle.checked = Boolean(saved.sectionFollow);
      if (saved.harmonicFollow != null) ui.harmonicToggle.checked = Boolean(saved.harmonicFollow);
    } catch {}
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        sensitivity:Number(ui.sensitivity.value) || 0,
        tempoFollow:Boolean(ui.tempoToggle.checked),
        barFollow:Boolean(ui.barToggle.checked),
        sectionFollow:Boolean(ui.sectionToggle.checked),
        harmonicFollow:Boolean(ui.harmonicToggle.checked)
      }));
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
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0;
      analyser.minDecibels = -90;
      analyser.maxDecibels = -10;
      buffer = new Float32Array(analyser.fftSize);
      frequencyBuffer = new Float32Array(analyser.frequencyBinCount);
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
      resetTempoTracking();
      resetSectionTracking();
      resetHarmonicTracking();
      resetFusionTracking();
      ui.toggle.textContent = '■ Tắt Auto Follow';
      ui.pill.textContent = 'LISTENING';
      setHint(ui.tempoToggle.checked
        ? 'Đang nghe guitar. Dynamics phản ứng ngay; BPM, beat 1, section và harmonic position chỉ thay đổi khi tín hiệu đủ ổn định.'
        : 'Đang nghe guitar. Follow BPM đang tắt; dynamics/chord debug vẫn có thể hoạt động.');
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
    resetTempoTracking();
    resetSectionTracking();
    resetHarmonicTracking();
    resetFusionTracking();
    renderState('silent', 0, -80, 0);
    renderTempo();
    renderBar();
    renderSection();
    renderHarmonic();
    renderFusion();
    if (message) setHint(message + ' Intensity, BPM, bar sync, section và harmonic follow trở lại điều khiển tay.');
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
    frequencyBuffer = null;
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
    recordEnergy(ts, smoothedEnergy);
    const strumRate = updateOnsetRate(ts, smoothedEnergy);
    updateTempoFollow(ts);
    updateBarFollow(ts);
    updateSectionFollow(ts);
    updateHarmonicFollow(ts);
    updatePerformanceFusion(ts);
    const state = stateForEnergy(smoothedEnergy, ts);
    updateState(state, ts);
    renderState(currentState, smoothedEnergy, db, strumRate);
    renderTempo();
    renderBar();
    renderSection();
    renderHarmonic();
    renderFusion();
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
      recordOnset(now, energy);
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

  function resetTempoTracking() {
    onsetTimes = [];
    onsetEvents = [];
    if (ui?.strums) ui.strums.dataset.rate = '0';
    tempoEstimate = null;
    tempoConfidence = 0;
    tempoCandidate = null;
    tempoCandidateSince = 0;
    lastTempoApplyAt = 0;
    barEstimate = null;
    barConfidence = 0;
    barCandidateBase = null;
    barCandidateSince = 0;
    lastBarSyncAt = 0;
  }

  function recordOnset(now, energy) {
    onsetTimes.push(now);
    onsetEvents.push({time:now, strength:clamp(Number(energy)||0, 0, 1)});
    const cutoff = now - TEMPO_WINDOW_MS;
    while (onsetTimes.length && onsetTimes[0] < cutoff) onsetTimes.shift();
    const barCutoff = now - BAR_WINDOW_MS;
    while (onsetEvents.length && onsetEvents[0].time < barCutoff) onsetEvents.shift();
  }

  function normalizeBpmFromInterval(intervalMs, minBpm, maxBpm) {
    if (!Number.isFinite(intervalMs) || intervalMs < 120 || intervalMs > 1800) return null;
    let value = 60000 / intervalMs;
    while (value > maxBpm * 1.08) value /= 2;
    while (value < minBpm * 0.92) value *= 2;
    return value >= minBpm * 0.92 && value <= maxBpm * 1.08 ? value : null;
  }

  function median(values) {
    if (!values.length) return null;
    const sorted = values.slice().sort((a,b) => a-b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function estimateTempo() {
    if (onsetTimes.length < TEMPO_MIN_ONSETS) return null;
    const minBpm = Number(bpmInput.min) || 50;
    const maxBpm = Number(bpmInput.max) || 90;
    const candidates = [];

    for (let i = 1; i < onsetTimes.length; i++) {
      const interval = onsetTimes[i] - onsetTimes[i - 1];
      const bpm = normalizeBpmFromInterval(interval, minBpm, maxBpm);
      if (bpm != null) candidates.push(bpm);
    }
    if (candidates.length < TEMPO_MIN_ONSETS - 1) return null;

    let bestCenter = null;
    let bestMembers = [];
    for (let center = minBpm; center <= maxBpm; center += 0.5) {
      const members = candidates.filter(v => Math.abs(v - center) <= 3.0);
      if (members.length > bestMembers.length) {
        bestMembers = members;
        bestCenter = center;
      }
    }
    if (!bestMembers.length || bestCenter == null) return null;

    const bpm = median(bestMembers);
    const spread = median(bestMembers.map(v => Math.abs(v - bpm))) || 0;
    const density = bestMembers.length / candidates.length;
    const sampleScore = clamp(bestMembers.length / 8, 0, 1);
    const consistency = clamp(1 - spread / 4.5, 0, 1);
    const confidence = clamp(0.50 * density + 0.30 * consistency + 0.20 * sampleScore, 0, 1);
    return {bpm, confidence, samples:bestMembers.length};
  }

  function updateTempoFollow(now) {
    const estimate = estimateTempo();
    tempoEstimate = estimate?.bpm ?? null;
    tempoConfidence = estimate?.confidence ?? 0;

    if (!ui.tempoToggle.checked || !estimate || estimate.confidence < TEMPO_CONFIDENCE_MIN) {
      tempoCandidate = null;
      tempoCandidateSince = 0;
      return;
    }

    const rounded = Math.round(estimate.bpm);
    if (tempoCandidate == null || Math.abs(rounded - tempoCandidate) > 2) {
      tempoCandidate = rounded;
      tempoCandidateSince = now;
      return;
    }

    tempoCandidate = Math.round(tempoCandidate * 0.7 + rounded * 0.3);
    if (now - tempoCandidateSince < TEMPO_STABLE_MS) return;
    if (now - lastTempoApplyAt < TEMPO_APPLY_MS) return;

    const current = Number(bpmInput.value) || 62;
    const diff = tempoCandidate - current;
    if (Math.abs(diff) < 2) return;

    const next = clamp(current + Math.sign(diff), Number(bpmInput.min) || 50, Number(bpmInput.max) || 90);
    bpmInput.value = String(next);
    if (bpmLabel) bpmLabel.textContent = String(next);
    bpmInput.dispatchEvent(new Event('input', {bubbles:true}));
    lastTempoApplyAt = now;
    api.setStatus?.('🎸 Tempo guitar ~' + tempoCandidate + ' BPM → Drummer ' + next + ' BPM.');
  }

  function renderTempo() {
    if (!ui.tempo) return;
    if (!ui.tempoToggle.checked) {
      ui.tempo.textContent = 'OFF';
      ui.tempoConfidence.textContent = 'follow BPM tắt';
      return;
    }
    if (tempoEstimate == null) {
      ui.tempo.textContent = '— BPM';
      ui.tempoConfidence.textContent = onsetTimes.length + '/' + TEMPO_MIN_ONSETS + ' onset';
      return;
    }
    ui.tempo.textContent = Math.round(tempoEstimate) + ' BPM';
    ui.tempoConfidence.textContent = Math.round(tempoConfidence * 100) + '% confidence';
  }

  function phaseError(time, anchor, period) {
    const raw = ((time - anchor + period / 2) % period + period) % period - period / 2;
    return raw;
  }

  function estimateBar() {
    if (!tempoEstimate || tempoConfidence < 0.66 || onsetEvents.length < BAR_MIN_ALIGNED) return null;
    const beatMs = 60000 / tempoEstimate;
    const recent = onsetEvents.filter(e => onsetEvents[onsetEvents.length - 1].time - e.time <= BAR_WINDOW_MS);
    if (recent.length < BAR_MIN_ALIGNED) return null;

    let bestAnchor = null;
    let bestScore = -Infinity;
    const tolerance = beatMs * 0.20;

    for (const candidate of recent) {
      let score = 0;
      for (const event of recent) {
        const err = Math.abs(phaseError(event.time, candidate.time, beatMs));
        const closeness = clamp(1 - err / Math.max(1, tolerance), 0, 1);
        score += closeness * (0.35 + event.strength);
      }
      if (score > bestScore) {
        bestScore = score;
        bestAnchor = candidate.time;
      }
    }
    if (bestAnchor == null) return null;

    const residueScores = [0,0,0,0];
    const residueCounts = [0,0,0,0];
    let aligned = 0;

    for (const event of recent) {
      const err = Math.abs(phaseError(event.time, bestAnchor, beatMs));
      if (err > tolerance) continue;
      const k = Math.round((event.time - bestAnchor) / beatMs);
      const residue = ((k % 4) + 4) % 4;
      const closeness = clamp(1 - err / Math.max(1, tolerance), 0, 1);
      residueScores[residue] += (0.25 + event.strength) * closeness;
      residueCounts[residue]++;
      aligned++;
    }
    if (aligned < BAR_MIN_ALIGNED) return null;

    const means = residueScores.map((score, i) => residueCounts[i] ? score / residueCounts[i] : 0);
    const order = [0,1,2,3].sort((a,b) => means[b] - means[a]);
    const bestResidue = order[0], secondResidue = order[1];
    const best = means[bestResidue], second = means[secondResidue];
    if (best <= 0) return null;

    const otherMean = order.slice(1).reduce((sum, index) => sum + means[index], 0) / 3;
    const contrast = clamp((best - otherMean) / Math.max(0.15, best), 0, 1);
    const contrastScore = clamp(contrast / 0.30, 0, 1);
    const sampleScore = clamp(aligned / 16, 0, 1);
    const confidence = clamp(0.70 * contrastScore + 0.30 * sampleScore, 0, 1);
    const baseDownbeat = bestAnchor + bestResidue * beatMs;

    return {beatMs, baseDownbeat, confidence, aligned, contrast};
  }

  function nearestBarTime(baseDownbeat, beatMs, targetTime) {
    const barMs = beatMs * 4;
    const n = Math.round((targetTime - baseDownbeat) / barMs);
    return baseDownbeat + n * barMs;
  }

  function updateBarFollow(now) {
    const estimate = estimateBar();
    barEstimate = estimate;
    barConfidence = estimate?.confidence ?? 0;

    if (!ui.barToggle.checked || !ui.tempoToggle.checked) return;
    if (!estimate || estimate.confidence < BAR_CONFIDENCE_MIN || estimate.aligned < BAR_MIN_ALIGNED) {
      barCandidateBase = null;
      barCandidateSince = 0;
      return;
    }

    const barMs = estimate.beatMs * 4;
    if (barCandidateBase == null || Math.abs(phaseError(estimate.baseDownbeat, barCandidateBase, barMs)) > estimate.beatMs * 0.14) {
      barCandidateBase = estimate.baseDownbeat;
      barCandidateSince = now;
      return;
    }
    if (now - barCandidateSince < BAR_STABLE_MS) return;
    if (now - lastBarSyncAt < BAR_SYNC_COOLDOWN_MS) return;
    if (typeof api.getTransport !== 'function' || typeof api.syncNextBeat !== 'function') return;

    const transport = api.getTransport();
    if (!transport?.playing || transport.paused || transport.countIn > 0 || !Number.isFinite(transport.nextBeatPerformanceMs)) return;

    const guitarDownbeat = nearestBarTime(estimate.baseDownbeat, estimate.beatMs, transport.nextBeatPerformanceMs);
    const delta = guitarDownbeat - transport.nextBeatPerformanceMs;
    if (Math.abs(delta) > 85) return;
    if (transport.nextBeatIndex === 0 && Math.abs(delta) < 24) return;

    const synced = api.syncNextBeat(guitarDownbeat, 0);
    if (!synced) return;
    lastBarSyncAt = now;
    api.setStatus?.('🎸 Beat 1 nhận diện ' + Math.round(estimate.confidence * 100) + '% · drummer đã sync ô nhịp.');
  }

  function renderBar() {
    if (!ui.barState) return;
    if (!ui.barToggle.checked) {
      ui.barState.textContent = 'OFF';
      ui.barConfidence.textContent = 'bar sync tắt';
      return;
    }
    if (!ui.tempoToggle.checked) {
      ui.barState.textContent = 'WAIT';
      ui.barConfidence.textContent = 'cần Follow BPM';
      return;
    }
    if (!barEstimate) {
      ui.barState.textContent = '—';
      ui.barConfidence.textContent = onsetEvents.length + '/' + BAR_MIN_ALIGNED + ' onset';
      return;
    }
    ui.barState.textContent = 'Beat 1';
    const justSynced = performance.now() - lastBarSyncAt < 2400;
    const stable = barCandidateSince && performance.now() - barCandidateSince >= BAR_STABLE_MS;
    ui.barConfidence.textContent = Math.round(barConfidence * 100) + '% ' + (justSynced ? '· synced' : stable ? '· stable' : '· learning');
  }

  function resetSectionTracking() {
    energyHistory = [];
    sectionPrediction = null;
    sectionCandidateIndex = null;
    sectionCandidateSince = 0;
    sectionArmedIndex = null;
    lastSectionActionAt = 0;
  }

  function recordEnergy(now, energy) {
    energyHistory.push({time:now, energy:clamp(Number(energy)||0, 0, 1)});
    const cutoff = now - SECTION_ENERGY_WINDOW_MS;
    while (energyHistory.length && energyHistory[0].time < cutoff) energyHistory.shift();
  }

  function meanEnergyBetween(now, newestAgeMs, oldestAgeMs) {
    const values = energyHistory
      .filter(x => {
        const age = now - x.time;
        return age >= newestAgeMs && age <= oldestAgeMs;
      })
      .map(x => x.energy);
    if (values.length < 5) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function sectionSignal(now) {
    const recent = meanEnergyBetween(now, 0, 1500);
    const baseline = meanEnergyBetween(now, 2600, 5600);
    if (recent == null || baseline == null) return null;
    return {recent, baseline, trend:recent-baseline};
  }

  function updateSectionFollow(now) {
    sectionPrediction = null;
    if (!ui.sectionToggle.checked || !ui.barToggle.checked || !ui.tempoToggle.checked) {
      sectionCandidateIndex = null;
      sectionCandidateSince = 0;
      return;
    }
    if (typeof api.getTransport !== 'function' || typeof api.getSectionTimeline !== 'function' || typeof api.requestSectionTransition !== 'function') return;

    const transport = api.getTransport();
    if (!transport?.playing || transport.paused || transport.countIn > 0) return;
    if (!barEstimate || barConfidence < BAR_CONFIDENCE_MIN || !barCandidateSince || now - barCandidateSince < BAR_STABLE_MS) return;
    if (tempoConfidence < TEMPO_CONFIDENCE_MIN) return;

    const timeline = api.getSectionTimeline();
    if (!Array.isArray(timeline) || timeline.length < 2) return;
    const currentIndex = timeline.findIndex(s => transport.songBeat >= s.startBeat && transport.songBeat < s.endBeat);
    if (currentIndex < 0 || currentIndex >= timeline.length - 1) return;

    const current = timeline[currentIndex];
    const next = timeline[currentIndex + 1];
    const beatsAway = next.startBeat - transport.songBeat;
    if (beatsAway < SECTION_MIN_BEATS_AWAY || beatsAway > SECTION_MAX_BEATS_AWAY) {
      sectionCandidateIndex = null;
      sectionCandidateSince = 0;
      return;
    }

    const gainDelta = Number(next.gain||1) - Number(current.gain||1);
    const isBuildTarget = Boolean(next.autoFillIn) || gainDelta >= 0.10;
    if (!isBuildTarget) {
      sectionCandidateIndex = null;
      sectionCandidateSince = 0;
      return;
    }

    const signal = sectionSignal(now);
    if (!signal) return;

    const trendScore = clamp((signal.trend - 0.035) / 0.17, 0, 1);
    const gainScore = clamp((gainDelta + 0.04) / 0.30, 0, 1);
    const proximityScore = clamp(1 - Math.abs(beatsAway - 8) / 7, 0, 1);
    const stateScore = currentState === 'big' ? 1 : currentState === 'medium' ? 0.62 : currentState === 'soft' ? 0.22 : 0;
    const confidence = clamp(
      0.34 * trendScore +
      0.18 * gainScore +
      0.16 * proximityScore +
      0.14 * stateScore +
      0.10 * barConfidence +
      0.08 * tempoConfidence,
      0, 1
    );

    sectionPrediction = {
      current,
      next,
      beatsAway,
      trend:signal.trend,
      confidence,
      armed:sectionArmedIndex===next.index && now-lastSectionActionAt<SECTION_ACTION_COOLDOWN_MS
    };

    if (confidence < SECTION_CONFIDENCE_MIN) {
      sectionCandidateIndex = null;
      sectionCandidateSince = 0;
      return;
    }

    if (sectionCandidateIndex !== next.index) {
      sectionCandidateIndex = next.index;
      sectionCandidateSince = now;
      return;
    }

    sectionPrediction.ready = now - sectionCandidateSince >= SECTION_STABLE_MS;
  }

  function renderSection() {
    if (!ui.sectionState) return;
    if (!ui.sectionToggle.checked) {
      ui.sectionState.textContent = 'OFF';
      ui.sectionConfidence.textContent = 'section follow tắt';
      return;
    }
    if (!ui.barToggle.checked || !ui.tempoToggle.checked) {
      ui.sectionState.textContent = 'WAIT';
      ui.sectionConfidence.textContent = 'cần BPM + beat 1';
      return;
    }
    if (!sectionPrediction) {
      ui.sectionState.textContent = 'MAP';
      ui.sectionConfidence.textContent = 'đang theo vị trí bài';
      return;
    }

    const label = sectionPrediction.next?.name || 'next';
    ui.sectionState.textContent = '→ ' + label;
    const confidence = Math.round((sectionPrediction.confidence||0)*100);
    if (sectionPrediction.armed) ui.sectionConfidence.textContent = confidence + '% · armed';
    else if (sectionCandidateIndex === sectionPrediction.next?.index && sectionCandidateSince) {
      const stable = performance.now() - sectionCandidateSince >= SECTION_STABLE_MS;
      ui.sectionConfidence.textContent = confidence + '% · ' + (stable ? 'ready' : 'learning');
    } else ui.sectionConfidence.textContent = confidence + '% · watching';
  }

  function resetHarmonicTracking() {
    lastChromaAt = 0;
    chromaEma = new Array(12).fill(0);
    chordCandidate = null;
    chordCandidateSince = 0;
    currentChord = null;
    chordEvents = [];
    harmonicMatch = null;
    lastHarmonicShift = soundingShift();
    lastHarmonicAnchorAt = 0;
  }

  function chordQuality(symbol) {
    const m = String(symbol||'').match(/^([A-G])([#b]?)(.*)$/);
    if (!m) return null;
    const rest = m[3] || '';
    if (/m7b5/.test(rest)) return 'm7b5';
    if (/dim/.test(rest)) return 'dim';
    if (/aug/.test(rest)) return 'aug';
    if (/sus2/.test(rest)) return 'sus2';
    if (/sus/.test(rest)) return 'sus4';
    if (/^m(?!aj)/.test(rest)) return /7/.test(rest) ? 'm7' : 'm';
    if (/maj7/.test(rest)) return 'maj7';
    if (/7/.test(rest)) return '7';
    return 'maj';
  }

  function chordIntervals(quality) {
    return {
      maj:[0,4,7], m:[0,3,7], '7':[0,4,7,10], m7:[0,3,7,10],
      maj7:[0,4,7,11], dim:[0,3,6], m7b5:[0,3,6,10],
      aug:[0,4,8], sus2:[0,2,7], sus4:[0,5,7]
    }[quality] || [0,4,7];
  }

  function soundingShift() {
    const song = api.getCurrentSong?.();
    if (!song) return 0;
    const meta = api.getToneMeta?.() || {};
    const sounding = meta.soundingKey != null ? Number(meta.soundingKey) : Number(api.getCurrentKey?.() ?? song.baseKey);
    return ((sounding - Number(song.baseKey) + 12) % 12);
  }

  function transposeChordSymbol(symbol, semitones) {
    const m = String(symbol||'').match(/^([A-G])([#b]?)(.*)$/);
    if (!m) return symbol;
    const song = api.getCurrentSong?.() || {};
    const names = song.preferFlats ? NOTES_FLAT : NOTES_SHARP;
    const root = NOTE_MAP[m[1]+m[2]];
    if (root == null) return symbol;
    let rest = m[3] || '';
    rest = rest.replace(/\/([A-G])([#b]?)/, (_, a, b) => {
      const bass = NOTE_MAP[a+b];
      return bass == null ? '/'+a+b : '/'+names[(bass+semitones+12)%12];
    });
    return names[(root+semitones+12)%12] + rest;
  }

  function chordDescriptor(baseSymbol) {
    const shifted = transposeChordSymbol(baseSymbol, soundingShift());
    const m = String(shifted||'').match(/^([A-G])([#b]?)(.*)$/);
    if (!m) return null;
    const root = NOTE_MAP[m[1]+m[2]];
    const quality = chordQuality(shifted);
    if (root == null || !quality) return null;
    const slash = (m[3]||'').match(/\/([A-G])([#b]?)/);
    const bass = slash ? NOTE_MAP[slash[1]+slash[2]] : null;
    return {baseSymbol, symbol:shifted, root, quality, bass, id:root+':'+quality};
  }

  function templateForChord(desc) {
    const vector = new Array(12).fill(0);
    const intervals = chordIntervals(desc.quality);
    const weights = [1.0,0.84,0.68,0.50];
    intervals.forEach((interval, i) => {
      vector[(desc.root+interval)%12] += weights[Math.min(i,weights.length-1)];
    });
    if (desc.bass != null) vector[desc.bass] += 0.22;
    return vector;
  }

  function normalizeVector(values) {
    const norm = Math.sqrt(values.reduce((sum,v)=>sum+v*v,0)) || 1;
    return values.map(v=>v/norm);
  }

  function spectralChroma() {
    if (!analyser || !frequencyBuffer || !audioCtx) return null;
    analyser.getFloatFrequencyData(frequencyBuffer);
    const chroma = new Array(12).fill(0);
    const binHz = audioCtx.sampleRate / analyser.fftSize;
    for (let i=1; i<frequencyBuffer.length; i++) {
      const f = i * binHz;
      if (f < 70 || f > 1250) continue;
      const db = frequencyBuffer[i];
      if (!Number.isFinite(db) || db < -78) continue;
      const midi = 69 + 12 * Math.log2(f / 440);
      const nearest = Math.round(midi);
      const cents = Math.abs((midi-nearest)*100);
      if (cents > 48) continue;
      const pc = ((nearest%12)+12)%12;
      const magnitude = Math.pow(10, db/20);
      const tuningWeight = Math.exp(-0.5 * Math.pow(cents/28,2));
      const frequencyWeight = 1 / Math.sqrt(Math.max(1, f/110));
      chroma[pc] += magnitude * tuningWeight * frequencyWeight;
    }
    const total = chroma.reduce((a,b)=>a+b,0);
    if (total <= 1e-7) return null;
    return chroma.map(v=>v/total);
  }

  function expectedChordDescriptors() {
    const timeline = api.getHarmonicTimeline?.() || [];
    const map = new Map();
    timeline.forEach(item => {
      const desc = chordDescriptor(item.symbol);
      if (desc && !map.has(desc.id)) map.set(desc.id, desc);
    });
    return [...map.values()];
  }

  function detectChordFromChroma() {
    const descs = expectedChordDescriptors();
    if (!descs.length) return null;
    const chromaNorm = normalizeVector(chromaEma);
    const ranked = descs.map(desc => {
      const tpl = normalizeVector(templateForChord(desc));
      let score = 0;
      for (let i=0;i<12;i++) score += chromaNorm[i]*tpl[i];
      score = clamp(score + chromaEma[desc.root]*0.10, 0, 1);
      return {...desc, score};
    }).sort((a,b)=>b.score-a.score);
    const best = ranked[0], second = ranked[1] || {score:0};
    const margin = best.score-second.score;
    if (best.score < CHORD_SCORE_MIN || margin < CHORD_MARGIN_MIN) return null;
    return {...best, margin, confidence:clamp(0.72*best.score+0.28*clamp(margin/0.16,0,1),0,1)};
  }

  function updateChordCandidate(now, detected) {
    if (!detected) return;
    if (!chordCandidate || chordCandidate.id !== detected.id) {
      chordCandidate = detected;
      chordCandidateSince = now;
      return;
    }
    chordCandidate = detected;
    if (now-chordCandidateSince < CHORD_STABLE_MS) return;
    if (currentChord?.id === detected.id) {
      currentChord = detected;
      return;
    }
    currentChord = detected;
    chordEvents.push({
      time:now,
      id:detected.id,
      symbol:detected.symbol,
      baseSymbol:detected.baseSymbol,
      confidence:detected.confidence
    });
    if (chordEvents.length > 8) chordEvents.shift();
  }

  function expectedSequence() {
    return (api.getHarmonicTimeline?.() || []).map(item => {
      const desc = chordDescriptor(item.symbol);
      return desc ? {...item, id:desc.id, soundingSymbol:desc.symbol} : null;
    }).filter(Boolean);
  }

  function matchHarmonicPosition() {
    const observed = chordEvents.slice(-5);
    if (observed.length < HARMONIC_MIN_EVENTS) return null;
    const expected = expectedSequence();
    if (expected.length < observed.length) return null;
    const n = Math.min(observed.length, 5);
    const obs = observed.slice(-n);
    const ranked = [];

    for (let end=n-1; end<expected.length; end++) {
      let score=0;
      let exact=0;
      for (let j=0;j<n;j++) {
        const o=obs[j], e=expected[end-n+1+j];
        if (o.id===e.id) {
          score += 1.0 * (0.70+0.30*o.confidence);
          exact++;
        } else {
          const oroot=Number(o.id.split(':')[0]), eroot=Number(e.id.split(':')[0]);
          if (oroot===eroot) score += 0.58 * (0.70+0.30*o.confidence);
        }
      }
      const normalized=score/n;
      ranked.push({
        score:normalized,
        exact,
        endIndex:end,
        target:expected[end]
      });
    }
    ranked.sort((a,b)=>b.score-a.score);
    const best=ranked[0], second=ranked[1]||{score:0};
    const margin=best.score-second.score;
    return {
      ...best,
      margin,
      confidence:clamp(0.78*best.score+0.22*clamp(margin/0.22,0,1),0,1),
      observed:obs.map(x=>x.symbol),
      candidates:ranked.slice(0,5).map(item=>({
        score:item.score,
        exact:item.exact,
        endIndex:item.endIndex,
        target:item.target
      }))
    };
  }

  function updateHarmonicFollow(now) {
    if (!running || !frequencyBuffer) return;
    const shift=soundingShift();
    if (lastHarmonicShift == null) lastHarmonicShift=shift;
    if (shift !== lastHarmonicShift) {
      chromaEma=new Array(12).fill(0);
      chordCandidate=null;
      chordCandidateSince=0;
      currentChord=null;
      chordEvents=[];
      harmonicMatch=null;
      lastHarmonicShift=shift;
    }
    const sinceOnset=now-lastOnsetAt;
    if (smoothedEnergy < 0.14 || sinceOnset < 40 || sinceOnset > 720) return;
    if (now-lastChromaAt < CHROMA_ANALYSIS_MS) return;
    lastChromaAt=now;

    const chroma=spectralChroma();
    if (!chroma) return;
    const alpha=chromaEma.some(v=>v>0) ? 0.28 : 1;
    for (let i=0;i<12;i++) chromaEma[i]=(1-alpha)*chromaEma[i]+alpha*chroma[i];
    const sum=chromaEma.reduce((a,b)=>a+b,0)||1;
    chromaEma=chromaEma.map(v=>v/sum);

    const detected=detectChordFromChroma();
    updateChordCandidate(now,detected);
    harmonicMatch=matchHarmonicPosition();
  }

  function renderHarmonic() {
    if (!ui.chord) return;
    if (!running) {
      ui.chord.textContent='—';
      ui.harmonic.textContent='bật Auto Follow để nghe chord';
      return;
    }
    ui.chord.textContent=currentChord?.symbol || chordCandidate?.symbol || '…';
    if (!ui.harmonicToggle.checked) {
      ui.harmonic.textContent='auto re-anchor tắt';
      return;
    }
    if (!harmonicMatch) {
      ui.harmonic.textContent=chordEvents.length+'/'+HARMONIC_MIN_EVENTS+' chord ổn định';
      return;
    }
    const target=harmonicMatch.target;
    const conf=Math.round(harmonicMatch.confidence*100);
    const ambiguous=harmonicMatch.margin<HARMONIC_MARGIN_MIN;
    ui.harmonic.textContent=target
      ? '→ L'+(target.rowIndex+1)+' '+target.section+' · '+conf+'%'+(ambiguous?' · ambiguous':'')
      : conf+'%';
  }

  function resetFusionTracking() {
    performanceState={mode:'acquiring',confidence:0,reason:'waiting'};
    fusionCandidateKey=null;
    fusionCandidateSince=0;
    lastFusionActionAt=0;
  }

  function isBarLocked(now) {
    return Boolean(
      barEstimate &&
      barConfidence >= BAR_CONFIDENCE_MIN &&
      barCandidateSince &&
      now-barCandidateSince >= BAR_STABLE_MS
    );
  }

  function sectionSupportForTarget(targetSection) {
    if (!targetSection) return 0;
    if (sectionPrediction?.next?.name===targetSection) return clamp(sectionPrediction.confidence||0,0,1);
    const transport=api.getTransport?.();
    if (transport?.currentSection===targetSection) return 0.62;
    return 0.18;
  }

  function fusedPositionCandidate(now) {
    if (!harmonicMatch?.candidates?.length || !ui.harmonicToggle.checked) return null;
    const transport=api.getTransport?.();
    if (!transport?.playing || transport.paused || transport.countIn>0) return null;

    const barScore=clamp(barConfidence,0,1);
    const tempoScore=clamp(tempoConfidence,0,1);
    const candidates=harmonicMatch.candidates.map((item,index)=>{
      const target=item.target;
      const distance=Math.abs(Number(target?.beat)-Number(transport.songBeat));
      const continuity=distance<4 ? 1 : distance<=24 ? 0.88 : distance<=64 ? 0.68 : 0.48;
      const sectionSupport=sectionSupportForTarget(target?.section);
      const uniqueness=index===0
        ? clamp((harmonicMatch.margin||0)/0.18,0,1)
        : clamp((item.score-(harmonicMatch.candidates[index+1]?.score||0))/0.18,0,1);
      const exactScore=clamp((item.exact||0)/Math.max(3,Math.min(chordEvents.length,5)),0,1);
      const score=clamp(
        0.48*item.score +
        0.13*exactScore +
        0.12*uniqueness +
        0.10*barScore +
        0.07*tempoScore +
        0.06*sectionSupport +
        0.04*continuity,
        0,1
      );
      return {...item,distance,continuity,sectionSupport,uniqueness,fusionScore:score};
    }).sort((a,b)=>b.fusionScore-a.fusionScore);

    const best=candidates[0], second=candidates[1]||{fusionScore:0};
    if(!best?.target) return null;
    return {
      ...best,
      fusionMargin:best.fusionScore-second.fusionScore,
      candidates
    };
  }

  function updateFusionCandidate(key,now) {
    if (!key) {
      fusionCandidateKey=null;
      fusionCandidateSince=0;
      return false;
    }
    if (fusionCandidateKey!==key) {
      fusionCandidateKey=key;
      fusionCandidateSince=now;
      return false;
    }
    return now-fusionCandidateSince>=FUSION_STABLE_MS;
  }

  function updatePerformanceFusion(now) {
    const transport=api.getTransport?.();
    if (!running || !transport?.playing || transport.paused || transport.countIn>0) {
      performanceState={mode:'acquiring',confidence:0,reason:'waiting'};
      updateFusionCandidate(null,now);
      return;
    }

    const tempoLocked=tempoConfidence>=TEMPO_CONFIDENCE_MIN;
    const barLocked=isBarLocked(now);
    const position=fusedPositionCandidate(now);
    const harmonicStrong=Boolean(
      harmonicMatch &&
      harmonicMatch.score>=0.72 &&
      harmonicMatch.confidence>=0.68
    );
    const harmonicAmbiguous=Boolean(
      harmonicStrong &&
      (
        harmonicMatch.margin < HARMONIC_MARGIN_MIN ||
        (position && position.fusionMargin < 0.055)
      )
    );

    if (!tempoLocked) {
      performanceState={mode:'acquiring',confidence:tempoConfidence,reason:'tempo'};
      updateFusionCandidate(null,now);
      return;
    }
    if (!barLocked) {
      performanceState={mode:'listening',confidence:0.55*tempoConfidence+0.45*barConfidence,reason:'beat-1'};
      updateFusionCandidate(null,now);
      return;
    }

    if (harmonicAmbiguous) {
      performanceState={
        mode:'ambiguous',
        confidence:position?.fusionScore||harmonicMatch?.confidence||0,
        reason:'repeated progression',
        target:position?.target||harmonicMatch?.target||null
      };
      updateFusionCandidate(null,now);
      return;
    }

    if (position && position.fusionScore>=FUSION_LOCK_MIN) {
      const target=position.target;
      const sameArea=Math.abs(Number(target.beat)-Number(transport.songBeat))<4;
      performanceState={
        mode:sameArea?'locked':'following',
        confidence:position.fusionScore,
        reason:'harmonic+bar+tempo',
        target,
        margin:position.fusionMargin
      };

      const key='pos:'+target.rowIndex+':'+target.beat;
      const stable=updateFusionCandidate(key,now);
      const actionable=
        !sameArea &&
        position.fusionScore>=FUSION_ACTION_MIN &&
        position.fusionMargin>=0.07 &&
        harmonicMatch.score>=HARMONIC_MATCH_MIN &&
        harmonicMatch.margin>=HARMONIC_MARGIN_MIN &&
        position.target?.beat===harmonicMatch.target?.beat &&
        position.target?.rowIndex===harmonicMatch.target?.rowIndex &&
        stable &&
        now-lastFusionActionAt>=FUSION_ACTION_COOLDOWN_MS &&
        now-lastHarmonicAnchorAt>=HARMONIC_ANCHOR_COOLDOWN_MS;

      if (actionable && typeof api.requestHarmonicAnchor==='function') {
        const accepted=api.requestHarmonicAnchor(target.beat,target.rowIndex,position.fusionScore);
        if (accepted) {
          lastFusionActionAt=now;
          lastHarmonicAnchorAt=now;
          performanceState.mode='reposition';
          performanceState.reason='sequence lock';
          api.setStatus?.('🎸 Follow v2 '+Math.round(position.fusionScore*100)+'% → '+target.section+' · Line '+(target.rowIndex+1)+'.');
        }
      }
      return;
    }

    const sectionReady=Boolean(
      ui.sectionToggle.checked &&
      sectionPrediction?.ready &&
      sectionPrediction.confidence>=SECTION_CONFIDENCE_MIN
    );
    if (sectionReady) {
      const harmonicSupportsNext=
        !harmonicStrong ||
        harmonicMatch.target?.section===sectionPrediction.next?.name;
      const confidence=clamp(
        0.52*sectionPrediction.confidence+
        0.18*barConfidence+
        0.14*tempoConfidence+
        0.10*(harmonicSupportsNext?1:0.25)+
        0.06*(currentState==='big'?1:currentState==='medium'?0.65:0.25),
        0,1
      );
      performanceState={
        mode:'following',
        confidence,
        reason:harmonicSupportsNext?'section build':'section/chord conflict',
        target:sectionPrediction.next
      };

      const key='section:'+sectionPrediction.next.index;
      const stable=updateFusionCandidate(key,now);
      const actionable=
        harmonicSupportsNext &&
        confidence>=FUSION_ACTION_MIN &&
        stable &&
        now-lastFusionActionAt>=FUSION_ACTION_COOLDOWN_MS &&
        now-lastSectionActionAt>=SECTION_ACTION_COOLDOWN_MS;

      if (actionable && typeof api.requestSectionTransition==='function') {
        const accepted=api.requestSectionTransition(sectionPrediction.next.index);
        if (accepted) {
          lastFusionActionAt=now;
          lastSectionActionAt=now;
          sectionArmedIndex=sectionPrediction.next.index;
          sectionPrediction.armed=true;
          performanceState.mode='transition';
          performanceState.reason='build+map';
          api.setStatus?.('🎸 Follow v2 '+Math.round(confidence*100)+'% · fill → '+sectionPrediction.next.name+'.');
        }
      }
      return;
    }

    performanceState={
      mode:'locked',
      confidence:clamp(0.46*tempoConfidence+0.44*barConfidence+0.10*(harmonicMatch?.confidence||0),0,1),
      reason:'tempo+bar'
    };
    updateFusionCandidate(null,now);
  }

  function renderFusion() {
    if (!ui.fusion) return;
    const labels={
      acquiring:'ACQUIRE',
      listening:'LISTEN',
      locked:'LOCKED',
      following:'FOLLOW',
      ambiguous:'AMBIG',
      transition:'FILL→',
      reposition:'RE-POS'
    };
    ui.fusion.textContent=labels[performanceState.mode]||String(performanceState.mode||'—').toUpperCase();
    const confidence=Math.round(clamp(performanceState.confidence||0,0,1)*100);
    const target=performanceState.target;
    const targetText=target?.section||target?.name||'';
    ui.fusionDetail.textContent=
      (confidence?confidence+'% · ':'')+
      (targetText?targetText+' · ':'')+
      (performanceState.reason||'waiting');
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
    getState:() => ({
      state:currentState,
      energy:smoothedEnergy,
      ambientDb,
      peakDb,
      tempoEstimate,
      tempoConfidence,
      tempoFollow:Boolean(ui.tempoToggle.checked),
      barConfidence,
      barFollow:Boolean(ui.barToggle.checked),
      barEstimate,
      sectionFollow:Boolean(ui.sectionToggle.checked),
      sectionPrediction,
      harmonicFollow:Boolean(ui.harmonicToggle.checked),
      currentChord,
      harmonicMatch,
      chordEvents:chordEvents.slice(),
      performanceState:{...performanceState}
    })
  };
})();
