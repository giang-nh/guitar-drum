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

  injectStyles();
  const ui = buildUi();
  restoreSettings();
  renderState('silent', 0, -80, 0);
  renderTempo();
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
      .gd-follow-stats{display:grid;grid-template-columns:repeat(5,1fr);gap:7px;margin-top:9px}
      .gd-follow-stat{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:7px 8px}
      .gd-follow-stat span{display:block;font-size:9px;color:var(--muted);font-weight:800;text-transform:uppercase}
      .gd-follow-stat strong{display:block;margin-top:2px;font-size:13px}
      .gd-follow-controls{display:grid;grid-template-columns:auto minmax(110px,1fr) auto auto;gap:10px;align-items:end;margin-top:10px}
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
      </div>
      <div class="gd-follow-controls">
        <button type="button" id="gdFollowToggle">🎙 Bật Auto Follow</button>
        <div>
          <label for="gdFollowSensitivity">Độ nhạy mic</label>
          <input id="gdFollowSensitivity" type="range" min="-12" max="12" value="0" step="1" />
        </div>
        <label class="gd-follow-tempo-option" for="gdTempoFollow"><input id="gdTempoFollow" type="checkbox" checked /> Follow BPM</label>
        <label class="gd-follow-tempo-option" for="gdBarFollow"><input id="gdBarFollow" type="checkbox" checked /> Sync beat 1</label>
      </div>
      <div id="gdFollowHint" class="gd-follow-hint">POC: mic follow lực đàn + tempo. “Sync beat 1” chỉ can thiệp khi accent pattern đủ rõ và chỉ nudge/re-index ô nhịp nhẹ; section vẫn theo song map. Dùng tai nghe hoặc giảm loa sẽ giảm mic bleed.</div>
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
      toggle: host.querySelector('#gdFollowToggle'),
      sensitivity: host.querySelector('#gdFollowSensitivity'),
      tempoToggle: host.querySelector('#gdTempoFollow'),
      barToggle: host.querySelector('#gdBarFollow'),
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
    });
    ui.barToggle.addEventListener('change', () => {
      saveSettings();
      barEstimate = null;
      barConfidence = 0;
      renderBar();
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
    } catch {}
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        sensitivity:Number(ui.sensitivity.value) || 0,
        tempoFollow:Boolean(ui.tempoToggle.checked),
        barFollow:Boolean(ui.barToggle.checked)
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
      resetTempoTracking();
      ui.toggle.textContent = '■ Tắt Auto Follow';
      ui.pill.textContent = 'LISTENING';
      setHint(ui.tempoToggle.checked
        ? 'Đang nghe guitar. Dynamics phản ứng ngay; BPM và beat 1 chỉ thay đổi khi tín hiệu đủ ổn định.'
        : 'Đang nghe guitar. Follow BPM đang tắt; app chỉ phản ứng theo lực đàn.');
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
    renderState('silent', 0, -80, 0);
    renderTempo();
    renderBar();
    if (message) setHint(message + ' Intensity, BPM và bar sync trở lại điều khiển tay.');
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
    updateTempoFollow(ts);
    updateBarFollow(ts);
    const state = stateForEnergy(smoothedEnergy, ts);
    updateState(state, ts);
    renderState(currentState, smoothedEnergy, db, strumRate);
    renderTempo();
    renderBar();
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
      barEstimate
    })
  };
})();
