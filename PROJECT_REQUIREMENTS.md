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
- Drummer có fallback groove theo section hiện tại: Intro nhẹ, Verse giữ pocket, Pre-chorus build, Chorus mạnh hơn, Bridge half-time, Interlude mở hơn, Outro hạ động lực.
- Mỗi bài có **arrangement riêng theo exact section name** để định nghĩa pattern, gain/độ mạnh, label và section nào cần auto-fill.
- Có **Intensity 1–5** để người dùng chỉnh lực chơi mà không đổi BPM; intensity được nhân với gain của arrangement.
- Có nút **Fill**; khi đang Play, fill thủ công được queue và bắt đầu ở đầu ô nhịp 4/4 kế tiếp.
- Với section được đánh dấu auto-fill, engine tự bắt đầu fill 4 beat trước section đó để fill kết thúc đúng lúc vào Chorus/cao trào.
- Khi chuyển section mà không có fill, engine có accent ngắn để chuyển đoạn tự nhiên hơn.
- Mỗi bài hiện có một style mặc định: Acoustic Pop / Soft Ballad / Acoustic Ballad.
- Drum phải chạy đồng bộ với BPM và dòng lời hiện tại.
- Có **Auto Follow guitar (POC)**: khi user chủ động bật microphone, app đo năng lượng đàn acoustic realtime và phân loại ổn định thành `silent / soft / medium / big` để tự điều khiển Intensity của drummer.
- Follow guitar phải dùng smoothing/hysteresis/hold time để không đổi groove lực theo từng cú quạt riêng lẻ.
- Auto Follow có **Tempo Follow (POC)** tùy chọn: dùng onset guitar gần đây để ước lượng BPM + confidence, chỉ cập nhật khi candidate đủ ổn định và phải glide từ từ thay vì nhảy BPM.
- Tempo Follow phải cho phép tắt riêng để user vẫn dùng dynamics follow mà giữ BPM thủ công.
- Auto Follow có **Beat-1 / Bar Sync (POC)**: từ accent/onset pattern 4/4, app có thể suy ra downbeat khi confidence cao và phase ổn định nhiều giây; chỉ nudge timing nhẹ và re-index beat counter, không được nhảy song position.
- Beat-1 sync phải fail-safe: nếu pattern không đủ rõ, hiển thị learning/low confidence và không tự can thiệp.
- Auto Follow có **Section Follow (POC)**: app đọc section timeline đã build sẵn cho bài, kết hợp proximity tới section kế tiếp, arrangement gain/`autoFillIn`, bar/tempo confidence và xu hướng energy guitar để dự đoán chuyển vào section cao trào.
- Khi section candidate đủ tin cậy và ổn định, app được phép queue một transition giới hạn: fill 1 bar ở đầu ô nhịp kế tiếp → anchor tới đúng đầu section kế tiếp → crash. Chỉ được xét section kế tiếp; không được nhảy tùy ý sang section xa.
- Manual jump hoặc Fill của user luôn override/hủy pending AI section transition.
- Auto Follow có **Harmonic Position Matching (POC)**: ưu tiên spectral/chroma analysis ngay sau strum onset, so với chord vocabulary của đúng bài trong sounding key hiện tại (kể cả capo), và chỉ ghi chord khi candidate ổn định qua nhiều frame.
- Chuỗi 3–5 chord gần nhất được so với chord timeline derive từ row data để tìm song position candidate. Nếu nhiều đoạn dùng cùng progression, phải coi là ambiguous và không auto-reposition.
- Auto harmonic re-anchor chỉ được phép khi sequence score + margin đủ cao, tempo/bar confidence ổn định, target cách vị trí hiện tại đủ xa và user không có pending/manual transition. Re-anchor chỉ áp dụng ở beat 1 kế tiếp.
- Manual jump/Fill luôn override harmonic anchor.

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
- Per-section arrangement riêng cho 3 bài hiện tại.
- Intensity 1–5, queued Fill thủ công và auto-fill trước Chorus/cao trào.
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


## Sensor Fusion / PerformanceState

