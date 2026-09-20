# Status — Guitar Drum

_Updated 2026-09-20._

## Current implementation

Prototype hiện đã có:

- iPad-friendly responsive UI;
- in-app **Hướng dẫn** đã cập nhật theo runtime mới: quick-play 6 bước, Tone/Capo, Playing/Developer Mode, Auto Follow (BPM/beat-1/section/chords), Phrase-aware/Stop-Resume/Predictive Plan, Follow Health, Clean Mic, Mic Calibration, Debug/Auto-Tune/Regression và troubleshooting;
- song picker;
- 3 bài:
  - Nàng Thơ — Hoàng Dũng;
  - Quê Xa — Quang Dũng;
  - Giấc Mơ Tình Yêu — Mỹ Tâm;
- chord transposition;
- key selector;
- BPM slider;
- 4-beat visual indicator;
- section-aware Web Audio drummer với kick/snare/closed-open hi-hat/tom/crash;
- per-song drum style và per-section arrangement cho 3 bài hiện tại;
- Nàng Thơ có build riêng qua Intro → Verse → Tiền ĐK → Chorus → Interlude → Final;
- Quê Xa giữ Soft Ballad và tăng lực dần giữa các Verse/Điệp khúc;
- Giấc Mơ Tình Yêu chuyển từ verse mềm sang full ballad ở Điệp khúc và half-time ở Bridge;
- Intensity 1–5;
- queued Fill thủ công ở đầu ô nhịp kế tiếp;
- auto-fill 4 beat trước Chorus/cao trào đã đánh dấu;
- transition accent khi đổi section không dùng fill;
- 4-beat count-in;
- Play/Pause/Stop;
- click/tap row to jump;
- Play từ selected row;
- current-line highlight;
- five-line focus mode;
- Show all mode;
- line numbering;
- per-song local state persistence;
- PWA manifest/service worker;
- GitHub Pages deployment setup;
- integrated **Tone & Capo** tools in the main UI for all 3 current songs: microphone pitch tracking, per-song prebuilt reference profiles, detected singing key, and easy guitar-shape + capo recommendations;
- standalone `tone-poc.html` remains as an earlier experiment.
- **Auto Follow guitar POC** in `guitar-follow.js`: microphone RMS/energy tracking, adaptive calibration, smoothing/hysteresis, `silent / soft / medium / big` states, live debug meter and automatic drummer Intensity mapping;
- **Tempo Follow POC**: recent strum onsets → robust tempo estimate + confidence → stable-candidate gate → gradual 1-BPM steering of the existing tempo control; can be disabled independently while keeping dynamics follow;
- **Beat-1 / Bar Sync POC**: folds recent onset accents onto a 4/4 grid, requires a high-confidence downbeat phase that remains stable for several seconds, then only performs a small timing nudge/re-index of the next unscheduled beat; exposes `learning / stable / synced` debug state;
- **Section Follow POC**: reads the known section timeline, compares recent guitar energy to a longer baseline, combines proximity + arrangement gain + bar/tempo confidence, and can arm a one-bar fill followed by an early anchor to the next high-energy section; manual jump/Fill cancels the pending AI transition;
- **Harmonic Position POC**: 4096-point FFT → 12-bin chroma near strum onsets → expected-chord template scoring in the current sounding key/capo → stable chord events → 3–5 chord sequence matching against the known row/chord timeline; repeated/ambiguous progressions are surfaced but do not auto-reposition;
- **Sensor Fusion / Follow v2**: central `PerformanceState` combines tempo, bar/downbeat, dynamics, section prediction and harmonic candidates; individual detectors no longer directly change song position. Fusion alone can request section fill/transition or harmonic re-anchor, with stable-candidate and shared cooldown gates;
- **Stop / Resume Intent POC**: no reliable strum activity for ~1.7 s → `THIN`; ~3.8 s → queue `HOLD` on beat 1 and freeze song position; new playing → clear/study fresh tempo+bar evidence, align the silent clock to detected downbeat, then `REJOIN` on beat 1;
- **Predictive Transition Planner POC**: stable section/chord/bar evidence can arm a transition before the final bar; the engine keeps playing the current groove until the last 4 beats, then selects `small/medium/big` fill intensity plus one of three non-repeating variants and lands on the next section beat 1;
- **Humanization / Performance Layer**: per-hit deterministic microtiming + velocity variation, protected beat-1 timing, snare layback, hi-hat articulation, subtle timbre variation, context-aware ghost notes, and reduced humanization strength inside fills. `Human feel` slider (0–100%, default 55%) persists per song;
- **Clean Mic / Bleed Rejection POC**: drum engine publishes scheduled self-hit metadata; mic analysis computes spectral flux/flatness/band ratios, estimates per-frame self-drum contamination and voice-like input, adaptively gates onsets/dynamics/chord frames, and exposes `GUITAR / VOICE / DRUM / MIX` debug plus accepted/rejected onset counts. This is heuristic rejection, not source separation;
- **Debug Session / Telemetry Recorder**: local-only `Record / Mark / Export JSON` workflow; ~4 Hz bounded samples + state-change events capture mic/tempo/bar/chord/section/fusion/plan/transport metrics without storing audio, enabling real iPad sessions to be analyzed later;
- **Mic Calibration Mode**: 5-step guided local calibration learns device/placement-specific mic rejection thresholds and sensitivity. Low-quality calibration automatically blends toward defaults; profile is persisted and included in debug export;
- **Follow Health / Fail-safe Mode**: smoothed detector-health score drives `GREEN Full Auto / YELLOW Safe Follow / RED Manual Safe`; risky permissions are gated centrally, pending AI anchors are cancelled on downgrade, YELLOW disables harmonic re-position and big fills, RED freezes risky automation while preserving THIN/HOLD safety;
- **Auto-Tune Engine / Profile Suggestions**: current or imported debug JSON + user Marks → directional failure classification → bounded Mic Profile suggestions → estimated before/after guitar retention and contamination pass → explicit Apply/Undo. Harmonic ambiguity is not mis-treated as a mic-threshold problem; unsafe comparisons disable Apply;
- **Replay / Regression Test Harness**: import up to 12 historical debug sessions, replay current vs proposed mic thresholds on stored telemetry, compare guitar retention / contamination leakage / marked-case score / action-risk proxy, and block Auto-Tune Apply when any old session regresses. v27 adds onset decision telemetry for higher-fidelity future replay;
- **Performance Polish v2**: contextual deterministic groove rendering from section + Intensity + Human feel + guitar energy + Health; new ride/bell + rim voices, contextual kick/hat/ghost density, destination-aware fills and section-turn flourishes. Clean Mic knows the new voices; slow-tempo HOLD re-entry now supports up to 5.2 s alignment;
- **Phrase-aware Drummer v1**: section maps are automatically segmented into 4/8-bar phrases; renderer gets phrase position/progress/section occurrence, builds density gradually through a phrase, lifts later Chorus passes modestly, decays Outro, and adds deterministic mini-turns only at safe phrase endings. Predictive Planner now uses phrase-end alignment as additional evidence and exposes `P x/y` diagnostics;\n- **Automated logic tests**: dependency-free Node harness in `tests/run-tests.cjs` extracts and executes production helper functions from `tone.js`, `guitar-follow.js`, and `index.html`. Initial suite: **105 cases / 105 PASS / 0 FAIL** covering tone/chord transposition, capo ranking invariants, tempo normalization, phase math, harmonic chord classification, threshold bounds, Follow Health states, chord parsing, and section classification. `.github/workflows/tests.yml` runs the suite on every push to `main` and pull request;

