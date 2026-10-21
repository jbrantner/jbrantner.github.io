
**v.103 (2026-10-21):** 🧊 3D model: the fused model is drawn over the painted-in background (depth layers without the character, swung less), so holes and torn edges show the room instead of black; Use this angle only repaints what neither covers. Fuse now keeps the background in the mesh (no sky mask) and tears less (discontinuity 0.08). Press Fuse again for the new settings.

**v.104 (2026-10-21):** More progress bars, so a stuck job is easy to spot (Jordan asked). The MiniMax views show a loading bar with a % (downloading the clips, then taking the frames). Fuse shows a bar while it sends the 17 frames, then the real queue state ("Waiting behind N jobs", time so far). Every short step without a number (sending pictures, grabbing a frame) shows a moving bar.

**v.105 (2026-10-21):** 🧊 Fuse no longer says "update ComfyUI" when the computers just can't be reached; it says to check Tailscale instead.
