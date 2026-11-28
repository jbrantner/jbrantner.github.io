# 🎞 Reel

A very simple clip maker on H3 Deck's engine (Jordan 2026-11-20: "an app that uses the same engine as Render Deck but is extremely
simplified … without ruining the current Render Deck").
App: https://jbrantner.github.io/reel-5b1e7c94d2a0/ (add it to the home screen). The whole app is `index.html`; no build step.

## Screen (from Jordan's sketch)
- **Viewport**: the current clip's picked option, looping between its start and end. ▶ Play all plays from this clip to the end
  with two players, so there's no gap between clips. 🔇/🔊 sound.
- **Wheel**: the current clip big in the middle, the clips before and after small at the sides, turned like a wheel. Drag it and it
  snaps the nearest clip into the middle (a flick moves one clip); tap a side clip to go to it.
- **Options**: every option (take) of the current clip. Tap one to use it. ✕ twice removes one (or stops it while rendering).
  Rendering ones show % and time left. A ⚠ line shows when the picked option was made for another option of the clip before or after.
- **↻ Redo**: more options that line up with the clips around it: between two clips it's a ⇿ fill (end of the clip before pinned at
  the start, start of the clip after pinned at the end); with only a clip before it carries on from it; with only a clip after it
  leads into it (⏪); on its own it's the same settings again.
- **✂ Edit**: ✂ Length (drag the two handles). Trimming the end of a clip that has a clip after it can 🪄 blend the end into the next
  clip: the last 0.5–2 s are made again (H3 Deck's ⇿ fill from the new end to the next clip's first frame), which shows up as a small
  🪄 clip between them with its own options. 🎨 Change it = H3 Deck's ↻ redo of a stretch with new words and "How much it changes"
  (denoise); the frames just outside the stretch are pinned (the last half second too when there's a clip after it), so it still lines up.
  🗑 Remove this clip.
- **➕ Next / ⇿ Insert**: Next carries on from the end of the clip (H3 Motion Context, the `[0s-1s]` anchor line, only the new part
  is made). When there's already a clip after it, the button is ⇿ Insert: new seconds between the two.
- ✍ New clip / 📤 Upload a clip start an empty reel. 🎞 the reel name opens the reels list (＋ New reel, rename, delete).
  ⚙ model and shape for new clips, PCs.
- 👥 Who's in it: H3 Deck's 📚 Library characters. Tapping one puts the name in the words; any Library character named in the words
  is sent as `<Subject n>` with her pictures.

## 📚 Library tab (Jordan 2026-11-20: "a library tab like Render Deck does")
- 🎞 Reel / 📚 Library tabs under the header. The Library lists H3 Deck's 📚 Library characters plus ones made here (＋ New: name,
  what she looks like, 1–4 pictures). Tap one to put her in this reel (`reel.cast`); the reel's characters are picked in 👥 Who's in it
  for every new clip. 👥 In this reel shows them under the options (＋ opens the Library).
- Characters made in Reel live in the engine's own save (`L.reel`), kept next to H3 Deck's Library on every start; H3 Deck's save is
  never written. H3 Deck's own characters are changed in H3 Deck.

## Engine
The page loads `../h3-a875336252cb/?engine=1` in a hidden frame (same site, so same storage). In engine mode H3 Deck:
- keeps its own save under `h3reel_engine` (its own takes and form), and on every start reads H3 Deck's `h3deck` save for the 📚 Library
  (plus those pictures' media entries), the PCs and the look (model, size, quality). Pictures are in the shared IndexedDB; the engine
  never deletes any.
- never writes H3 Deck's copies on the PCs (`h3deck_takes.json`, `h3deck_films.json`, `h3deck_run.json`), never wakes or adopts the
  🌙 hidden copy, doesn't open Films, and follows its takes under its own tab lock (`h3reel_lead`) and client id (`h3reelcid`).
- exposes `window.H3Engine` (make, again, carry, fill, lead, redo, upload, info, lib, pcs, models, setLook, forget, stop, retry); its
  messages show as Reel toasts.
Reel's own save is `h3reel` (reels → clips → takes, picks, in/out) and `h3reel_th` (small frame pictures of the options).

Test: `CLIP=<a ~5 s video> NODE_PATH=$(npm root -g) node reel-5b1e7c94d2a0/tests/t_reel.js` (from the repo root).

## 🔗 Re-link (Jordan 2026-11-25, her drawings)
After re-rolling a middle clip and picking an option, **🔗 Re-link to the clips around it** (under the options, or the link in a "may jump"
warning) makes that option again at a strength (Light 0.35 / Medium 0.5 / Strong 0.65): one window = the clip before's last 22 frames
(guide clip at frame 0) + this clip's own frames (VAE-encoded start, spread over a length rounded to MiniMax's 17-frame blocks, within ⅓ s)
+ the clip after's first 22 frames (guide clip on a block). Only this clip's frames are kept; its own sound is pinned; its first and last
1.5 s are colour-matched (mkl ramp) to the frame it meets on each side. Same words and settings as the clip; it comes back as a new option of
the same clip and is picked (meta.relink = the option it came from), so the reel keeps the same number of clips. New-shot cuts and
unfinished neighbours are left out. Engine `relink` → H3 Deck's `H3Relink` (lead take with `lead.base`).

