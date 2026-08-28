# InvokeAI Simple Mode v1.2.0

This release gives Variate, New view, and Extract their own compact node interfaces instead of reusing the generic Modify prompt layout.

Each specialized node now provides useful starting choices that are compiled into the real InvokeAI prompt. Variate controls form or color, direction, preset, and change strength. New view controls camera direction and elevation. Extract controls color, material, or parts plus sampling detail.

The default 360p preview option submits a real low-resolution, four-step FLUX graph for fast exploration. Full quality remains available inside each node and uses the shared quality controls. Every selection is stored in the workspace and restored after reload.

Native browser dropdowns have been replaced with a neutral compact menu matching the node system, including keyboard navigation and accessible state. New nodes now open fully inside the visible canvas, and saved output counts stay synchronized with the Generate button.

Video nodes now run InvokeAI 6.14.0's Wan 2.2 pipeline for text-to-video or image-to-video work. Results return as playable MP4 nodes and can be focused or downloaded. Optional Wan model components can be installed from the Video node and share the serial queue with FLUX image jobs.

Double-clicking an image now opens a working Focus Edit view. Direct edit revises the whole image, while Inpaint limits the edit to the brushed mask. Generated variants appear beneath the focused image; selecting one and returning to the canvas replaces the original while preserving its position and connections.

## Important

- Windows 10/11 only for v1.2.0.
- Requires an existing InvokeAI 6.14.0 installation.
- Model weights are not included.
- FLUX.2 Klein 9B has its own license and may require Hugging Face approval.
- Wan 2.2 video components are optional downloads with their own model licenses and storage requirements.
- HiDream support in the launcher is optional and separate from the node pipeline.
- This is an unofficial community project and is not endorsed by Invoke AI or Black Forest Labs.
