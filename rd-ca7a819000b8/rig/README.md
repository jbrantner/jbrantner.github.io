# Pose Rig

A 3D skeleton for posing on the phone, made to feel like a Maya rig, that sends an OpenPose guide from any camera angle.
Standalone for now; it will fold into Render Deck later. Copyright (c) 2026 Jordan Brantner. All rights reserved.

- Live: https://jbrantner.github.io/rd-ca7a819000b8/rig/
- `index.html` is the whole page (three.js 0.160 from jsdelivr). It reads Render Deck's saved PC list (same site).
- Posing: pink IK handles for hands and feet (arms follow the chest, feet stay planted), cyan poles for elbows and knees,
  gold hips and floor ring, rotate rings with joint limits on the spine, neck, head and collarbones, mirror and flip,
  undo, starting poses, body proportion sliders (the pose is kept when the body changes).
- Body: an AFK Journey-style anime figure (narrow face with a pointed chin, painted green eyes, hair: long with
  blunt bangs / bob / none, toon shading with an ink outline) grown from the skeleton (rounded cones and ellipsoids melted together, meshed with
  surface nets, skinned to the bones by which shapes each point lies on); rebuilt when the proportions change.
  Skeleton / X-ray / Body view switch.
- Skirt (Short / Knee / Long dress, length and flare): a ring of hanging chains from the waist that settles from scratch
  for each pose (gravity, a motion push: Still / Walk / Run / Twirl / Wind with a direction, stiffness for the flare,
  the front following the thighs so it makes a lap), kept out of the posed hips and legs. Purple hem handles pin the
  hem where you drag it (saved with the pose, undoable). The skirt is in the depth and outline guides.
- Pose from a picture: MediaPipe Pose Landmarker on the phone (3D), or DWPose on a PC (comfyui_controlnet_aux's
  DWPreprocessor + SavePoseKpsAsJsonFile, lifted to 3D with the rig's bone lengths). The camera is fitted so the rig
  lines up with the picture.
- Pose from an orbit: a turnaround video of one held pose (or pictures from all round, in order) is cut into 12/16/24
  views, each read (MediaPipe or DWPose), then combined into one 3D pose: per view turn (searched near its even step,
  with the whole turn allowed to run 25% short or long), size and shift, one shared camera tilt, left/right mix-ups
  tried both ways, outlier points dropped; which side is her left is settled from the nose. `tests/t_orbit.js [preset]`
  films the rig turning (pictures and a webm) and reads it back. My poses (Pose tab) saves poses as directions.
- Not the whole body in the picture: the phone reader gets empty room below to find a cut-off person (legs it can't
  see stay standing). 🎬 Make it full body runs two MiniMax H3 FL2V clips on the PC (Render Deck's Change angle setup):
  a dolly-out to head-to-toe (optional leg description), then a full circle from its last frame back to it, which is
  read as an orbit. Tested in `tests/t_orbit.js` against a stand-in ComfyUI.
- Guides of what's inside the dashed frame: OpenPose (18 points, OpenPose colours), Depth (from the body, near =
  white) and Outline (white lines on black). Save, send to a PC's input folder, or try a render (Illustrious + LoRAs +
  ProMax with each guide switched on as its union type, saved under RenderDeck/rig).
- Tests: `RIG_DEPS=<folder with three-0.160.0/ and mediapipe-tasks-vision-0.10.14/ unpacked from npm pack> NODE_PATH=$(npm root -g) node tests/t_rig.js`;
  `tests/t_body.js` checks the body and saves screenshots and guides to tests/out; `tests/t_photo.js <photo>` also needs `pose_landmarker_full.task` in RIG_DEPS.
- 🦴 Pose / 🎥 Camera (top): only one answers the finger, so posing never moves the camera and the camera never moves her.
  Camera has Orbit (turns round her middle) and Pan / zoom (one finger slides her across the frame as a lens shift, so the
  angle on her stays; pinch or the wheel goes closer). The shift is carried into every guide.
- In a comic panel: `rig/?panel=<id>&w=&h=&name=&g=` (Render Deck opens it full screen). Its own saved rig per panel
  (`rd-pose-rig-panel-<id>`, a new one starts with the rig page's body), the frame fixed to the panel's shape, Camera
  first, the view chips turn the camera without changing where she sits or how big; `RIG.frameShot()` gives the page its picture.

**2026-10-22 (Render Deck v.134)**: 🛋 Set mode: walls and furniture blocks moved in orthographic views one axis at a time; panelGuides() adds bg (set colours), bgDepth and front (set in front of her) when a set exists.

**2026-10-22 (Render Deck v.135)**: spriteShots() gives 24 guides (3 rings at -25/5/35 degrees × 8 yaws from her facing); set pieces of kind sprite read rd-pose-sprites[-h] and face the camera, picking the view by azimuth (minus the piece turn) and elevation (<-10 low, >20 high). Set mode: Layers list, split view (SPLIT 0.56).

**2026-10-22 (Render Deck v.136)**: set drags move along both screen axes of the flat view (S.setDrag 'one' = old first-direction lock); pieces carry it.r (spin in quarter turns, any value) plus it.tx / it.tz (world tilts in degrees), set by the Spin/Tilt slider for the current view (rotKey), with S.setSnap rounding to 45°.

**2026-10-23 (Render Deck v.137)**: spriteShots(gw, {n, w, h}) also returns orbit: 3 rings × n outline frames (frame f at f·360/(n−1)°) for MiniMax's control video; sprite pieces with it.look use the pose's look[] pictures; Bust 0–5 (bigger busts sit lower, further apart, sunk into the chest).

**2026-10-23 (Render Deck v.138)**: each spriteShots view also has face (head forward · direction to the camera), spread (1 − silhouette area / convex hull area) and mask (64-wide 0/1 silhouette string), used by Render Deck to pick the best start picture.

**2026-10-23 (Render Deck v.139)**: view.html is 🧊 Make 3D's viewer: one pose from rd-pose-sprites[-h] (?pose=id&sp=-h) as a camera-facing picture in a grey room with a grid floor and a soft shadow, OrbitControls, an optional flat backdrop that always faces the camera; window.VIEW = {shot(w, h), cam(), setCam(), setBackdrop(url), reload()}.

- 2026-10-23: `RIG.poseFromPicture(url, pc)` copies a picture's pose (DWPose on that PC first, else MediaPipe on the phone), for Render Deck's 🧊 Make 3D.