## Current data model

Song data đang embedded trong `index.html`, object `songs`.

Timing theo từng dòng dùng manual beat count.

## Current import process

### Screenshots

Workflow đã chốt:

1. user gửi nhiều ảnh;
2. agent chỉ nhận;
3. user nói “làm”;
4. agent xử lý tất cả ảnh của batch;
5. chuẩn hóa thành song data;
6. cập nhật repo.

### OneNote

Mục tiêu là để agent dùng connector Microsoft/OneNote nếu môi trường hỗ trợ, đọc toàn bộ page và chuyển thành song data.

Điểm quan trọng: đây hiện là **agent workflow**, chưa phải feature chạy trong web app.

## Immediate next work

Ưu tiên tiếp theo:

- test integrated vocal tone detection on real iPad/Safari voices; current references are `harmonic-profile-v1`, so the next accuracy upgrade is true per-song/per-phrase melody references from trusted audio/MIDI;

- test Auto Follow trên iPad khi vừa quạt acoustic vừa phát drum bằng loa; tune sensitivity/echo cancellation và ngưỡng state để tránh drum tự kích mic;
- sau khi intensity follow ổn, thêm beat/onset tracking để ước lượng tempo drift rồi mới nghiên cứu song-position/section following;

- nhập thêm bài hát từ nguồn của người dùng;
- kiểm tra độ chính xác lời/hợp âm;
- tinh chỉnh beat count cho playback;
- test cảm giác drummer trên iPad khi vừa đàn acoustic vừa hát, đặc biệt auto-fill vào Chorus, mức Intensity và balance giữa Verse/Chorus;
- cải thiện workflow import OneNote khi connector phù hợp có sẵn;
- chỉ refactor code khi complexity thực sự cản trở việc thêm/chỉnh bài.

## Known limitations

- automated logic tests now cover deterministic/pure logic; current baseline is **105/105 PASS**. Real microphone/audio/iPad behavior still requires device tests;
- song data và app logic cùng nằm trong `index.html`;
- beat timing là thủ công;
- drummer hiện có arrangement thủ công riêng cho 3 bài; mic follow đã có **Intensity + Tempo + Beat-1 + Section Follow v1 + Harmonic Position POC**. Chord recognition vẫn là heuristic chroma/template matching và cần tune trên guitar/iPad thật;
- không có cloud sync;
- không có in-app editor;
- không có in-app OneNote integration;
- vocal tone detection currently uses prebuilt harmonic pitch-class profiles (`tone-references.json`), not true melody phrase matching, so nearby-key ambiguity can still occur.

