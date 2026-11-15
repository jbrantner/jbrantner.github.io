# ✨ P-H3 Image

Pruna's P-H3-Image (MiniMax H3 fine-tuned for still pictures) on Jordan's PCs. Edit a picture (Picture 1 changes, Pictures 2-9 are
references named in the request) or make a new one. Copyright (c) 2026 Jordan Brantner. All rights reserved.

- Live: https://jbrantner.github.io/rd-ca7a819000b8/ph3/ (`?h=1` saves under Hidden). Opened from Render Deck's ✨ P-H3 tab button.
- `index.html` is the whole page. It reads Render Deck's saved PC list (same site), Render first; Auto picks the first PC that has everything.
- One ComfyUI job of core nodes (ComfyUI 0.44.0+), as Comfy-Org's templates image_p_h3_t2i / image_p_h3_image_edit:
  `UNETLoader` minimax_h3_fl2va_pruned_int8_convrot → `LoraLoaderModelOnly` p-h3-image_lora_bf16 1.0 (skipped when a standalone
  p-h3-image_* diffusion model is there) → `MiniMaxH3SigmaShift` 1.0/1.0 → `BasicGuider` ← `PH3ImageConditioning` (p-h3-image text
  encoder + VAE; `images.image_N`) ; `RandomNoise` + `KSamplerSelect` er_sde + `ManualSigmas` (Pruna's 8-step grid) → `SamplerCustomAdvanced`
  → `VAEDecode` → `SaveImage` RenderDeck/ph3/ph3.
- Auto prompt: "Aspect ratio: R\nRequest: …" + the pictures → `TextGenerateV2` (p-h3-image_prompt_upsampler, greedy, 1536; thinking on for new pictures, off for edits: with it on, whole-picture edits came back rotated 180° on Render)
  → the conditioning; `PreviewAny` sends the written prompt back ("The prompt it wrote"). Off: the words go straight in (the node adds "Edit <Picture 1>.").
- Size 2 / 4 / 8 MP (ComfyUI megapixels, 1024²). New pictures: canvas at that ratio, multiples of 32 (8 MP 4:3 = 3360x2496). Edits: Picture 1
  is scaled to that size (`ImageScaleToTotalPixels`) and the canvas set to it, so references are read no bigger.
- How many (1-8, Jordan 2026-11-13): each picture is its own job with the next seed, dealt round every PC that has P-H3 and all its files
  (Render and Main; the PC chips can pin one). Each lands in the list as it finishes; a batch's pictures show as a strip under the result.
  The progress line shows each PC's count left and its step. No before/after slider (Jordan didn't need it).
- Missing files get one ⬇ button that downloads them through Render Deck's helper (Hugging Face: Comfy-Org/MiniMax-H3, PrunaAI/p-h3-image-comfy).
- 🆕 H3 Image (Jordan 2026-11-15): a model chip switches to MiniMax's own still-picture model (MiniMaxAI/MiniMax-H3-Image, Nov 10 2026; not Pruna's).
  Job as Comfy-Org's templates image_minimax_h3_image_edit / _t2i (ComfyUI 0.45): `UNETLoader` minimax_h3_image_pruned_w4a8 (int8 if that's what's there)
  → `KSampler` 6 steps, CFG 1, euler/simple ← `MiniMaxH3ImageConditioning` (H3 text encoder qwen3vl_32b_minimax_h3 nvfp4/int8 + minimax_h3_image_vae_fp16,
  `images.image_N`, canvas) with `ConditioningZeroOut` as negative → `VAEDecode` → `SaveImage` RenderDeck/ph3/h3i. Auto prompt = the templates' own writer
  texts (`h3i-prompts.js`, copied unchanged) → `TextGenerateV2` (qwen3.5_9b_w4a8_gptq, thinking on, 8192) → `JsonExtractString` expanded_caption.
  Sizes 4 / 8 / 16 MP (it falls apart under ~4 MP), up to 16 pictures. Files from Comfy-Org/MiniMax-H3-Image. Its licence (not the H3 video one) excludes the USA/EU/UK/Korea.
- Test: `NODE_PATH=$(npm root -g) node ph3/tests/t_ph3.js` (a stand-in ComfyUI checks the job).
