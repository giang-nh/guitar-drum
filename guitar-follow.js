(function GuitarFollowModule() {
  const api = window.GuitarDrumAPI;
  if (!api) return;

  const intensity = document.querySelector('#intensity');
  const intensityLabel = document.querySelector('#intensityLabel');
  const bpmInput = document.querySelector('#bpm');
  const bpmLabel = document.querySelector('#bpmLabel');
  const humanizeInput = document.querySelector('#humanize');
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
  const SILENCE_THIN_MS = 1700;
  const STOP_HOLD_MS = 3800;
  const RESUME_ACTIVITY_MS = 900;
  const RESUME_MIN_RECENT_ONSETS = 6;
  const RESUME_BAR_STABLE_MS = 1500;
  const RESUME_TEMPO_MIN = 0.58;
  const RESUME_BAR_MIN = 0.60;
  const PLAN_STABLE_MS = 1200;
  const PLAN_ARM_MIN = 0.74;
  const PLAN_HARMONIC_SUPPORT_MIN = 0.68;
  const SELF_HIT_HISTORY_MS = 900;
  const SELF_HIT_PRE_MS = 35;
  const INPUT_CLASS_HOLD_MS = 420;
  const TELEMETRY_SAMPLE_MS = 250;
  const TELEMETRY_MAX_SAMPLES = 7200;
  const TELEMETRY_MAX_EVENTS = 1200;
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
  let lastMusicalActivityAt = performance.now();
  let intentStage = 'active';
  let intentActionAt = 0;
  let transitionPlan = {mode:'stay',confidence:0,reason:'waiting'};
  let planCandidateKey = null;
  let planCandidateSince = 0;
  let fillVariantCursor = 0;
  let lastFillVariant = null;
  let selfHits = [];
  let previousSpectrum = null;
  let spectralFrame = {flux:0,flatness:0,lowRatio:0,midRatio:0,highRatio:0,drumPenalty:0,voiceLike:0,guitarEvidence:0};
  let inputClass = 'unknown';
  let inputClassSince = 0;
  let acceptedOnsets = 0;
  let rejectedOnsets = 0;
  let telemetryRecording = false;
  let telemetryStartedAt = 0;
  let telemetryStartedIso = null;
  let telemetrySamples = [];
  let telemetryEvents = [];
  let telemetryLastSampleAt = 0;
  let telemetryLastSignature = '';

  injectStyles();
  const ui = buildUi();
  restoreSettings();
  renderState('silent', 0, -80, 0);
  renderTempo();
  renderBar();
  renderSection();
  renderHarmonic();
  renderFusion();
  renderPlan();
  renderInput();
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
      .gd-debug{margin-top:10px;padding-top:10px;border-top:1px dashed var(--border)}
      .gd-debug-row{display:flex;flex-wrap:wrap;gap:7px;align-items:center}
      .gd-debug-row button{min-height:36px;padding:0 10px;font-size:11px}
      .gd-debug-status{font-size:10px;color:var(--muted);font-variant-numeric:tabular-nums}
      .gd-debug-note{margin-top:6px;font-size:10px;color:var(--muted);line-height:1.35}
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
        <div class="gd-follow-stat"><span>Plan</span><strong id="gdFollowPlan">STAY</strong><span id="gdFollowPlanDetail">chưa có transition</span></div>
        <div class="gd-follow-stat"><span>Input</span><strong id="gdFollowInput">RAW</strong><span id="gdFollowInputDetail">chưa phân loại</span></div>
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
        <label class="gd-follow-tempo-option" for="gdCleanInput"><input id="gdCleanInput" type="checkbox" checked /> Clean mic</label>
      </div>
      <div id="gdFollowHint" class="gd-follow-hint">POC: Clean mic dùng self-drum timing + spectral transient gate để giảm tiếng drum từ loa và giọng hát kích nhầm onset/chord. Nếu guitar bị bỏ sót, có thể tắt Clean mic để A/B.</div>
      <div class="gd-debug">
        <div class="gd-debug-row">
          <button type="button" id="gdDebugRecord">● Record debug</button>
          <button type="button" id="gdDebugMark" disabled>⚑ Mark</button>
          <button type="button" id="gdDebugExport" disabled>↗ Export JSON</button>
          <span id="gdDebugStatus" class="gd-debug-status">chưa ghi session</span>
        </div>
        <div class="gd-debug-note">Chỉ ghi telemetry/state; không ghi hoặc lưu audio. Dữ liệu ở local cho tới khi bạn chủ động Export.</div>
      </div>
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
      plan: host.querySelector('#gdFollowPlan'),
      planDetail: host.querySelector('#gdFollowPlanDetail'),
      input: host.querySelector('#gdFollowInput'),
      inputDetail: host.querySelector('#gdFollowInputDetail'),
      toggle: host.querySelector('#gdFollowToggle'),
      sensitivity: host.querySelector('#gdFollowSensitivity'),
      tempoToggle: host.querySelector('#gdTempoFollow'),
      barToggle: host.querySelector('#gdBarFollow'),
      sectionToggle: host.querySelector('#gdSectionFollow'),
      harmonicToggle: host.querySelector('#gdHarmonicFollow'),
      cleanInputToggle: host.querySelector('#gdCleanInput'),
      debugRecord: host.querySelector('#gdDebugRecord'),
      debugMark: host.querySelector('#gdDebugMark'),
      debugExport: host.querySelector('#gdDebugExport'),
      debugStatus: host.querySelector('#gdDebugStatus'),
      hint: host.querySelector('#gdFollowHint')
    };
  }

  function attachListeners() {
    ui.toggle.addEventListener('click', () => {
      if (running) stopListening('Auto Follow đã tắt.');
      else startListening();
    });
    ui.sensitivity.addEventListener('input', saveSettings);
    ui.debugRecord.addEventListener('click', toggleTelemetryRecording);
    ui.debugMark.addEventListener('click', () => recordTelemetryEvent('manual-mark',{label:'user-mark'}));
    ui.debugExport.addEventListener('click', exportTelemetry);
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
      resetIntentTracking();
      resetPlannerTracking();
      renderFusion();
      renderPlan();
    });
    ui.barToggle.addEventListener('change', () => {
      saveSettings();
      barEstimate = null;
      barConfidence = 0;
      resetSectionTracking();
      renderBar();
      renderSection();
      resetFusionTracking();
      resetIntentTracking();
      resetPlannerTracking();
      renderFusion();
      renderPlan();
    });
    ui.sectionToggle.addEventListener('change', () => {
      saveSettings();
      resetSectionTracking();
      renderSection();
      resetFusionTracking();
      resetIntentTracking();
      resetPlannerTracking();
      renderFusion();
      renderPlan();
    });
    ui.harmonicToggle.addEventListener('change', () => {
      saveSettings();
      resetHarmonicTracking();
      renderHarmonic();
      resetFusionTracking();
      resetIntentTracking();
      resetPlannerTracking();
      renderFusion();
      renderPlan();
    });
    ui.cleanInputToggle.addEventListener('change', () => {
      saveSettings();
      resetInputTracking();
      resetTempoTracking();
      resetHarmonicTracking();
      renderInput();
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
      resetIntentTracking();
      resetPlannerTracking();
      resetInputTracking();
      renderFusion();
      renderPlan();
      renderInput();
    });

    document.querySelector('#gdToneMic')?.addEventListener('click', () => {
      if (running) stopListening('Auto Follow tạm tắt để dùng mic tìm tone.');
    });

    window.addEventListener('guitar-drum-self-hit', handleSelfDrumHit);
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
      if (saved.cleanInput != null) ui.cleanInputToggle.checked = Boolean(saved.cleanInput);
    } catch {}
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        sensitivity:Number(ui.sensitivity.value) || 0,
        tempoFollow:Boolean(ui.tempoToggle.checked),
        barFollow:Boolean(ui.barToggle.checked),
        sectionFollow:Boolean(ui.sectionToggle.checked),
        harmonicFollow:Boolean(ui.harmonicToggle.checked),
        cleanInput:Boolean(ui.cleanInputToggle.checked)
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
      resetIntentTracking();
      resetPlannerTracking();
      resetInputTracking();
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
    const transport=api.getTransport?.();
    if (
      transport?.playing &&
      (transport.followHeld||transport.followSilenceMode==='thin'||transport.pendingFollowHold) &&
      typeof api.requestFollowResume==='function'
    ) api.requestFollowResume();
    cleanupAudio();
    ui.toggle.textContent = '🎙 Bật Auto Follow';
    ui.pill.textContent = 'OFF';
    candidateState = 'silent';
    currentState = 'silent';
    resetTempoTracking();
    resetSectionTracking();
    resetHarmonicTracking();
    resetFusionTracking();
    resetIntentTracking();
    resetPlannerTracking();
    resetInputTracking();
    renderState('silent', 0, -80, 0);
    renderTempo();
    renderBar();
    renderSection();
    renderHarmonic();
    renderFusion();
    renderPlan();
    renderInput();
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

    spectralFrame = analyzeSpectrum(ts);
    updateAdaptiveRange(db, spectralFrame.drumPenalty);
    const rawEnergy = normalizeEnergy(db);
    const energy = cleanInputEnergy(rawEnergy, spectralFrame);
    smoothedEnergy = smoothedEnergy * 0.80 + energy * 0.20;
    recordEnergy(ts, smoothedEnergy);
    const strumRate = updateOnsetRate(ts, smoothedEnergy, spectralFrame);
    updateActivityEvidence(ts);
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
    renderPlan();
    renderInput();
    recordTelemetryFrame(ts, db);
    renderTelemetryStatus(ts);
  }

  function round(value,digits=3) {
    if(!Number.isFinite(Number(value)))return null;
    const p=Math.pow(10,digits);
    return Math.round(Number(value)*p)/p;
  }

  function telemetrySnapshot(now=performance.now(),db=null) {
    const transport=api.getTransport?.()||{};
    const song=api.getCurrentSong?.()||{};
    return {
      t:telemetryStartedAt?Math.round(now-telemetryStartedAt):0,
      song:{id:song.id||'',title:song.title||''},
      transport:{
        playing:Boolean(transport.playing),
        paused:Boolean(transport.paused),
        songBeat:Number.isFinite(transport.songBeat)?transport.songBeat:null,
        row:Number.isFinite(transport.currentRow)?transport.currentRow:null,
        section:transport.currentSection||'',
        bpm:Number.isFinite(transport.bpm)?transport.bpm:null,
        followMode:transport.followSilenceMode||'',
        held:Boolean(transport.followHeld)
      },
      mic:{
        db:db==null?null:round(db,1),
        energy:round(smoothedEnergy),
        state:currentState,
        inputClass,
        clean:Boolean(ui.cleanInputToggle.checked),
        acceptedOnsets,
        rejectedOnsets,
        flux:round(spectralFrame.flux),
        flatness:round(spectralFrame.flatness),
        low:round(spectralFrame.lowRatio),
        mid:round(spectralFrame.midRatio),
        high:round(spectralFrame.highRatio),
        drumPenalty:round(spectralFrame.drumPenalty),
        voiceLike:round(spectralFrame.voiceLike),
        guitarEvidence:round(spectralFrame.guitarEvidence)
      },
      tempo:{
        estimate:round(tempoEstimate,1),
        confidence:round(tempoConfidence),
        barConfidence:round(barConfidence),
        barStable:Boolean(barCandidateSince&&now-barCandidateSince>=BAR_STABLE_MS)
      },
      chord:{
        current:currentChord?.symbol||null,
        confidence:round(currentChord?.confidence),
        matchConfidence:round(harmonicMatch?.confidence),
        matchMargin:round(harmonicMatch?.margin),
        targetRow:Number.isFinite(harmonicMatch?.target?.rowIndex)?harmonicMatch.target.rowIndex:null,
        targetSection:harmonicMatch?.target?.section||null
      },
      section:{
        next:sectionPrediction?.next?.name||null,
        confidence:round(sectionPrediction?.confidence),
        beatsAway:Number.isFinite(sectionPrediction?.beatsAway)?round(sectionPrediction.beatsAway,1):null,
        trend:round(sectionPrediction?.trend)
      },
      fusion:{
        mode:performanceState?.mode||'',
        confidence:round(performanceState?.confidence),
        reason:performanceState?.reason||'',
        target:performanceState?.target?.section||performanceState?.target?.name||null
      },
      plan:{
        mode:transitionPlan?.mode||'',
        confidence:round(transitionPlan?.confidence),
        reason:transitionPlan?.reason||'',
        target:transitionPlan?.target?.name||transitionPlan?.target?.section||null,
        beatsAway:Number.isFinite(transitionPlan?.beatsAway)?round(transitionPlan.beatsAway,1):null,
        fillStyle:transitionPlan?.fillStyle||null
      },
      controls:{
        intensity:Number(intensity.value)||0,
        humanFeel:Number(humanizeInput?.value)||0,
        sensitivity:Number(ui.sensitivity.value)||0
      }
    };
  }

  function telemetrySignature(snapshot) {
    return [
      snapshot.mic.inputClass,
      snapshot.mic.state,
      snapshot.fusion.mode,
      snapshot.plan.mode,
      snapshot.chord.current||'',
      snapshot.transport.followMode,
      snapshot.transport.section
    ].join('|');
  }

  function resetTelemetryData() {
    telemetrySamples=[];
    telemetryEvents=[];
    telemetryLastSampleAt=0;
    telemetryLastSignature='';
  }

  function startTelemetryRecording() {
    resetTelemetryData();
    telemetryRecording=true;
    telemetryStartedAt=performance.now();
    telemetryStartedIso=new Date().toISOString();
    ui.debugRecord.textContent='■ Stop debug';
    ui.debugMark.disabled=false;
    ui.debugExport.disabled=true;
    recordTelemetryEvent('session-start',{
      settings:{
        cleanInput:Boolean(ui.cleanInputToggle.checked),
        tempoFollow:Boolean(ui.tempoToggle.checked),
        barFollow:Boolean(ui.barToggle.checked),
        sectionFollow:Boolean(ui.sectionToggle.checked),
        harmonicFollow:Boolean(ui.harmonicToggle.checked)
      }
    });
    renderTelemetryStatus();
  }

  function stopTelemetryRecording() {
    if(!telemetryRecording)return;
    recordTelemetryEvent('session-stop');
    telemetryRecording=false;
    ui.debugRecord.textContent='● Record debug';
    ui.debugMark.disabled=true;
    ui.debugExport.disabled=telemetrySamples.length===0&&telemetryEvents.length===0;
    renderTelemetryStatus();
  }

  function toggleTelemetryRecording() {
    if(telemetryRecording)stopTelemetryRecording();
    else startTelemetryRecording();
  }

  function recordTelemetryEvent(type,payload={}) {
    if(!telemetryRecording&&type!=='session-stop')return;
    const now=performance.now();
    const event={
      t:telemetryStartedAt?Math.round(now-telemetryStartedAt):0,
      type:String(type),
      payload,
      snapshot:telemetrySnapshot(now)
    };
    telemetryEvents.push(event);
    if(telemetryEvents.length>TELEMETRY_MAX_EVENTS)telemetryEvents.shift();
    renderTelemetryStatus(now);
  }

  function recordTelemetryFrame(now,db) {
    if(!telemetryRecording)return;
    if(now-telemetryLastSampleAt>=TELEMETRY_SAMPLE_MS){
      telemetryLastSampleAt=now;
      const snapshot=telemetrySnapshot(now,db);
      telemetrySamples.push(snapshot);
      if(telemetrySamples.length>TELEMETRY_MAX_SAMPLES)telemetrySamples.shift();

      const signature=telemetrySignature(snapshot);
      if(telemetryLastSignature&&signature!==telemetryLastSignature){
        telemetryEvents.push({
          t:Math.round(now-telemetryStartedAt),
          type:'state-change',
          payload:{from:telemetryLastSignature,to:signature},
          snapshot
        });
        if(telemetryEvents.length>TELEMETRY_MAX_EVENTS)telemetryEvents.shift();
      }
      telemetryLastSignature=signature;
    }
  }

  function telemetryDurationMs(now=performance.now()) {
    if(!telemetryStartedAt)return 0;
    if(telemetryRecording)return Math.max(0,now-telemetryStartedAt);
    const lastSample=telemetrySamples[telemetrySamples.length-1];
    const lastEvent=telemetryEvents[telemetryEvents.length-1];
    return Math.max(Number(lastSample?.t)||0,Number(lastEvent?.t)||0);
  }

  function formatDuration(ms) {
    const sec=Math.floor(Math.max(0,ms)/1000);
    const m=Math.floor(sec/60),s=sec%60;
    return m+':'+String(s).padStart(2,'0');
  }

  function renderTelemetryStatus(now=performance.now()) {
    if(!ui.debugStatus)return;
    if(!telemetryStartedAt){
      ui.debugStatus.textContent='chưa ghi session';
      return;
    }
    ui.debugStatus.textContent=
      (telemetryRecording?'REC ':'')+
      formatDuration(telemetryDurationMs(now))+
      ' · '+telemetrySamples.length+' samples · '+telemetryEvents.length+' events';
  }

  function safeFilenamePart(value) {
    return String(value||'session')
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-zA-Z0-9-_]+/g,'-')
      .replace(/^-+|-+$/g,'')
      .toLowerCase()||'session';
  }

  async function exportTelemetry() {
    if(telemetryRecording)stopTelemetryRecording();
    if(!telemetrySamples.length&&!telemetryEvents.length)return;

    const song=api.getCurrentSong?.()||{};
    const payload={
      schema:'guitar-drum-debug-v1',
      appCache:'v23',
      startedAt:telemetryStartedIso,
      durationMs:Math.round(telemetryDurationMs()),
      note:'Local telemetry only; no audio samples are recorded.',
      environment:{
        userAgent:navigator.userAgent||'',
        language:navigator.language||''
      },
      song:{id:song.id||'',title:song.title||'',artist:song.artist||''},
      settings:{
        cleanInput:Boolean(ui.cleanInputToggle.checked),
        tempoFollow:Boolean(ui.tempoToggle.checked),
        barFollow:Boolean(ui.barToggle.checked),
        sectionFollow:Boolean(ui.sectionToggle.checked),
        harmonicFollow:Boolean(ui.harmonicToggle.checked),
        sensitivity:Number(ui.sensitivity.value)||0,
        intensity:Number(intensity.value)||0,
        humanFeel:Number(humanizeInput?.value)||0
      },
      summary:{
        samples:telemetrySamples.length,
        events:telemetryEvents.length,
        acceptedOnsets,
        rejectedOnsets,
        inputClass
      },
      events:telemetryEvents,
      samples:telemetrySamples
    };
    const json=JSON.stringify(payload,null,2);
    const fileName='guitar-drum-debug-'+safeFilenamePart(song.id||song.title)+'-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
    const file=new File([json],fileName,{type:'application/json'});

    try{
      if(navigator.canShare?.({files:[file]})&&navigator.share){
        await navigator.share({title:'Guitar Drum debug session',files:[file]});
        api.setStatus?.('Debug session đã mở Share sheet.');
        return;
      }
    }catch(error){
      if(error?.name==='AbortError')return;
    }

    const url=URL.createObjectURL(file);
    const a=document.createElement('a');
    a.href=url;
    a.download=fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
    api.setStatus?.('Debug session đã export JSON.');
  }

  function resetInputTracking() {
    selfHits=[];
    previousSpectrum=null;
    spectralFrame={flux:0,flatness:0,lowRatio:0,midRatio:0,highRatio:0,drumPenalty:0,voiceLike:0,guitarEvidence:0};
    inputClass='unknown';
    inputClassSince=0;
    acceptedOnsets=0;
    rejectedOnsets=0;
  }

  function handleSelfDrumHit(event) {
    const d=event?.detail;
    if (!d || !Number.isFinite(Number(d.time))) return;
    selfHits.push({
      voice:String(d.voice||''),
      time:Number(d.time),
      power:Math.max(0,Number(d.power)||0)
    });
    const cutoff=performance.now()-SELF_HIT_HISTORY_MS;
    while(selfHits.length&&selfHits[0].time<cutoff)selfHits.shift();
  }

  function drumVoiceWindow(voice) {
    return {
      kick:170,snare:145,ghost:85,hat:65,openHat:210,tom:155,crash:260,click:90
    }[voice]||100;
  }

  function drumVoiceWeight(voice) {
    return {
      kick:.92,snare:.88,ghost:.22,hat:.24,openHat:.42,tom:.62,crash:.82,click:.28
    }[voice]||.35;
  }

  function predictedDrumPenalty(now, features) {
    let penalty=0;
    const cutoff=now-SELF_HIT_HISTORY_MS;
    while(selfHits.length&&selfHits[0].time<cutoff)selfHits.shift();

    for(const hit of selfHits){
      const age=now-hit.time;
      const post=drumVoiceWindow(hit.voice);
      if(age<-SELF_HIT_PRE_MS||age>post)continue;
      const envelope=age<0
        ? clamp(1+age/SELF_HIT_PRE_MS,0,1)
        : clamp(1-age/post,0,1);
      let spectralMatch=.35;
      if(hit.voice==='kick'){
        spectralMatch=clamp(.35+features.lowRatio*.95-features.highRatio*.25,0,1);
      }else if(hit.voice==='snare'||hit.voice==='crash'||hit.voice==='openHat'||hit.voice==='hat'){
        spectralMatch=clamp(.20+features.flatness*.62+features.highRatio*.42,0,1);
      }else if(hit.voice==='tom'){
        spectralMatch=clamp(.25+features.lowRatio*.35+features.midRatio*.50,0,1);
      }
      const power=clamp(hit.power/1.25,0.25,1);
      penalty=Math.max(penalty,envelope*drumVoiceWeight(hit.voice)*spectralMatch*power);
    }
    return clamp(penalty,0,1);
  }

  function analyzeSpectrum(now) {
    if(!analyser||!frequencyBuffer||!audioCtx){
      return {flux:0,flatness:0,lowRatio:0,midRatio:0,highRatio:0,drumPenalty:0,voiceLike:0,guitarEvidence:0};
    }
    analyser.getFloatFrequencyData(frequencyBuffer);
    const binHz=audioCtx.sampleRate/analyser.fftSize;
    if(!previousSpectrum||previousSpectrum.length!==frequencyBuffer.length){
      previousSpectrum=new Float32Array(frequencyBuffer.length);
    }

    let low=0,mid=0,high=0,total=0,fluxNum=0;
    let logSum=0,arith=0,flatCount=0;
    for(let i=1;i<frequencyBuffer.length;i++){
      const f=i*binHz;
      if(f<70||f>5000)continue;
      const db=frequencyBuffer[i];
      const mag=Number.isFinite(db)?Math.pow(10,db/20):0;
      const prev=previousSpectrum[i]||0;
      if(mag>prev)fluxNum+=mag-prev;
      previousSpectrum[i]=mag;
      total+=mag;
      if(f<180)low+=mag;
      else if(f<1200)mid+=mag;
      else high+=mag;
      if(f>=180&&f<=4200){
        const safe=Math.max(1e-9,mag);
        logSum+=Math.log(safe);
        arith+=safe;
        flatCount++;
      }
    }
    const denom=Math.max(1e-9,total);
    const flux=clamp(fluxNum/denom,0,2);
    const lowRatio=low/denom,midRatio=mid/denom,highRatio=high/denom;
    const flatness=flatCount>0&&arith>0
      ? clamp(Math.exp(logSum/flatCount)/(arith/flatCount),0,1)
      : 0;
    const transient=clamp((flux-.025)/.24,0,1);
    const provisional={flux,flatness,lowRatio,midRatio,highRatio};
    const drumPenalty=predictedDrumPenalty(now,provisional);
    const voiceLike=clamp(
      (1-transient)*.48 +
      clamp((midRatio-.42)/.38,0,1)*.34 +
      clamp((.23-highRatio)/.23,0,1)*.18,
      0,1
    );
    const tonal=1-clamp(flatness/.72,0,1);
    const guitarEvidence=clamp(
      transient*.52 +
      clamp((midRatio-.24)/.46,0,1)*.22 +
      clamp(highRatio/.32,0,1)*.12 +
      tonal*.14,
      0,1
    );

    let nextClass='mix';
    if(ui.cleanInputToggle.checked&&drumPenalty>.55&&guitarEvidence<.50) nextClass='drum';
    else if(guitarEvidence>.48&&transient>.18) nextClass='guitar';
    else if(voiceLike>.62&&transient<.30) nextClass='voice';
    else if(total<1e-5) nextClass='quiet';

    if(nextClass!==inputClass){
      if(!inputClassSince||now-inputClassSince>INPUT_CLASS_HOLD_MS){
        inputClass=nextClass;
        inputClassSince=now;
      }
    }else{
      inputClassSince=now;
    }

    return {flux,flatness,lowRatio,midRatio,highRatio,drumPenalty,voiceLike,guitarEvidence,transient};
  }

  function cleanInputEnergy(rawEnergy,evidence) {
    if(!ui.cleanInputToggle.checked)return rawEnergy;
    let factor=1;
    if(evidence.drumPenalty>.58&&evidence.guitarEvidence<.48){
      factor*=1-.62*evidence.drumPenalty;
    }
    if(evidence.voiceLike>.68&&evidence.transient<.22){
      factor*=.62;
    }
    return clamp(rawEnergy*factor,0,1);
  }

  function renderInput() {
    if(!ui.input)return;
    if(!running){
      ui.input.textContent=ui.cleanInputToggle.checked?'CLEAN':'RAW';
      ui.inputDetail.textContent='bật Auto Follow để phân loại';
      return;
    }
    if(!ui.cleanInputToggle.checked){
      ui.input.textContent='RAW';
      ui.inputDetail.textContent='rejection tắt';
      return;
    }
    const labels={guitar:'GUITAR',voice:'VOICE',drum:'DRUM',mix:'MIX',quiet:'QUIET',unknown:'—'};
    ui.input.textContent=labels[inputClass]||String(inputClass).toUpperCase();
    ui.inputDetail.textContent=
      'flux '+Math.round((spectralFrame.flux||0)*100)+
      ' · mask '+Math.round((spectralFrame.drumPenalty||0)*100)+
      '% · ok/rej '+acceptedOnsets+'/'+rejectedOnsets;
  }

  function rmsOf(data) {
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    return Math.sqrt(sum / Math.max(1, data.length));
  }

  function updateAdaptiveRange(db, drumPenalty=0) {
    if (db < -75) return;
    if (db < ambientDb) ambientDb = ambientDb * 0.90 + db * 0.10;
    else ambientDb = ambientDb * 0.998 + db * 0.002;

    if (db > peakDb && drumPenalty < 0.58) peakDb = peakDb * 0.72 + db * 0.28;
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

  function updateOnsetRate(now, energy, evidence=spectralFrame) {
    const rise = energy - onsetEnvelope;
    onsetEnvelope = onsetEnvelope * 0.84 + energy * 0.16;
    const clean=Boolean(ui.cleanInputToggle.checked);
    const extraDrumGate=clean ? evidence.drumPenalty*0.075 : 0;
    const extraVoiceGate=clean ? evidence.voiceLike*0.040 : 0;
    const requiredRise=0.105+extraDrumGate+extraVoiceGate;
    const spectralOk=!clean ||
      evidence.guitarEvidence>=0.28 ||
      (evidence.drumPenalty<0.35 && evidence.flux>=0.08);
    const accept =
      rise>requiredRise &&
      energy>0.20 &&
      spectralOk &&
      now-lastOnsetAt>120;

    if (accept) {
      onsetCount++;
      acceptedOnsets++;
      lastOnsetAt = now;
      recordOnset(now, energy);
    } else if (
      clean &&
      rise>0.105 &&
      energy>0.20 &&
      now-lastOnsetAt>120 &&
      (evidence.drumPenalty>0.45 || evidence.voiceLike>0.58)
    ) {
      rejectedOnsets++;
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

  function nextBarTime(baseDownbeat, beatMs, afterTime) {
    const barMs=beatMs*4;
    const n=Math.max(0,Math.ceil((afterTime-baseDownbeat)/barMs));
    return baseDownbeat+n*barMs;
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
    if (ui.cleanInputToggle.checked) {
      const concentration=chromaEma.reduce((sum,v)=>sum+v*v,0);
      const effectivePitchClasses=concentration>0?1/concentration:0;
      if (effectivePitchClasses<2.05) return null;
      if (spectralFrame.drumPenalty>.68 && spectralFrame.guitarEvidence<.48) return null;
      if (spectralFrame.voiceLike>.72 && spectralFrame.transient<.18) return null;
    }
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
    if (
      ui.cleanInputToggle.checked &&
      (
        (spectralFrame.drumPenalty>.72 && spectralFrame.guitarEvidence<.52) ||
        (spectralFrame.voiceLike>.78 && spectralFrame.transient<.16)
      )
    ) return;
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
    const alpha=chromaEma.some(v=>v>0)
      ? (ui.cleanInputToggle.checked ? 0.22 : 0.28)
      : 1;
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

  function resetIntentTracking() {
    lastMusicalActivityAt=performance.now();
    intentStage='active';
    intentActionAt=0;
  }

  function updateActivityEvidence(now) {
    const recentOnset=lastOnsetAt>0 && now-lastOnsetAt<RESUME_ACTIVITY_MS;
    const active=recentOnset && smoothedEnergy>=0.15;
    if (active) lastMusicalActivityAt=now;
  }

  function recentOnsetCount(now,windowMs=3200) {
    return onsetTimes.filter(t=>now-t<=windowMs).length;
  }

  function intentEvidence(now,transport) {
    if (!transport?.playing || transport.paused || transport.countIn>0) {
      lastMusicalActivityAt=now;
      return {silenceMs:0,recent:false,recentOnsets:0};
    }
    const recent=lastOnsetAt>0 && now-lastOnsetAt<RESUME_ACTIVITY_MS && smoothedEnergy>=0.15;
    const recentOnsets=recentOnsetCount(now);
    return {
      silenceMs:Math.max(0,now-lastMusicalActivityAt),
      recent,
      recentOnsets
    };
  }

  function resetPlannerTracking() {
    transitionPlan={mode:'stay',confidence:0,reason:'waiting'};
    planCandidateKey=null;
    planCandidateSince=0;
  }

  function updatePlanCandidate(key,now) {
    if (!key) {
      planCandidateKey=null;
      planCandidateSince=0;
      return false;
    }
    if (planCandidateKey!==key) {
      planCandidateKey=key;
      planCandidateSince=now;
      return false;
    }
    return now-planCandidateSince>=PLAN_STABLE_MS;
  }

  function chooseFillVariant(style) {
    const options=[0,1,2];
    let variant=options[fillVariantCursor++%options.length];
    if (lastFillVariant===style+':'+variant) variant=(variant+1)%3;
    lastFillVariant=style+':'+variant;
    return variant;
  }

  function buildTransitionPlan(now,transport,harmonicStrong) {
    if (
      !ui.sectionToggle.checked ||
      !sectionPrediction?.ready ||
      !sectionPrediction.next ||
      sectionPrediction.confidence<SECTION_CONFIDENCE_MIN
    ) {
      updatePlanCandidate(null,now);
      return {mode:'stay',confidence:0,reason:'no stable section target'};
    }

    const next=sectionPrediction.next;
    const current=sectionPrediction.current;
    const beatsAway=Number(next.startBeat)-Number(transport.songBeat);
    if (beatsAway<5 || beatsAway>16) {
      updatePlanCandidate(null,now);
      return {mode:'stay',confidence:0,reason:'outside transition window'};
    }

    const harmonicSupports=
      !harmonicStrong ||
      harmonicMatch?.target?.section===next.name;
    if (!harmonicSupports) {
      updatePlanCandidate(null,now);
      return {
        mode:'stay',
        confidence:clamp(sectionPrediction.confidence*0.55,0,1),
        reason:'chord evidence disagrees',
        target:next
      };
    }

    const trendScore=clamp((Number(sectionPrediction.trend||0)-0.025)/0.17,0,1);
    const gainDelta=Number(next.gain||1)-Number(current?.gain||1);
    const gainScore=clamp((gainDelta+0.02)/0.28,0,1);
    const intensityScore=currentState==='big'?1:currentState==='medium'?0.68:currentState==='soft'?0.32:0;
    const harmonicScore=harmonicStrong
      ? clamp(harmonicMatch?.confidence||0,0,1)
      : 0.72;
    const proximityScore=beatsAway<=8?1:clamp(1-(beatsAway-8)/8,0,1);
    const confidence=clamp(
      0.34*sectionPrediction.confidence+
      0.17*trendScore+
      0.12*gainScore+
      0.10*intensityScore+
      0.10*barConfidence+
      0.07*tempoConfidence+
      0.06*harmonicScore+
      0.04*proximityScore,
      0,1
    );

    let fillStyle='small';
    if (confidence>=0.88 && trendScore>=0.62 && intensityScore>=0.68) fillStyle='big';
    else if (confidence>=0.81 || trendScore>=0.48 || gainScore>=0.58) fillStyle='medium';

    const mode=beatsAway>8?'build':'fill-'+fillStyle;
    const key='plan:'+next.index+':'+fillStyle;
    const stable=updatePlanCandidate(key,now);
    return {
      mode,
      confidence,
      reason:stable?'stable target':'learning target',
      target:next,
      beatsAway,
      fillStyle,
      stable,
      harmonicSupports,
      trendScore,
      gainScore
    };
  }

  function renderPlan() {
    if (!ui.plan) return;
    const labels={
      stay:'STAY',
      build:'BUILD',
      'fill-small':'FILL S',
      'fill-medium':'FILL M',
      'fill-big':'FILL L',
      armed:'ARMED',
      drop:'DROP',
      rejoin:'REJOIN'
    };
    ui.plan.textContent=labels[transitionPlan.mode]||String(transitionPlan.mode||'stay').toUpperCase();
    const conf=Math.round(clamp(transitionPlan.confidence||0,0,1)*100);
    const target=transitionPlan.target?.name||transitionPlan.target?.section||'';
    const beats=Number.isFinite(transitionPlan.beatsAway)?Math.max(0,Math.round(transitionPlan.beatsAway))+'b':'';
    ui.planDetail.textContent=
      (conf?conf+'% · ':'')+
      (target?target+' · ':'')+
      (beats?beats+' · ':'')+
      (transitionPlan.reason||'waiting');
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
      lastMusicalActivityAt=now;
      intentStage='active';
      performanceState={mode:'acquiring',confidence:0,reason:'waiting'};
      updateFusionCandidate(null,now);
      return;
    }

    const intent=intentEvidence(now,transport);

    if (transport.followHeld) {
      transitionPlan={mode:'drop',confidence:1,reason:'hold',beatsAway:0};
      if (!intent.recent) {
        intentStage='hold';
        performanceState={mode:'hold',confidence:1,reason:'guitar silent · song position frozen'};
        updateFusionCandidate(null,now);
        return;
      }

      intentStage='reacquire';
      const resumeBarStable=Boolean(
        barEstimate &&
        barConfidence>=RESUME_BAR_MIN &&
        barCandidateSince &&
        now-barCandidateSince>=RESUME_BAR_STABLE_MS
      );
      const resumeReady=
        tempoConfidence>=RESUME_TEMPO_MIN &&
        resumeBarStable &&
        intent.recentOnsets>=RESUME_MIN_RECENT_ONSETS;

      performanceState={
        mode:resumeReady?'rejoin':'reacquire',
        confidence:clamp(0.48*tempoConfidence+0.42*barConfidence+0.10*clamp(intent.recentOnsets/RESUME_MIN_RECENT_ONSETS,0,1),0,1),
        reason:resumeReady?'beat 1 reacquired':'listening for tempo + beat 1'
      };

      if (
        resumeReady &&
        !transport.pendingFollowResume &&
        now-intentActionAt>900 &&
        typeof api.requestFollowResume==='function'
      ) {
        let aligned=true;
        if (typeof api.alignHeldBeatOne==='function' && barEstimate) {
          const targetDownbeat=nextBarTime(barEstimate.baseDownbeat,barEstimate.beatMs,now+80);
          aligned=api.alignHeldBeatOne(targetDownbeat);
        }
        const accepted=aligned && api.requestFollowResume();
        if (accepted) {
          intentActionAt=now;
          intentStage='rejoin';
          performanceState.mode='rejoin';
          performanceState.reason='beat 1 aligned · re-entry queued';
          lastFusionActionAt=now;
          api.setStatus?.('🎸 Re-entry ready · clock đã align beat 1, drummer vào lại cùng bạn.');
        }
      }
      updateFusionCandidate(null,now);
      return;
    }

    if (intent.silenceMs>=STOP_HOLD_MS) {
      transitionPlan={mode:'drop',confidence:1,reason:'long silence'};
      intentStage='hold';
      performanceState={mode:'hold',confidence:1,reason:'long silence · hold next beat 1'};
      updateFusionCandidate(null,now);
      if (
        !transport.pendingFollowHold &&
        now-intentActionAt>900 &&
        typeof api.requestFollowHold==='function'
      ) {
        const accepted=api.requestFollowHold();
        if (accepted) {
          intentActionAt=now;
          resetTempoTracking();
          resetSectionTracking();
          resetHarmonicTracking();
          lastFusionActionAt=now;
          performanceState.reason='hold queued · old evidence cleared';
          api.setStatus?.('🎸 Guitar dừng · drummer hold và chờ bắt nhịp mới.');
        }
      }
      return;
    }

    if (intent.silenceMs>=SILENCE_THIN_MS) {
      transitionPlan={mode:'drop',confidence:clamp(intent.silenceMs/STOP_HOLD_MS,0,1),reason:'thin out'};
      intentStage='thin';
      performanceState={mode:'thin',confidence:clamp(intent.silenceMs/STOP_HOLD_MS,0,1),reason:'short silence · thin out'};
      updateFusionCandidate(null,now);
      if (
        transport.followSilenceMode!=='thin' &&
        now-intentActionAt>700 &&
        typeof api.requestFollowThin==='function'
      ) {
        const accepted=api.requestFollowThin();
        if (accepted) intentActionAt=now;
      }
      return;
    }

    if (
      (transport.followSilenceMode==='thin'||transport.pendingFollowHold) &&
      intent.recent &&
      typeof api.requestFollowResume==='function'
    ) {
      const accepted=api.requestFollowResume();
      if (accepted) {
        intentActionAt=now;
        intentStage='active';
        transitionPlan={mode:'rejoin',confidence:0.72,reason:'guitar returned'};
        performanceState={mode:'rejoin',confidence:0.72,reason:'guitar returned before hold'};
        updateFusionCandidate(null,now);
        return;
      }
    } else {
      intentStage='active';
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
    transitionPlan=buildTransitionPlan(now,transport,harmonicStrong);

    if (!tempoLocked) {
      transitionPlan={mode:'stay',confidence:0,reason:'waiting tempo lock'};
      updatePlanCandidate(null,now);
      performanceState={mode:'acquiring',confidence:tempoConfidence,reason:'tempo'};
      updateFusionCandidate(null,now);
      return;
    }
    if (!barLocked) {
      transitionPlan={mode:'stay',confidence:0,reason:'waiting beat 1'};
      updatePlanCandidate(null,now);
      performanceState={mode:'listening',confidence:0.55*tempoConfidence+0.45*barConfidence,reason:'beat-1'};
      updateFusionCandidate(null,now);
      return;
    }

    if (harmonicAmbiguous) {
      transitionPlan={mode:'stay',confidence:position?.fusionScore||harmonicMatch?.confidence||0,reason:'ambiguous chord position'};
      updatePlanCandidate(null,now);
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

      if (!sameArea) {
        const key='pos:'+target.rowIndex+':'+target.beat;
        const stable=updateFusionCandidate(key,now);
        const actionable=
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
    }

    const planReady=Boolean(
      transitionPlan?.target &&
      transitionPlan.stable &&
      transitionPlan.harmonicSupports &&
      transitionPlan.confidence>=PLAN_ARM_MIN
    );
    if (planReady) {
      const target=transitionPlan.target;
      performanceState={
        mode:'following',
        confidence:transitionPlan.confidence,
        reason:'predictive '+transitionPlan.mode,
        target
      };

      const key='planner:'+target.index+':'+transitionPlan.fillStyle;
      const stable=updateFusionCandidate(key,now);
      const actionable=
        stable &&
        now-lastFusionActionAt>=FUSION_ACTION_COOLDOWN_MS &&
        now-lastSectionActionAt>=SECTION_ACTION_COOLDOWN_MS;

      if (actionable && typeof api.requestSectionTransition==='function') {
        const variant=chooseFillVariant(transitionPlan.fillStyle);
        const accepted=api.requestSectionTransition(target.index,{
          fillStyle:transitionPlan.fillStyle,
          variant,
          confidence:transitionPlan.confidence
        });
        if (accepted) {
          lastFusionActionAt=now;
          lastSectionActionAt=now;
          sectionArmedIndex=target.index;
          sectionPrediction.armed=true;
          transitionPlan={...transitionPlan,mode:'armed',variant,reason:'queued · wait final bar'};
          performanceState.mode='transition';
          performanceState.reason='predictive plan armed';
          api.setStatus?.('🥁 Plan '+transitionPlan.fillStyle+' '+Math.round(transitionPlan.confidence*100)+'% → '+target.name+' · chờ bar cuối.');
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
      reposition:'RE-POS',
      thin:'THIN',
      hold:'HOLD',
      reacquire:'RE-LOCK',
      rejoin:'REJOIN'
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
      performanceState:{...performanceState},
      transitionPlan:{...transitionPlan},
      cleanInput:Boolean(ui.cleanInputToggle.checked),
      inputClass,
      spectralFrame:{...spectralFrame},
      acceptedOnsets,
      rejectedOnsets,
      telemetry:{
        recording:telemetryRecording,
        samples:telemetrySamples.length,
        events:telemetryEvents.length,
        durationMs:Math.round(telemetryDurationMs())
      },
      intentStage,
      lastMusicalActivityAt
    })
  };
})();
