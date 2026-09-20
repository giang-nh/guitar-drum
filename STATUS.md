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
- Web Audio kick/snare/hi-hat;
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
- experimental vocal tone detection PoC for Nàng Thơ (`tone-poc.html`): microphone pitch tracking, 8-second pitch-class aggregation, key-profile scoring, chord preview, and apply-to-app through existing localStorage.

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

- test vocal tone detection PoC on real iPad/Safari voices; if useful, replace the key-profile-only heuristic with per-song/per-phrase melody references;

- nhập thêm bài hát từ nguồn của người dùng;
- kiểm tra độ chính xác lời/hợp âm;
- tinh chỉnh beat count cho playback;
- cải thiện workflow import OneNote khi connector phù hợp có sẵn;
- chỉ refactor code khi complexity thực sự cản trở việc thêm/chỉnh bài.

## Known limitations

- chưa có automated tests;
- song data và app logic cùng nằm trong `index.html`;
- beat timing là thủ công;
- drum pattern là generic 4/4;
- không có cloud sync;
- không có in-app editor;
- không có in-app OneNote integration;
- vocal tone PoC hiện chỉ dùng pitch-class/key profile, chưa match melody-reference của câu hát nên confidence có thể thấp hoặc nhầm với key gần.
