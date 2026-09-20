# Guitar Drum — Yêu cầu đã chốt

_Cập nhật: 2026-09-20_

## 1. Mục tiêu cuối cùng

Làm một web app/PWA tối ưu cho iPad để vừa nhìn lời + hợp âm guitar vừa có drum đệm theo nhịp. App phải đơn giản, mở nhanh trên Safari, có thể Add to Home Screen và dùng thuận tiện khi tập đàn.

Bên cạnh phần phát nhạc, cần có quy trình đưa bài hát mới từ nội dung người dùng đang lưu trong OneNote hoặc từ ảnh chụp màn hình vào thư viện bài hát của app.

## 2. Giao diện bài hát

Mỗi bài hát cần có:

- Tên bài hát và ca sĩ.
- Điệu/nhịp, trước mắt chủ yếu Ballad 4/4.
- Tone gốc.
- Toàn bộ lời bài hát kèm hợp âm đúng vị trí trên lời.
- Chia theo phần nếu có: Intro, Verse, Điệp khúc/Chorus, Bridge, Outro...
- Đánh số từng dòng để dễ thao tác khi tập.
- Dòng đang chơi phải được highlight rõ ràng.

Chế độ hiển thị:

- Mặc định chỉ tập trung khoảng 5 dòng quanh dòng hiện tại để chữ đủ lớn trên iPad.
- Có nút **Show all** để xem toàn bài.
- Có thể quay lại chế độ 5 dòng.

## 3. Chọn bài hát

Có danh sách để đổi bài ngay trong app.

Hiện repo đã có dữ liệu cho:

- **Nàng Thơ — Hoàng Dũng**
- **Quê Xa — Quang Dũng**
- **Giấc Mơ Tình Yêu — Mỹ Tâm**

Các bài mới sẽ tiếp tục được thêm vào cùng cấu trúc này.

## 4. Tone / chuyển hợp âm

- Có ô chọn tone.
- Khi đổi tone, toàn bộ hợp âm trong bài phải transpose tự động.
- Giữ đúng loại hợp âm như m, m7, 7, maj, slash chord, b5... khi chuyển.
- Có thể hiển thị gợi ý quãng giọng như nam trầm, nam trung, nam cao, nữ trầm, nữ trung, nữ cao để chọn tone nhanh.
- Tone gốc của bài phải được ghi rõ.

## 5. Tempo

- Có thanh chỉnh BPM.
- BPM hiện tại phải hiển thị số lớn, dễ nhìn.
- Khi thay BPM, drum và tiến trình bài phải chạy theo BPM mới.
- Giá trị BPM của từng bài cần được nhớ lại khi mở lần sau.

## 6. Drum đệm và nhịp

- Drum chạy trực tiếp trong trình duyệt, không phụ thuộc file audio ngoài.
- Nhịp chính trước mắt là **4/4**.
- Có visual beat **1 – 2 – 3 – 4**.
- Beat hiện tại phải sáng rõ để người chơi nhìn được nhịp.
- Khi bấm Play từ đầu hoặc từ một dòng, có **count-in 4 beat** trước khi vào bài.
- Drum dùng Web Audio với kick, snare, hi-hat và các accent bổ sung như open hi-hat, tom, crash.
- Drummer tự chọn groove theo section hiện tại: Intro nhẹ, Verse giữ pocket, Pre-chorus build, Chorus mạnh hơn, Bridge half-time, Interlude mở hơn, Outro hạ động lực.
- Có **Intensity 1–5** để người dùng chỉnh lực chơi mà không đổi BPM.
- Có nút **Fill**; khi đang Play, fill được queue và bắt đầu ở đầu ô nhịp 4/4 kế tiếp.
- Khi chuyển loại section, engine có accent/fill ngắn để chuyển đoạn tự nhiên hơn.
- Mỗi bài hiện có một style mặc định: Acoustic Pop / Soft Ballad / Acoustic Ballad.
- Drum phải chạy đồng bộ với BPM và dòng lời hiện tại.

## 7. Điều khiển khi tập

Các nút/chức năng cần có:

