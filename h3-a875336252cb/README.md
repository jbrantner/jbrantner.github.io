# H3 Deck

A phone front end for MiniMax H3 on ComfyUI, running on both PCs (Render and Main) over Tailscale, in the Render Deck look.
App: https://jbrantner.github.io/h3-a875336252cb/ (add it to the home screen). The whole app is `index.html`; no build step.

## What it does
- **Model**: every MiniMax H3 family the PCs have (DaSiWa Hybrid V2, H3 ErosMax, official Reference and First/last frame). **Turbo** uses the family's own turbo file, or the base file + the official turbo LoRA (4 steps for reference models, 8 for FL2V); **Regular** is 20 steps. Optional MiniMax style LoRA with strength and activation words.
- **First / last frame** toggle (last frame its own toggle) and **References** toggle: up to 9 pictures, 3 videos (🔊 with their sound, ⏱ follow in time) and 3 sounds (🎤 sample or 🎵 soundtrack the clip follows), each on or off. Slots show the `<Picture n>` / `<Video n>` / `<Audio n>` name MiniMax will use. References go through MMH3 Fit References (the low-memory node) when the PC has it.
- **Canvas**: aspect chips, a resolution slider (kept inside MiniMax's 768×1344 cap, multiples of 32) and preset sizes.
- **Long clips**: anything over the "longest piece" (5 s by default, ⚙ More) is split into near-even pieces on the 17k+5 frame grid (6 s → 3 s + 2.8 s, not 5 + 1). Pieces run in order on one PC and are joined with **H3 Motion Context** (last 22 frames + 1 s of sound of the previous piece's saved latent pinned at the head of the next, trimmed after decoding). Timed beats in the prompt (`[0s-3s] …`, `At 4s, …`) are moved into the piece they fall in and re-timed; a cut lands on a beat change when one is close. Each piece's prompt can be edited. When all pieces are done the app queues ComfyUI's Concatenate Video (no re-encode) for one file.
- **Both PCs**: each take goes to the PC that will be free first (Main counts 1.26× slower). A split clip needs H3 Motion Context on that PC. Takes run in ComfyUI's own queue, so they carry on with the app closed; joining happens next time the app is open.
- Per take: live step progress and preview, ✕ Cancel, ⬇ Save, ➕ Add more (continues from the end), 🎲 New take, tap a piece to replay it or make it again from there.

## Ref Deck
`refs/` is a companion page for gathering references from a video (frames, clips, sound, voice / background split) that sends them straight into the reference slots. See `refs/README.md`.

## Why H3 Motion Context
Checked 2026-11-01: the newer chaining packs (MiniMax H3 Extender, H3 Long Video, Motion Context Auto-Chain, H3 Continuum) all use the same idea, a 22-frame latent tail as the next clip's head. H3 Motion Context was already installed and tested on Render (2026-10-03) and is plain nodes the app can drive through the API.

## Test
`tests/t_h3.js` runs the app against two real ComfyUI servers of the PCs' version (0.41.3) with empty model files: one with ComfyUI-H3-Motion-Context + mmh3_studio_refs.py, one with no custom nodes. Every graph must pass ComfyUI's own checks, and the join runs for real on two ffmpeg clips. See the header of the test for how to run it.
