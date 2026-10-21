
**v.103 (2026-10-21):** 🧊 3D model: the fused model is drawn over the painted-in background (depth layers without the character, swung less), so holes and torn edges show the room instead of black; Use this angle only repaints what neither covers. Fuse now keeps the background in the mesh (no sky mask) and tears less (discontinuity 0.08). Press Fuse again for the new settings.

**v.104 (2026-10-21):** More progress bars, so a stuck job is easy to spot (Jordan asked). The MiniMax views show a loading bar with a % (downloading the clips, then taking the frames). Fuse shows a bar while it sends the 17 frames, then the real queue state ("Waiting behind N jobs", time so far). Every short step without a number (sending pictures, grabbing a frame) shows a moving bar.

**v.105 (2026-10-21):** 🧊 Fuse no longer says "update ComfyUI" when the computers just can't be reached; it says to check Tailscale instead.

**v.106 (2026-10-21):** 3D look ⭕ Full circle (Jordan's idea): one MiniMax FL2V clip that circles all the way round the still, using the still as first and last frame (Last frame: This still / Leave it free). The prompt has timed checkpoints: profile 1.3 s, back 2.6 s, other profile 3.9 s, home 5 s. Swing with ⭕ Full circle: dragging right plays it forward, left plays it backward from the end, with no stop; ↔ flips the direction; Wiggle spins it slowly; Use this angle finishes that frame. The left/right views are kept alongside.

**v.107 (2026-10-21):** 3D look **Character: 3D / Flat cut-out** (Jordan's idea). The flat cut-out is drawn straight on, always facing the camera, over the swung 3D background, in the view and in Use this angle (so only the background gets repainted). Shows when the still has the layered character cut-out.

**v.108 (2026-10-21):** ⭕ Full circle fixes from Jordan's first test. The drag now follows your finger (it was backwards). It shows the nearest frame and no longer blends two, which showed her twice; there are 72 frames now. The 3D look switches to the circle as soon as it's made. Picking Make: Full circle also switches the view.

**v.109 (2026-10-21):** 🧊 Fuse from the ⭕ full circle (Jordan asked to orbit all round her and tilt above or below). It takes 16 frames all the way round, with the still in the middle, through Depth Anything 3 multiview, and turns 8 of them into meshes 45° apart. The model turns without a stop and tilts up to about 70°. A From switch picks Full circle or Left and right when both exist. Fixed: Fuse again while looking at the 3D model used to hang on "Taking the frames".

**v.110 (2026-10-21):** 🧍 Her 3D model from the ⭕ full circle. It replaces the fused model, which showed copies because Depth Anything 3 couldn't place the cameras round a painted character. The circle's front, both sides and back go to Hunyuan3D-2mv (or Pixal3D), the shape is painted from those four pictures on the phone (bake3d), and she is drawn where she stands in the still over the swung background. Swing with 🧍 Her model: drag sideways to walk round her, up or down to look from above or below. From her model, Use this angle repaints harder, with line art ControlNet and a 0.65 then 0.55 pass with no colour match, so Illustrious redoes her shading and dress. New "Circle her on: The scene / Plain white" setting circles her cut out on white.

**v.111 (2026-10-21):** The comic redraws by itself when a computer comes on or goes off, so you no longer need to tap another panel and back. Her model now always looks for Hunyuan3D-2mv (on Render) instead of saying Pixal3D is missing.
