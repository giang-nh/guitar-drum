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
- per-song drum style cho 3 bài hiện tại;
- Intensity 1–5;
- queued Fill ở đầu ô nhịp kế tiếp;
- transition accent khi đổi loại section;
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

- nhập thêm bài hát từ nguồn của người dùng;
- kiểm tra độ chính xác lời/hợp âm;
- tinh chỉnh beat count cho playback;
- test cảm giác drummer trên iPad khi vừa đàn acoustic vừa hát, đặc biệt mức Intensity và thời điểm Fill;
- cải thiện workflow import OneNote khi connector phù hợp có sẵn;
- chỉ refactor code khi complexity thực sự cản trở việc thêm/chỉnh bài.

## Known limitations

- chưa có automated tests;
- song data và app logic cùng nằm trong `index.html`;
- beat timing là thủ công;
- drummer hiện dùng rule-based section patterns, chưa bám arrangement gốc và chưa follow tempo trực tiếp từ guitar;
- không có cloud sync;
- không có in-app editor;
- không có in-app OneNote integration;
- vocal tone detection currently uses prebuilt harmonic pitch-class profiles (`tone-references.json`), not true melody phrase matching, so nearby-key ambiguity can still occur.