- test **Stop / Resume Intent** on iPad with intentional rests: short break should thin only, long break should freeze line/song position, and re-entry should not occur until a fresh beat-1 lock is visible;
- verify drum-speaker bleed does not continuously refresh guitar activity; if it does, tune onset/energy gate before making stop intent default-on for production.

- test **Predictive Transition Planner** with gradual build vs one-off loud strum: gradual build should show `BUILD → ARMED → FILL`, while a transient spike should return to `STAY` without queueing;
- verify the planned fill starts only in the final bar before the target section and that repeated transitions rotate fill variants rather than replaying the same pattern.

- test **Human feel** A/B at 0%, 55%, and ~85% on iPad speakers/headphones: groove should loosen audibly while beat 1, tempo follow and section landings remain stable;
- listen specifically for ghost-snare overload or hi-hat timing feeling sloppy at high Human feel; tune ranges before enabling more performance complexity.

- test **Clean mic** with three scenarios on the actual iPad: (1) drum playing with no guitar, (2) singing only, (3) guitar + vocal + drum together. Drum-only should stop creating steady strum/onset evidence; singing-only should rarely create stable chord events; real guitar strums on kick/snare beats must still pass often enough to keep tempo lock.
- A/B `Clean mic` ON/OFF and record `Input` class plus accepted/rejected counts; tune penalty/voice thresholds only from real-device behavior because speaker/mic latency and frequency response are device-specific.

- run at least one **debug session** per key scenario (drum-only, singing-only, guitar-only, full guitar+vocal+drum, stop/rejoin, Verse→Chorus build). Tap `Mark` whenever the app visibly/hearably makes a wrong decision, then export JSON for threshold analysis.

- run **Mic Calibration** once with the actual iPad placement/volume, then run a debug session with the same setup. Compare calibration quality and `Input`/onset behavior before changing hard-coded defaults.

- test **Follow Health** deliberately under clean guitar, drum-only bleed, singing-only, full mix and ambiguous chord progressions. Confirm GREEN only appears on stable evidence, YELLOW still feels useful but conservative, and RED never re-positions/fills/syncs unexpectedly.
- specifically test downgrade while a predictive plan is ARMED: GREEN→YELLOW/RED must cancel the pending anchor; if the fill has already begun it may finish but must not jump song position afterward.

- test **Auto-Tune** with at least 2–3 marked failures of the same type, then compare the suggestion and run a fresh debug session after Apply. Use Undo if guitar retention/tempo lock visibly worsens despite the offline estimate.
- import an older exported debug JSON and verify Auto-Tune handles missing newer telemetry fields (for example `transient`/Health) conservatively rather than failing.

- test **Regression suite** with at least 3 different scenarios (clean guitar, drum/voice contamination, full mix). Create a new Auto-Tune suggestion and verify every loaded session replays automatically; Apply must be blocked if any session crosses a regression threshold.
- verify an older v25/v26 JSON without onset-rise fields still imports and replays via fallback rather than crashing.

- test **Performance Polish v2** A/B with Human feel 0% / 55% / 85% across Verse, build/Pre, Chorus, Interlude and Outro. Listen for clear section character without audible timing drift or over-busy ghost/extra-kick behavior.
- test Clean Mic with ride/rim-heavy sections and verify the new self-hit voices do not inflate Strum/onset evidence. Also test HOLD→REJOIN at 50 BPM from awkward bar phases to validate the 5.2 s alignment ceiling.

- test **Phrase-aware Drummer** on sections of 4, 8, 12+ bars: `P x/y` should reset at phrase boundaries, later bars should build subtly rather than jump, and mini-turns must not fire on top of predictive/full fills or actual section-turn flourishes.
- compare Chorus occurrence 1 vs 2 and an Outro from start→end; the repeat lift/decay should be audible but modest. Verify Plan diagnostics show phrase position and that phrase alignment only nudges confidence rather than forcing a transition.

- test **Playing Mode** on iPad with Auto Follow both ON and OFF. The compact summary must keep section/phrase position in sync during playback, while Developer toggle should reveal/hide diagnostics without resetting Follow state or transport.
- verify a fresh install defaults to Playing Mode; after explicitly enabling Developer Mode, reload should preserve that preference.

- CI test gate is now mandatory before Pages deploy. When extending phrase, Health, transition guards, Tone/Capo or regression safety, add/adjust a core unit test in the same change rather than relying only on source-contract checks.
- browser/WebAudio behavior is intentionally not claimed as fully automated yet; real iPad/Safari sessions remain required for microphone latency, speaker bleed, audible groove feel and permission UX.
