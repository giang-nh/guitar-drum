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


## D009 — Section-aware drummer trước AI follow

**Decision:** POC drummer dùng rule-based 4/4 groove theo section, có per-song style, Intensity 1–5 và queued Fill; chưa nghe guitar để tự bám tempo/section.

**Reason:** cho phép kiểm tra trải nghiệm cốt lõi “vừa đàn acoustic + hát, app làm tay trống” với Web Audio hiện có trước khi tăng complexity sang realtime audio-following.


## D010 — Per-song drum arrangement + auto-fill

**Decision:** mỗi bài có thể khai báo `drumArrangement` theo exact section name, gồm pattern/gain/label và cờ `autoFillIn`. Section được đánh dấu sẽ nhận fill 4 beat ngay trước điểm vào section; các section không khai báo vẫn dùng fallback theo loại Intro/Verse/Chorus/Bridge.

**Reason:** cùng một rule chung chưa đủ tạo cảm giác một tay trống đang đệm theo diễn tiến của từng bài; arrangement nhỏ theo section cho khác biệt rõ mà vẫn giữ kiến trúc static/Web Audio đơn giản.


## D011 — Mic follow intensity trước tempo/section follow

**Decision:** vertical slice realtime đầu tiên dùng microphone để đo guitar energy và tự điều khiển drummer Intensity qua các state `silent / soft / medium / big`. Giữ BPM, beat grid và section progression theo song map hiện tại; chưa cho mic trực tiếp kéo tempo hoặc đoán section.

**Reason:** dynamics là tín hiệu dễ kiểm chứng nhất để chứng minh trải nghiệm “drummer nghe người chơi”. Tách intensity follow khỏi tempo/section inference giúp test latency, mic bleed từ loa iPad, smoothing và musical response trước khi thêm beat tracking phức tạp hơn.


## D012 — Tempo follow phải bảo thủ và glide

**Decision:** Tempo Follow dùng onset timestamps trong một cửa sổ ngắn để ước lượng BPM, nhưng chỉ được điều khiển drummer khi có đủ mẫu, confidence vượt ngưỡng và candidate BPM giữ ổn định trong nhiều giây. Khi áp dụng, BPM chỉ dịch từng bước nhỏ (hiện 1 BPM mỗi khoảng 850 ms). User có thể tắt Tempo Follow riêng mà vẫn giữ dynamics follow.

**Reason:** acoustic strumming có 8th notes, syncopation và mic bleed từ drum speaker nên tempo estimate có thể alias hoặc nhiễu. Một drummer nghe tự nhiên nên giữ pocket và điều chỉnh dần thay vì nhảy theo từng estimate tức thời.
