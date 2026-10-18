# Render Deck (source)

Jordan's phone front end for ComfyUI. Blocks in the app build the ComfyUI API graph; Render sends it to the render computer.
Copyright (c) 2026 Jordan Brantner. All rights reserved.

- Live app: https://jbrantner.github.io/rd-ca7a819000b8/
- `comfy-app.html` is the whole app (one file, no doctype; `webbuild.py` wraps it into `../index.html` with the manifest, icons and offline helper).
- Release: edit `comfy-app.html`, run the tests, then `python3 webbuild.py ..` from this folder, commit and push `main`, and check that the "pages build and deployment" Action succeeds.
- `../tags.txt` is the Danbooru tag list behind the prompt suggestions (Illustrious and Pony styles). Rebuild it with `python3 make_tags.py danbooru.csv` from the a1111 tagcomplete list (link in the script).
- `../chars.txt` says how often each character is drawn as a girl, boy or other, so the app can add 1girl / 2girls / 1boy / solo for the people named in a prompt. Rebuild it with `python3 make_chars.py` (asks Danbooru once per character; it resumes if stopped).
- Bump `APP_VERSION` in `comfy-app.html` on every release so a phone that resumes the app offers the update.
- Tests: `NODE_PATH=$(npm root -g) node tests/t_flow.js` and `tests/t_lib.js` (needs Playwright). It runs the app at phone size against a pretend ComfyUI and checks every graph against ComfyUI's node definitions.

## Setup on the render computer
1. Install Tailscale on the render computer and the iPhone, same account on both.
2. Tailscale admin page > DNS: turn on MagicDNS and HTTPS certificates.
3. Start ComfyUI with `--enable-cors-header "*" --preview-method auto`.
4. Optional, for "Add a model or LoRA": copy `comfyui/render_deck_models.py` into `ComfyUI/custom_nodes/` and restart ComfyUI. It downloads Civitai / Hugging Face links and receives files from the phone (.safetensors only). For Civitai models that need sign-in, put a Civitai API key in `CIVITAI_API_TOKEN` or in `civitai_token.txt` next to the helper.
5. Run `tailscale serve --bg 8188` once and paste the https address it prints into the app (⚙ > Connect).
6. Optional, to share renders between computers: set each computer's ComfyUI output folder (Comfy Desktop's output folder, or `--output-directory`) to the same Dropbox folder, and put this computer's name in `custom_nodes/render_deck_pc.txt` (for example `Output_Main`). The helper then saves into that subfolder, the renders browser shows every computer's pictures, and Delete removes them from all of them (Dropbox's Deleted files can restore them).
