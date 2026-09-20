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
  const CALIBRATION_PROFILE_VERSION = 1;
  const HEALTH_WINDOW_MS = 10000;
  const HEALTH_GREEN_MIN = 0.72;
  const HEALTH_RED_MAX = 0.47;
  const HEALTH_STABLE_MS = 1200;
  const HEALTH_RED_STABLE_MS = 650;
  const AUTOTUNE_PROFILE_VERSION = 1;
  const AUTOTUNE_MARK_WINDOW_MS = 3500;
  const CALIBRATION_STEPS = [
    {id:'quiet',label:'1/5 · Quiet',ms:5000,instruction:'Để phòng yên · không drum · không đàn · không hát.'},
    {id:'drum',label:'2/5 · Drum only',ms:5000,instruction:'Bật Play drum · không đàn · không hát.'},
    {id:'guitar',label:'3/5 · Guitar only',ms:6000,instruction:'Tắt/giảm drum · quạt guitar đều như lúc hát · không hát.'},
    {id:'voice',label:'4/5 · Voice only',ms:5000,instruction:'Không đàn · không drum · hát/nói ở mức âm lượng thật.'},
    {id:'mix',label:'5/5 · Full mix',ms:7000,instruction:'Đàn + hát + drum như lúc sử dụng thật.'}
  ];
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
  let calibrationProfile = null;
  let calibrationActive = false;
  let calibrationStepIndex = 0;
  let calibrationCapturing = false;
  let calibrationCaptureStartedAt = 0;
  let calibrationSamples = {};
  let calibrationCurrentSamples = [];
  let followHealth = {score:.60,raw:.60,level:'yellow',mode:'safe-follow',reason:'acquiring',components:{}};
  let healthCandidateLevel = 'yellow';
  let healthCandidateSince = performance.now();
  let healthOnsetHistory = [];
  let lastHealthLevel = 'yellow';
  let autoTuneSuggestion = null;
  let autoTuneImportedSession = null;
  let autoTuneSourceLabel = '';
  let autoTuneBackupProfile = null;

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
  renderCalibration();
  renderHealth();
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
      .gd-autotune{margin-top:9px;padding:8px;border:1px solid var(--border);border-radius:10px;background:var(--card)}
      .gd-autotune-head{display:flex;flex-wrap:wrap;gap:7px;align-items:center}
      .gd-autotune-head button{min-height:34px;padding:0 9px;font-size:10px}
      .gd-autotune-result{margin-top:7px;font-size:10px;color:var(--muted);line-height:1.45;white-space:pre-line}
      .gd-autotune-result strong{color:var(--text)}
      .gd-cal{margin-top:10px;padding-top:10px;border-top:1px dashed var(--border)}
      .gd-cal-head{display:flex;justify-content:space-between;gap:8px;align-items:center}
      .gd-cal-title{font-size:11px;font-weight:800}
      .gd-cal-profile{font-size:10px;color:var(--muted)}
      .gd-cal-panel{display:none;margin-top:8px;padding:9px;border:1px solid var(--border);border-radius:10px;background:var(--card)}
      .gd-cal-panel.on{display:block}
      .gd-cal-step{font-size:12px;font-weight:800}
      .gd-cal-instruction{margin-top:4px;color:var(--muted);font-size:11px;line-height:1.35}
      .gd-cal-progress{height:7px;margin-top:8px;border-radius:999px;background:#e5e7ea;overflow:hidden}
      .gd-cal-progress>div{height:100%;width:0;background:var(--accent);transition:width .08s linear}
      .gd-cal-actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:8px}
      .gd-cal-actions button{min-height:36px;padding:0 10px;font-size:11px}
      .gd-cal-result{margin-top:7px;color:var(--muted);font-size:10px;line-height:1.4}
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
        <div class="gd-follow-stat"><span>Health</span><strong id="gdFollowHealth">YELLOW</strong><span id="gdFollowHealthDetail">safe follow</span></div>
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
      <div id="gdFollowHint" class="gd-follow-hint">POC: Follow Health tổng hợp chất lượng mic/onset/tempo/bar/chord/calibration. GREEN = Full Auto; YELLOW = Safe Follow; RED = Manual Safe, tự chặn các action rủi ro. Clean mic vẫn có thể tắt để A/B.</div>
      <div class="gd-debug">
        <div class="gd-debug-row">
          <button type="button" id="gdDebugRecord">● Record debug</button>
          <button type="button" id="gdDebugMark" disabled>⚑ Mark</button>
          <button type="button" id="gdDebugExport" disabled>↗ Export JSON</button>
          <span id="gdDebugStatus" class="gd-debug-status">chưa ghi session</span>
        </div>
        <div class="gd-debug-note">Chỉ ghi telemetry/state; không ghi hoặc lưu audio. Dữ liệu ở local cho tới khi bạn chủ động Export.</div>
        <div class="gd-autotune">
          <div class="gd-autotune-head">
            <button type="button" id="gdTuneAnalyze" disabled>✨ Analyze marks</button>
            <button type="button" id="gdTuneImport">Import JSON</button>
            <input id="gdTuneFile" type="file" accept="application/json,.json" hidden />
            <button type="button" id="gdTuneApply" disabled>Apply suggestion</button>
            <button type="button" id="gdTuneUndo" disabled>Undo tune</button>
          </div>
          <div id="gdTuneResult" class="gd-autotune-result">Auto‑Tune chỉ đề xuất; không tự sửa Mic Profile.</div>
        </div>
      </div>
      <div class="gd-cal">
        <div class="gd-cal-head">
          <div>
            <div class="gd-cal-title">🧪 Mic Calibration</div>
            <div id="gdCalProfile" class="gd-cal-profile">Default thresholds</div>
          </div>
          <button type="button" id="gdCalOpen">Calibrate</button>
        </div>
        <div id="gdCalPanel" class="gd-cal-panel">
          <div id="gdCalStep" class="gd-cal-step">1/5 · Quiet</div>
          <div id="gdCalInstruction" class="gd-cal-instruction"></div>
          <div class="gd-cal-progress"><div id="gdCalProgress"></div></div>
          <div class="gd-cal-actions">
            <button type="button" id="gdCalCapture">Start sample</button>
            <button type="button" id="gdCalCancel">Cancel</button>
            <button type="button" id="gdCalReset">Reset profile</button>
          </div>
          <div id="gdCalResult" class="gd-cal-result"></div>
        </div>
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
      health: host.querySelector('#gdFollowHealth'),
      healthDetail: host.querySelector('#gdFollowHealthDetail'),
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
      tuneAnalyze: host.querySelector('#gdTuneAnalyze'),
      tuneImport: host.querySelector('#gdTuneImport'),
      tuneFile: host.querySelector('#gdTuneFile'),
      tuneApply: host.querySelector('#gdTuneApply'),
      tuneUndo: host.querySelector('#gdTuneUndo'),
      tuneResult: host.querySelector('#gdTuneResult'),
      calOpen: host.querySelector('#gdCalOpen'),
      calPanel: host.querySelector('#gdCalPanel'),
      calProfile: host.querySelector('#gdCalProfile'),
      calStep: host.querySelector('#gdCalStep'),
      calInstruction: host.querySelector('#gdCalInstruction'),
      calProgress: host.querySelector('#gdCalProgress'),
      calCapture: host.querySelector('#gdCalCapture'),
      calCancel: host.querySelector('#gdCalCancel'),
      calReset: host.querySelector('#gdCalReset'),
      calResult: host.querySelector('#gdCalResult'),
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
    ui.tuneAnalyze.addEventListener('click', analyzeCurrentTelemetryForTune);
    ui.tuneImport.addEventListener('click', () => ui.tuneFile.click());
    ui.tuneFile.addEventListener('change', importTelemetryForTune);
    ui.tuneApply.addEventListener('click', applyAutoTuneSuggestion);
    ui.tuneUndo.addEventListener('click', undoAutoTune);
    ui.calOpen.addEventListener('click', startCalibrationWizard);
    ui.calCapture.addEventListener('click', startCalibrationCapture);
    ui.calCancel.addEventListener('click', () => cancelCalibration('Calibration đã hủy.'));
    ui.calReset.addEventListener('click', resetCalibrationProfile);
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
      resetHealthTracking();
      renderInput();
      renderHealth();
    });

    document.querySelector('#songSelect')?.addEventListener('change', () => {
      if(calibrationActive)cancelCalibration('',true);
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
      resetHealthTracking();
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
      if (saved.calibrationProfile?.version === CALIBRATION_PROFILE_VERSION) calibrationProfile = saved.calibrationProfile;
      if (saved.autoTuneBackupProfile) autoTuneBackupProfile = saved.autoTuneBackupProfile;
      if (ui?.tuneUndo) ui.tuneUndo.disabled = !autoTuneBackupProfile;
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
        cleanInput:Boolean(ui.cleanInputToggle.checked),
        calibrationProfile,
        autoTuneBackupProfile
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
      resetHealthTracking();
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
    if(calibrationActive)cancelCalibration('',true);
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
    resetHealthTracking();
    renderState('silent', 0, -80, 0);
    renderTempo();
    renderBar();
    renderSection();
    renderHarmonic();
    renderFusion();
    renderPlan();
    renderInput();
    renderHealth();
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
    captureCalibrationFrame(ts, rawDb, rawEnergy);
    const energy = cleanInputEnergy(rawEnergy, spectralFrame);
    smoothedEnergy = smoothedEnergy * 0.80 + energy * 0.20;
    recordEnergy(ts, smoothedEnergy);
    const strumRate = updateOnsetRate(ts, smoothedEnergy, spectralFrame);
    updateActivityEvidence(ts);
    updateTempoFollow(ts);
    updateBarFollow(ts);
    updateSectionFollow(ts);
    updateHarmonicFollow(ts);
    updateFollowHealth(ts);
    if(calibrationActive){
      const step=CALIBRATION_STEPS[calibrationStepIndex];
      performanceState={mode:'listening',confidence:0,reason:'calibrating '+(step?.id||'profile')};
      transitionPlan={mode:'stay',confidence:0,reason:'calibration'};
    }else{
      updatePerformanceFusion(ts);
    }
    const state = stateForEnergy(smoothedEnergy, ts);
    if(!calibrationActive)updateState(state, ts);
    renderState(currentState, smoothedEnergy, db, strumRate);
    renderTempo();
    renderBar();
    renderSection();
    renderHarmonic();
    renderFusion();
    renderPlan();
    renderInput();
    renderHealth();
    renderCalibration(ts);
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
        transient:round(spectralFrame.transient),
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
      health:{
        level:followHealth.level,
        mode:followHealth.mode,
        score:round(followHealth.score),
        raw:round(followHealth.raw),
        reason:followHealth.reason,
        components:{...(followHealth.components||{})}
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
    ui.tuneAnalyze.disabled=true;
    autoTuneSuggestion=null;
    ui.tuneApply.disabled=true;
    ui.tuneResult.textContent='Đang ghi session… bấm Mark lúc app làm sai.';
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
    ui.tuneAnalyze.disabled=telemetrySamples.length<8;
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
      appCache:'v26',
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
        humanFeel:Number(humanizeInput?.value)||0,
        calibrationProfile,
        autoTuneSuggestion:autoTuneSuggestion?{
          sourceLabel:autoTuneSuggestion.sourceLabel,
          confidence:round(autoTuneSuggestion.confidence),
          marks:autoTuneSuggestion.marks,
          changes:autoTuneSuggestion.changes,
          compare:autoTuneSuggestion.compare,
          safetyBlocked:autoTuneSuggestion.safetyBlocked
        }:null
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

  function deepClone(value) {
    return value==null?value:JSON.parse(JSON.stringify(value));
  }

  function sessionFromCurrentTelemetry() {
    return {
      schema:'guitar-drum-debug-v1',
      appCache:'v26',
      samples:telemetrySamples.slice(),
      events:telemetryEvents.slice(),
      settings:{calibrationProfile:deepClone(calibrationProfile)}
    };
  }

  function manualMarks(session) {
    return (session?.events||[]).filter(e=>e?.type==='manual-mark'&&Number.isFinite(Number(e.t)));
  }

  function sessionSamplesNear(session,time,windowMs=AUTOTUNE_MARK_WINDOW_MS) {
    return (session?.samples||[]).filter(s=>Math.abs(Number(s?.t)-Number(time))<=windowMs);
  }

  function mean(values,fallback=0) {
    const nums=values.filter(v=>Number.isFinite(Number(v))).map(Number);
    return nums.length?nums.reduce((a,b)=>a+b,0)/nums.length:fallback;
  }

  function cumulativeDelta(samples,path) {
    const vals=samples.map(s=>{
      const parts=path.split('.');
      let v=s;
      for(const p of parts)v=v?.[p];
      return Number(v);
    }).filter(Number.isFinite);
    return vals.length?Math.max(...vals)-Math.min(...vals):0;
  }

  function markWindowAnalysis(session,mark,thresholds) {
    const samples=sessionSamplesNear(session,mark.t);
    if(!samples.length)return null;
    const classes={guitar:0,voice:0,drum:0,mix:0,quiet:0,unknown:0};
    samples.forEach(s=>{const k=s?.mic?.inputClass||'unknown';classes[k]=(classes[k]||0)+1;});
    const n=samples.length;
    const frac=k=>(classes[k]||0)/n;
    const avgDrum=mean(samples.map(s=>s?.mic?.drumPenalty));
    const avgVoice=mean(samples.map(s=>s?.mic?.voiceLike));
    const avgGuitar=mean(samples.map(s=>s?.mic?.guitarEvidence));
    const avgEnergy=mean(samples.map(s=>s?.mic?.energy));
    const avgTempo=mean(samples.map(s=>s?.tempo?.confidence),.5);
    const avgBar=mean(samples.map(s=>s?.tempo?.barConfidence),.5);
    const avgHealth=mean(samples.map(s=>s?.health?.score),.55);
    const margins=samples.map(s=>Number(s?.chord?.matchMargin)).filter(Number.isFinite);
    const avgMargin=mean(margins,.12);
    const accepted=cumulativeDelta(samples,'mic.acceptedOnsets');
    const rejected=cumulativeDelta(samples,'mic.rejectedOnsets');
    const dominant=Object.keys(classes).sort((a,b)=>classes[b]-classes[a])[0]||'unknown';

    const flags=[];
    if((frac('drum')>=.30||avgDrum>Math.max(.55,thresholds.drumReject))&&accepted>=2&&avgGuitar<thresholds.guitarEvidenceMin+.22){
      flags.push('drum-false-positive');
    }
    if((frac('voice')>=.25||avgVoice>Math.max(.64,thresholds.voiceReject-.02))&&accepted>=2&&avgGuitar<thresholds.guitarEvidenceMin+.20){
      flags.push('voice-false-positive');
    }
    if((frac('guitar')>=.28||avgGuitar>Math.max(.42,thresholds.guitarEvidenceMin+.10))&&(rejected>accepted||avgTempo<.48||avgHealth<.48)){
      flags.push('guitar-over-reject');
    }
    if(avgMargin<HARMONIC_MARGIN_MIN&&avgDrum<.48&&avgVoice<.60&&avgGuitar>.34){
      flags.push('harmonic-ambiguity');
    }
    if(avgGuitar>.40&&avgTempo<.46&&accepted<3&&rejected<=accepted+1){
      flags.push('guitar-under-detect');
    }

    return {mark,samples:n,classes,dominant,avgDrum,avgVoice,avgGuitar,avgEnergy,avgTempo,avgBar,avgHealth,avgMargin,accepted,rejected,flags};
  }

  function boundedThreshold(key,value) {
    const ranges={
      onsetRiseBase:[.088,.132],
      minEnergy:[.14,.26],
      guitarEvidenceMin:[.22,.52],
      drumReject:[.42,.78],
      voiceReject:[.54,.84],
      voiceTransientMax:[.16,.34],
      classDrum:[.40,.76],
      classGuitar:[.36,.64],
      classVoice:[.50,.80],
      chordDrumReject:[.56,.86],
      chordVoiceReject:[.62,.90]
    };
    const [lo,hi]=ranges[key]||[0,1];
    return round(clamp(value,lo,hi),3);
  }

  function tuneDeltasForAnalysis(analysis) {
    const d={};
    const add=(k,v)=>{d[k]=(d[k]||0)+v;};
    if(analysis.flags.includes('drum-false-positive')){
      add('drumReject',-.035);
      add('classDrum',-.025);
      add('chordDrumReject',-.03);
      add('guitarEvidenceMin',.018);
      add('onsetRiseBase',.003);
    }
    if(analysis.flags.includes('voice-false-positive')){
      add('voiceReject',-.035);
      add('classVoice',-.025);
      add('chordVoiceReject',-.03);
      add('guitarEvidenceMin',.012);
      add('onsetRiseBase',.0025);
    }
    if(analysis.flags.includes('guitar-over-reject')){
      add('guitarEvidenceMin',-.022);
      add('onsetRiseBase',-.0035);
      add('minEnergy',-.014);
      if(analysis.avgDrum>.38)add('drumReject',.015);
      if(analysis.avgVoice>.50)add('voiceReject',.012);
    }
    if(analysis.flags.includes('guitar-under-detect')){
      add('guitarEvidenceMin',-.014);
      add('onsetRiseBase',-.003);
      add('minEnergy',-.010);
    }
    return d;
  }

  function capTuneDelta(key,value) {
    const caps={
      onsetRiseBase:.012,minEnergy:.04,guitarEvidenceMin:.06,
      drumReject:.10,voiceReject:.10,voiceTransientMax:.05,
      classDrum:.08,classGuitar:.08,classVoice:.08,
      chordDrumReject:.10,chordVoiceReject:.10
    };
    const cap=caps[key]??.08;
    return clamp(value,-cap,cap);
  }

  function samplePassEstimate(sample,t) {
    const m=sample?.mic||{};
    const guitar=Number(m.guitarEvidence)||0;
    const energy=Number(m.energy)||0;
    const drum=Number(m.drumPenalty)||0;
    const voice=Number(m.voiceLike)||0;
    const transient=Number.isFinite(Number(m.transient))?Number(m.transient):.20;
    const rejectedByDrum=drum>t.drumReject&&guitar<Math.max(t.guitarEvidenceMin+.20,.48);
    const rejectedByVoice=voice>t.voiceReject&&transient<t.voiceTransientMax;
    const spectralOk=guitar>=t.guitarEvidenceMin||(drum<Math.max(.26,t.drumReject-.23)&&(Number(m.flux)||0)>=.08);
    return energy>t.minEnergy&&spectralOk&&!rejectedByDrum&&!rejectedByVoice;
  }

  function compareThresholds(session,before,after,marks) {
    const samples=session?.samples||[];
    const guitarSamples=samples.filter(s=>(s?.mic?.inputClass==='guitar'||Number(s?.mic?.guitarEvidence)>.48));
    const contaminated=samples.filter(s=>
      s?.mic?.inputClass==='drum'||s?.mic?.inputClass==='voice'||
      Number(s?.mic?.drumPenalty)>.62||Number(s?.mic?.voiceLike)>.72
    );
    const markSamples=marks.flatMap(m=>sessionSamplesNear(session,m.t,2200));
    const ratio=(arr,t)=>arr.length?arr.filter(s=>samplePassEstimate(s,t)).length/arr.length:null;
    return {
      guitarRetentionBefore:ratio(guitarSamples,before),
      guitarRetentionAfter:ratio(guitarSamples,after),
      contaminationPassBefore:ratio(contaminated,before),
      contaminationPassAfter:ratio(contaminated,after),
      markedPassBefore:ratio(markSamples,before),
      markedPassAfter:ratio(markSamples,after),
      guitarSamples:guitarSamples.length,
      contaminatedSamples:contaminated.length
    };
  }

  function buildAutoTuneSuggestion(session,sourceLabel='current session') {
    const samples=Array.isArray(session?.samples)?session.samples:[];
    const marks=manualMarks(session);
    const before={...calibrationThresholds()};
    const analyses=marks.map(m=>markWindowAnalysis(session,m,before)).filter(Boolean);
    const directional=analyses.filter(a=>a.flags.some(f=>f!=='harmonic-ambiguity'));
    const ambiguityOnly=analyses.filter(a=>a.flags.length&&a.flags.every(f=>f==='harmonic-ambiguity')).length;
    const totals={};
    directional.forEach(a=>{
      const d=tuneDeltasForAnalysis(a);
      Object.entries(d).forEach(([k,v])=>{totals[k]=(totals[k]||0)+v;});
    });

    const proposed={...before};
    const changes=[];
    Object.entries(totals).forEach(([key,total])=>{
      const scaled=capTuneDelta(key,total/Math.max(1,Math.sqrt(directional.length)));
      const next=boundedThreshold(key,Number(before[key])+scaled);
      if(Math.abs(next-Number(before[key]))>=.001){
        proposed[key]=next;
        changes.push({key,before:Number(before[key]),after:next,delta:round(next-Number(before[key]),3)});
      }
    });

    const confidenceBase=clamp(
      .18+
      .10*Math.min(4,marks.length)+
      .28*clamp(directional.length/Math.max(1,marks.length),0,1)+
      .18*clamp(samples.length/500,0,1)+
      .12*(calibrationProfile?.quality||.5),
      0,1
    );
    const confidence=Math.min(confidenceBase,.48+.12*Math.min(3,marks.length));
    const compare=compareThresholds(session,before,proposed,marks);
    const guitarLoss=
      compare.guitarRetentionBefore!=null&&compare.guitarRetentionAfter!=null
        ? compare.guitarRetentionBefore-compare.guitarRetentionAfter
        : 0;
    const contaminationWorse=
      compare.contaminationPassBefore!=null&&compare.contaminationPassAfter!=null
        ? compare.contaminationPassAfter-compare.contaminationPassBefore
        : 0;
    const safetyBlocked=guitarLoss>.08||contaminationWorse>.035;
    const reasons=[];
    const counts={};
    analyses.flatMap(a=>a.flags).forEach(f=>counts[f]=(counts[f]||0)+1);
    if(counts['drum-false-positive'])reasons.push(counts['drum-false-positive']+' mark: drum false-positive');
    if(counts['voice-false-positive'])reasons.push(counts['voice-false-positive']+' mark: voice false-positive');
    if(counts['guitar-over-reject'])reasons.push(counts['guitar-over-reject']+' mark: guitar over-reject');
    if(counts['guitar-under-detect'])reasons.push(counts['guitar-under-detect']+' mark: guitar under-detect');
    if(ambiguityOnly)reasons.push(ambiguityOnly+' mark: harmonic ambiguity → không sửa mic');

    return {
      version:AUTOTUNE_PROFILE_VERSION,
      sourceLabel,
      createdAt:new Date().toISOString(),
      samples:samples.length,
      marks:marks.length,
      analyzedMarks:analyses.length,
      directionalMarks:directional.length,
      confidence,
      before,
      proposed,
      changes,
      compare,
      safetyBlocked,
      safetyReason:safetyBlocked
        ? (guitarLoss>.08?'estimated guitar retention drops too much':'estimated contamination pass gets worse')
        : '',
      reasons,
      analyses
    };
  }

  function fmtPct(value) {
    return value==null?'n/a':Math.round(value*100)+'%';
  }

  function renderAutoTuneSuggestion() {
    if(!ui.tuneResult)return;
    if(!autoTuneSuggestion){
      ui.tuneResult.textContent='Auto‑Tune chỉ đề xuất; không tự sửa Mic Profile.';
      ui.tuneApply.disabled=true;
      return;
    }
    const s=autoTuneSuggestion;
    if(!s.marks){
      ui.tuneResult.textContent='Không có Mark trong '+s.sourceLabel+'. Hãy bấm Mark lúc app làm sai rồi phân tích lại.';
      ui.tuneApply.disabled=true;
      return;
    }
    if(!s.changes.length){
      ui.tuneResult.textContent=
        'Không có threshold change đủ chắc từ '+s.marks+' Mark. '+
        (s.reasons.length?s.reasons.join(' · '):'Evidence chưa chỉ ra lỗi mic theo một hướng rõ ràng.')+
        '\nGiữ profile hiện tại.';
      ui.tuneApply.disabled=true;
      return;
    }
    const changeText=s.changes.map(x=>x.key+' '+x.before+' → '+x.after).join(' · ');
    const cmp=s.compare;
    ui.tuneResult.textContent=
      'Suggestion '+Math.round(s.confidence*100)+'% · '+s.directionalMarks+'/'+s.marks+' Mark có hướng tune\n'+
      (s.reasons.length?s.reasons.join(' · ')+'\n':'')+
      changeText+'\n'+
      'Estimate: guitar retention '+fmtPct(cmp.guitarRetentionBefore)+' → '+fmtPct(cmp.guitarRetentionAfter)+
      ' · contamination pass '+fmtPct(cmp.contaminationPassBefore)+' → '+fmtPct(cmp.contaminationPassAfter);
    if(s.safetyBlocked){
      ui.tuneResult.textContent+=
        '\n⚠ Safety block: '+s.safetyReason+'. Suggestion chỉ để xem, không Apply.';
    }
    ui.tuneApply.disabled=s.confidence<.55||s.safetyBlocked;
  }

  function analyzeSessionForTune(session,label) {
    autoTuneSuggestion=buildAutoTuneSuggestion(session,label);
    autoTuneSourceLabel=label;
    renderAutoTuneSuggestion();
    recordTelemetryEvent('autotune-analysis',{
      source:label,
      confidence:round(autoTuneSuggestion.confidence),
      marks:autoTuneSuggestion.marks,
      changes:autoTuneSuggestion.changes
    });
  }

  function analyzeCurrentTelemetryForTune() {
    if(telemetryRecording)stopTelemetryRecording();
    if(telemetrySamples.length<8){
      ui.tuneResult.textContent='Session quá ngắn để Auto‑Tune.';
      return;
    }
    autoTuneImportedSession=null;
    analyzeSessionForTune(sessionFromCurrentTelemetry(),'current session');
  }

  async function importTelemetryForTune(event) {
    const file=event?.target?.files?.[0];
    if(!file)return;
    try{
      const payload=JSON.parse(await file.text());
      if(!Array.isArray(payload?.samples)||!Array.isArray(payload?.events)){
        throw new Error('invalid debug JSON');
      }
      autoTuneImportedSession=payload;
      analyzeSessionForTune(payload,'import: '+file.name);
      ui.tuneAnalyze.disabled=false;
    }catch(error){
      autoTuneImportedSession=null;
      autoTuneSuggestion=null;
      ui.tuneApply.disabled=true;
      ui.tuneResult.textContent='Không đọc được debug JSON hợp lệ.';
    }finally{
      event.target.value='';
    }
  }

  function applyAutoTuneSuggestion() {
    const s=autoTuneSuggestion;
    if(!s?.changes?.length||s.confidence<.55||s.safetyBlocked)return;
    autoTuneBackupProfile=calibrationProfile
      ? deepClone(calibrationProfile)
      : {__defaultProfile:true};
    const base=calibrationProfile?deepClone(calibrationProfile):{
      version:CALIBRATION_PROFILE_VERSION,
      createdAt:new Date().toISOString(),
      quality:round(Math.max(.45,s.confidence*.72)),
      recommendedSensitivity:Number(ui.sensitivity.value)||0,
      metrics:{source:'autotune-without-calibration'}
    };
    calibrationProfile={
      ...base,
      version:CALIBRATION_PROFILE_VERSION,
      thresholds:{...s.proposed},
      autoTune:{
        version:AUTOTUNE_PROFILE_VERSION,
        appliedAt:new Date().toISOString(),
        source:s.sourceLabel,
        confidence:round(s.confidence),
        marks:s.marks,
        changes:s.changes
      }
    };
    saveSettings();
    resetInputTracking();
    resetTempoTracking();
    resetHarmonicTracking();
    resetHealthTracking();
    ui.tuneApply.disabled=true;
    ui.tuneUndo.disabled=false;
    ui.tuneResult.textContent='Applied · '+s.changes.map(x=>x.key+' '+x.before+'→'+x.after).join(' · ')+'\nCó thể Undo tune để quay lại profile trước.';
    renderCalibration();
    recordTelemetryEvent('autotune-applied',{confidence:round(s.confidence),changes:s.changes});
    api.setStatus?.('✨ Auto‑Tune suggestion đã áp dụng vào Mic Profile.');
  }

  function undoAutoTune() {
    if(!autoTuneBackupProfile)return;
    calibrationProfile=autoTuneBackupProfile.__defaultProfile
      ? null
      : deepClone(autoTuneBackupProfile);
    autoTuneBackupProfile=null;
    saveSettings();
    resetInputTracking();
    resetTempoTracking();
    resetHarmonicTracking();
    resetHealthTracking();
    ui.tuneUndo.disabled=true;
    ui.tuneResult.textContent='Đã Undo Auto‑Tune · quay lại profile trước.';
    renderCalibration();
    recordTelemetryEvent('autotune-undo');
    api.setStatus?.('↩ Auto‑Tune đã được hoàn tác.');
  }

  function percentile(values,p=0.5) {
    const nums=values.filter(v=>Number.isFinite(Number(v))).map(Number).sort((a,b)=>a-b);
    if(!nums.length)return null;
    const pos=(nums.length-1)*clamp(p,0,1);
    const lo=Math.floor(pos),hi=Math.ceil(pos);
    if(lo===hi)return nums[lo];
    return nums[lo]+(nums[hi]-nums[lo])*(pos-lo);
  }

  function calibrationThresholds() {
    const defaults={
      onsetRiseBase:.105,
      minEnergy:.20,
      guitarEvidenceMin:.28,
      drumReject:.58,
      voiceReject:.68,
      voiceTransientMax:.22,
      classDrum:.55,
      classGuitar:.48,
      classVoice:.62,
      chordDrumReject:.68,
      chordVoiceReject:.72
    };
    return calibrationProfile?.thresholds
      ? {...defaults,...calibrationProfile.thresholds}
      : defaults;
  }

  function calibrationMetric(samples,key,p=.5,fallback=0) {
    const value=percentile((samples||[]).map(s=>s[key]),p);
    return value==null?fallback:value;
  }

  function buildCalibrationProfile() {
    const quiet=calibrationSamples.quiet||[];
    const drum=calibrationSamples.drum||[];
    const guitar=calibrationSamples.guitar||[];
    const voice=calibrationSamples.voice||[];
    const mix=calibrationSamples.mix||[];

    const quietDb=calibrationMetric(quiet,'rawDb',.5,-58);
    const quietEnergy=calibrationMetric(quiet,'rawEnergy',.90,.05);
    const guitarEvidence=calibrationMetric(guitar,'guitarEvidence',.30,.38);
    const guitarEnergy=calibrationMetric(guitar,'rawEnergy',.25,.32);
    const drumGuitarFalse=calibrationMetric(drum,'guitarEvidence',.80,.28);
    const voiceGuitarFalse=calibrationMetric(voice,'guitarEvidence',.80,.28);
    const negativeGuitar=Math.max(drumGuitarFalse,voiceGuitarFalse);
    const separation=guitarEvidence-negativeGuitar;

    const learnedGuitarMin=separation>.04
      ? clamp(negativeGuitar+separation*.46,.22,.52)
      : .28;
    const drumP=calibrationMetric(drum,'drumPenalty',.72,.62);
    const voiceP=calibrationMetric(voice,'voiceLike',.55,.70);
    const voiceTransient=calibrationMetric(voice,'transient',.80,.20);
    const mixGuitar=calibrationMetric(mix,'guitarEvidence',.25,guitarEvidence);

    const sampleCoverage=CALIBRATION_STEPS.reduce((sum,step)=>{
      const count=(calibrationSamples[step.id]||[]).length;
      return sum+clamp(count/Math.max(1,step.ms/ANALYSIS_MS*.72),0,1);
    },0)/CALIBRATION_STEPS.length;
    const separationScore=clamp((separation+.02)/.22,0,1);
    const mixScore=clamp((mixGuitar-.20)/.35,0,1);
    const quality=clamp(.46*sampleCoverage+.36*separationScore+.18*mixScore,0,1);

    const blend=quality<.45?.35:quality<.65?.65:1;
    const blendValue=(learned,base)=>base+(learned-base)*blend;
    const recommendedSensitivity=clamp(Math.round(-56-quietDb),-6,6);

    return {
      version:CALIBRATION_PROFILE_VERSION,
      createdAt:new Date().toISOString(),
      quality:round(quality),
      recommendedSensitivity,
      metrics:{
        quietDb:round(quietDb,1),
        quietEnergy:round(quietEnergy),
        guitarEvidence:round(guitarEvidence),
        negativeGuitarEvidence:round(negativeGuitar),
        separation:round(separation),
        drumPenalty:round(drumP),
        voiceLike:round(voiceP),
        voiceTransient:round(voiceTransient),
        mixGuitarEvidence:round(mixGuitar)
      },
      thresholds:{
        onsetRiseBase:round(blendValue(clamp(.09+quietEnergy*.08,.09,.13),.105)),
        minEnergy:round(blendValue(clamp(guitarEnergy*.52,.14,.25),.20)),
        guitarEvidenceMin:round(blendValue(learnedGuitarMin,.28)),
        drumReject:round(blendValue(clamp(drumP*.78,.44,.76),.58)),
        voiceReject:round(blendValue(clamp(voiceP*.90,.56,.82),.68)),
        voiceTransientMax:round(blendValue(clamp(voiceTransient+.045,.16,.34),.22)),
        classDrum:round(blendValue(clamp(drumP*.72,.42,.74),.55)),
        classGuitar:round(blendValue(clamp(learnedGuitarMin+.14,.38,.62),.48)),
        classVoice:round(blendValue(clamp(voiceP*.84,.54,.78),.62)),
        chordDrumReject:round(blendValue(clamp(drumP*.90,.58,.84),.68)),
        chordVoiceReject:round(blendValue(clamp(voiceP*.98,.64,.88),.72))
      }
    };
  }

  async function startCalibrationWizard() {
    if(calibrationActive){
      ui.calPanel.classList.add('on');
      renderCalibration();
      return;
    }
    if(!running)await startListening();
    if(!running)return;
    calibrationActive=true;
    calibrationStepIndex=0;
    calibrationCapturing=false;
    calibrationSamples={};
    calibrationCurrentSamples=[];
    ui.calPanel.classList.add('on');
    ui.calOpen.textContent='Calibrating…';
    ui.calCancel.textContent='Cancel';
    ui.calCapture.disabled=false;
    ui.calResult.textContent='Chuẩn bị đúng cảnh rồi bấm Start sample.';
    recordTelemetryEvent('calibration-start');
    renderCalibration();
    api.setStatus?.('🧪 Mic calibration bắt đầu · Follow actions tạm khóa.');
  }

  function startCalibrationCapture() {
    if(!calibrationActive||calibrationCapturing)return;
    const step=CALIBRATION_STEPS[calibrationStepIndex];
    if(!step)return;
    calibrationCurrentSamples=[];
    calibrationCaptureStartedAt=performance.now();
    calibrationCapturing=true;
    ui.calCapture.disabled=true;
    ui.calResult.textContent='Đang đo '+step.label+'…';
    recordTelemetryEvent('calibration-step-start',{step:step.id});
    renderCalibration();
  }

  function captureCalibrationFrame(now,rawDb,rawEnergy) {
    if(!calibrationActive||!calibrationCapturing)return;
    const step=CALIBRATION_STEPS[calibrationStepIndex];
    if(!step)return;
    calibrationCurrentSamples.push({
      rawDb:round(rawDb,2),
      rawEnergy:round(rawEnergy),
      flux:round(spectralFrame.flux),
      flatness:round(spectralFrame.flatness),
      lowRatio:round(spectralFrame.lowRatio),
      midRatio:round(spectralFrame.midRatio),
      highRatio:round(spectralFrame.highRatio),
      drumPenalty:round(spectralFrame.drumPenalty),
      voiceLike:round(spectralFrame.voiceLike),
      guitarEvidence:round(spectralFrame.guitarEvidence),
      transient:round(spectralFrame.transient)
    });
    if(now-calibrationCaptureStartedAt>=step.ms)finishCalibrationStep();
  }

  function finishCalibrationStep() {
    const step=CALIBRATION_STEPS[calibrationStepIndex];
    if(!step)return;
    calibrationSamples[step.id]=calibrationCurrentSamples.slice();
    calibrationCapturing=false;
    recordTelemetryEvent('calibration-step-stop',{step:step.id,samples:calibrationCurrentSamples.length});
    calibrationCurrentSamples=[];

    if(calibrationStepIndex>=CALIBRATION_STEPS.length-1){
      calibrationProfile=buildCalibrationProfile();
      calibrationActive=false;
      const recommended=Number(calibrationProfile.recommendedSensitivity)||0;
      ui.sensitivity.value=String(recommended);
      saveSettings();
      resetInputTracking();
      resetTempoTracking();
      resetHarmonicTracking();
      resetFusionTracking();
      resetIntentTracking();
      resetPlannerTracking();
      resetHealthTracking();
      autoTuneBackupProfile=null;
      autoTuneSuggestion=null;
      ui.tuneUndo.disabled=true;
      ui.tuneApply.disabled=true;
      ui.calOpen.textContent='Recalibrate';
      ui.calCapture.disabled=true;
      ui.calCancel.textContent='Close';
      recordTelemetryEvent('calibration-complete',{profile:calibrationProfile});
      api.setStatus?.('🧪 Calibration xong · Mic Profile đã áp dụng.');
      renderCalibration();
      return;
    }

    calibrationStepIndex++;
    ui.calCapture.disabled=false;
    ui.calResult.textContent='Đã đo '+step.label+'. Chuẩn bị bước kế tiếp rồi bấm Start sample.';
    renderCalibration();
  }

  function cancelCalibration(message='Calibration đã hủy.',silent=false) {
    const wasActive=calibrationActive;
    calibrationActive=false;
    calibrationCapturing=false;
    calibrationCurrentSamples=[];
    ui.calPanel.classList.remove('on');
    ui.calOpen.textContent=calibrationProfile?'Recalibrate':'Calibrate';
    ui.calCapture.disabled=false;
    ui.calCancel.textContent='Cancel';
    if(wasActive)recordTelemetryEvent('calibration-cancel');
    if(message&&!silent&&wasActive)api.setStatus?.('🧪 '+message);
    renderCalibration();
  }

  function resetCalibrationProfile() {
    if(calibrationActive)cancelCalibration('',true);
    calibrationProfile=null;
    autoTuneBackupProfile=null;
    autoTuneSuggestion=null;
    ui.tuneUndo.disabled=true;
    ui.tuneApply.disabled=true;
    saveSettings();
    resetInputTracking();
    resetTempoTracking();
    resetHarmonicTracking();
    resetHealthTracking();
    ui.calOpen.textContent='Calibrate';
    ui.calCapture.disabled=false;
    ui.calCancel.textContent='Cancel';
    ui.calResult.textContent='Đã reset về default thresholds. Mic sensitivity giữ nguyên để bạn chỉnh tay nếu cần.';
    api.setStatus?.('🧪 Mic Profile đã reset về default.');
    renderCalibration();
  }

  function renderCalibration(now=performance.now()) {
    if(!ui.calProfile)return;
    if(calibrationProfile){
      const q=Math.round((calibrationProfile.quality||0)*100);
      const t=calibrationProfile.thresholds||{};
      const tuned=calibrationProfile.autoTune
        ? ' · tuned '+Math.round((calibrationProfile.autoTune.confidence||0)*100)+'%'
        : '';
      ui.calProfile.textContent='Profile '+q+'%'+tuned+' · sens '+(calibrationProfile.recommendedSensitivity>=0?'+':'')+calibrationProfile.recommendedSensitivity+' dB';
      if(!calibrationActive&&ui.calPanel.classList.contains('on')){
        ui.calStep.textContent='Calibration complete';
        ui.calInstruction.textContent='Profile đang được dùng cho Clean mic / onset / chord gates.';
        ui.calProgress.style.width='100%';
        ui.calResult.textContent=
          'guitar≥'+round(t.guitarEvidenceMin,2)+
          ' · drum≥'+round(t.drumReject,2)+
          ' · voice≥'+round(t.voiceReject,2)+
          ' · onset>'+round(t.onsetRiseBase,3);
      }
    }else{
      ui.calProfile.textContent='Default thresholds';
    }

    if(!calibrationActive){
      ui.calOpen.textContent=calibrationProfile?'Recalibrate':'Calibrate';
      return;
    }
    const step=CALIBRATION_STEPS[calibrationStepIndex];
    if(!step)return;
    ui.calStep.textContent=step.label;
    ui.calInstruction.textContent=step.instruction;
    const elapsed=calibrationCapturing?now-calibrationCaptureStartedAt:0;
    ui.calProgress.style.width=Math.round(clamp(elapsed/step.ms,0,1)*100)+'%';
    ui.calCapture.textContent=calibrationCapturing?'Measuring…':'Start sample';
    ui.calCapture.disabled=calibrationCapturing;
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

    const thresholds=calibrationThresholds();
    let nextClass='mix';
    if(ui.cleanInputToggle.checked&&drumPenalty>thresholds.classDrum&&guitarEvidence<Math.max(thresholds.guitarEvidenceMin+.22,.50)) nextClass='drum';
    else if(guitarEvidence>thresholds.classGuitar&&transient>.18) nextClass='guitar';
    else if(voiceLike>thresholds.classVoice&&transient<Math.max(.26,thresholds.voiceTransientMax+.08)) nextClass='voice';
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
    const thresholds=calibrationThresholds();
    let factor=1;
    if(evidence.drumPenalty>thresholds.drumReject&&evidence.guitarEvidence<Math.max(thresholds.guitarEvidenceMin+.20,.48)){
      factor*=1-.62*evidence.drumPenalty;
    }
    if(evidence.voiceLike>thresholds.voiceReject&&evidence.transient<thresholds.voiceTransientMax){
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

    const thresholds=calibrationThresholds();
    if (db > peakDb && drumPenalty < thresholds.drumReject) peakDb = peakDb * 0.72 + db * 0.28;
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
    const thresholds=calibrationThresholds();
    const extraDrumGate=clean ? evidence.drumPenalty*0.075 : 0;
    const extraVoiceGate=clean ? evidence.voiceLike*0.040 : 0;
    const requiredRise=thresholds.onsetRiseBase+extraDrumGate+extraVoiceGate;
    const spectralOk=!clean ||
      evidence.guitarEvidence>=thresholds.guitarEvidenceMin ||
      (evidence.drumPenalty<Math.max(.26,thresholds.drumReject-.23) && evidence.flux>=0.08);
    const accept =
      rise>requiredRise &&
      energy>thresholds.minEnergy &&
      spectralOk &&
      now-lastOnsetAt>120;

    if (accept) {
      onsetCount++;
      acceptedOnsets++;
      recordHealthOnset(now,true);
      lastOnsetAt = now;
      recordOnset(now, energy);
    } else if (
      clean &&
      rise>thresholds.onsetRiseBase &&
      energy>thresholds.minEnergy &&
      now-lastOnsetAt>120 &&
      (evidence.drumPenalty>Math.max(.36,thresholds.drumReject-.13) || evidence.voiceLike>Math.max(.52,thresholds.voiceReject-.10))
    ) {
      rejectedOnsets++;
      recordHealthOnset(now,false);
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

    if (calibrationActive) {
      tempoCandidate=null;
      tempoCandidateSince=0;
      return;
    }

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

    if(!healthPermissions().tempo)return;
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

    if (calibrationActive) return;
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

    if(!healthPermissions().barSync)return;
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
      const thresholds=calibrationThresholds();
      if (spectralFrame.drumPenalty>thresholds.chordDrumReject && spectralFrame.guitarEvidence<Math.max(thresholds.guitarEvidenceMin+.20,.48)) return null;
      if (spectralFrame.voiceLike>thresholds.chordVoiceReject && spectralFrame.transient<Math.max(.16,thresholds.voiceTransientMax-.04)) return null;
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
    if (ui.cleanInputToggle.checked) {
      const thresholds=calibrationThresholds();
      if (
        (spectralFrame.drumPenalty>Math.min(.90,thresholds.chordDrumReject+.04) && spectralFrame.guitarEvidence<Math.max(thresholds.guitarEvidenceMin+.24,.52)) ||
        (spectralFrame.voiceLike>Math.min(.92,thresholds.chordVoiceReject+.06) && spectralFrame.transient<Math.max(.14,thresholds.voiceTransientMax-.06))
      ) return;
    }
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

  function resetHealthTracking() {
    followHealth={score:.60,raw:.60,level:'yellow',mode:'safe-follow',reason:'acquiring',components:{}};
    healthCandidateLevel='yellow';
    healthCandidateSince=performance.now();
    healthOnsetHistory=[];
    lastHealthLevel='yellow';
  }

  function recordHealthOnset(now,accepted) {
    healthOnsetHistory.push({time:now,accepted:Boolean(accepted)});
    const cutoff=now-HEALTH_WINDOW_MS;
    while(healthOnsetHistory.length&&healthOnsetHistory[0].time<cutoff)healthOnsetHistory.shift();
  }

  function recentOnsetHealth(now) {
    const cutoff=now-HEALTH_WINDOW_MS;
    while(healthOnsetHistory.length&&healthOnsetHistory[0].time<cutoff)healthOnsetHistory.shift();
    if(healthOnsetHistory.length<4)return {score:.62,accepted:0,rejected:0,total:healthOnsetHistory.length};
    const accepted=healthOnsetHistory.filter(x=>x.accepted).length;
    const rejected=healthOnsetHistory.length-accepted;
    const ratio=accepted/Math.max(1,accepted+rejected);
    const sampleScore=clamp(healthOnsetHistory.length/14,0,1);
    return {
      score:clamp(.78*ratio+.22*sampleScore,0,1),
      accepted,
      rejected,
      total:healthOnsetHistory.length
    };
  }

  function healthPermissions() {
    if(followHealth.level==='green'){
      return {intensity:true,tempo:true,barSync:true,reposition:true,transition:true,bigFill:true,hold:true,rejoin:true};
    }
    if(followHealth.level==='yellow'){
      return {intensity:true,tempo:true,barSync:true,reposition:false,transition:true,bigFill:false,hold:true,rejoin:true};
    }
    return {intensity:false,tempo:false,barSync:false,reposition:false,transition:false,bigFill:false,hold:true,rejoin:false};
  }

  function healthLevelForScore(score) {
    if(score>=HEALTH_GREEN_MIN)return 'green';
    if(score<HEALTH_RED_MAX)return 'red';
    return 'yellow';
  }

  function updateFollowHealth(now) {
    if(!running){
      followHealth={score:.60,raw:.60,level:'yellow',mode:'safe-follow',reason:'mic off',components:{}};
      return;
    }

    const onset=recentOnsetHealth(now);
    const thresholds=calibrationThresholds();
    const guitarSupport=clamp(
      (spectralFrame.guitarEvidence-thresholds.guitarEvidenceMin+.18)/.48,
      0,1
    );
    const drumContam=clamp(
      spectralFrame.drumPenalty*(1-clamp(guitarSupport*.70,0,.70)),
      0,1
    );
    const voiceContam=clamp(
      spectralFrame.voiceLike*(1-clamp(spectralFrame.transient/.55,0,.75))*(1-clamp(guitarSupport*.45,0,.45)),
      0,1
    );
    const inputScore=clamp(
      .52*guitarSupport+
      .28*(1-drumContam)+
      .20*(1-voiceContam),
      0,1
    );
    const tempoScore=tempoEstimate==null?.58:clamp(tempoConfidence,0,1);
    const barScore=barEstimate==null?.56:clamp(barConfidence,0,1);
    let harmonicScore=.62;
    if(harmonicMatch){
      const ambiguous=harmonicMatch.margin<HARMONIC_MARGIN_MIN;
      harmonicScore=ambiguous
        ? clamp(.28+.30*harmonicMatch.confidence,0,1)
        : clamp(.68*harmonicMatch.confidence+.32*clamp(harmonicMatch.margin/.20,0,1),0,1);
    }
    const calibrationScore=calibrationProfile
      ? clamp(.55+.45*(calibrationProfile.quality||0),0,1)
      : .64;
    const signalScore=clamp(
      .58*(1-Math.max(drumContam,voiceContam))+
      .42*clamp((spectralFrame.guitarEvidence||0)+.25,0,1),
      0,1
    );

    let raw=clamp(
      .22*inputScore+
      .17*onset.score+
      .18*tempoScore+
      .16*barScore+
      .13*harmonicScore+
      .08*calibrationScore+
      .06*signalScore,
      0,1
    );

    const quietOrRest=currentState==='silent'&&now-lastOnsetAt>800;
    if(quietOrRest&&raw<.50)raw=.52;
    if(drumContam>.72&&guitarSupport<.30&&onset.rejected>=onset.accepted+2)raw=Math.min(raw,.40);
    if(voiceContam>.76&&guitarSupport<.28&&onset.rejected>=3)raw=Math.min(raw,.44);

    const smoothed=clamp(.82*(followHealth.score||.60)+.18*raw,0,1);
    const wanted=healthLevelForScore(smoothed);
    if(wanted!==healthCandidateLevel){
      healthCandidateLevel=wanted;
      healthCandidateSince=now;
    }
    const stableMs=wanted==='red'?HEALTH_RED_STABLE_MS:HEALTH_STABLE_MS;
    let level=followHealth.level||'yellow';
    if(wanted===level||now-healthCandidateSince>=stableMs)level=wanted;

    const reasons=[];
    if(drumContam>.55)reasons.push('drum bleed');
    if(voiceContam>.60)reasons.push('voice');
    if(onset.score<.52&&onset.total>=4)reasons.push('onset noisy');
    if(tempoEstimate!=null&&tempoConfidence<.52)reasons.push('tempo weak');
    if(barEstimate!=null&&barConfidence<.52)reasons.push('bar weak');
    if(harmonicMatch&&harmonicMatch.margin<HARMONIC_MARGIN_MIN)reasons.push('chord ambiguous');
    if(calibrationProfile&&(calibrationProfile.quality||0)<.45)reasons.push('calibration weak');
    if(!reasons.length)reasons.push(level==='green'?'signals stable':level==='yellow'?'limited confidence':'unsafe confidence');

    const mode=level==='green'?'full-auto':level==='yellow'?'safe-follow':'manual-safe';
    const previousLevel=followHealth.level;
    followHealth={
      score:smoothed,
      raw,
      level,
      mode,
      reason:reasons.slice(0,2).join(' + '),
      components:{
        input:inputScore,
        onset:onset.score,
        tempo:tempoScore,
        bar:barScore,
        harmonic:harmonicScore,
        calibration:calibrationScore,
        signal:signalScore,
        drumContam,
        voiceContam,
        recentAccepted:onset.accepted,
        recentRejected:onset.rejected
      }
    };

    if(level!==previousLevel){
      recordTelemetryEvent('health-change',{from:previousLevel,to:level,score:round(smoothed),reason:followHealth.reason});
      if(
        (level==='red'||(previousLevel==='green'&&level==='yellow')) &&
        typeof api.cancelFollowAutomation==='function'
      ){
        api.cancelFollowAutomation(
          level==='red'
            ? 'Follow Health RED · Manual Safe'
            : 'Follow Health YELLOW · hủy pending Full Auto'
        );
      }
      if(previousLevel==='red'&&level!=='red'&&!calibrationActive){
        const restoredLevel={silent:1,soft:2,medium:3,big:5}[currentState]||3;
        applyIntensity(restoredLevel,currentState);
      }
      lastHealthLevel=level;
    }
  }

  function renderHealth() {
    if(!ui.health)return;
    if(!running){
      ui.health.textContent='OFF';
      ui.healthDetail.textContent='bật Auto Follow để đánh giá';
      return;
    }
    const score=Math.round(clamp(followHealth.score||0,0,1)*100);
    ui.health.textContent=String(followHealth.level||'yellow').toUpperCase()+' '+score+'%';
    const label=followHealth.mode==='full-auto'?'full auto':followHealth.mode==='manual-safe'?'manual safe':'safe follow';
    ui.healthDetail.textContent=label+' · '+(followHealth.reason||'');
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
    if(!healthPermissions().bigFill&&fillStyle==='big')fillStyle='medium';

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
      rejoin:'REJOIN',
      safe:'SAFE'
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
        healthPermissions().rejoin &&
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
      typeof api.requestFollowResume==='function' &&
      healthPermissions().rejoin
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

    if(followHealth.level==='red'){
      transitionPlan={mode:'stay',confidence:followHealth.score,reason:'health red · manual safe'};
      updatePlanCandidate(null,now);
      performanceState={mode:'safe',confidence:followHealth.score,reason:'manual safe · '+followHealth.reason};
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

        if (actionable && healthPermissions().reposition && typeof api.requestHarmonicAnchor==='function') {
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
      const permissions=healthPermissions();
      const healthPlanMin=followHealth.level==='yellow'?Math.max(PLAN_ARM_MIN,.82):PLAN_ARM_MIN;
      const actionable=
        permissions.transition &&
        transitionPlan.confidence>=healthPlanMin &&
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
    if(!healthPermissions().intensity)return;
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
      followHealth:{...followHealth,components:{...(followHealth.components||{})}},
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
      healthPermissions:healthPermissions(),
      autoTune:{
        suggestion:autoTuneSuggestion?{
          sourceLabel:autoTuneSuggestion.sourceLabel,
          confidence:autoTuneSuggestion.confidence,
          marks:autoTuneSuggestion.marks,
          changes:autoTuneSuggestion.changes,
          compare:autoTuneSuggestion.compare
        }:null,
        canUndo:Boolean(autoTuneBackupProfile)
      },
      calibration:{
        active:calibrationActive,
        step:CALIBRATION_STEPS[calibrationStepIndex]?.id||null,
        capturing:calibrationCapturing,
        profile:calibrationProfile
      },
      intentStage,
      lastMusicalActivityAt
    })
  };
})();
