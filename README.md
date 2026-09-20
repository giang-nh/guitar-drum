# Guitar Drum

iPad-first static PWA for guitar practice with lyric/chord display and simple synchronized drum accompaniment.

## Product scope

**PWA ưu tiên iPad cho việc tập guitar: hiển thị lời+hợp âm, transpose tone, chỉnh BPM, chạy drum 4/4 đồng bộ theo từng dòng, và hỗ trợ quy trình nhập bài hát từ ảnh/OneNote qua agent — không cần backend ở giai đoạn hiện tại.**

## For AI agents / handoff

If you are ChatGPT, Codex, Claude, Gemini, or another coding agent, **read [AGENTS.md](./AGENTS.md) first**.

Canonical project context:

- [PRODUCT_REQUIREMENTS.md](./PRODUCT_REQUIREMENTS.md) — original need, product definition, scope, in/out of scope.
- [ARCHITECTURE.md](./ARCHITECTURE.md) — current technical architecture and constraints.
- [PROJECT_REQUIREMENTS.md](./PROJECT_REQUIREMENTS.md) — detailed functional requirements.
- [STATUS.md](./STATUS.md) — current implementation and next work.
- [DECISIONS.md](./DECISIONS.md) — durable product/technical decisions.

The repository is intended to contain enough context that a new agent can continue the project without access to the original chat history.

## Current prototype

- Song picker
- Songs: Nàng Thơ, Quê Xa, Giấc Mơ Tình Yêu
- Tone transposition
- Tempo control
- 4-beat visual indicator
- Web Audio drum accompaniment
- Count-in
- Click/tap any lyric/chord line to jump there
- Play from selected line
- Play/Pause/Stop
- 5-line focus view / Show all
- Line numbering and current-line highlight
- Per-song local persistence
- PWA-style install support
- Integrated vocal tone detection for the 3 current songs
- Tone + Capo recommendations that favor common guitar chord shapes
- Microphone **Follow guitar** POC: listens to acoustic-guitar energy, follows tempo/bar phase, predicts sections, matches chord sequences to song position, uses a central **Sensor Fusion / PerformanceState**, handles stop/resume intent, includes a **Predictive Transition Planner**, renders through a **Humanization / Performance Layer**, and now adds **Clean mic** rejection using self-drum timing + spectral/transient evidence to reduce drum-speaker bleed and vocal-triggered false onsets/chords

## Cách sử dụng app

### Chơi nhanh

1. Chọn bài hát.
2. Chọn **Tone**; nếu chưa biết tone phù hợp, dùng **🎙 Tìm tone giọng**. Dùng **🎸 Tone + Capo** để chọn chord shape dễ bấm và capo phù hợp.
3. Chạm vào dòng lời/hợp âm muốn bắt đầu. Dùng **Show all** khi muốn xem toàn bài.
4. Chỉnh **Tempo**, **Intensity 1–5** và **Human feel** nếu muốn.
5. Nếu muốn drummer nghe cách bạn đang đàn, bật **🎙 Auto Follow** và cho phép microphone.
6. Bấm **▶ Play**, nghe count-in 1–2–3–4 rồi chơi. Pause giữ vị trí; Stop đưa bài về đầu.

### Auto Follow

Ở **Playing Mode**, app giữ giao diện gọn và chỉ hiện summary quan trọng. Khi Auto Follow chạy, drummer có thể phản ứng theo dynamics và, khi evidence đủ ổn định, follow BPM, beat 1, section và chuỗi hợp âm. Phrase-aware drummer dùng vị trí P x/y để build/relax theo phrase. Khi người chơi ngừng, hệ thống có thể chuyển qua THIN → HOLD và chờ REJOIN ở beat 1.

Bấm **Developer** để mở các tùy chọn nâng cao:

- **Follow BPM** — kéo tempo dần theo strum ổn định.
- **Sync beat 1** — re-phase bar khi downbeat đủ chắc.
- **Follow section** — dự đoán section kế tiếp và chuẩn bị transition/fill.
- **Follow chords** — dùng chord sequence để xác nhận/re-anchor vị trí; progression mơ hồ không tự nhảy.
- **Clean mic** — giảm drum-speaker bleed và voice-triggered false positives.
- **Follow Health** — GREEN = Full Auto, YELLOW = Safe Follow, RED = Manual Safe; Health tự chặn action rủi ro khi tín hiệu kém.

### Tuning microphone / diagnostics

Trong Developer Mode:

- **Mic Calibration**: Quiet → Drum only → Guitar only → Voice only → Full mix.
- **Record debug → Mark → Export JSON** để ghi telemetry/state của một buổi test; không ghi audio.
- **Analyze marks / Import JSON** để tạo Auto‑Tune suggestion. Chỉ **Apply suggestion** khi muốn áp dụng; có **Undo tune**.
- **Load regression sessions → Replay suite** để kiểm tra suggestion trên các session cũ; Apply có thể bị block nếu có regression đáng kể.

