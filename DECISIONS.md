# Decisions — Guitar Drum

Các quyết định dưới đây nên được xem là durable cho tới khi requirement mới thay đổi chúng.

## D001 — iPad-first

**Decision:** thiết kế ưu tiên iPad/Safari và thao tác cảm ứng khi đang tập guitar.

**Reason:** đây là context sử dụng chính.

## D002 — Static PWA trước

**Decision:** giữ app client-side, deploy GitHub Pages, chưa thêm backend/database.

**Reason:** scope hiện tại không cần hạ tầng server và static app dễ mở, dễ deploy, ít bảo trì.

## D003 — Web Audio drum

**Decision:** tạo drum bằng Web Audio thay vì phụ thuộc backing-track audio file.

**Reason:** dễ thay BPM, nhẹ và phù hợp prototype tập nhịp.

## D004 — Line-based song model

**Decision:** bài hát được chia thành row, mỗi row có section, beat count và các text/chord parts.

**Reason:** cùng một model hỗ trợ hiển thị, jump, highlight, transpose và playback progression.

## D005 — Agent-assisted import

**Decision:** ảnh/OneNote được nhập qua agent workflow, không cần xây importer vào runtime app ở giai đoạn này.

**Reason:** giảm scope và tận dụng agent để xử lý dữ liệu không cấu trúc.

## D006 — Screenshot batch gate

**Decision:** khi user gửi ảnh, agent không xử lý ngay; chỉ xử lý toàn batch sau từ khóa/chỉ thị **“làm”**.

**Reason:** user thường gửi nhiều ảnh cho cùng một bài và muốn tránh xử lý từng phần rời rạc.

## D007 — Preserve simple stack

**Decision:** không tự chuyển sang framework/build system nếu chưa có pain point hoặc requirement cụ thể.

**Reason:** repository hiện nhỏ, deploy static và tốc độ chỉnh sửa quan trọng hơn abstraction.

## D008 — Documentation as agent memory

**Decision:** repository phải chứa product context, architecture, status và decisions để agent khác có thể tiếp tục mà không phụ thuộc vào lịch sử chat.

**Reason:** project sẽ được dùng qua nhiều agent/tool khác nhau như ChatGPT, Claude hoặc Gemini.