Keep-things-the-same line: clips made to line up (➕ Next, ⇿ Insert / ↻ Redo between clips, ⏪ lead-in, 🔗 Re-link) get a sentence saying
the same people, clothes, objects and props stay in place and nothing appears or disappears unless said (➕ Next: after the [0s-1s] anchor,
never in it). `keep:false` on the engine call leaves it out. Test: `tests/t_relink.js`.

## 🔑 Phase 2: keyframes (Jordan 2026-11-24, `keys/`)
**HIDDEN since 2026-11-25** (Jordan: confusing, gets in the way of the workflow, may rethink later). Code and page kept; open Reel with `?p2=1` to show the buttons.
🔑 Phase 2 on the viewport (or 🎬 › Move on to Phase 2) opens `keys/?reel=<id>`. The reel is joined into one video on a PC (the export
helper) and turned like a wheel under a fixed centre needle (drag + fling, 64 px = 1 s). It starts BLANK the first time (Jordan 2026-11-25); a "· keyframed" reel's Phase 2 opens with the keyframes, redraws and chunks of the Phase 2 it came from (at their shown times): ＋ Keyframe
adds one at the needle, tap a dot to bring it to the needle. Hold a dot ~⅓ s and drag a line: every keyframe the line reaches within 5 s
joins one chunk, the ones inside as breakdowns (press and hold the chunk bar to disconnect it; a tap opens ✂ Disconnect; the keyframe editor has ✂ Disconnect its chunk). Drag the dot under the needle to retime it: a
breakdown moves between its neighbours (in-betweens faster cyan / slower orange, ¼–4×), a chunk's end takes the rest of the reel along;
outside chunks the reel keeps its own pace. Below, the nearest keyframe, the next one
sliding in as you get closer. Each keyframe: 🖌 paint / 🧽 erase a mask, 🎯 Character focus (on by default, BiRefNet cut-out), words,
👤 saved characters under the words (💾 Save as a character = name + Danbooru description, kept on the phone in `illus_chars` for every reel; tap a name to put it in front of the words, again to take it out; ✎ edit/delete), How much changes (0.6), ✨ Redraw = Render Deck's Illustrious recipe (BismuthIlMix_v8, one L, found on any PC + afk_style_condensed_v2 at 1, 28 steps, CFG 5.5,
euler_ancestral normal, finishing pass, Fix faces 0.35/32) on the mask's box zoomed to 1344×768, put back with a soft edge.
🎬 Redo the in-betweens: only the chunks, each from the joined reel retimed to the new timing (strength like
✂ Edit's 🎨 Change), every keyframe in it pinned (engine `keys` → H3 Deck's `H3KeyPass`), the base take = the clip it's mostly in.
The result is a new reel "· keyframed" in Phase 1: the original takes trimmed around each chunk, one clip per chunk. Phase 2's own save is in IndexedDB `reelkeys`/kv/'all' (moved out of localStorage `h3reel_keys` 2026-11-25: the 5 MB localStorage is shared with Render Deck/H3 Deck/Reel and filled up). Hold a dot and drag its line onto the needle = 🎯 move it to the needle's time (a free keyframe gets joined to the one before).
Test: `CLIP=<a ~5 s webm> NODE_PATH=$(npm root -g) node reel-5b1e7c94d2a0/tests/t_keys.js`.

- 👥 Characters made in Reel are kept on the PCs too (`h3reel_chars.json` in ComfyUI's user files), like H3 Deck's Library: a character missing on the phone comes back with her pictures, the newer edit wins, a deleted one stays deleted (2026-11-25, after one vanished). Test: `h3-a875336252cb/tests/t_reel_chars.js`.

## 🗑 Stopped and removed options leave nothing behind (Jordan 2026-11-26)
An option stopped while it renders (✕ twice, or a rendering option of a removed clip or reel, or 🧹 Keep only this) has its own output
folder on its PC deleted: half-made parts and their saved endings (`ctx_*.safetensors`). Engine `stop` marks the take, `forget` queues
its folder (`h3reel_drop` on the phone), and the helper's `POST /renderdeck/h3drop {dirs}` deletes it (only `…/H3Deck/h3_…`, never a ✨
`hqctx_` chain folder). It is tried again 30 s later in case the PC wrote a last file as it stopped; a PC that's off is tried for 7 days.
A folder another option still uses (shared parts, carry-ons) stays. An older helper only gets `/renderdeck/delete` of the videos.
Since later the same day (Jordan: "let's have those delete their files too if they're removed"), finished options you remove go the same
way once their ↩ Undo is gone (✕, 🧹 Keep only this, a removed clip or reel), unless another option carried on from them. Options that
failed on their own keep their files. Test: `tests/t_cancel_drop.js`.

## 🌙 Keeps going with the phone off (Jordan 2026-11-28)
Every 15 s on screen Reel tells Render's helper (`/renderdeck/h3run/beat`) whether anything is still going (engine takes, 🎭 face passes,
🎬 / 🧵 runs). Going into the background with work left, it leaves a copy on Render (`/userdata/h3reel_run.json`: its reels, the engine's
takes, H3 Deck's Library) and holds. After 90 s the helper opens H3 Deck hidden (`?worker=1`); seeing Reel's copy is the newer one, it
goes to `h3-a875336252cb/reelw/`, which loads Reel with this copy and H3 Deck from Render as its engine, and carries on. Back on the phone,
the hidden copy saves and stops, and the phone takes its copy over (one reload, "🌙 Picked up where Render left off"). Test `tests/t_away.js`.
