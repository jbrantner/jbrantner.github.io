# 🎬 H3 Film

**Review and edit** (Jordan 2026-11-03): 🎛 H3 Deck renders, and H3 Film reviews and assembles the results. Both apps run on the same site, so H3 Film reads H3 Deck's takes straight from its storage (`h3deck`) and never writes to them. Its own state is in `h3edit`.

- **✂ Review**: everything H3 Deck has finished that you haven't looked at yet, plus what it is still rendering.
  - A take that finishes while H3 Deck is closed is picked up from the PC. The app reads the last piece's job in `/history` and uses the joined file.
  - Per take: ＋ Add to the film you last opened, ✓ Keep (it goes to the top of ＋ Clip), ✕ Not this one, ✏️ H3 Deck.
- **Film = a timeline**:
  - Clips sit on several tracks, and the upper track plays where clips overlap. A clip is `{take, in, out, dur, at}`.
  - Drag a clip to move it, including up or down to another track. Drag its ends to trim. Moves snap to clip edges and the playhead.
  - Tools: ✂ Split at the playhead, ⇄ Versions (swap for another take of the same lineage, e.g. its 🎲 takes), 🗑, ＋ Track, zoom.
  - The preview plays the clips in order with two video elements: the next clip loads in the hidden one.
- **✏️ Edit in H3 Deck** opens `../#take=<id>`, and H3 Deck scrolls to that take and highlights it. Takes regenerated in place update the clip. New 🎲 takes are swapped in with ⇄ Versions.
- Still to come: exporting the timeline to one mp4 (helper node).
- The earlier app (cast, scenes, cuts, Cutting Room) is at `old.html`, with its README in `README-old.md` and its data in `h3film`.

Tests: `tests/t_film.js` (this app), `tests/t_film_old.js` (old.html), `tests/t_branch.js` (H3 Deck 🎲).

## ⬇ Export

The film screen's ⬇ Export button sends the edit list (each clip's file, trim, start and track) to Render's
helper (`POST /renderdeck/h3export`, progress at `GET /renderdeck/h3export?id=`), or to Main when Render is off.
The helper writes one mp4 into `<PC>/H3Film/` a frame at a time with PyAV (the upper track wins where clips
overlap; gaps are black and silent; sound is resampled to 48 kHz stereo), so a long film doesn't fill memory.
Needs the helper from 2026-11-03 or later.

## ➕ Carry on from here and ↻ Redo a stretch

Both work inside H3 Deck (the 🎞 Films tab), because H3 Deck does the rendering.

