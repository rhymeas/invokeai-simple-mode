# InvokeAI Simple Mode v1.4.0

This release turns Focus Edit's Layers sidebar into a controllable version stack. Generated layers can be hidden, shown, reordered, or removed while the original image remains protected. Hiding or deleting the active version automatically reveals the highest remaining visible version.

When a 360p preview is selected, a compact **Render standard** action now appears directly below the image as well as in the edit panel. Reference thumbnails use a red remove state on hover or keyboard focus.

Sequential FLUX.2 Klein previews now reuse InvokeAI's cached model-loader and reference-conditioning results when their inputs match. This reduces repeated setup work after the first job. The first preview can still take time because loading the selected model and encoding the source image are substantial operations even at 360p.

## Important

- Windows 10/11 only for v1.4.0.
- Requires an existing InvokeAI 6.14.0 installation.
- Model weights are not included.
- FLUX.2 Klein 9B has its own license and may require Hugging Face approval.
- Wan 2.2 video components are optional downloads with their own model licenses and storage requirements.
- HiDream support in the launcher is optional and separate from the node pipeline.
- This is an unofficial community project and is not endorsed by Invoke AI or Black Forest Labs.
