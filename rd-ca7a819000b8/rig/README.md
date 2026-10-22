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
- Guides of what's inside the dashed frame: OpenPose (18 points, OpenPose colours), Depth (from the body, near =
  white) and Outline (white lines on black). Save, send to a PC's input folder, or try a render (Illustrious + LoRAs +
  ProMax with each guide switched on as its union type, saved under RenderDeck/rig).
- Tests: `RIG_DEPS=<folder with three-0.160.0/ and mediapipe-tasks-vision-0.10.14/ unpacked from npm pack> NODE_PATH=$(npm root -g) node tests/t_rig.js`;
  `tests/t_body.js` checks the body and saves screenshots and guides to tests/out; `tests/t_photo.js <photo>` also needs `pose_landmarker_full.task` in RIG_DEPS.
