# AGENTS.md — Cross-agent project handoff

File này là **điểm bắt đầu cho bất kỳ coding/research agent nào** làm việc với repository này.

## Read first

Đọc theo thứ tự:

1. `PRODUCT_REQUIREMENTS.md` — sản phẩm này là gì, scope là gì.
2. `ARCHITECTURE.md` — hệ thống hiện đang được xây như thế nào.
3. `PROJECT_REQUIREMENTS.md` — functional requirements chi tiết đã tích lũy.
4. `STATUS.md` — hiện tại đã làm tới đâu và việc tiếp theo.
5. `DECISIONS.md` — các quyết định cần giữ ổn định.
6. Code hiện tại, đặc biệt `index.html`, `manifest.json`, `sw.js`.

## One-line product scope

**PWA ưu tiên iPad cho việc tập guitar: hiển thị lời+hợp âm, transpose tone, chỉnh BPM, chạy drum 4/4 đồng bộ theo từng dòng, và hỗ trợ quy trình nhập bài hát từ ảnh/OneNote qua agent — không cần backend ở giai đoạn hiện tại.**

## Non-negotiable interaction rule

Khi người dùng gửi nhiều ảnh bài hát:

- nhận ảnh;
- chưa xử lý;
- chờ người dùng nói **“làm”**;
- lúc đó xử lý toàn bộ batch một lần.

Không được tự động bắt đầu sau từng ảnh.

## Current technical shape

- Static HTML/CSS/JS.
- No framework.
- No backend.
- No database.
- Web Audio drum synthesis.
- localStorage state.
- PWA.
- GitHub Pages.
- Songs embedded in `index.html`.

Đừng tự ý hiện đại hóa stack nếu task không yêu cầu.

## Working principles

- Ưu tiên iPad/touch usability.
- Preserve existing working behavior unless task explicitly changes it.
- Song accuracy is more important than clever automation.
- Preserve chord token boundaries so transpose continues to work.
- Treat row beat counts as musical timing data, not arbitrary UI metadata.
- For uncertain lyrics/chords, flag uncertainty rather than silently inventing.
- Keep changes small and reviewable.
- Update documentation when product scope, architecture, data schema or workflow changes.

## Song import checklist

Trước khi coi một bài mới là hoàn tất:

- title/artist đúng;
- base key đúng nếu biết;
- flats/sharps phù hợp;
- sections hợp lý;
- lyrics đủ và đúng thứ tự;
- chords ở đúng vị trí tương đối;
- chord strings được parser nhận diện;
- row beat counts đã điền;
- song picker có bài mới;
- transpose hoạt động;
- Play/Pause/Stop hoạt động;
- jump-to-row hoạt động;
- app không có syntax error.

## Repository workflow

Ưu tiên thay đổi bằng branch + pull request khi có thể.

Nếu agent đang tiếp tục một PR có sẵn, kiểm tra branch/PR trước khi tạo branch mới để tránh phân mảnh context.

## Documentation policy

Các file canonical:

- Product intent/scope: `PRODUCT_REQUIREMENTS.md`
- Architecture: `ARCHITECTURE.md`
- Detailed functional requirements: `PROJECT_REQUIREMENTS.md`
- Current implementation status: `STATUS.md`
- Durable technical/product decisions: `DECISIONS.md`

Nếu hai tài liệu mâu thuẫn, ưu tiên file canonical tương ứng ở trên và cập nhật tài liệu cũ trong cùng change.
