# Product Requirements — Guitar Drum

_Canonical product definition. Updated 2026-09-20._

## 1. Yêu cầu gốc ban đầu

> **Bản chuẩn hóa từ ý định ban đầu, không phải trích nguyên văn hội thoại:**  
> Làm một app dùng trên iPad để khi tập guitar có thể vừa xem lời + hợp âm, vừa có drum đệm theo nhịp; dễ đổi tone/tempo, dễ nhảy đến chỗ đang tập, và có thể đưa các bài hát đang lưu ở ảnh chụp hoặc OneNote vào app.

Một yêu cầu vận hành quan trọng được chốt sau đó:

> Khi người dùng gửi nhiều ảnh bài hát, chỉ thu nhận ảnh trước. **Không xử lý từng ảnh ngay. Chỉ khi người dùng nói “làm” thì mới xử lý toàn bộ batch ảnh một lần.**

## 2. Product scope — một dòng

**PWA ưu tiên iPad cho việc tập guitar: hiển thị lời+hợp âm, transpose tone, chỉnh BPM, chạy drum 4/4 đồng bộ theo từng dòng, và hỗ trợ quy trình nhập bài hát từ ảnh/OneNote qua agent — không cần backend ở giai đoạn hiện tại.**

## 3. Vấn đề cần giải quyết

Khi tập guitar trên iPad, người dùng cần một màn hình duy nhất để:

- đọc lời và hợp âm rõ ràng;
- nghe nhịp drum đơn giản nhưng ổn định;
- đổi tone nhanh mà không sửa tay từng hợp âm;
- thay BPM để tập chậm hoặc đúng tốc độ;
- nhảy tới đúng dòng đang tập;
- mở lại app và tiếp tục gần vị trí trước đó;
- đưa bài hát đang có ở nguồn khác vào app mà không phải nhập lại thủ công quá nhiều.

## 4. Người dùng chính

Người tập guitar dùng iPad trong lúc chơi đàn, cần thao tác ít, nút dễ bấm, chữ/hợp âm dễ nhìn và không muốn quản lý một hệ thống backend phức tạp.

## 5. In scope

### Trải nghiệm tập bài

- Chọn bài hát.
- Hiển thị tên bài, ca sĩ, tone gốc, điệu/nhịp.
- Hiển thị lời + hợp âm theo từng dòng.
- Phân đoạn Intro / Verse / Chorus / Bridge / Outro khi có.
- Đánh số dòng.
- Highlight dòng hiện tại.
- Chế độ tập trung khoảng 5 dòng.
- Chế độ Show all.
- Tap dòng để jump.
- Play từ dòng đang chọn.
- Play / Pause / Stop.
- Count-in 4 beat.
- Visual beat 1–2–3–4.
- Drum 4/4 cơ bản.
- Chỉnh BPM.
- Transpose toàn bộ hợp âm.
- Ghi nhớ bài/dòng/tone/BPM/chế độ xem bằng local storage.

### Quản lý dữ liệu bài hát

- Thêm bài mới theo cùng schema dữ liệu.
- Nhập dữ liệu từ ảnh chụp qua workflow với agent.
- Nhập dữ liệu từ OneNote qua agent/connector khi công cụ truy cập được nội dung.
- Giữ đúng thứ tự, lời, vị trí hợp âm và cấu trúc bài trước khi đưa vào app.

### Nền tảng

- Ưu tiên iPad + Safari.
- Có thể Add to Home Screen dưới dạng PWA.
- Deploy bằng GitHub Pages.
- Chạy client-side.

## 6. Out of scope ở giai đoạn hiện tại

Các mục dưới đây **không phải yêu cầu hiện tại**, trừ khi người dùng bổ sung sau:

- tài khoản người dùng;
- đăng nhập;
- backend/API riêng;
- database server;
- đồng bộ cloud giữa nhiều thiết bị;
- collaborative editing;
- streaming audio;
- AI chạy trực tiếp bên trong web app;
- tự động kết nối OneNote từ chính web app;
- notation/tab editor hoàn chỉnh;
- DAW hoặc drum machine chuyên nghiệp;
- nhiều time signature ngoài 4/4.

## 7. Success criteria

Sản phẩm đạt mục tiêu hiện tại khi người dùng có thể mở iPad, chọn một bài, chọn tone/BPM, chọn dòng muốn tập, bấm Play và tập guitar theo drum + highlight mà không cần thao tác phụ.

Một bài mới được xem là nhập thành công khi:

1. có đủ tên/ca sĩ/tone/điệu khi nguồn cung cấp;
2. lời và hợp âm đúng thứ tự;
3. hợp âm hiển thị và transpose được;
4. dòng có beat duration hợp lý để playback đi qua bài;
5. bài xuất hiện trong song picker;
6. app vẫn chạy trên iPad/PWA sau khi thêm bài.

## 8. Nguyên tắc ưu tiên sản phẩm

Khi có xung đột giữa tính năng mới và trải nghiệm tập đàn, ưu tiên theo thứ tự:

1. Dễ dùng khi đang cầm guitar.
2. Lời/hợp âm chính xác và dễ đọc.
3. Drum/tempo ổn định.
4. Thao tác ít.
5. Kiến trúc đơn giản.
6. Chỉ thêm hạ tầng mới khi có nhu cầu thực tế.
