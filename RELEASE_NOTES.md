# InvokeAI Simple Mode v1.3.0

This release adds a complete draft-to-final image workflow. Draft mode now creates true 360p previews with four steps. In Focus Edit, choose a preview and select **Render standard** to use that approved image as guidance for a standard-resolution, eight-step render. The existing 2x AI upscale remains available afterward.

Focus Edit now has its own reference uploads and a Layers sidebar. Add up to four references directly above the prompt, remove them independently, and use them as `@2` through `@5`. Every original, preview, standard render, and upscale is stored as a reversible layer. The selected layer appears on the canvas when returning, while the original stays available.

Focus renders append instead of replacing previous outputs, and their status continues updating even when another result group is visible. On small screens, layers become a horizontal strip so the image stage retains its width.

## Important

- Windows 10/11 only for v1.3.0.
- Requires an existing InvokeAI 6.14.0 installation.
- Model weights are not included.
- FLUX.2 Klein 9B has its own license and may require Hugging Face approval.
- Wan 2.2 video components are optional downloads with their own model licenses and storage requirements.
- HiDream support in the launcher is optional and separate from the node pipeline.
- This is an unofficial community project and is not endorsed by Invoke AI or Black Forest Labs.
