# InvokeAI Simple Mode v1.1.1

This patch refines the loading and Focus Edit interfaces introduced with v1.1.

Pending image and video nodes now show a contained neutral rendering indicator without exposing internal queue-state labels. Focus Edit's Add ref action now sits immediately above the prompt field, keeping reference setup next to the instruction it affects.

Video nodes now run InvokeAI 6.14.0's Wan 2.2 pipeline for text-to-video or image-to-video work. Results return as playable MP4 nodes and can be focused or downloaded. Optional Wan model components can be installed from the Video node and share the serial queue with FLUX image jobs.

Double-clicking an image now opens a working Focus Edit view. Direct edit revises the whole image, while Inpaint limits the edit to the brushed mask. Generated variants appear beneath the focused image; selecting one and returning to the canvas replaces the original while preserving its position and connections.

## Important

- Windows 10/11 only for v1.1.1.
- Requires an existing InvokeAI 6.14.0 installation.
- Model weights are not included.
- FLUX.2 Klein 9B has its own license and may require Hugging Face approval.
- Wan 2.2 video components are optional downloads with their own model licenses and storage requirements.
- HiDream support in the launcher is optional and separate from the node pipeline.
- This is an unofficial community project and is not endorsed by Invoke AI or Black Forest Labs.
