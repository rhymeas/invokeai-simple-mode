# InvokeAI Simple Mode v1.7.0

This release adds direct clipboard image paste to the node canvas.

Click a free canvas position, then press `Ctrl+V` on Windows or `Cmd+V` on macOS. Clipboard images upload through the same InvokeAI path as drag and drop, become selected image nodes, and appear around the clicked position. Multiple images are cascaded so they remain individually accessible.

Paste remains context-aware: text fields, prompt editors, search fields, workspace names, and editable image names retain normal text-paste behavior.

## Important

- Windows 10/11 only for v1.7.0.
- Requires an existing InvokeAI 6.14.0 installation.
- Model weights are not included.
- FLUX.2 Klein 9B has its own license and may require Hugging Face approval.
- Wan 2.2 video components are optional downloads with their own model licenses and storage requirements.
- HiDream support in the launcher is optional and separate from the node pipeline.
- This is an unofficial community project and is not endorsed by Invoke AI or Black Forest Labs.

This release fixes Focus Edit layer switching, generated-result connections, and specialized node execution. Eye controls now update the displayed layer immediately, and generated results can be opened or connected downstream even when InvokeAI returns numeric queue IDs.

Variate, New view, Extract, and related nodes now send their selected controls and workflow relationships into the generation request. Full quality explicitly uses the standard render path, while 360p remains a four-step preview. Workflow and Focus previews preserve the full image instead of cropping it.

The top bar has more room, the active image version can be renamed by double-clicking its title, and Layers float in a compact rounded panel instead of occupying the full left edge.

Use the new Pan tool to move a zoomed image with the left mouse button, or hold and drag the middle mouse button at any time. Mouse-wheel zoom remains centered over the image, and panning is disabled automatically while painting an inpaint mask.

Canvas Layout now arranges source images, action nodes, and results into a compact graph and fits it into the viewport. New results stay near their source. Image connectors automatically move to the side facing their connected node, producing shorter, stable curves without moving delete controls.
