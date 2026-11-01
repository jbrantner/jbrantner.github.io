# Mocap

Pick a video of someone moving; the PC reads their body on every frame with SAM 3D Body and this page plays it back as a 3D
mannequin you can scrub through and orbit. Copyright (c) 2026 Jordan Brantner. All rights reserved.

- Live: https://jbrantner.github.io/rd-ca7a819000b8/mocap/ (`?h=1` saves under Hidden)
- `index.html` is the whole page (three.js 0.160 from jsdelivr). It reads Render Deck's saved PC list (same site), Render first.
- No helper change: one ComfyUI job of core nodes (ComfyUI 0.41.3) plus VideoHelperSuite when it's there:
  `VHS_LoadVideo` (trimmed with skip_first_frames / frame_load_cap at the chosen rate, longest side 960) →
  `RTDETR_detect` (one person per frame, 0.3, then 0.12 if nobody is found) → `MoGeInference` on the first frame →
  `SAM3DBody_Predict` (every frame, batch 16, hands optional) → `SAM3DBody_Smooth` (temporal smoothing) →
  `BuildPoseFile` (animated body GLB, camera translation centered, bone smoothing) → `Save3DAdvanced` (RenderDeck/mocap).
  If VHS can't open the video it retries with ComfyUI's own `LoadVideo` → `Video Slice` → `GetVideoComponents` →
  `ImageScaleToMaxDimension` (the video's own frame rate then).
- Smoothing Off / Light (savgol 7) / Medium (gaussian 9 + bone 5) / Strong (gaussian 15 + bone 11). Rebuild re-queues the
  same job, so ComfyUI's cache skips the frames SAM already read when only the smoothing changes.
- Playback: the GLB's frame rate comes from its keyframe times (frames where nobody was found are left out and blended over).
  🚶 Moves keeps the camera translation, 📍 In place drops it; 📌 Feet on floor stands each frame's lowest joint on the floor,
  🦘 Free only the lowest of the clip (jumps). Head size scales bone_113. The video plays beside it and drives the clock.
- A running job is kept on the phone (`rd-mocap-draft`) and picked up when the page opens again; finished ones go in
  📚 Clips (`rd-mocap`; the GLB and video stay on the PC).
- Test: `RIG_DEPS=<folder with three-0.160.0/> MOCAP_VIDEO=<short .webm> NODE_PATH=$(npm root -g) node tests/t_mocap.js`
  (a stand-in ComfyUI and a small animated GLB made in the page).
