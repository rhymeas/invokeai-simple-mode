# InvokeAI Simple Mode

An unofficial community interface for InvokeAI with an open node canvas, image and video generation, direct editing, multi-reference prompts, sequential variants, focus inpainting, upscaling, download, workspaces, and access to native InvokeAI actions.

Version **1.1.0** is a Windows release tested with **InvokeAI 6.14.0**, **FLUX.2 Klein 9B**, and **Wan 2.2 TI2V-5B Q4**.

## Highlights

- Infinite pan and zoom canvas with movable image, action, and result nodes
- Main image plus up to four ordered references
- Drag, drop, connect, disconnect, reorder, and `@1` / `@2` prompt references
- Reference roles for style, brand, object, lighting, and composition
- One to four variants queued sequentially to protect GPU memory
- Large focus view with direct edit, brush-based inpaint, variant selection, canvas replacement, 2x upscale, and direct download
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
2. Download and extract `InvokeAI-Simple-Mode-v1.1.0.zip` from this project's Releases page.
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

Double-click an image or result for Focus Edit. Use **Direct edit** for a whole-image revision, or **Inpaint** to brush only the area that may change. Select the preferred result and go back; the selected version replaces the focused image in the canvas without moving its connections.

Add a **Video** node for text-to-video, or connect an image first for image-to-video. Video jobs share InvokeAI's serial queue with image jobs, so FLUX and Wan are not loaded for simultaneous generation.

## Compatibility

The v1.1 generation graphs target InvokeAI 6.14.0's FLUX.2 Klein and Wan 2.2 nodes. Native InvokeAI actions are discovered at runtime. InvokeAI updates may change node schemas; install newer versions with `-Force` only for testing.

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