- Các detector dynamics, tempo, beat-1/bar, section và harmonic position chỉ được cung cấp evidence; không detector nào tự thay đổi song position trực tiếp.
- Một `PerformanceState` trung tâm phải tổng hợp confidence/margin/continuity và là authority duy nhất cho `fill/section transition` hoặc `harmonic re-anchor`.
- Harmonic re-anchor chỉ được phép khi raw best match và fused best candidate trùng đúng cùng row/beat, candidate ổn định đủ lâu, bar/tempo đã lock và sequence không ambiguous.
- Strong harmonic evidence mâu thuẫn với predicted next section phải chặn section transition thay vì để hai subsystem cạnh tranh.
- Repeated progression phải chuyển sang trạng thái ambiguous và giữ vị trí hiện tại.
- Shared action cooldown phải ngăn hai transport action xảy ra sát nhau.


## Stop / Resume Intent

- Silence intent must be driven primarily by absence of reliable guitar strum onsets, not raw microphone level alone.
- Short silence should thin the drummer without changing song position semantics or firing fills.
- Longer silence should hold only at a beat-1 boundary and freeze `songBeat` so the backing does not run ahead while the guitarist stops.
- Entering hold must invalidate stale tempo/bar/chord evidence. Resume must use fresh evidence.
- While held, the transport may hard-align its silent clock to a newly detected guitar downbeat before re-entry.
- Re-entry must occur on beat 1 and should sound intentional (light crash/pickup), never resume abruptly in the middle of a bar.
- Manual transport actions and disabling Auto Follow must override/release automated thin/hold behavior.


## Predictive Transition Planner

- The drummer may decide a transition early, but must separate **plan time** from **play time**: an armed transition must keep the current groove until the final bar before the target section.
- Planner inputs should include section confidence, energy trend, arrangement gain delta, current intensity, tempo/bar confidence, harmonic agreement, and beats-to-target.
- A one-off loud strum must not be sufficient to arm a transition; target evidence must remain stable through the planner hold window.
- Fill intensity must be selected contextually as small/medium/big, with multiple variants and basic repetition avoidance.
- Existing automatic fill logic must not compete with a pending predictive transition.
- Planned transitions must fail safe if the target boundary is reached late or evidence becomes invalid; they must never leave transport in a permanently pending state.


## Humanization / Performance Layer

- Humanization must be downstream of transport/follow decisions: it may alter individual hit timing/velocity/timbre slightly but must not move bar boundaries, song position, BPM, section transitions or beat-1 anchors.
- User must have a `Human feel` amount from 0–100%, persisted per song; 0% should behave close to the original rigid synth groove.
- Beat-1 kick/crash must use the smallest timing deviation. Backbeat snare and hi-hat may use wider but still musical timing ranges.
- Fill humanization must be weaker than groove humanization to protect the target section landing.
- Hi-hat/open-hat articulation should vary filter brightness/decay; drum voices may have subtle deterministic timbre variation.
- Ghost notes should be contextual, low-volume, deterministic and gated by Human feel/pattern; they must not appear on every bar or overwhelm ballad arrangements.
- Humanization should be deterministic for the same song position/voice context so POC behavior is reproducible during tuning.


## Clean Mic / Bleed + Vocal Rejection

- Because the app produces the drum audio itself, the drum scheduler should expose predicted self-hit timing/voice/power to the microphone analyzer rather than treating playback bleed as unknown noise.
- Self-drum knowledge must **not** hard-mute microphone windows: guitar strums commonly coincide with kick/snare. It should raise rejection thresholds only when the observed spectrum is also consistent with the predicted drum hit.
- Onset acceptance should combine energy rise with transient/spectral evidence and use stronger thresholds under likely self-drum or vocal contamination.
- Dynamics energy should be attenuated for strong self-drum/voice-like frames so speaker bleed or singing does not drive drummer Intensity by itself.
- Chord tracking should reject strong self-drum/voice-like frames and require enough pitch-class diversity to reduce false chord detection from one sung note.
- `Clean mic` must be user-toggleable for A/B testing and persist with the Follow settings.
- Debug UI/API must expose heuristic input class, self-drum penalty and accepted/rejected onset counts. These values must be described as heuristics, not source-separation truth.


## Debug Session / Telemetry

