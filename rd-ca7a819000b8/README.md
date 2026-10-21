
**v.103 (2026-10-21):** 🧊 3D model: the fused model is drawn over the painted-in background (depth layers without the character, swung less), so holes and torn edges show the room instead of black; Use this angle only repaints what neither covers. Fuse now keeps the background in the mesh (no sky mask) and tears less (discontinuity 0.08). Press Fuse again for the new settings.

**v.104 (2026-10-21):** More progress bars, so a stuck job is easy to spot (Jordan asked). The MiniMax views show a loading bar with a % (downloading the clips, then taking the frames). Fuse shows a bar while it sends the 17 frames, then the real queue state ("Waiting behind N jobs", time so far). Every short step without a number (sending pictures, grabbing a frame) shows a moving bar.

**v.105 (2026-10-21):** 🧊 Fuse no longer says "update ComfyUI" when the computers just can't be reached; it says to check Tailscale instead.

**v.106 (2026-10-21):** 3D look ⭕ Full circle (Jordan's idea): one MiniMax FL2V clip that circles all the way round the still, using the still as first and last frame (Last frame: This still / Leave it free). The prompt has timed checkpoints: profile 1.3 s, back 2.6 s, other profile 3.9 s, home 5 s. Swing with ⭕ Full circle: dragging right plays it forward, left plays it backward from the end, with no stop; ↔ flips the direction; Wiggle spins it slowly; Use this angle finishes that frame. The left/right views are kept alongside.

**v.107 (2026-10-21):** 3D look **Character: 3D / Flat cut-out** (Jordan's idea). The flat cut-out is drawn straight on, always facing the camera, over the swung 3D background, in the view and in Use this angle (so only the background gets repainted). Shows when the still has the layered character cut-out.
