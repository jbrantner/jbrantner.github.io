# Ref Deck

Cuts a video into MiniMax H3 reference material on the phone and hands it to H3 Deck.
App: https://jbrantner.github.io/h3-a875336252cb/refs/ (or ✂️ in H3 Deck's References). The whole app is `index.html`; no build step.

## What it does
- **Video**: pick any video the phone can play. Frame-by-frame stepping (±1 frame, ±1 s), a scrubber with a strip of frames, and ⟦ Start here / End here ⟧ to mark a clip (it warns outside MiniMax's 2 to 15 s for reference videos).
- **Frames**: 📸 the frame on screen, or N frames spread evenly across the clip, as full-size PNGs.
- **Clip**: 🎬 video + sound, 🎞 video only, 🔊 sound only (16-bit 44.1 kHz WAV). Cut on the phone with Mediabunny (vendored, `mediabunny-1.61.4.min.mjs`, MPL-2.0): the cut starts on the exact frame (re-encoding when needed); a phone that can't re-encode copies from the keyframe before.
- **Voice and background**: the clip's sound goes to Render (Main if Render is off or has no splitter) over Tailscale and comes back as 🎤 Voice + 🎵 Background, using whichever splitter that ComfyUI has:
  - **Mel-Band RoFormer** (kijai/ComfyUI-MelBandRoFormer + `MelBandRoformer_fp16.safetensors` in diffusion_models): vocals / everything else. Best for songs and speech. ⚙ can fetch the model through the Render Deck helper.
  - **TIGER-DnR** (MW Audio Tools' Music Separation, installed on Render): dialog / effects / music, plus Background = effects + music. Needs its 17 MB model in `ComfyUI/models/TTS/TIGER-DnR` (one PowerShell line, shown in ⚙).
- **Tray**: everything made lands here (kept on the phone). Tap to view or ⬇ save (share sheet on phones), ✓ to pick. **➕ Send to H3 Deck** puts the picked pieces into H3 Deck's reference slots (a video with sound arrives with 🔊 on) and opens H3 Deck. It refuses when H3 Deck has no room left (9 pictures, 3 videos, 3 sounds).

## How the hand-over works
Ref Deck lives inside H3 Deck's folder, so both share one storage, also as home-screen apps. It writes each picked file into H3 Deck's IndexedDB media store (`h3deck` / `media`) and a note of it into `localStorage['h3deck-inbox']`; H3 Deck takes the inbox in when it opens or comes back to the front (`takeInbox()`).

## Test
`tests/t_refs.js` runs the page in headless Chromium against stand-in ComfyUI servers that check each graph against the real node signatures, cuts real WebM and MP4 files (checked with ffprobe), and checks H3 Deck slots the pieces in. See the header of the test for how to run it.
