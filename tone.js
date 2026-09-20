(function ToneModule() {
  const api = window.GuitarDrumAPI;
  const core = window.GuitarDrumCore;
  if (!api || !core) return;

  const NOTES_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const NOTES_FLAT = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
  const NOTE_MAP = {C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11};
  const COMMON_KEYS = [7,0,2,9,4];
  const CAPTURE_MS = 8000;
  const ANALYSIS_INTERVAL_MS = 75;

  let refs = null;
  let toneCtx = null, toneStream = null, toneSource = null, toneAnalyser = null, toneBuffer = null;
  let running = false, raf = 0, lastAt = 0, startedAt = 0;
  let histogram = new Array(12).fill(0), voicedFrames = 0, totalFrames = 0;
  let candidateKey = null;
  let applying = false;

  injectStyles();
  const ui = buildUi();
  loadReferences();
  refreshSummary();

  document.querySelector('#songSelect')?.addEventListener('change', () => setTimeout(refreshSummary, 0));
  document.querySelector('#keySelect')?.addEventListener('change', () => {
    if (applying) return;
    const key = Number(document.querySelector('#keySelect').value);
    api.setToneMeta({capo:0,soundingKey:key,shapeKey:key});
    refreshSummary();
  });
  window.addEventListener('pagehide', cleanupAudio);

  async function loadReferences() {
    try {
      const response = await fetch('./tone-references.json');
      if (!response.ok) throw new Error('reference HTTP ' + response.status);
      refs = await response.json();
    } catch (error) {
      console.warn('Tone references unavailable', error);
    }
  }

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .gd-tone-tools{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
      .gd-tone-tools button{min-height:40px;padding:0 10px;color:var(--accent);background:var(--accent-bg);border-color:transparent;font-size:13px}
      .gd-capo-summary{margin-top:7px;color:var(--muted);font-size:12px;line-height:1.35}
      .gd-tone-overlay{position:fixed;inset:0;z-index:60;background:rgba(20,22,24,.38);display:none;align-items:flex-end;justify-content:center;padding:14px}
      .gd-tone-overlay.open{display:flex}
      .gd-tone-panel{width:min(650px,100%);max-height:min(90vh,780px);overflow:auto;background:var(--card);border-radius:22px 22px 16px 16px;padding:18px;box-shadow:0 18px 70px rgba(0,0,0,.22)}
      .gd-tone-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}
      .gd-tone-head h2{font-size:21px;margin:0 0 4px}.gd-tone-head .sub{font-size:14px}
      .gd-tone-close{min-height:38px;width:38px;padding:0;border-radius:50%;font-size:20px}
      .gd-tone-tabs{display:flex;gap:8px;margin:14px 0}.gd-tone-tabs button{flex:1;min-height:40px}.gd-tone-tabs button.active{background:var(--accent-bg);color:var(--accent);border-color:transparent}
      .gd-tone-pane{display:none}.gd-tone-pane.active{display:block}
      .gd-tone-prompt{color:var(--muted);line-height:1.45;margin:8px 0 14px}
      .gd-tone-meter{text-align:center;background:var(--panel);border-radius:16px;padding:16px}
      .gd-tone-note{font-size:54px;font-weight:850;line-height:1;letter-spacing:-.04em}
      .gd-tone-hz{font-size:13px;color:var(--muted);margin-top:6px}
      .gd-tone-cents{height:9px;border-radius:999px;background:#e5e7ea;position:relative;overflow:hidden;margin:16px 12px 2px}
      .gd-tone-cents::before{content:"";position:absolute;left:50%;top:0;bottom:0;width:2px;background:#8d9298}
      .gd-tone-needle{position:absolute;left:50%;top:0;bottom:0;width:8px;border-radius:999px;background:var(--accent);transform:translateX(-50%);transition:left .08s linear}
      .gd-tone-status{display:flex;justify-content:space-between;gap:12px;margin-top:12px;color:var(--muted);font-size:13px}
      .gd-tone-progress{height:8px;background:#e5e7ea;border-radius:999px;overflow:hidden;margin-top:9px}.gd-tone-progress>div{height:100%;width:0;background:var(--accent)}
      .gd-tone-buttons{display:flex;gap:9px;flex-wrap:wrap;margin-top:14px}.gd-tone-buttons button{flex:1 1 auto}
      .gd-tone-result{display:none;margin-top:14px;border-top:1px solid var(--border);padding-top:14px}.gd-tone-result.show{display:block}
      .gd-tone-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .gd-tone-stat{background:var(--panel);border-radius:13px;padding:12px}.gd-tone-stat span{display:block;color:var(--muted);font-size:11px;font-weight:750;margin-bottom:4px}.gd-tone-stat strong{font-size:22px}
      .gd-capo-list{display:grid;gap:9px;margin-top:12px}.gd-capo-option{width:100%;text-align:left;height:auto;min-height:58px;padding:10px 12px;display:flex;justify-content:space-between;gap:12px;align-items:center}
      .gd-capo-option strong{display:block;font-size:17px}.gd-capo-option small{display:block;color:var(--muted);font-weight:600;margin-top:2px}
      .gd-capo-option.recommended{background:var(--accent-bg);border-color:transparent}
      .gd-tone-note-line{font-size:12px;color:var(--muted);line-height:1.5;margin-top:10px}
      @media(max-width:560px){.gd-tone-grid{grid-template-columns:1fr}.gd-tone-tools{grid-template-columns:1fr}.gd-tone-panel{padding:14px}}
    `;
    document.head.appendChild(style);
  }

  function buildUi() {
    const keySelect = document.querySelector('#keySelect');
    const host = keySelect?.parentElement;
    if (!host) return {};

    const tools = document.createElement('div');
    tools.className = 'gd-tone-tools';
    tools.innerHTML = '<button type="button" id="gdToneMic">🎙 Tìm tone giọng</button><button type="button" id="gdCapoSuggest">🎸 Tone + Capo</button>';
    host.appendChild(tools);

    const summary = document.createElement('div');
    summary.className = 'gd-capo-summary';
    summary.id = 'gdCapoSummary';
    host.appendChild(summary);

    const overlay = document.createElement('div');
    overlay.className = 'gd-tone-overlay';
    overlay.id = 'gdToneOverlay';
    overlay.setAttribute('aria-hidden','true');
    overlay.innerHTML = `
      <section class="gd-tone-panel" role="dialog" aria-modal="true" aria-labelledby="gdToneTitle">
        <div class="gd-tone-head">
          <div><h2 id="gdToneTitle">Tone & Capo</h2><div id="gdToneSong" class="sub"></div></div>
          <button type="button" id="gdToneClose" class="gd-tone-close" aria-label="Đóng">×</button>
        </div>
        <div class="gd-tone-tabs">
          <button type="button" id="gdTabMic" class="active">Tìm bằng giọng</button>
          <button type="button" id="gdTabCapo">Gợi ý Capo</button>
        </div>
        <div id="gdPaneMic" class="gd-tone-pane active">
          <p id="gdTonePrompt" class="gd-tone-prompt"></p>
          <div class="gd-tone-meter">
            <div id="gdToneNote" class="gd-tone-note">—</div>
            <div id="gdToneHz" class="gd-tone-hz">Chưa mở microphone</div>
            <div class="gd-tone-cents"><div id="gdToneNeedle" class="gd-tone-needle"></div></div>
          </div>
          <div class="gd-tone-status"><span id="gdToneStatus">Sẵn sàng.</span><span id="gdToneSamples">0 mẫu giọng</span></div>
          <div class="gd-tone-progress"><div id="gdToneProgress"></div></div>
          <div class="gd-tone-buttons">
            <button type="button" id="gdToneStart" class="primary">🎙 Bắt đầu nghe</button>
            <button type="button" id="gdToneAnalyze" disabled>Phân tích ngay</button>
            <button type="button" id="gdToneRetry">Làm lại</button>
          </div>
          <div id="gdToneResult" class="gd-tone-result">
            <div class="gd-tone-grid">
              <div class="gd-tone-stat"><span>Tone giọng</span><strong id="gdDetectedKey">—</strong></div>
              <div class="gd-tone-stat"><span>So với tone gốc</span><strong id="gdDetectedShift">—</strong></div>
              <div class="gd-tone-stat"><span>Độ tin cậy</span><strong id="gdConfidence">—</strong></div>
              <div class="gd-tone-stat"><span>Pitch hợp lệ</span><strong id="gdVoiced">—</strong></div>
            </div>
            <div id="gdCandidates" class="gd-tone-note-line"></div>
            <div id="gdDetectedCapoList" class="gd-capo-list"></div>
          </div>
        </div>
        <div id="gdPaneCapo" class="gd-tone-pane">
          <p id="gdCapoPrompt" class="gd-tone-prompt"></p>
          <div id="gdManualCapoList" class="gd-capo-list"></div>
          <div class="gd-tone-note-line">“Tone nghe” là tone bạn hát. “Hợp âm bấm” là shape hiển thị trên màn hình. Capo nâng shape đó lên đúng tone nghe.</div>
        </div>
      </section>`;
    document.body.appendChild(overlay);

    const $ = s => overlay.querySelector(s);
    const obj = {
      overlay, summary,
      micBtn: tools.querySelector('#gdToneMic'), capoBtn: tools.querySelector('#gdCapoSuggest'),
      close: $('#gdToneClose'), song: $('#gdToneSong'),
      tabMic: $('#gdTabMic'), tabCapo: $('#gdTabCapo'), paneMic: $('#gdPaneMic'), paneCapo: $('#gdPaneCapo'),
      prompt: $('#gdTonePrompt'), note: $('#gdToneNote'), hz: $('#gdToneHz'), needle: $('#gdToneNeedle'),
      status: $('#gdToneStatus'), samples: $('#gdToneSamples'), progress: $('#gdToneProgress'),
      start: $('#gdToneStart'), analyze: $('#gdToneAnalyze'), retry: $('#gdToneRetry'), result: $('#gdToneResult'),
      detectedKey: $('#gdDetectedKey'), detectedShift: $('#gdDetectedShift'), confidence: $('#gdConfidence'),
      voiced: $('#gdVoiced'), candidates: $('#gdCandidates'), detectedCapoList: $('#gdDetectedCapoList'),
      capoPrompt: $('#gdCapoPrompt'), manualCapoList: $('#gdManualCapoList')
    };

    obj.micBtn.addEventListener('click', () => openPanel('mic'));
    obj.capoBtn.addEventListener('click', () => openPanel('capo'));
    obj.close.addEventListener('click', closePanel);
    obj.overlay.addEventListener('click', e => { if (e.target === obj.overlay) closePanel(); });
    obj.tabMic.addEventListener('click', () => switchTab('mic'));
    obj.tabCapo.addEventListener('click', () => switchTab('capo'));
    obj.start.addEventListener('click', startListening);
    obj.analyze.addEventListener('click', finishListening);
    obj.retry.addEventListener('click', () => { cleanupAudio(); resetCapture(); });
    return obj;
  }

  function currentRef() {
    const song = api.getCurrentSong();
    return refs?.songs?.[song.id] || null;
  }
  function noteNames(song) { return song.preferFlats ? NOTES_FLAT : NOTES_SHARP; }
  function noteName(pc, song = api.getCurrentSong()) { return noteNames(song)[(pc + 12) % 12]; }
  function signedShift(v) { return ((v + 6) % 12) - 6; }
  function formatShift(v) { const s = signedShift(v); return s === 0 ? '0 semitone' : (s > 0 ? '+' : '') + s + ' semitone'; }

  function switchTab(which) {
    const mic = which === 'mic';
    ui.tabMic.classList.toggle('active', mic); ui.tabCapo.classList.toggle('active', !mic);
    ui.paneMic.classList.toggle('active', mic); ui.paneCapo.classList.toggle('active', !mic);
    if (!mic) renderManualCapo();
  }

  function openPanel(which) {
    api.stopPlayback();
    cleanupAudio(); resetCapture();
    const song = api.getCurrentSong(), ref = currentRef();
    ui.song.textContent = song.title + ' · ' + song.artist + ' · tone gốc ' + noteName(song.baseKey, song);
    ui.prompt.textContent = (ref?.prompt || 'Hát một đoạn quen thuộc của bài.') + ' Hát theo tone tự nhiên của bạn khoảng 8 giây.';
    ui.overlay.classList.add('open'); ui.overlay.setAttribute('aria-hidden','false');
    switchTab(which);
  }
  function closePanel() { cleanupAudio(); ui.overlay.classList.remove('open'); ui.overlay.setAttribute('aria-hidden','true'); refreshSummary(); }

  function refreshSummary() {
    if (!ui.summary) return;
    const song = api.getCurrentSong(), meta = api.getToneMeta();
    const capo = Number(meta.capo || 0);
    const soundingKey = meta.soundingKey != null ? Number(meta.soundingKey) : api.getCurrentKey();
    const shapeKey = meta.shapeKey != null ? Number(meta.shapeKey) : api.getCurrentKey();
    ui.summary.textContent = capo > 0
      ? 'Tone nghe: ' + noteName(soundingKey, song) + ' · Hợp âm bấm: ' + noteName(shapeKey, song) + ' · Capo ' + capo
      : 'Không capo · Tone/hợp âm: ' + noteName(api.getCurrentKey(), song);
  }

  function resetCapture() {
    histogram = new Array(12).fill(0); voicedFrames = 0; totalFrames = 0; candidateKey = null;
    ui.note.textContent = '—'; ui.hz.textContent = 'Chưa mở microphone'; ui.needle.style.left = '50%';
    ui.samples.textContent = '0 mẫu giọng'; ui.progress.style.width = '0%'; ui.status.textContent = 'Sẵn sàng.';
    ui.result.classList.remove('show'); ui.detectedCapoList.innerHTML = '';
  }

  function rmsOf(buf) { let sum = 0; for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]; return Math.sqrt(sum / buf.length); }
  function autoCorrelate(buf, sampleRate) {
    const rms = rmsOf(buf); if (rms < 0.012) return null;
    let mean = 0; for (let i = 0; i < buf.length; i++) mean += buf[i]; mean /= buf.length;
    const minLag = Math.max(2, Math.floor(sampleRate / 1000)), maxLag = Math.min(Math.floor(sampleRate / 80), Math.floor(buf.length / 2));
    let bestLag = -1, bestCorr = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let sum = 0, normA = 0, normB = 0; const limit = buf.length - lag;
      for (let i = 0; i < limit; i++) { const a = buf[i] - mean, b = buf[i + lag] - mean; sum += a * b; normA += a * a; normB += b * b; }
      const corr = sum / Math.sqrt((normA * normB) || 1); if (corr > bestCorr) { bestCorr = corr; bestLag = lag; }
    }
    if (bestLag < 0 || bestCorr < 0.62) return null;
    const freq = sampleRate / bestLag; if (!Number.isFinite(freq) || freq < 80 || freq > 1000) return null;
    return {freq, confidence: bestCorr, rms};
  }
  function freqToMidi(freq) { return 69 + 12 * Math.log2(freq / 440); }
  function pushPitch(freq, quality) {
    const song = api.getCurrentSong(), midi = freqToMidi(freq), rounded = Math.round(midi), cents = (midi - rounded) * 100, pc = ((rounded % 12) + 12) % 12;
    const weight = Math.max(0.1, quality.confidence) * Math.max(0.2, Math.min(1, quality.rms / 0.08));
    histogram[pc] += weight; voicedFrames++;
    ui.note.textContent = noteName(pc, song) + Math.floor(rounded / 12 - 1);
    ui.hz.textContent = freq.toFixed(1) + ' Hz · ' + (cents >= 0 ? '+' : '') + cents.toFixed(0) + ' cents';
    ui.needle.style.left = Math.max(0, Math.min(100, 50 + cents)) + '%'; ui.samples.textContent = voicedFrames + ' mẫu giọng';
  }
  function pearson(obs, ref, offset) {
    let mo = 0, mr = 0; for (let pc = 0; pc < 12; pc++) { mo += obs[pc]; mr += ref[(pc - offset + 12) % 12]; } mo /= 12; mr /= 12;
    let num = 0, do2 = 0, dr2 = 0;
    for (let pc = 0; pc < 12; pc++) { const a = obs[pc] - mo, b = ref[(pc - offset + 12) % 12] - mr; num += a * b; do2 += a * a; dr2 += b * b; }
    return num / Math.sqrt((do2 * dr2) || 1);
  }
  function analyzeCapture() {
    const song = api.getCurrentSong(), ref = currentRef();
    if (!ref) { ui.status.textContent = 'Chưa có reference cho bài này.'; return null; }
    if (voicedFrames < 18) { ui.status.textContent = 'Chưa đủ giọng rõ. Hãy hát to và liền câu hơn.'; return null; }
    const total = histogram.reduce((a,b) => a + b, 0) || 1, obs = histogram.map(v => v / total), ranked = [];
    for (let offset = 0; offset < 12; offset++) ranked.push({offset, score:pearson(obs, ref.profile, offset), key:(song.baseKey + offset) % 12});
    ranked.sort((a,b) => b.score - a.score);
    const best = ranked[0], second = ranked[1], coverage = Math.min(1, voicedFrames / 55);
    const margin = Math.max(0, Math.min(1, (best.score - second.score) * 2.5)), absolute = Math.max(0, Math.min(1, (best.score + 0.2) / 1.2));
    return {best, ranked, confidence:Math.round(100 * (0.35 * coverage + 0.45 * margin + 0.20 * absolute))};
  }
  function showResult(result) {
    const song = api.getCurrentSong(); candidateKey = result.best.key;
    ui.detectedKey.textContent = noteName(candidateKey, song); ui.detectedShift.textContent = formatShift(result.best.offset);
    ui.confidence.textContent = result.confidence + '%'; ui.voiced.textContent = voicedFrames + ' frames';
    ui.candidates.textContent = 'Ứng viên gần nhất: ' + result.ranked.slice(0,3).map(x => noteName(x.key, song) + ' (' + formatShift(x.offset) + ')').join(' · ');
    renderCapoOptions(ui.detectedCapoList, candidateKey); ui.result.classList.add('show');
  }
  function frame(ts) {
    if (!running) return; raf = requestAnimationFrame(frame);
    const elapsed = performance.now() - startedAt; ui.progress.style.width = Math.min(100, elapsed / CAPTURE_MS * 100) + '%';
    ui.status.textContent = 'Đang nghe… ' + Math.max(0, Math.ceil((CAPTURE_MS - elapsed) / 1000)) + 's';
    if (ts - lastAt >= ANALYSIS_INTERVAL_MS) { lastAt = ts; totalFrames++; toneAnalyser.getFloatTimeDomainData(toneBuffer); const pitch = autoCorrelate(toneBuffer, toneCtx.sampleRate); if (pitch) pushPitch(pitch.freq, pitch); }
    if (elapsed >= CAPTURE_MS) finishListening();
  }
  async function startListening() {
    cleanupAudio(); resetCapture();
    if (!navigator.mediaDevices?.getUserMedia) { ui.status.textContent = 'Trình duyệt này không hỗ trợ microphone.'; return; }
    try {
      toneStream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false});
      const AC = window.AudioContext || window.webkitAudioContext; toneCtx = new AC(); if (toneCtx.state === 'suspended') await toneCtx.resume();
      toneSource = toneCtx.createMediaStreamSource(toneStream); toneAnalyser = toneCtx.createAnalyser(); toneAnalyser.fftSize = 2048; toneAnalyser.smoothingTimeConstant = 0;
      toneBuffer = new Float32Array(toneAnalyser.fftSize); toneSource.connect(toneAnalyser);
      running = true; startedAt = performance.now(); lastAt = 0; ui.start.disabled = true; ui.analyze.disabled = false; ui.hz.textContent = 'Hãy bắt đầu hát'; raf = requestAnimationFrame(frame);
    } catch (error) { ui.status.textContent = 'Không mở được microphone. Kiểm tra quyền mic trong Safari.'; ui.hz.textContent = error?.message || String(error); cleanupAudio(); }
  }
  function cleanupAudio() {
    running = false; if (raf) cancelAnimationFrame(raf); raf = 0;
    if (toneStream) { toneStream.getTracks().forEach(t => t.stop()); toneStream = null; }
    if (toneCtx) { toneCtx.close().catch(() => {}); toneCtx = null; }
    toneSource = null; toneAnalyser = null; toneBuffer = null;
    if (ui.start) ui.start.disabled = false; if (ui.analyze) ui.analyze.disabled = true;
  }
  function finishListening() {
    if (!running) return; cleanupAudio(); ui.progress.style.width = '100%';
    const result = analyzeCapture(); if (result) { ui.status.textContent = 'Đã phân tích xong.'; showResult(result); }
  }

  function renderManualCapo() {
    const song = api.getCurrentSong(), meta = api.getToneMeta();
    const targetKey = meta.soundingKey != null ? Number(meta.soundingKey) : api.getCurrentKey();
    ui.capoPrompt.textContent = 'Tone nghe hiện tại: ' + noteName(targetKey, song) + '. Chọn cách bấm trực tiếp hoặc dùng capo để đưa hợp âm về các tone guitar phổ biến.';
    renderCapoOptions(ui.manualCapoList, targetKey);
  }
  function collectChords(song) {
    const set = new Set();
    song.rows.forEach(row => row[2].forEach(v => {
      if (/^[A-G](?:#|b)?(?:m|maj|dim|aug|sus|add)?\d*(?:b5|#5|b9|#9|11|13)?(?:\/[A-G](?:#|b)?)?$/.test(v)) set.add(v);
    }));
    return [...set];
  }
  function transposeChord(chord, shift, preferFlats) { return core.transposeChord(chord,shift,preferFlats); }
  function chordDifficulty(chord) { return core.chordDifficulty(chord); }
  function capoOptions(targetKey) { return core.capoOptions(api.getCurrentSong(),targetKey); }
  function renderCapoOptions(container, targetKey) {
    const song = api.getCurrentSong(), opts = capoOptions(targetKey); container.innerHTML = '';
    opts.forEach((opt, index) => {
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'gd-capo-option' + (index === 0 ? ' recommended' : '');
      const label = opt.capo === 0 ? 'Bấm trực tiếp ' + noteName(opt.shapeKey, song) : 'Bấm ' + noteName(opt.shapeKey, song) + ' + Capo ' + opt.capo;
      const detail = opt.capo === 0 ? 'Không capo · tone nghe ' + noteName(targetKey, song) : 'Tone nghe ' + noteName(targetKey, song) + ' · hợp âm hiển thị theo ' + noteName(opt.shapeKey, song);
      btn.innerHTML = '<span><strong>' + escapeHtml(label) + '</strong><small>' + escapeHtml(detail) + '</small></span><span>' + (index === 0 ? 'Đề xuất' : 'Chọn') + '</span>';
      btn.addEventListener('click', () => applyCapoOption(opt)); container.appendChild(btn);
    });
  }
  function applyCapoOption(opt) {
    const song = api.getCurrentSong(); applying = true; api.applyChordKey(opt.shapeKey); api.setToneMeta({capo:opt.capo,soundingKey:opt.targetKey,shapeKey:opt.shapeKey}); applying = false;
    refreshSummary(); closePanel();
    api.setStatus(opt.capo > 0 ? 'Tone ' + noteName(opt.targetKey, song) + ' · bấm ' + noteName(opt.shapeKey, song) + ' · Capo ' + opt.capo + '.' : 'Tone ' + noteName(opt.targetKey, song) + ' · không capo.');
  }
  function escapeHtml(value) { return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
})();