Nếu Auto Follow chưa ổn, giữ **Clean mic** ON, đặt iPad để mic nghe guitar rõ nhưng không quá sát loa, chạy Calibration, và nhìn Health. Nếu app xác định sai vị trí bài, chạm vào đúng dòng — thao tác tay ưu tiên hơn pending AI transition. Khi dùng **Tìm tone giọng**, Auto Follow sẽ tạm dừng vì hai tính năng cùng cần microphone.

## Architecture summary

- Static HTML/CSS/JavaScript
- No framework
- No backend
- No database
- Song data currently embedded in `index.html`
- Web Audio for drum synthesis
- `guitar-follow.js` for optional microphone-driven drummer intensity following
- `localStorage` for device-local state
- GitHub Pages for deployment

See [ARCHITECTURE.md](./ARCHITECTURE.md) before making structural changes.

## Publish with GitHub Pages

1. Open **Settings → Pages**.
2. Under **Build and deployment**, choose the repository's configured Pages workflow/branch.
3. The production site is normally available at:
   `https://giang-nh.github.io/guitar-drum/`

On iPad: open the site in Safari → Share → Add to Home Screen.

Deployment workflow is configured in `.github/workflows/pages.yml`.

The main app now includes **Tìm tone giọng** and **Tone + Capo** controls. Per-song prebuilt reference data lives in `tone-references.json`.

- **Debug Session / Telemetry Recorder**: local-only recorder for iPad tuning; samples Follow state roughly 4x/sec, records state changes/marks, and exports a JSON session via iOS Share sheet or download. It does not record audio.

- **Mic Calibration Mode**: guided 5-step local wizard (`Quiet → Drum only → Guitar only → Voice only → Full mix`) that learns device-specific Clean Mic/onset/chord thresholds and a bounded sensitivity recommendation; low-quality calibration blends back toward safe defaults instead of replacing them aggressively.

- **Follow Health / Fail-safe Mode**: aggregates mic contamination, recent onset acceptance, tempo/bar confidence, harmonic ambiguity and calibration quality into `GREEN / YELLOW / RED`. GREEN enables Full Auto, YELLOW keeps Safe Follow with no harmonic re-position and no big fills, RED switches to Manual Safe and blocks risky automation while still allowing silence→THIN/HOLD safety behavior.

- **Auto-Tune Engine / Profile Suggestions**: analyzes local debug sessions and `Mark` windows, infers directional failure patterns (drum/voice false positives, guitar over-rejection/under-detection, harmonic ambiguity), proposes bounded Mic Profile threshold changes with before→after estimates, imports prior debug JSON, requires explicit Apply, and supports persistent Undo. Suggestions are safety-blocked if estimated guitar retention drops too much or contamination pass gets worse.

- **Replay / Regression Test Harness**: load multiple exported debug JSON sessions as a regression suite, replay current vs proposed threshold decisions over stored derived features, compare guitar retention / contamination pass / marked-case score / action-risk proxy, and hard-block Auto-Tune Apply when any historical session materially regresses. Debug v27 adds onset-rise/required-threshold telemetry for higher-fidelity future replay.

- **Performance Polish v2**: contextual groove renderer uses section pattern, Intensity, Human feel, live guitar energy and Follow Health to vary kick placement, hat openness, ride/bell articulation, rim/side-stick use and ghost-note density. Fill motifs now respond to the target section (Chorus/Bridge/Outro), while transport timing and beat-1 anchors remain unchanged.

- **Phrase-aware Drummer v1**: derives 4/8-bar phrase position from the existing song/section map and feeds `P x/y`, phrase progress, section occurrence, and beats-to-phrase-end into the performance renderer and transition planner. Groove density/build/open-hat/ghost/extra-kick behavior now arcs through the phrase; Chorus repeats can lift subtly, Outro decays across the section, and deterministic mini-turns can happen at phrase ends without changing transport or replacing full predictive fills.


## Automated tests

Run the dependency-free logic suite with:

```bash
node tests/run-tests.cjs
```

Current baseline: **105 cases / 105 PASS / 0 FAIL**. The suite exercises deterministic production helpers from `tone.js`, `guitar-follow.js`, and `index.html`. GitHub Actions also runs it automatically on pushes to `main` and pull requests.

This suite does not replace real-device validation for microphone input, speaker bleed, Web Audio timing, or iPad/Safari interaction.

- **Playing Mode + Developer Mode**: the Follow panel now defaults to a compact performance surface with Auto Follow, Health, section/phrase and Plan summary. Detailed meter/stats, sensitivity, detector toggles, Calibration, Debug, Auto-Tune and Regression remain available behind a persistent `Developer` toggle. The compact summary stays synced even when Auto Follow is off.

- **Automated Test Harness**: dependency-free Node tests exercise shared runtime core logic (phrase mapping, Health permissions, section-transition/rejoin guards, Tone/Capo transpose/scoring, replay threshold decisions and regression blockers) plus integration/source contracts for song data, PWA assets, Playing/Developer wiring and debug/cache versions. GitHub Pages deploy now requires the test job to pass first.
