# Status — Guitar Drum

_Updated 2026-09-20._

## Current implementation

Prototype hiện đã có:

- iPad-friendly responsive UI;
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

- chưa có automated tests;
- song data và app logic cùng nằm trong `index.html`;
- beat timing là thủ công;
- drummer hiện có arrangement thủ công riêng cho 3 bài; mic follow đã có **Intensity + Tempo + Beat-1 + Section Follow v1 + Harmonic Position POC**. Chord recognition vẫn là heuristic chroma/template matching và cần tune trên guitar/iPad thật;
- không có cloud sync;
- không có in-app editor;
- không có in-app OneNote integration;
- vocal tone detection currently uses prebuilt harmonic pitch-class profiles (`tone-references.json`), not true melody phrase matching, so nearby-key ambiguity can still occur.
