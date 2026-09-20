# Guitar Drum

iPad-first static PWA for guitar practice with lyric/chord display and simple synchronized drum accompaniment.

## Product scope

**PWA ưu tiên iPad cho việc tập guitar: hiển thị lời+hợp âm, transpose tone, chỉnh BPM, chạy drum 4/4 đồng bộ theo từng dòng, và hỗ trợ quy trình nhập bài hát từ ảnh/OneNote qua agent — không cần backend ở giai đoạn hiện tại.**

## For AI agents / handoff

If you are ChatGPT, Codex, Claude, Gemini, or another coding agent, **read [AGENTS.md](./AGENTS.md) first**.

Canonical project context:

- [PRODUCT_REQUIREMENTS.md](./PRODUCT_REQUIREMENTS.md) — original need, product definition, scope, in/out of scope.
- [ARCHITECTURE.md](./ARCHITECTURE.md) — current technical architecture and constraints.
- [PROJECT_REQUIREMENTS.md](./PROJECT_REQUIREMENTS.md) — detailed functional requirements.
- [STATUS.md](./STATUS.md) — current implementation and next work.
- [DECISIONS.md](./DECISIONS.md) — durable product/technical decisions.

The repository is intended to contain enough context that a new agent can continue the project without access to the original chat history.

## Current prototype

- Song picker
- Songs: Nàng Thơ, Quê Xa, Giấc Mơ Tình Yêu
- Tone transposition
- Tempo control
- 4-beat visual indicator
- Web Audio drum accompaniment
- Count-in
- Click/tap any lyric/chord line to jump there
- Play from selected line
- Play/Pause/Stop
- 5-line focus view / Show all
- Line numbering and current-line highlight
- Per-song local persistence
- PWA-style install support
- Experimental vocal tone detection PoC for Nàng Thơ

## Architecture summary

- Static HTML/CSS/JavaScript
- No framework
- No backend
- No database
- Song data currently embedded in `index.html`
- Web Audio for drum synthesis
- `localStorage` for device-local state
- GitHub Pages for deployment

See [ARCHITECTURE.md](./ARCHITECTURE.md) before making structural changes.

## Publish with GitHub Pages

1. Open **Settings → Pages**.
2. Under **Build and deployment**, choose the repository's configured Pages workflow/branch.
3. The production site is normally available at:
   `https://giang-nh.github.io/guitar-drum/`

On iPad: open the site in Safari → Share → Add to Home Screen.

Deployment workflow is configured in `.github/workflows/pages.yml`.

Experimental vocal tone PoC: `https://giang-nh.github.io/guitar-drum/tone-poc.html`
