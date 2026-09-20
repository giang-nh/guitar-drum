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


## D013 — Beat-1 sync chỉ được re-phase khi confidence cao

**Decision:** downbeat/bar sync dùng accent pattern của onset guitar trên lưới 4/4. Candidate beat 1 phải có confidence cao và giữ cùng phase trong nhiều giây; chỉ khi predicted downbeat nằm rất gần next unscheduled drummer beat mới được nudge timing và re-index quarter counter về beat 1. Không thay đổi `songBeat` hoặc nhảy dòng lời.

**Reason:** xác định beat 1 từ acoustic strumming khó hơn BPM, đặc biệt với quạt 8th/syncopated và mic bleed. Re-phase nhỏ giữ cảm giác pocket trong khi tránh phá song position nếu detector sai.


## D014 — Section Follow chỉ được dự đoán section kế tiếp

**Decision:** Section Follow v1 chỉ xét section kế tiếp trong known song timeline, ưu tiên target cao trào (`autoFillIn` hoặc arrangement gain tăng), và chỉ được arm transition khi energy trend + bar/tempo confidence + proximity cùng vượt ngưỡng. Transition AI luôn là fill 1 bar → anchor đúng đầu section kế tiếp → crash; manual jump/Fill hủy pending transition.

**Reason:** energy alone chưa đủ để xác định vị trí bài hát tùy ý. Giới hạn search space vào section kế tiếp cho trải nghiệm phản ứng có ích mà vẫn tránh nhảy sai cấu trúc. Chord/harmonic-position matching sẽ là lớp xác nhận tiếp theo.


## D015 — Harmonic re-anchor phải fail-safe khi progression lặp

**Decision:** harmonic-position matching dùng chord/chroma sequence của đúng bài và sounding key hiện tại, nhưng chỉ được auto re-anchor khi có ít nhất 3 stable chord events, best sequence match đủ cao và margin đủ xa ứng viên thứ hai. Nếu progression lặp ở nhiều vị trí, trạng thái phải là ambiguous và không được nhảy. Re-anchor chỉ áp dụng ở beat 1 kế tiếp; manual jump/Fill luôn override.

**Reason:** nhiều bài pop/ballad lặp cùng progression ở nhiều verse/chorus. Chord recognition có ích để xác nhận vị trí nhưng không đủ để phân biệt mọi đoạn; margin gate + bar sync giữ quyền kiểm soát cho người chơi và tránh nhảy sai.


## D016 — Một PerformanceState duy nhất được quyền điều khiển transport

**Decision:** từ Follow v2, dynamics/tempo/bar/section/harmonic detectors là các evidence providers. Chỉ `PerformanceState`/Sensor Fusion được quyền request section transition hoặc harmonic re-anchor. Harmonic reposition yêu cầu raw-best và fused-best trùng cùng row/beat; strong harmonic disagreement chặn section transition; mọi transport action dùng shared cooldown.

**Reason:** khi nhiều detector cùng tự hành động, chúng có thể đúng riêng lẻ nhưng xung đột trong cùng một musical moment. Một authority duy nhất giúp hệ thống fail-safe, giải thích được (`LOCKED/FOLLOW/AMBIG/RE-POS`) và dễ tune trên iPad thật.


## D017 — Dừng đàn phải freeze song position

**Decision:** Follow v2 uses a two-stage silence response: a short gap requests a sparse `THIN` groove; a longer gap queues `HOLD` at the next beat 1, freezes `songBeat`, and discards old timing/harmonic evidence. Re-entry requires fresh tempo/downbeat evidence, aligns the silent transport to the detected guitar downbeat, then resumes on beat 1.

**Reason:** letting the backing continue through an unplanned guitarist stop makes song position drift and makes later harmonic matching harder. Freezing position preserves musical intent, while a short thin-out prevents every small breath/rest from feeling like a hard stop.


## D018 — Quyết định sớm, chơi fill đúng bar cuối

**Decision:** Predictive Drummer may arm a section transition several beats early, but the drum engine does not start the fill immediately. It stores the plan, continues the current groove, and triggers the selected 1-bar fill only when the target is within the final 4 beats. Fill size is chosen from small/medium/big and variants rotate deterministically.

**Reason:** anticipation is musically useful only if it preserves structure. Early decision-making should create confidence and preparation, not an early section jump. Separating planning from rendering also lets later AI/performance layers change how a fill is played without changing when the section transition happens.


## D019 — Humanize hit, không humanize transport

**Decision:** human feel is applied only at the drum-hit rendering layer. The transport clock, tempo tracking, beat-1 alignment, song position and section transitions remain on the predictive scheduler grid. Beat-1 kick/crash get minimal timing variance; snare/hat can move more, fills less. Variation uses deterministic hashes rather than fresh randomness.

**Reason:** the project needs a drummer that feels alive without making the follow system unstable. Keeping musical decisions/grid deterministic while humanizing only articulation and microtiming preserves sync and makes regressions reproducible.


## D020 — Dùng self-hit knowledge thay vì hard mute mic

**Decision:** mic cleanup v1 uses the drum engine's own scheduled-hit metadata plus spectral/transient heuristics to estimate contamination. It never blindly masks the whole microphone window around a drum hit. Instead, likely self-drum/voice frames raise onset/chord thresholds while strong guitar evidence may still pass. Chord frames also require pitch-class diversity.

