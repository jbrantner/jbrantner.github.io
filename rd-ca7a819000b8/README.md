
**v.103 (2026-10-21):** 🧊 3D model: the fused model is drawn over the painted-in background (depth layers without the character, swung less), so holes and torn edges show the room instead of black; Use this angle only repaints what neither covers. Fuse now keeps the background in the mesh (no sky mask) and tears less (discontinuity 0.08). Press Fuse again for the new settings.

**v.104 (2026-10-21):** More progress bars, so a stuck job is easy to spot (Jordan asked). The MiniMax views show a loading bar with a % (downloading the clips, then taking the frames). Fuse shows a bar while it sends the 17 frames, then the real queue state ("Waiting behind N jobs", time so far). Every short step without a number (sending pictures, grabbing a frame) shows a moving bar.

**v.105 (2026-10-21):** 🧊 Fuse no longer says "update ComfyUI" when the computers just can't be reached; it says to check Tailscale instead.

**v.106 (2026-10-21):** 3D look ⭕ Full circle (Jordan's idea): one MiniMax FL2V clip that circles all the way round the still, using the still as first and last frame (Last frame: This still / Leave it free). The prompt has timed checkpoints: profile 1.3 s, back 2.6 s, other profile 3.9 s, home 5 s. Swing with ⭕ Full circle: dragging right plays it forward, left plays it backward from the end, with no stop; ↔ flips the direction; Wiggle spins it slowly; Use this angle finishes that frame. The left/right views are kept alongside.

**v.107 (2026-10-21):** 3D look **Character: 3D / Flat cut-out** (Jordan's idea). The flat cut-out is drawn straight on, always facing the camera, over the swung 3D background, in the view and in Use this angle (so only the background gets repainted). Shows when the still has the layered character cut-out.

**v.108 (2026-10-21):** ⭕ Full circle fixes from Jordan's first test. The drag now follows your finger (it was backwards). It shows the nearest frame and no longer blends two, which showed her twice; there are 72 frames now. The 3D look switches to the circle as soon as it's made. Picking Make: Full circle also switches the view.

**v.109 (2026-10-21):** 🧊 Fuse from the ⭕ full circle (Jordan asked to orbit all round her and tilt above or below). It takes 16 frames all the way round, with the still in the middle, through Depth Anything 3 multiview, and turns 8 of them into meshes 45° apart. The model turns without a stop and tilts up to about 70°. A From switch picks Full circle or Left and right when both exist. Fixed: Fuse again while looking at the 3D model used to hang on "Taking the frames".

**v.110 (2026-10-21):** 🧍 Her 3D model from the ⭕ full circle. It replaces the fused model, which showed copies because Depth Anything 3 couldn't place the cameras round a painted character. The circle's front, both sides and back go to Hunyuan3D-2mv (or Pixal3D), the shape is painted from those four pictures on the phone (bake3d), and she is drawn where she stands in the still over the swung background. Swing with 🧍 Her model: drag sideways to walk round her, up or down to look from above or below. From her model, Use this angle repaints harder, with line art ControlNet and a 0.65 then 0.55 pass with no colour match, so Illustrious redoes her shading and dress. New "Circle her on: The scene / Plain white" setting circles her cut out on white.

**v.111 (2026-10-21):** The comic redraws by itself when a computer comes on or goes off, so you no longer need to tap another panel and back. Her model now always looks for Hunyuan3D-2mv (on Render) instead of saying Pixal3D is missing.

**v.112 (2026-10-21):** Jordan's plan: **🧊 Turn into 3D object**.
- **Characters on: ⬜ White (for 3D) / 🏙 The place** is a new setting, white by default. Stills are painted on a plain white background (simple background, white background, with scenery negatives) and the place picture isn't used.
- Turn into 3D object makes a MiniMax full circle of the still on plain white. It then takes 16 views (every 22.5°) and reads each one's depth (MoGe-2 or Depth Anything) in one job; her outline comes from the white.
- A **Turn** slider (-8 to 8, front in the middle) picks the view, and a finger swings that view's own depth. Wiggle, ↺, ↔ Swap left and right, and Use this angle (on white) all work on it.
- The old 3D look experiments (layers, MiniMax views, Full circle, Fuse, her model, Flat cut-out) are no longer reachable from the panel.

**v.113 (2026-10-21):** 🧊 3D object: the 16 views now use Depth Anything (MoGe-2 stopped on a mostly white view with "max() iterable argument is empty"). MoGe is only used when there's no Depth Anything, and a MoGe failure retries once with Depth Anything.

**v.114 (2026-10-21)**: 🧊 Turn into 3D object is all video now, with no depth step (Jordan: Depth Anything wasn't good enough). MiniMax circles her on white three times: at eye level, from a high angle and from a low angle. The high and low circles start and end on the last frame of a crane up or down from the still, so all three show the same her. Each ring is lined up with the eye-level circle by her outline and colours (dynamic time warping), because MiniMax doesn't turn at an even speed. Drag sideways (or use the Turn slider) to walk round her. Drag up or down (or tap the Height buttons) to snap to the high or low circle at the same angle. ✨ Use this angle finishes the exact frame showing.

**v.115 (2026-10-21)**: Fixed the high or low circle failing with "height None". The clip size now comes from the still, and an empty frame is caught. If a circle fails after its crane is done, a "↻ Make the high/low circle" button retries it without redoing the crane. Swiping is reversed (per Jordan): drag down for the high circle and up for the low one.

**v.116 (2026-10-21)**: Jordan found the low circle looked just like eye level, so the high and low circles are gone. 🧊 3D object now makes the one eye-level MiniMax circle. Stop at any angle, then tap ⬆ Up, ⬇ Down, 🔍 Zoom in or 🔭 Zoom out to have MiniMax make that camera move from that exact frame. Dragging up or down (or the move slider) scrubs the move, and dragging sideways goes back to the circle. Every move you make stays listed as a chip, so you can look through it again. ✨ Use this angle finishes whatever frame is showing.

**v.117 (2026-10-22)**: 🧊 Turn into 3D object is now set-and-forget. It makes the eye-level circle, plus a crane up and a crane down from the still. In each crane it picks the frame where her outline has changed most, and it says so if the crane barely moved. From those frames it makes a high circle and a low circle whose prompts insist the camera never comes back to eye level. The high and low circles are lined up to eye level by her outline. Drag up or down (or use the Height buttons) to snap between them; drag down looks from higher up. ⭕ Circle from here re-makes a high or low circle from a frame you pick by hand in any ⬆ or ⬇ move.

**v.118 (2026-10-22)**: 🔑 The keyframed 3D object, Jordan's design. 🧊 Turn into 3D object makes 12 keyframes, from two sources:
- **Eye level:** the still and the eye-level circle at its side, back and other-side marks.
- **High and low:** a crane up and a crane down from each eye-level keyframe, using the furthest frame of each crane.

Each height then becomes four quarter turns made with MiniMax FL2V, each one starting and ending on neighbouring keyframes. That way all three heights reach front, side and back at the same moment. There are 21 jobs in all, alternating between both PCs. One step function moves the run forward whenever a job lands and whenever the app opens, so it carries on after the app is closed. Drag sideways to turn, and up or down (or the Height buttons) to snap heights; drag down looks from higher up. Camera moves and ✨ Use this angle work as before.

**v.119 (2026-10-22)**: Fixed the blank Comic tab. An older saved 3D state (the v.114 rings) crashed the 3D panel, and that blanked the whole tab. Old states are now handled. If any part of the comic page fails to draw, it shows a message instead of a blank tab, and if the 3D panel itself fails, it offers to start the 3D object again.

**v.120 (2026-10-22)**: 📄 Pages and comics (Jordan: build one page start to finish). Under the comic header there's a Comic row (➕ New comic, plus a picker once you have more than one) and a Page row (page numbers, ➕ New page, 🗑 Remove). Each page keeps its own script, and 📖 Read the script only rebuilds the page you're on. A new comic keeps the old one in the list (an empty comic is dropped when you switch away). Removing a page asks first, stops its running jobs, and leaves its pictures in the Library. Hidden mode has its own comics.

**v.121 (2026-10-22)**: ✏️ The script is now one box per panel (➕ Add panel, ✕ to remove), and the page preview follows the boxes straight away. The old single box is kept folded as 📋 Paste a whole script, which splits it into panels. 👥 Characters is a library shared by every comic and page; each entry has a name, an @tag, she/he/they, a look (tags) and an optional character card for its LoRA and pictures. In a panel box, 👤 Add a character puts the @tag where the cursor is. The panel text stays short, and the look is added to the prompt from the library, so changing it there changes every panel. ⬜ Character only is now a per-panel switch that paints that panel on white; the old comic-wide White/Place row is gone.

**v.122 (2026-10-22)**: 👥 Library characters can have LoRAs of their own (➕ Add a LoRA, pick one, set its strength; several allowed, no card needed). They go into every panel that character is in, along with their activation words. Typing a character's look now shows Danbooru tag suggestions, and when you leave the box, plain words are turned into tags ("long black hair and green eyes" becomes long hair, black hair, green eyes). Count tags like 1girl and solo are removed, because each panel counts its people from she/he/they.

**v.123 (2026-10-22)**: 🎨 Comic look is a fold at the top of the Comic tab, holding the model, the style LoRA and its strength and words. It applies to every page, every panel and every library preview in that comic. The style LoRA isn't offered on library characters and is never applied twice. 👁 Generate preview on a library character paints them full body, standing, on white, with the comic's model and style plus their own LoRAs and look, so you can see what the tags do. It shows a progress bar and the picture stays under the character.

**v.124 + helper (2026-10-22)**: 📦 Copy Qwen to the other computer (⚙ › Add a model or LoRA › Between your computers). It copies the Qwen Image Edit set (edit model, text encoder, VAE, Lightning LoRAs) once, from the PC that has it to the one that doesn't, over the home network. The helper route is POST /renderdeck/sync {source, only:'qwen'}. It refuses if there isn't enough disk space, and it skips MiniMax's Qwen-named encoder. The automatic sync still leaves Qwen alone.

**v.125 (2026-10-22)**: 🦴 each comic panel box shows a blank frame in the panel's shape (with its size); tapping it, or tapping the picked empty panel on the page, opens the Pose Rig full screen in that shape, as a character picked from the library (the one tagged in the panel first). Each panel keeps its own rig (pose, body, camera) on the phone; ✓ Done keeps a little picture of the frame, shown in the box and faded in the page's panel.

**v.126 (2026-10-22)**: 🦴 a panel's posed rig now steers its stills: ✓ Done keeps the rig's OpenPose and depth guides (on the phone, beside the comic) and where she stands in the frame; 🖼 Paint the still sends them through ProMax (OpenPose 0.85 to 70%, depth 0.45 to 50%) and paints the character only where the rig stands.

**v.127 (2026-10-22)**: 🎬 a posed panel's stills can be drawn by MiniMax H3 (Pose by: 🎬 MiniMax + pictures, the default; or 🖼 Illustrious + ProMax): the characters' pictures (card, else the library preview) as references, the rig's Outline guide as a 9-frame still control video through the Fun ControlNet (as canny, strength 1, full model 20 steps), the middle frame saved as the still. Only on a computer with the Fun ControlNet (Render).

**v.128 (2026-10-22)**: the panel editor has 🦴 Its pose rig (opens the rig even when the panel shows a still) and 🗑 Clear its stills (asks first; they stay in the Library).

**v.129 (2026-10-22)**: MiniMax-posed stills use Turbo at 4 steps by default (Steps: ⚡ Turbo (4) / Full (20), per comic); the 3D object note no longer says "About NaN min".

**v.130 (2026-10-22)**: 🎬 Director mode on a comic panel with a still: pick an Action (walking, running, holds the pose, turns around, looks back, sits down, waves, or type your own) and a Camera (static, side, other side, behind, high, low, push in, pull back). MiniMax H3 reference-to-video, the still pinned as frame 0 and each character's card or library preview as a "model sheet" reference, hybrid Turbo 4 steps; the clip lands as a take (scrub, 📸, ✨ Finish). The prompt pieces were tested on Render in three rounds (RenderDeck/director_tests): side 9/9/9/10, low 9/9/8/10, high 8/9/8/9 (camera/outfit/face/walking). Fixed a page error when a host without takes had a clip loading.

**v.131 (2026-10-22)**: 🎬 Director mode chip rows (Action, Camera) swipe sideways on a phone (they were clipped). Camera "Static" is now 🚫 No camera change: the prompt says nothing about the camera, so the character animates in the still's framing.

**v.132 (2026-10-22)**: Floor for ⬜ Character only panels (per comic, panel editor): 🔲 Faint grid (default), 🌑 Shadow, ⬜ Plain. Grid adds "white floor, grid, perspective grid, tile floor, shadow" to the still, drops "floor, shadow" from its negative, and tells Director mode "A plain white floor marked with a faint light-grey grid; the grid stays fixed to the floor as the camera moves, and her shadow falls on it under her feet." Tested on Render: feet stay planted on the grid through a side arc (8.5/10 vs 6 on plain white).

**v.133 (2026-10-22)**: 🎬 Director mode has a Steps choice per comic: ⚡ Turbo (4 steps, the hybrid Turbo with its ref2v LoRA, default) or Full (20 steps on the base MiniMax H3 model, no Turbo LoRA, about 12 to 20 min).

**v.134 (2026-10-22)**: 🛋 3D set. The panel rig has a third mode, 🛋 Set, with flat Top / Front / Back / Left / Right views: add a starter room and blocks of furniture (floor, wall, door, window, rug, table, chair, bookshelf, sofa, bed, counter, box, pillar, floor lamp, plant), tap one to pick it, and a drag slides it along one axis only (the way the finger first goes), 5 cm steps; she slides along the floor the same way. Turn 90°, copy, remove, size and colour in the Set tab. The set is shared by every panel of the comic (rd-pose-rig-set-<comic>). On ✓ Done the panel keeps the set seen from its camera (colours, depth, and a mask of any piece standing in front of her). The panel then offers 🏙 Paint the set: Illustrious over the set's colours at 0.72 denoise, held by its depth (ProMax 0.75) and Canny edges (0.5), nobody in it, plus an optional "what the set is" line. Her stills are then painted into that painted set: only where the rig stands is repainted, the set is pasted back exactly around her, pieces in front of her go back on top, and each still also saves her alone with transparency (JoinImageWithAlpha, prefix _cut). ⧉ Duplicate as the next panel copies a panel's text, rig (pose, camera), set picture, picked still and direction into a new panel after it; Copy from panel… does the same into the picked panel. Director cameras: Right side / Left side (hers) and a new ⬆️ Front (untested on Render).

**v.135 (2026-10-22)**: 🧍 Poses. In a panel rig, 🧍 Make a pose takes the pose from 24 angles (low, eye level, high × front, ¾, side, ¾, back, ¾, side, ¾; the same distance and lens each time) as OpenPose + depth guides, paints each in Illustrious with the character's LoRA and look (one seed for all, ProMax OpenPose 0.85 / depth 0.45, angle tags like from behind / from above), cuts it out with BiRefNet (transparent PNG) and keeps it under the comic's 🧍 Poses fold (24-picture grid, progress, ↻ paint the missing angles). Hidden has its own poses. In any rig's 🛋 Set tab a pose is a piece: a camera-facing picture that swaps to the nearest of the 24 views as the camera goes round or up and down; Turn 45°, Size. Painting a set with poses in it keeps them (no "no humans", 0.5 denoise). 🛋 Set mode now picks pieces from a Layers list (a tap in the view never picks; a drag moves the picked piece, or the view when nothing is picked), and splits the view: flat view on top, the panel camera underneath.

**v.136 (2026-10-22)**: a trimmed Comic tab. Taken out of the panel screen (Jordan: "all"): the Straight to video route (Style line, Video LoRA, Quality, What MiniMax is told), 🧊 Turn into 3D object, Pose by MiniMax + pictures (posing is always Illustrious + ProMax now), 🎬 Animate (per panel and for the page), the Place picture section and the Cast section. Options, Tags, Background and the Place words sit in one ⚙ More fold. Old data is kept; an old place picture can be dropped from ⚙ More. In the rig's 🛋 Set mode a piece now drags both ways across the flat view with the depth locked (↔ One way brings back the old single-axis drag), and a Spin / Tilt slider turns it to any angle round the axis of the view, with 🧲 Snap to 45° and ↺ Straight. 🧍 Make a pose only looks at the camera in the front views (looking ahead elsewhere, looking at viewer in the negatives).

**v.137 (2026-10-23)**: 🧍 Poses. Paint by 🎬 MiniMax turn + Illustrious (the default when Render's Fun ControlNet is on): the rig films its outline turning a full circle at each of the 3 heights (49 frames), MiniMax paints her turning through the Fun ControlNet with her library picture as the reference, every 6th frame is one of the 8 directions, and each is painted over in Illustrious (her LoRA, ProMax OpenPose + depth, denoise 0.5) and cut out. 🖼 Illustrious only is the old way. Eyes: 24 looking away, or 48 with a second 👀 looking-at-camera set (also addable to a pose afterwards while its rig is fresh); in the rig's Set a pose piece with that set has a 👀 Looks at camera switch. Pose pictures go only to computers that can cut her out (BiRefNet). The rig's Bust slider goes to 5.

**v.138 (2026-10-23)**: 🧍 Poses, set and forget. MiniMax no longer follows the rig (its outline renders were wrong): a start picture is painted in Illustrious from the rig (front and both ¾ at eye level), 🤖 the best is picked without AI (how much face the rig's head shows the camera, how open the silhouette reads, and how well the painting's cut-out matches the rig's outline; or tap one), and MiniMax H3 FL2V turns from that picture alone: an eye-level circle, crane up / down, then high / low circles from where the cranes end. 8 evenly spaced frames per circle are painted over in Illustrious (her LoRA, ProMax line art from the frame, 0.45) and cut out. 🦴 From a saved pose: pick one of the rig's My poses and who does it, ▶ Make it (the rig opens out of sight). 📱 Start from a picture: upload one or use the preview, say which side it shows her from.

**v.139 (2026-10-23)**: 🧊 Make 3D under any render (and in the viewer). MiniMax turns round the picture (eye-level circle, crane up/down, high/low circles), every angle gets the Illustrious pass with that render's own model, LoRAs and prompt and is cut out, and she stands in a grey room with a grid floor (rig/view.html) that you orbit with a finger. 🏙 Paint 3 backdrops paints flat pictures (no humans, your words) to stand behind her; ✨ Paint it flat paints over what the camera sees (Light / Medium / Strong) and lands in the strip, keeping its 3D, camera and backdrop, so 🧊 on it opens the scene again.

## 2026-10-23.140
- 🧊 Make 3D shows what is running: each MiniMax move or angle being painted gets ComfyUI's live preview picture (when the PC sends one) and its own step bar with time left ("step 3 of 8"), or its place in that PC's line.
- The MiniMax moves now spread over every PC that has FL2V instead of all going to the first one.

## 2026-10-23.141
- 🧊 Make 3D: ✕ Stop (takes its jobs out of the PCs' lines and stops the running one), ▶ Carry on, and ↻ Start over from the picture.
- A pose job waiting in a busy PC's line moves to a PC that can make it and is idle.
- The 3D viewer shows the picture itself until the angles are painted, instead of a white card.

## 2026-10-23.142–143
- 🧊 / 📱 poses from a picture keep the picture's shape: MiniMax and the Illustrious pass use its aspect (FL2V stretched a square picture into a tall clip), and the 3D card matches it.
- 3D viewer: the camera can go under the floor to look up at her (low ring); a smaller 4 m grid; two fingers pinch to zoom and drag to pan, and the camera still turns round her after a pan (double-tap recentres).
- 🧊 Illustrious pass on each angle: Off (MiniMax frames, just cut out; the new default) / Light 0.3 / Full 0.45. Paint over's Light/Medium/Strong buttons work again.
- Spreading pose and MiniMax jobs uses each PC's own ComfyUI queue length, so jobs cleared in ComfyUI no longer count against a PC; a waiting MiniMax move sent by an older version can move to an idle PC too.

## 2026-10-23.144–145
- FIX: since v.140 every live preview picture from a 📖/🧍/🧊 job started a new character-preview render (two functions shared a name), which filled both PCs' lines with hundreds of jobs. Renamed; live pictures only update the 🧊 thumbnails now.
- 🧊 shows when a PC that could help has a line of other jobs, with ✕ Clear its line.

## 2026-10-23.146
- 🧍/🧊 pose jobs go out one per computer at a time (Jordan): the rest wait in the app, and whichever PC is idle (nothing in its ComfyUI line) takes the next one it can make, MiniMax moves first. 🧊 shows how many are waiting. Needs the app open; it picks up again when the app opens.
- Removed the live picture for these jobs (MiniMax sent nothing useful); the step bars stay.

## 2026-10-23.147 (helper: farm chains)
- 🧊 Make 3D (and 📱 poses from a picture) run on the farm when Render's helper has chains: the whole 3D is handed over at once and runs with the app closed. MiniMax moves first, each high/low circle waits for its crane and each angle for its circle, taking that job's frame (fetched from whichever PC made it); one job per idle PC. ✕ Stop cancels its farm jobs. Without the new helper the app hands them out itself while open (v.146).
- Helper: farm jobs take `after` (keys) and `use` ({LoadImage node: [key, n]}); `/renderdeck/farm` says `chain: 1`.

## 2026-10-23.148
- 🧊 Make 3D "Turn her with": 🦴 Rig + Illustrious (new default, after MiniMax's turn wasn't great) or 🎬 MiniMax. The rig copies her pose from the picture (DWPose on a PC that has it, else the phone's reader), then each of the 24 angles is an Illustrious render from the rig's pose and depth with the picture's own model, LoRAs and prompt; all 24 go to the farm at once.

## 2026-10-23.149
- 🧊: a finished 3D has ↻ Make it again (with the Turn her with setting), not only one still running.

## 2026-10-23.150
- 🧊 Describe her: tags put first in every angle (on top of the picture's own prompt), so the back and sides keep the same hair, clothes and shoes.
- 3D viewer: the picture standing in before the angles arrive keeps its own shape.

## 2026-10-24.184

- 🖼 Flat on the 3D preview is now "copy canvas" (Jordan): it saves the view as it is as a PNG of only her, see-through around her, no grid, floor or shadow, into the library and the open project, and shows it.
- 🧊 Look only picks a strength now (Jordan: picking one started 80 paints). 🎨 Render character paints at it. "🖌 Paint every angle at …" paints the whole 3D at that look if you want it, and "✕ Stop painting the angles" stops it. 🖌 Repaint this angle uses the MiniMax picture when the look isn't painted across the 3D.
- A picture you tap while renders run stays on screen. The live picture and newly landed renders no longer pull you back, and the next Render tap lets go (Jordan).

## 2026-10-24.183

- 🖥 3Ds made with the app closed now actually start. Edge on Render blocked the hidden app (loaded from github.io) from reaching the PCs' Tailscale addresses ("Permission was denied for this request to access the local address space"), so it never took a job and the helper reopened it every 2 minutes. The helper now serves the app from Render's own address (/renderdeck/app/) and opens the hidden copy from there. It waits 10 minutes, not 2, before deciding the hidden app has stalled. Needs helper paste on Render.

## 2026-10-24.182

- 🗂 Projects (Jordan's idea): each thumbnail under the picture is now a project, not a single render. The thumbnail shows the picture you last looked at in that project. Renders made while a project is open go into it, and its pictures are in the smaller row below (tap one to show it; it becomes the project's thumbnail).
- ＋ New project starts an empty one, and your next renders go in it. A render started in one project lands there even if you open another meanwhile. ✎ Rename names the open project.
- Your renders from before, and ones found on the computers, are in "Earlier renders". Hidden keeps its own projects. Each project keeps its latest 60 pictures in the app (300 in all); the files on the computers are untouched.

## 2026-10-24.181

- 🧊 The 3D block stays in the recipe when you tap another thumbnail. Tapping loads that picture's recipe, which dropped the block (Jordan found it).
- 🖥 Hand it to Render: a 3D being made from the app can be moved to Render once Render has the new helper. While Render doesn't have it, the block says so.

## 2026-10-24.180

- 🧊 3D is now a block (＋ Add a block › 3D), not its own screen (Jordan's redesign). ▶ Make it 3D turns the picture in the preview into 3D: MiniMax goes round her at 5 heights, led by the rig, and the preview shows her in 3D when it is done. No angle pictures, backdrop or "make it a picture".
- Faces: every picture of a 3D gets FaceDetailer in Illustrious (face_yolov8m), the MiniMax pictures and every look. There is no switch for it.
- Look: MiniMax / Light 0.3 / Medium 0.4 / Heavy 0.55. Illustrious paints over the same MiniMax frames, all 80 pictures (40 angles plus the in-between frames). Each look is painted once and kept, so switching between them works like a quality setting.
- 🖌 Repaint this angle repaints the angle you're looking at, in the look shown, with a new seed.
- 🎨 Render character paints the current view as one Illustrious picture with the render's own prompt, at the look's strength (Light when the look is MiniMax), face fixed. It is cut out along her outline in the view (LoadImage mask → JoinImageWithAlpha) and lands in the strip.
- Made with the app closed: with the new helper on Render, the 3D is handed to Render, which opens the app hidden (Edge headless, ?worker=1) to make it, and taps on the phone (look, repaint, stop) are passed on. Without the helper it is made from the app, as before.
- The row under the picture is gone for now (✨ Finish stays for drafts). Use as start picture and the rest are still in the photo viewer.
- Fixes found by the new test (tests/t_d3block.js): the block couldn't be added, the angles waited for picks on the hidden app, and the preview didn't turn 3D when it finished. Tapping the picture opens the viewer again.

## 2026-10-24.179

- 🧊 5 heights (Jordan picked it): new MiniMax 3Ds also turn round her at 20° up and 10° down. Each of those turns starts from the middle frame of the crane up / crane down (cranes now keep their middle and last frames). 40 angles, 80 with the in-between frames. The viewer shows the nearest height's pictures (older 3Ds with 3 heights keep the 32° / -20° switch).

## 2026-10-24.178

- 🧊 Viewer: pictures follow the camera again, feet planted (the locked pictures looked bad). Locked is only on with rig/view.html?lock=1.

## 2026-10-24.177

- 🧊 Viewer, 📌 locked pictures (to try): each picture stands facing the way it was made and no longer turns to follow the camera; it changes only at the next angle. rig/view.html?follow=1 brings back the turning card.

## 2026-10-24.176

- 🧊 Viewer: no fade between angles at all, dragging or not (Jordan said no).

## 2026-10-24.175

- 🧊 Viewer: the eye-level pictures hold until 32° up and 20° down (near where the high and low ones were made), and the high and low pictures are never stretched past their own size, so her head stays its size.

## 2026-10-23.174

- 🧊 Viewer: the high pictures take over from 27° up (was 20°), and a picture made from above or below is never stretched more than 8% past its size from where it was made, so her head no longer grows big while her height still has no jump at the switch.

## 2026-10-23.173

- 🧊 Viewer: her height on screen follows the camera smoothly. Each picture is sized and tilted to the rig's head-to-feet line as seen from where the camera is now, not from the height the picture was made at, so her head no longer jumps up where the high pictures switch to the eye-level ones.

## 2026-10-23.172

- 🧊 Viewer: the next angle fades in near each switch again, but only while you drag. When you let go, and in any flat shot, it shows the one nearest picture.

## 2026-10-23.171

- 🧊 Outfit references for the high and low circles are OFF again: they painted the skeleton onto her dress and made the head pop. Back to the v.167 way (first-frame model following the skeleton video).

## 2026-10-23.170

- 🧊 The high and low circles (skeleton video plus the eye-level outfit references) now use the full MiniMax model at 20 steps instead of Turbo at 4: on Turbo the skeleton's lines were painted onto her dress. Those two moves take longer.

## 2026-10-23.169

- 🌄 360° background in 🧊 Turn into 3D: pick a backdrop, tap 🌀 Turn the backdrop 360° (MiniMax turns the camera on the spot, starting from the backdrop), nudge the 3 picks at 90°, 180° and 270°, then tap 🔁 Make it loop. MiniMax runs again with the backdrop as first and last frame and the picks as key frames, the frames are stitched into one long panorama, and the viewer wraps it around the scene like a ring. On/off and ↻ Make a new one in the same section.

## 2026-10-23.168
- 🧊 one outfit all the way round (Jordan): in a 🦴🎬 3D the eye-level turn is the design; its back and two side frames go to the high and low turns as reference pictures (MiniMax's reference model on the same computer, with the first frame pinned and the pose ControlNet still leading), so they copy her back instead of making it up. Without the reference model a computer makes them as before.

## 2026-10-23.167
- 🧊 Make 3D locked to what works (Jordan): 🦴🎬 MiniMax led by the rig, no Illustrious pass, angles go ahead on their own; tapping 🧊 on a picture that isn't 3D starts it straight away, with no choices shown (window.M3_FREE unlocks them for the tests).

## 2026-10-23.166
- 3D viewer: a flat (orthographic) camera, so zooming in no longer bends her (Jordan); pinch zooms instead of moving the camera closer, and the card faces back along the line of sight. Saved cameras from before turn their distance into the zoom.

## 2026-10-23.165
- 3D viewer: the fade between angles is taken out again (Jordan: a flat render of the view needs one clean picture). 16 angles and pinning to the rig stay.

## 2026-10-23.164
- 3D viewer, less popping: (1) 16 angles round each ring for MiniMax 3Ds kept as MiniMax drew them: the frame halfway between each two picked angles is already in the turn (cmViews16); (2) near each switch the next angle fades in over the nearest, to half at the switch; (3) rig-led 3Ds store her head-top-to-feet line from the rig (P.rigV) and each picture is sized and tilted (up to 15°, about her feet) so its own head-to-feet line matches the skeleton's from that angle, so her head sits where the rig's does.

## 2026-10-23.163
- 🦴🎬 angles by maths: the rig fit now gives her facing and each view's turn, so the eye-level front, ¾, side and back are the frames looking at her front + n × 45° on one steady turn fitted through the views; the 4 rig-led moves start at the rig's own front. The eye-level angles wait for the rig fit (or its failure) before painting.

## 2026-10-23.162
- 🦴🎬 MiniMax led by the rig, the way it was meant: MiniMax's plain eye-level turn comes first, then the rig is fitted to about 15 of its views at once (DWPose on a PC, else the phone's reader; Pose Rig's solveOrbit, new RIG.poseFromOrbit), so hidden or foreshortened legs come out right. Only the other 4 moves follow the skeleton; each goes to whichever computer with the pose ControlNet is free. Older rig-led 3Ds keep the picture-only rig.

## 2026-10-23.161
- 🧊 MiniMax 3D: a circle whose frames came back while the app was closed or reloading had no angles picked, so that ring's 8 angles waited for ever and the bar stopped. It is now lined up by itself.

## 2026-10-23.160
- 🦴🎬 MiniMax led by the rig: a computer that runs MiniMax but lacks the pose ControlNet gets a 📦 Get it on … button (2.3 GB from Comfy-Org/MiniMax-H3 on Hugging Face, the same file Render has); once it's there, that computer takes rig-led moves too, including ones already waiting. Needs the helper with the model_patches folder.

## 2026-10-23.159
- 3D viewer: from above (or below) she keeps the size she is drawn at; each picture is sized only against the front at the same height, so her head no longer grows as the camera rises.
- 🧊 MiniMax 3D: the front angle is the frame where she really faces the camera, not the picture she started from: of the frames within 60° of the start, the one whose outline is most mirror-even. The other seven follow from it; the picture itself only starts the turn.

## 2026-10-23.158
- 3D viewer: every angle loads as soon as it opens, and a picture only swaps in once it has loaded, so turning round her never goes blank.
- 3D viewer: planted feet. Each picture is moved and sized so her feet stand on the same spot on the floor and she is as tall as in the front view, wherever MiniMax or Illustrious drew her in the frame; the card turns to the camera about that spot, so looking from above or below doesn't slide her feet either. (Also: the floor grid was never drawn, now it is.) Test: rig/tests/t_view.js.

## 2026-10-23.157
- 🧊 3D angles go to every computer that can paint them, not only ones with BiRefNet (Main sat free while Render did it all). A computer without BiRefNet paints on white, and the 3D viewer (and the rig's set) cuts the white away from the edges in, so white inside her (a blouse, socks) stays.

## 2026-10-23.156
- 🧊 A 3D left on "Copying her pose onto the rig…" (the app was closed or reloaded during that step, which runs in the app) now starts the step again by itself while the app is open. So does a rig-led one whose skeleton videos were lost with a reload, and a rig one whose angle guides were.

## 2026-10-23.155
- Rig: a limb that is straight in the picture stays straight. Reading a picture used to turn "this bone looks shorter than the rig's" into depth, so anime-length legs folded at the knee (and showed bent from the side, in 🦴 and 🦴🎬 3D). Now a nearly straight leg or arm lies flat, or leans as one piece when it is much shorter.
- 🧊 3D: the front angle is her real front, not just the picture's view. With 🦴🎬 MiniMax led by the rig her facing is known, so the 8 angles start from it; 🎯 Pick the angles also has ↶ Turn all / Turn all ↷ to move every label one angle round when "front" isn't her front (plain 🎬 MiniMax).

## 2026-10-23.154
- 🧊 on a thumbnail marks a render that has been made 3D (faded while it is still being made; its ✨ flat paints don't get one).
- The preview shows a 3D render in 3D straight away (drag to walk round her), with 🖼 Flat / 🧊 3D in the corner to flip. A live render preview takes the picture back while something paints.
- 🧊 Make 3D on a picture that isn't 3D yet no longer starts at once: it shows the picture, the choices (Turn her with, Illustrious pass, Describe her) and ▶ Make it 3D. ↻ Make it again still starts straight away.

## 2026-10-23.153
- ☰ Queue shows everything in each computer's line under its row, not just this queue's renders: 3D angles and MiniMax turns, comic stills and clips, character previews, the farm's jobs, other phones' or ComfyUI's own. Each says what it is (from what it saves, its model and prompt), whether it is running (with steps when this phone sent it) or waiting, and who sent it; ✕ stops or takes out one, "Clear the N waiting" empties the line. Hidden jobs stay unnamed outside Hidden. The list refreshes every 3 s while the queue is open.

## 2026-10-23.152
- 🧊 Make 3D with 🎬 MiniMax: each circle now keeps 31 frames (every 4th) and the 8 angles are lined up on their own: the frame where her outline is back to the first one marks a full turn, and the angles are spread evenly over it (MiniMax doesn't always turn in exactly 5 s). Then 🎯 Pick the angles shows the 8 per height with ‹ › to nudge any one a frame, and ✓ Use these angles sends them to the Illustrious / cut-out pass. "Each time: Ask me / Go ahead on its own" skips the check. The angles are handed over once picked, so that step needs the app open (the MiniMax moves still run with it closed).
- 🧊 Turn her with: 🦴🎬 MiniMax led by the rig. The rig copies her pose from the picture, then makes the skeleton's 5 moves (eye-level circle, crane up / down, high / low circles) as DWPose-style control videos, its first frame fitted onto her in the picture. MiniMax follows them through the Fun ControlNet Union (pose), so it turns at a steady speed and the 8 angles are exact eighths of the turn (still shown in 🎯 Pick the angles for nudging). Only PCs with the ControlNet (Render) make these moves, and they don't go to the farm.

## 2026-10-23.151
- 🧊 says when a PC is busy with another 3D's jobs on the farm, instead of calling them other jobs.

## 2026-10-25.185

- 🗂 🗑 Delete next to ✎ Rename deletes the open project and its pictures, every version, from both computers (Dropbox keeps them in Deleted files). Then it opens your next project. Works in Hidden too (Jordan asked).

## 2026-10-26.186 (helper: colour match + big thumbnails)

- New 🧍 Character Creator, a page of its own at `chars/` (or `?cc`). It runs the 3D Character Workflow in 5 steps on Render's helper, so the app can be closed: 1 your reference picture and tags, 2 full body with MiniMax (reference route, Hybrid Turbo + ref2v 4-step, mouth closed), 3 AFKJ redraw (inpaint 0.45 + line art 0.6, ESRGAN 2x, soft face fix), 4 turnaround (rig-led MiniMax orbit, pose ControlNet 0.6 ending at 60%, 40 angles over 5 heights), 5 finish on every angle (AFKJ masked repaint 0.3, line art 0.8 + tile 0.6, colour match on her cut-out 0.6, soft face fix, white paste-back). The viewer turns her by dragging left/right and changes height by dragging up/down, with no crossfade; feet sit on one floor and her size follows eye height. ↻ Redo from here on any step.
- Helper: `RenderDeckCutoutColorMatch` node and `/renderdeck/thumb?size=` (up to 1600 px). Without the new helper, step 5 skips the colour match and the viewer uses small thumbnails.

## 2026-10-26.187

- 🧍 Character is now a third tab next to 🎨 Render and 📖 Comic (Jordan asked). The tab remembers itself like Comic does; `chars/` and `?cc` still open it.

## 2026-10-26.188

- 🧍 Character: typing in the name and tags boxes works again (a redraw every 1.5 s took the box away once she had a name).
- Tapping one of your renders as her picture fills step 1 from that render: its prompt (plus added tags) as her tags, its model, AFKJ as the style LoRA and any other LoRA (her character LoRA) under "Her LoRAs", used in the Illustrious steps with its activation words. ✕ leaves one out. Only a picture with no recipe goes to the tagger.
- When a PC doesn't have the WD tagger yet, "Read them from the picture" offers to get it (1.26 GB, once) and reads the tags when it's in, instead of stopping with an error.

## 2026-10-26.189

- 🧍 Character viewer: only finished (step 5) angles are shown. An angle still waiting for its finish holds the nearest finished one at that height (or eye level) instead of its raw MiniMax frame, which was on grey, not cut out, and came out too big. No fade.

## 2026-10-26.190

- 🧍 Character: step 4's cut-outs and step 5's finishes only go to a PC with BiRefNet (Main has none yet, so 22 of Ellie's angles came back without a cut-out). Step 5 now finds her outline with BiRefNet, kept inside the picture's own cut-out, so a picture without one no longer has its white background repainted as part of her.

## 2026-10-26.191

- 🧍 Character viewer: her turning axis is the middle of her body (35–65% of her height) and her floor point is the middle of where her feet touch. From above she no longer orbits the centre: the old anchor was the bottom band, which from up there is only the foot nearer the camera.
- Step 5 saves every angle as a see-through PNG (her outline as the alpha); the viewer still draws her on white.

## 2026-10-26.192

- 🧍 Character: 🧊 Open in 3D stands her in the 3D viewer (grey room, grid floor, orbit / pan / zoom), with her 80 finished see-through angles (16 round each of the 5 heights). In the viewer a character stands on the middle of her body and where her feet touch, upright, so she turns on her own axis from every height.

## 2026-10-26.193

- 🧍 Character, heights lined up: the high and low circles get their own turn length from their frames (her outline half a turn on is her outline mirrored), starting at her front. With the pose guide letting go at 60%, MiniMax took 31–35 frames a turn, not 30.75, so the higher views drifted to ¾ where eye level was front. `ccredo:4.5` lines a character up again from the circles already made (new angles for those heights and every finish; no new MiniMax moves).
- 🧍 Character, colours: step 3 ends colour-matched (on her alone, 1.0) to the full body MiniMax made, and step 5 matches every angle to the full body at 0.8. The AFKJ redraw had lifted her blacks 2.3× and lost 39% of her colour, and step 5 was pinned to that.

## 2026-10-26.194

- 🧍 Character: a circle's own turn is now found from how wide her shoulders and arms are (narrowest from the sides, which are half a turn apart) and, when the clip comes back round to her front, the frame most like the first. The mirrored-outline fit in v.193 locked on to wrong turns (24 frames for one of 31) because from front and back she is near enough symmetric.

## 2026-10-27.195

- 🧍 Character: her high and low angles now come from the eye-level turn. For each of the 8 eye-level sides, one MiniMax clip starts on that side's own frame, rises to high, then sinks past eye level to low, led by the rig's skeleton at 0.6 (letting go at 60%). Every height then shows the back the eye-level turn drew. Before, the low circles started from a camera below her, couldn't see her hair, and made up a different back.
- Low heights stay above the floor: low is −12° and a little low −4° (they were −25°, below the floor, and −10°, at her shins). The viewer reads each character's own heights.
- Drift check: when the clip passes eye level again it should look like its first frame. One that doesn't (it turned, or changed her) is made once more.
- 16 angles round at eye level and 8 at the other heights, so 48 in all. ↻ `ccredo:4.6` remakes an older character's high and low angles this way and keeps her eye level.

## 2026-10-27.196

- 🧍 Character: the up-and-down clip's prompt now says "about 35 degrees above her eye level, still seeing her face, whole body and feet, never over her". "High above her, the top of her head" sent MiniMax straight overhead, so the high angle was only the top of her head.

## 2026-10-27.197

- 🧍 Character: from behind, MiniMax turned her round to face the camera during the up-and-down clip, and on her back it changed her outfit. Now:
  - each clip pins its first frame again where the camera passes eye level (MiniMaxH3AddGuide);
  - the prompt says she never turns towards the camera;
  - the drift check also compares her colours, at eye level again (over 0.055) and at the low end (over 0.03). Her outline alone looks the same from the front and the back.
- A character made on Render with the app closed now shows its progress. The app checks a finished character again once a minute, so a run started again on Render shows up.

## 2026-10-27.198

- 🧍 Character: the drift check no longer sends every side round twice. Eye level is pinned now, so that frame always matches, and only the low end's colours are compared. That limit was raised to 0.065: Ellie's good pinned clips came out at 0.025–0.047.

## 2026-10-27.199

- 🧍 Character: her camera is flat now (Jordan: "camera has to be flat perspective"). The rig guide films her with an 8° long lens from far away instead of 30°, and her turn and every up-and-down clip ask for a flat, telephoto, model-sheet view with no perspective distortion. The 3D viewer was already orthographic. A character made before this needs a redo from step 4 to get flat pictures.

## 2026-10-27.200

- 🧍 Character, 🧊 Open in 3D: two fixes for her looking bloated from above (Jordan 2026-10-27). 🧲 Snap to her angles: when you let go, the camera glides to the nearest angle and height a picture was made from, so the floor is seen from the same angle she was. 📐 Straighten: each picture is unbent as if it had been filmed from far away, with the parts that were nearer the camera narrowed. From above, her head gets smaller and her legs longer, and her feet and head top stay put. Both are on by default and toggle at the bottom of the 3D view.
- Helper: the small previews of see-through pictures are made on white. They showed black boxes behind her in the Character tab.

## 2026-10-27.201

- 🧍 Character tab, Momentum: a floor grid under her feet with a soft shadow. It is drawn through the camera each picture was made with (its height, its side, the guide's lens and distance), so it snaps with her. Jordan's test of whether she reads as standing in a 3D space.

## 2026-10-27.202

- 🧍 Character: ↔ Slim. Pictures made from above or below are drawn narrower by cos(height) / cos(eye level), which gives about 0.94 a little high and 0.82 high, the same as Jordan's hand edit ("I just had to Freeform transform it to squish it thinner"). It applies in the Character tab and in 🧊 Open in 3D, with a toggle in the 3D view. The files are unchanged.

## 2026-10-27.203

- 🧍 Character, 🧊 Open in 3D: ↺ Lean. The whole frame rolls a little, as in Jordan's hand edit of the high 45° view. The amount is 4° × sin(height)/sin(35°) × sin(angle round her)/sin(45°): none from the front or back, counter-clockwise on one side of her and clockwise on the other. It is on by default, with a toggle beside Snap, Straighten and Slim.

## 2026-10-27.204

- 🧍 Character, 🧊 Open in 3D: ↺ Lean is replaced by ⟋ Slant. Jordan's edit was a skew, not a turn ("I literally took the side of the image and pulled it downward"). Upright lines stay upright, and sideways lines (shoulders, hem, floor) slope down on one side. The slope is 0.12 at 35° up and 45° round her, scaled by sin(height) and sin(angle round her), so there is none from the front or back and it slopes the other way on her other side.

## 2026-10-27.205

- 🧍 Character: 📐 Straighten is taken out, since Jordan didn't like it. ⟋ Slant now also works in the Character tab, skewing her and the Momentum floor by the same amount as in the 3D view. The toggle in the 3D view controls both.

## 2026-10-27.206

- 🧍 Character tab: one drag now turns her and changes the height together, so a diagonal drag orbits diagonally. Before, a drag locked to whichever direction the finger first moved (Jordan 2026-10-27). A flick still keeps her spinning with Momentum.

## 2026-10-27.207

- 🧍 Character: a sixth card, 🎓 Her LoRA. Once all five steps are done, ▶ Make her LoRA runs on Render's helper with the app closed. The trigger word is her name + x (Ellie → elliex). Her 8 eye-level angles and the two a-little-high ¾ views are always in the set, put on white. MiniMax acts out the 12 training shots from her finished front, side and back. The helper keeps the sharpest, least alike frames, up to 30 pictures, and kohya trains on her model with her style LoRA mixed in (about 2.5 h). The card shows progress, the pictures it picked, and how to use the LoRA.
- Helper: `/renderdeck/auto/start` takes `only` (start at shots), `given` pictures, and `front`/`side`/`back`. Cut-out pictures are put on white for MiniMax and kohya. A picture missing from the output folder is turned down at the start.

## 2026-10-27.208

- 🎓 Her LoRA: the card also picks up a LoRA run for her that was started from a PC rather than from the phone. It finds the run by her trigger word.