- **➕ Carry on from here**: select a clip and put the playhead where the new part should start (at least 1 s in).
  H3 Deck opens on Render with the take's settings. The take's video sits in the First frame slot as the video to
  carry on, cut at the playhead (`media.cut`, then `Video Slice` on the PC). Write what happens next and Render.
  The take gets `carry {src, at, film, clip, key}`. Films then ends the clip at the playhead, puts the new take right
  after it (starting at the cut, so the carried-over part isn't shown twice) and moves later clips along.
- **↻ Redo a stretch**: pick the start, end and words, plus 1 to 3 versions. H3 Deck renders one window on the take's
  PC with `redoPlan()`. The window runs from up to 12 frames before the stretch to 12 after it, on the 17k+5 grid.
  The take's own frames there are pinned every 4th frame with `MiniMaxH3AddGuide`, and its sound is pinned too.
  The result is spliced back into the full take with `ImageFromBatch` and `ImageBatch`. If the stretch reaches the
  end of the take, only the frames before it are pinned. The first redo to finish replaces the clip's take, and
  ⇄ Versions lists the original and the other redos.

Test: `CLIP=<a ~5 s video with sound> node tests/t_carry.js`.

## Clip history (2026-11-06)
- ➕ Carry on from Films (`carry.own`) renders only the new part. It becomes its own clip right after the clip it carries on from, and isn't stitched onto it. Motion Context still gets the frames before the cut (Video Slice of the earlier take). Older carry-ons, which are stitched, still work the old way.
- The new clip appears as soon as you press Render, and is striped while it renders.
- A selected clip shows its takes underneath: the takes of one Carry on, 🎲 more takes, ↻ redos and the original. Tap one to put it in the clip. If the clip ran to its end, it takes the new take's length and later clips move to fit. The ⇄ Versions button is gone.
- (later the same day) ➕ Carry on puts the new part on a **track above**, starting at the exact moment it carries on from. The original clip stays whole underneath, and the upper track plays where they overlap. A new track is added when the one above isn't free. **＋ More takes** in a carry-on clip's takes row sets up the same Carry on again (same moment, the clip's words) so you can change the words and render more; they join that clip's takes.
- Playback has no black flash between clips: the next clip (including one that starts on a track above) is loaded ahead of time, and the clip before stays on screen until the next one has its frame ready.
- A plain Render from Films goes at the end of the film, on the track that ends last.
- Scrubbing has no black flash: it uses both players. The player that already has the clip's video is used; otherwise the hidden one loads it while the last picture stays on screen.
- ⚡ **Preview** (under the transport) asks the PC's helper (`/renderdeck/h3export` with `preview:true`) to write the timeline as one small temporary video: half size, veryfast, one file per film in `H3Film/_preview`. While the edit is unchanged (`sigOf`), ▶ Play plays that video in real time. An older helper ignores `preview` and writes a full-size export instead. Clip-by-clip playback now follows the playing video's clock (it waits instead of seeking when data is late).
- (later again) Jordan went back to the first behaviour: ➕ Carry on **replaces the rest of the clip** from that moment on the same track. The clip ends at the cut (drag its end to get the rest back), and the clips after it move along. No extra tracks.
- **✓ Keep only this** in a clip's takes row deletes that clip's other finished takes: from H3 Deck's list, and their video files on the PCs through the helper's `/renderdeck/delete`. In the shared Dropbox, Deleted files can bring them back. Takes used anywhere on a timeline, or still rendering, are kept.
- **Snapping:** scrubbing within 10 px of a clip's start or end snaps onto it, and the timeline settles exactly there when the swipe stops. Dragging or trimming clips snaps to edges and the needle (14 px on touch).
- **↶ Undo** (in the Play bar) remembers the last 50 changes to clips, tracks and names while the app is open.
- **⤓ One track** merges every track into track 1 exactly as the film plays (the upper track wins where clips overlap). ↶ Undo brings the tracks back.
- **🎞 Use this take** on H3 Deck's take cards (under the form) puts that take on the timeline. It goes into the selected clip if it's one of that clip's takes, otherwise in place of its other version on the timeline, otherwise at the end of the film.
- **⏪ Lead in** (Jordan 2026-11-06, "5 seconds before"): makes 1–6 s that lead into the selected clip. In a window of L frames, the clip's own first frames (from its in point) are pinned with AddGuide at the END, every 4th frame plus the last. Only the first B new frames are kept (sound trimmed to match). It goes on the timeline right before the clip, and the clip and everything after it on its track move along. Takes of one lead-in are grouped in the takes row (`lead.key`).

## 🦴 Guidance track (2026-11-06)
🦴 Guidance track in the timeline tools. Make one track the guide: the PC writes that track as one video on film time (helper h3export, preview size), DWPose + depth read every frame (H3 Deck guideMake), and the skeleton/depth are kept per film (H3 Deck S.guides). Tracks above it follow it by default (🦴 on their label; toggle in the sheet). ➕ Carry on, ↻ Redo, ⏪ Lead in and ＋ More takes on a following track get the guide as the Motion guide from the right film time (ctl.off). ▶ Render over the guide = one take (1-3) per guide clip, same time and length, its words, the form's references/👥 subjects/model/LoRAs, placed on the chosen track (or a new top track). Tests: tests/t_guide.js.

Drag snapping: both the start and the end of a dragged clip snap to other clips' edges, the playhead and 0 (18 px on touch), with a dashed line at the snap.

Empty space (2026-11-06): tap the gap between clips on a track (or before the first clip); it is outlined, and its 🗑 button (or the 🗑 tool) closes it, moving every later clip on that track earlier together. Other tracks stay put; ↶ Undo brings it back.

Speed (2026-11-06): inside H3 Deck, Films reads takes straight from H3 Deck (it used to re-read and parse the multi-MB h3deck save several times per scroll event); scroll scrubbing runs once per frame; seeks are coalesced (only the newest wanted time is applied when a seek lands); the Shot box gets the words when a scrub rests (250 ms); H3 Deck takes-list videos only load when on screen.

## Separate tracks in bare bones (2026-11-13)
Jordan: "render one track and generate in another", and slide a whole track. Bare bones had hidden empty tracks, ＋ Track and dragging between tracks; they're back (nothing else unhidden).
- Every track shows, ＋ Track is in the tools, and a selected clip drags up or down to another track.
- 🎬 track: new clips (Render from the form with no clip selected, 📤 Upload, 🎞 One you've made) go on the end of the track you tapped last (a clip or empty space on it), or the one picked with 🎬 New clips go on this track in its ⋯ menu. ＋ Track makes the new track the 🎬 track. Before any tap it's the track that ends last, as before. Kept in memory while the app is open (`ACT`).
- ⇔ Select the whole track (track ⋯ menu): every clip on it is selected (`TSEL`); dragging any of them slides them all, keeping their spacing, never before 0 s. Any of their starts or ends snaps to the edges of clips on the other tracks, the playhead and 0 (pink line). Done (in the note) or tapping empty space / a clip on another track ends it. ↶ Undo takes a slide back. Test: tests/t_tracks.js.

## ⧉ Picture in picture (2026-11-13)

Jordan: "videos can overlay other videos… scale and rotate and move an entire track". A track's ⋯ › ⧉ Picture in picture
gives the track `xf = {s, r, x, y, snd}`: s = size (1 = fitted inside the frame), r = turn in degrees clockwise, x / y = its
middle as a share of the frame's width / height from the middle, snd = its sound is mixed in. Such a track sits over the
tracks below it (the first full-frame clip underneath shows around it); a full-frame track above still covers it.
The panel under the picture has Size / Turn / Left·right / Up·down sliders, corner buttons, ↻ 90°, 🔊, ⬜ Full frame again;
on the picture, drag = move, two fingers = size + turn (clicks onto quarter turns). Preview/scrub layers one `<video>` per
overlay track with CSS; ⬇ Export and ⚡ preview send `xf` per clip and the helper draws it with PIL (job answers `ov:1`;
an older helper's preview isn't used for a film with overlays). Test: `tests/t_overlay.js` (uses ffmpeg for two clips).
