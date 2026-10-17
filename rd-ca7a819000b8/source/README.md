# Render Deck (source)

Jordan's phone front end for ComfyUI. Blocks in the app build the ComfyUI API graph; Render sends it to the render computer.
Copyright (c) 2026 Jordan Brantner. All rights reserved.

- Live app: https://jbrantner.github.io/rd-ca7a819000b8/
- `comfy-app.html` is the whole app (one file, no doctype; `webbuild.py` wraps it into `../index.html` with the manifest, icons and offline helper).
- Release: edit `comfy-app.html`, run the tests, then `python3 webbuild.py ..` from this folder, commit and push `main`, and check that the "pages build and deployment" Action succeeds.
- Tests: `NODE_PATH=$(npm root -g) node tests/t_flow.js` (needs Playwright). It runs the app at phone size against a pretend ComfyUI and checks every graph against ComfyUI's node definitions.

## Setup on the render computer
1. Install Tailscale on the render computer and the iPhone, same account on both.
2. Tailscale admin page > DNS: turn on MagicDNS and HTTPS certificates.
3. Start ComfyUI with `--enable-cors-header "*" --preview-method auto`.
4. Run `tailscale serve --bg 8188` once and paste the https address it prints into the app (⚙ > Connect).
