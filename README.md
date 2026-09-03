# InvokeAI Simple Mode

An unofficial community interface for InvokeAI with an open node canvas, image and video generation, direct editing, multi-reference prompts, sequential variants, focus inpainting, upscaling, download, workspaces, and access to native InvokeAI actions.

Version **1.9.1** is a Windows release tested with **InvokeAI 6.14.0**, **FLUX.2 Klein 9B and 4B**, and **Wan 2.2 TI2V-5B Q4**.

## Highlights

- Infinite pan and zoom canvas with movable image, action, and result nodes
- Clipboard image paste at the clicked canvas position with `Ctrl+V` or `Cmd+V`
- Invisible FLUX.2 prompt compiler that turns shorthand into precise, reference-aware execution guidance
- Compact fit-to-view canvas layout with side-aware, stable connectors
- Main image plus up to four ordered references
- Drag, drop, connect, disconnect, reorder, and `@1` / `@2` prompt references
- Reference roles for style, brand, object, lighting, and composition
- Purpose-built Variate, New view, and Extract nodes with prompt-backed presets
- Contextual Extract: measured color palettes plus source-derived material and part sheets, with a VRAM-safe vision-backed material macro study
- True 360p, four-step previews across Draft mode and specialized nodes
- Preview-to-standard promotion using the approved preview as image guidance
- One to four variants queued sequentially to protect GPU memory
- Compact installed-model selector with workspace persistence and automatic encoder matching
- In-place node mode switching through the node back menu; the Canvas `+` creates separate nodes
- Large focus view with direct edit, brush-based inpaint, image panning, editable version names, focus-only references, floating reversible version layers, visibility, reordering, deletion, 2x upscale, and direct download
- Image-to-video and text-to-video nodes with playable MP4 result nodes
- One-click optional Wan 2.2 model setup through InvokeAI's native model manager
- Persistent named workspaces stored locally
- Native InvokeAI workflow, gallery, model, image, and utility actions surfaced as nodes
- Windows launcher that starts and stops InvokeAI and Simple Mode as one application
- Optional HiDream launcher support when a separate compatible installation is present

## Requirements

- Windows 10 or Windows 11
- InvokeAI 6.14.0 installed at `%USERPROFILE%\invokeai`
- Python 3.12 in the InvokeAI virtual environment
- A compatible NVIDIA GPU and enough VRAM for the model you select
- FLUX.2 Klein model components installed through InvokeAI Model Manager for the default Modify workflow
- Optional Wan 2.2 TI2V-5B components for video; Simple Mode can install them from the Video node

Model weights are not included. FLUX.2 Klein 9B is separately licensed by Black Forest Labs and may require accepting its license on Hugging Face.

## Install

1. Install and run the official [InvokeAI](https://github.com/invoke-ai/InvokeAI) release once.
2. Download and extract `InvokeAI-Simple-Mode-v1.9.1.zip` from this project's Releases page.
3. Open PowerShell in the extracted folder.
4. Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\Install.ps1
```

The installer checks the InvokeAI version, installs only the extension files, builds or copies the launcher, and creates Start Menu and desktop shortcuts. It does not modify existing models, generated images, databases, or workspaces.

For a custom InvokeAI location:

```powershell
powershell -ExecutionPolicy Bypass -File .\Install.ps1 -InvokeRoot "D:\AI\invokeai"
```

## Use

Launch **InvokeAI Simple Mode** from the Start Menu or desktop. `Start` loads InvokeAI and opens Simple Mode at `http://127.0.0.1:9091`. `Invoke` opens the native interface at `http://127.0.0.1:9090`.

To add an image from the clipboard, click the canvas where the new image node should appear, then press `Ctrl+V` on Windows or `Cmd+V` on macOS. Paste in prompt, search, and name fields continues to insert text normally.

Prompts may remain short and informal. Before each image job, the backend keeps the original request authoritative, resolves shorthand by intended visual meaning, maps references to their actual input order, and adds only the execution guidance relevant to the requested geometry, text, color, lighting, material, camera, identity, addition, replacement, or removal. Unrequested source-image content is preserved. Generic quality-token padding is not added. If an InvokeAI `Text LLM` is installed later, short prompts also receive a constrained local expansion while the render queue is idle; the structured compiler remains the fallback and adds no extra VRAM load.

For precise edits, identify the target and desired geometry explicitly:

```text
Edit image 1. Replace the sharp outer corners of the central display wall
with smooth rounded architectural corners. Keep the camera, lighting,
graphics, text, room geometry, and all other elements unchanged.
```

With multiple references, describe each role clearly:

```text
Use image 1 as the main composition, image 2 for the people, and image 3
for the lighting and material finish.
```

Double-click an image or result for Focus Edit. Double-click the displayed image title to rename that version without changing its saved InvokeAI filename. Scroll the mouse wheel over the image to zoom in or out, use the plus and minus controls, drag with the middle mouse button, or enable the Pan tool for left-button dragging. Use **Direct edit** for a whole-image revision, or **Inpaint** to brush only the area that may change. Add up to four focus-only references, create quick 360p previews, choose one, and use **Render standard** below the preview or in the edit panel for an eight-step final render. Original, preview, standard, and upscaled versions remain in the floating Layers panel. Every layer can be hidden or shown; generated layers can also be reordered or removed, while the original remains protected from deletion. If all layers are hidden, use any eye control to restore one immediately. Select any visible layer and go back; that version appears on the canvas without moving its connections.

Add a **Video** node for text-to-video, or connect an image first for image-to-video. Video jobs share InvokeAI's serial queue with image jobs, so FLUX and Wan are not loaded for simultaneous generation.

## Compatibility

The v1.9.1 generation graphs target InvokeAI 6.14.0's FLUX.2 Klein and Wan 2.2 nodes. Specialized node controls are included in the generation request and prompt context; native InvokeAI actions are discovered at runtime. InvokeAI updates may change node schemas; install newer versions with `-Force` only for testing.

HiDream is optional and is not bundled. The launcher can switch to a separately installed HiDream O1 Dev web app, but HiDream output is not yet a native Simple Mode node.

## Privacy and security

Both services bind to `127.0.0.1` by default. Workspaces remain on the local computer. Do not expose ports 9090 or 9091 to an untrusted network.

## Uninstall

```powershell
powershell -ExecutionPolicy Bypass -File .\Uninstall.ps1
```

Workspaces are preserved unless `-RemoveWorkspaces` is explicitly supplied.

## License and attribution

This community extension is released under the Apache License 2.0. InvokeAI is a separate project and remains subject to its own license. Model licenses also apply separately. This project is not affiliated with or endorsed by Invoke AI or Black Forest Labs.
