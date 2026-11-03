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