- The app must support local-only debug session recording for real-device tuning; no server/backend is required.
- The recorder must not capture audio. It should sample compact numerical/state telemetry around 4 Hz and record explicit state-change/user-mark events.
- Telemetry should include enough context to reconstruct detector/fusion decisions: song/transport position, mic energy/input class, Clean Mic spectral metrics, onset accept/reject counters, tempo/bar confidence, harmonic/section candidates, PerformanceState, transition plan, and relevant user controls.
- Session memory must be bounded to avoid runaway PWA memory usage during long practice sessions.
- User must be able to `Mark` a bad moment while playing and export the session as versioned JSON.
- On iPad/iOS, export should prefer the native Share sheet when file sharing is available, with download fallback.
- Telemetry stays local until the user explicitly exports/shares it.


## Mic Calibration Mode

- Calibration must be guided and local, with separate samples for quiet, drum-only, guitar-only, voice-only and full-mix conditions.
- Each sample stage must be explicitly started by the user after they prepare the requested sound condition; the app must not assume the environment is ready.
- Calibration must not record audio; only derived numerical features may be retained.
- Follow/transport actions must be suspended while calibration is active so calibration material cannot cause BPM changes, fills, re-positioning or intensity automation.
- The profile must be versioned, stored locally, and fall back cleanly to safe defaults when missing/reset.
- Learned thresholds must include source-rejection and onset/chord gates, plus a bounded mic-sensitivity recommendation.
- Calibration must compute a quality/separation score; weak calibration should blend learned thresholds toward defaults rather than overfit poor samples.
- Debug exports must include the active calibration profile.


## Follow Health / Fail-safe Mode

- The app must compute a global Health score from detector quality, not rely only on the confidence of the subsystem requesting an action.
- Health inputs should include microphone contamination/guitar evidence, recent accepted-vs-rejected onset quality, tempo confidence, bar/downbeat confidence, harmonic ambiguity and calibration quality.
- Health must use smoothing/hysteresis so permissions do not flicker frame-to-frame.
- `GREEN / Full Auto`: all validated Follow actions may run.
- `YELLOW / Safe Follow`: dynamics/BPM/bar follow may continue and conservative next-section transitions may run, but harmonic song-position re-anchor is forbidden and planned big fills must be capped.
- `RED / Manual Safe`: automated intensity changes, BPM steering, bar re-sync, harmonic re-position and predictive section transitions are forbidden. Silence-driven THIN/HOLD may still protect song position, while automatic rejoin requires recovery above RED.
- Downgrading Health must cancel pending high-risk AI transport actions so decisions made under a previous confidence level cannot execute later.
- Health score, mode, reasons, component scores and current permission set must be available in debug/API state and telemetry.


## Auto-Tune Engine / Profile Suggestions

- Auto-Tune must analyze both the current local debug session and imported exported JSON sessions.
- Manual `Mark` events are the primary error anchors; the engine may infer a failure category only when the surrounding evidence is directional enough.
- Harmonic/song-position ambiguity without contamination evidence must not modify mic thresholds.
- Suggested threshold changes must be bounded per parameter and clamped to safe ranges.
- The UI must show before→proposed changes and an estimated before/after comparison for guitar retention and contamination pass.
- Apply must never be automatic. It requires explicit user action and minimum suggestion confidence.
- Apply must be disabled when the offline comparison predicts material guitar-retention loss or worse contamination leakage.
- The previous Mic Profile must be persisted for one-step Undo across page reloads.
- Recalibration or explicit profile reset invalidates stale Auto-Tune rollback state.
- Debug exports must include active profile and current Auto-Tune suggestion metadata when present.


## Replay / Regression Test Harness

- The app must be able to load multiple exported debug JSON sessions as a temporary regression suite without requiring a backend.
- Regression sessions should remain in memory rather than being persisted wholesale in localStorage.
- Replay must compare the active profile against the current proposed profile on every loaded session using stored derived telemetry.
- v1 may replay threshold-dependent decisions only; it must clearly avoid claiming full raw-audio/detector reprocessing when raw audio is not available.
- The report should include estimated guitar retention, contamination leakage, directional marked-case behavior, action-risk proxy, and recorded tempo/bar lock context.
- Auto-Tune Apply must be disabled when any historical session crosses a material regression guard, or when a loaded suite has not yet been replayed for the current suggestion.
- New Auto-Tune suggestions must automatically invalidate/rerun the regression report.
- New debug schema should capture enough onset-decision state (`rise`, required threshold, spectral gate, accept/reject flag) to improve future offline replay fidelity while remaining audio-free.
- Older debug schemas must remain importable with conservative fallback behavior.
