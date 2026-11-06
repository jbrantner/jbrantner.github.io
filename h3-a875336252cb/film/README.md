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
