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