**Reason:** guitar strums and drum hits intentionally coincide. A hard echo mask would remove exactly the guitar beats needed for tempo/downbeat tracking. Self-hit-aware soft rejection preserves those co-occurring strums while reducing the most obvious speaker-bleed and singing false positives without introducing a heavy source-separation model into the current static PWA.


## D021 — Tune bằng telemetry, không ghi audio

**Decision:** real-device tuning uses a bounded local telemetry recorder rather than recording microphone audio. The session samples detector/fusion metrics at ~4 Hz, logs state changes and explicit user marks, and exports a versioned JSON file only when the user asks.

**Reason:** most POC failures are threshold/timing/state-machine problems that can be diagnosed from confidence, spectral, transport and decision traces. Numeric telemetry is smaller, easier to inspect across agents, and avoids collecting unnecessary audio while still preserving enough evidence to tune the system on the actual iPad hardware.


## D022 — Calibration chỉ tune threshold, không học audio

**Decision:** the current PWA calibrates the existing heuristic detector thresholds from five short local sound conditions and never records or trains on raw audio. Learned values are quality-weighted against known-safe defaults, and sensitivity changes are capped to ±6 dB.

**Reason:** the dominant variation right now is device placement, speaker bleed, room level and singer/guitar balance. A lightweight per-device profile can improve every existing detector immediately without introducing a server/model pipeline or making the static PWA dependent on opaque learned behavior.


## D023 — Global Health quyết định quyền tự động

**Decision:** no high-impact Follow action is authorized solely by its local detector confidence. A separate global Health layer controls automation permissions with three hysteretic modes: GREEN Full Auto, YELLOW Safe Follow and RED Manual Safe. Health downgrades cancel pending AI section/harmonic anchors; RED blocks risky automation but preserves silence→THIN/HOLD safety, and rejoin waits for recovery.

**Reason:** multiple detectors can become simultaneously confident for the wrong reason (for example speaker bleed producing regular onsets). Global health combines independent evidence and contamination signals, making the system degrade gracefully instead of turning uncertainty into transport changes.


## D024 — Auto-Tune chỉ đề xuất, không tự apply

**Decision:** telemetry-based tuning may infer bounded threshold changes and estimate their effect, but it never silently changes the Mic Profile. Apply is explicit, confidence is limited by the amount of marked evidence, unsafe before/after estimates block Apply, and every applied tune has a persistent one-step Undo.

**Reason:** a debug `Mark` indicates that something sounded or behaved wrong, but it does not provide a perfect ground-truth label. Conservative, inspectable suggestions preserve user control and prevent a single ambiguous session from degrading the detector stack.


## D025 — Tune phải qua multi-session regression

**Decision:** once historical debug sessions are loaded, an Auto-Tune suggestion cannot be applied until it passes replay across the entire suite. Any material regression in guitar retention, contamination leakage, marked-case behavior or contaminated action-risk blocks Apply. Replay is explicitly derived-telemetry replay, not full audio reconstruction.

**Reason:** optimizing one marked session can overfit that room/song/device condition. Multi-session guards turn telemetry into a regression test set and prevent local improvements from silently breaking previously working scenarios, while keeping the current static/local architecture.


## D026 — Performance variation theo ngữ cảnh nhưng không đụng transport

**Decision:** Performance Polish v2 moves groove choice into a contextual, deterministic renderer driven by section pattern, Intensity, Human feel, live energy and Health. It can change articulation, extra kick/ghost density and fill phrasing, but never the scheduler clock or song-position anchors. Destination section is now part of fill phrasing.

**Reason:** the drummer needs audible musical character without weakening the Follow architecture. Keeping expression downstream of transport preserves sync/debuggability, while context-aware ride/rim/hat/kick/fill decisions make repeated patterns sound less mechanical and more appropriate to Verse/Chorus/Interlude/Outro roles.


## D027 — Phrase là expression context, không phải transport clock

**Decision:** 4/8-bar phrase position is derived from the existing section beat map and used as contextual evidence for performance arcs and planner confidence. Phrase logic can alter density, articulation and short phrase-end pickups, but it cannot move `songBeat`, change BPM, re-phase the clock or independently trigger a section jump.

**Reason:** phrase awareness makes the drummer feel like it is shaping a musical sentence while preserving the core safety property established by Humanization/Performance v1/v2: expression stays downstream of transport. This also avoids introducing new mandatory per-song phrase authoring until real-song testing shows it is needed.


## D028 — Tách Playing UI khỏi Developer diagnostics

**Decision:** the app defaults to a compact Playing Mode while keeping the full detector/tuning surface behind a persistent Developer toggle. UI mode changes visibility only and does not reset or reconfigure the Follow engine. A compact Health/section/phrase/Plan summary is kept live from transport events even when Auto Follow is off.

**Reason:** the diagnostic surface has grown substantially through calibration, Health, Auto-Tune and regression work. Keeping those tools always visible makes the iPad performance workflow harder without adding musical value. Separating presentation from runtime preserves all engineering tools while making the product usable as an instrument companion.