- **Play**
- **Pause**
- **Stop**
- Stop đưa bài về đầu.
- Tap vào một dòng để nhảy tới dòng đó.
- Ở dòng đang chọn có nút Play nhỏ để bắt đầu trực tiếp từ dòng đó.
- Khi đang chạy, app tự chuyển highlight sang dòng tiếp theo theo số beat đã khai báo cho từng dòng.
- Có thể pause ngay tại dòng đang tập và resume từ vị trí đó.

## 8. Ghi nhớ trạng thái

App cần lưu local trên thiết bị:

- Bài hát mở gần nhất.
- Dòng đang tập.
- Tone đang chọn của từng bài.
- BPM của từng bài.
- Intensity của drummer theo từng bài.
- Chế độ xem 5 dòng hay Show all.

Mục tiêu là đóng app rồi mở lại vẫn tiếp tục gần đúng chỗ đang tập.

## 9. iPad / PWA

- Giao diện ưu tiên cảm ứng và màn hình iPad.
- Nút đủ lớn để bấm khi đang cầm đàn.
- Chạy tốt bằng Safari.
- Có manifest/service worker để **Add to Home Screen**.
- App hiện là static client-side, chưa cần backend/database.
- Deploy bằng GitHub Pages từ repo này.

## 10. Quy trình thêm bài hát từ ảnh

Khi người dùng gửi nhiều ảnh chụp lời/hợp âm:

- Không xử lý từng ảnh ngay khi vừa nhận.
- Người dùng có thể gửi liên tục nhiều ảnh.
- Chỉ khi người dùng nói **“làm”** thì mới xử lý toàn bộ số ảnh vừa gửi như một batch.
- Từ ảnh, lấy tên bài, ca sĩ, tone, điệu/nhịp, lời và hợp âm.
- Ghép các ảnh đúng thứ tự thành một bài hoàn chỉnh.
- Chuẩn hóa dữ liệu về cùng format với các bài đang có trong app.
- Sau đó thêm bài vào danh sách chọn bài và kiểm tra hiển thị/transpose/drum.

## 11. Quy trình lấy bài hát từ OneNote

Mục tiêu là giảm việc phải chụp từng màn hình.

Yêu cầu mong muốn:

- Nếu có thể truy cập OneNote qua công cụ Microsoft đã kết nối, đọc **toàn bộ nội dung của page**, không chỉ phần đang nhìn thấy trên màn hình.
- Lấy toàn bộ lời + hợp âm của bài trên page đó.
- Chuyển nội dung OneNote sang đúng cấu trúc song data của app.
- Người dùng không cần thao tác nhiều trên iPad; ưu tiên để ChatGPT thực hiện các bước đọc/chuyển dữ liệu khi connector cho phép.
- Nếu một page chứa nhiều phần của cùng bài, phải ghép thành một bài hoàn chỉnh trước khi thêm vào app.

## 12. Nguyên tắc làm việc đã chốt

- Với ảnh: **nhận trước, chưa làm; chỉ làm khi người dùng nói “làm”.**
- Khi làm thì xử lý tất cả ảnh của batch một lần.
- Ưu tiên kết quả cuối cùng chạy được trong app, không cần lặp lại toàn bộ trao đổi trung gian.
- Bài mới phải giữ trải nghiệm thống nhất với các bài đã có: chọn bài → chọn tone/BPM → chọn dòng → Play → drum + highlight chạy theo bài.

## 13. Trạng thái hiện tại của repo

Repo hiện đã có prototype chạy client-side với:

- Song picker.
- 3 bài hát.
- Transpose hợp âm.
- Tempo control.
- Drummer 4/4 bằng Web Audio, tự đổi groove theo section.
- Intensity 1–5 và queued Fill.
- Count-in.
- Visual 4 beat.
- Play/Pause/Stop.
- Jump/Play từ từng dòng.
- Highlight dòng hiện tại.
- 5-line focus / Show all.
- Local persistence.
- PWA/service worker.
- Cấu hình deploy GitHub Pages.

Phần tiếp tục phát triển chủ yếu là **thêm bài hát chính xác hơn từ dữ liệu người dùng** và **tự động hóa việc đọc/import từ OneNote khi connector Microsoft hỗ trợ**.
