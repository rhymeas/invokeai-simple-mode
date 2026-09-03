# InvokeAI Simple Mode v1.9.5

Patch release: the material-study chain now claims report composition so overlapping poll loops cannot compose twice or duplicate focus history.

Patch release: optional prompt expansion now unloads the helper LLM immediately after use, so nothing stays warm next to FLUX.

Patch release: removal prompts no longer reattach the removed color or material, and bare change counts as a replacement so font and text swaps get precise targeting.

Patch release: InvokeAI HTTP errors (for example a 422 vision-model mismatch) are now reported with their real status and detail instead of a false offline message.

Patch release: optional prompt expansion now prefers the smallest capable Qwen (Qwen3 0.6B first) with correct size-bucket ordering, and the Extract endpoint rejects unknown targets with HTTP 400 before fetching anything.

This release makes Extract contextual. Color palettes are measured from the connected source image, material and part sheets use true source-derived crops, and Materials adds a vision-backed macro study with a composed labeled report. Vision analysis requires an idle queue and unloads the model cache immediately after use, so FLUX rendering stays VRAM-safe.

This release adds an invisible FLUX.2 prompt compiler to every Simple Mode image-generation path.

Users can keep writing short, informal, misspelled prompts. The backend preserves the original request as authoritative, maps `@` references into actual input order, treats specialized-node controls as hard constraints, and adds only relevant execution guidance for the requested visual change. It avoids generic quality-token padding and keeps unrequested source content stable.

The built-in deterministic compiler requires no additional model and adds no VRAM load. If a compatible InvokeAI `Text LLM` is installed, short prompts can also receive a tightly constrained local expansion before rendering. Expansion runs only while the image queue is idle, remains subordinate to the original request, and falls back silently to the deterministic compiler.

## Important

- Windows 10/11 only for v1.9.5.
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
