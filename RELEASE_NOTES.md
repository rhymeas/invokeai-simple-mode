# InvokeAI Simple Mode v1.2.2

This patch makes node navigation behave as an in-place mode switch. Opening the back menu inside a node and choosing Modify, Variate, New view, or Extract now transforms that same node. Its ID, position, prompt, references, result connections, and selection remain intact.

The Canvas `+` and other external creation paths still add a separate node. This keeps branching intentional and prevents duplicate nodes when the user is only changing the current operation.

Canvas and model-selector typography is smaller, including the selected model, dropdown options, and sequential-queue note.

## Important

- Windows 10/11 only for v1.2.2.
- Requires an existing InvokeAI 6.14.0 installation.
- Model weights are not included.
- FLUX.2 Klein 9B has its own license and may require Hugging Face approval.
- Wan 2.2 video components are optional downloads with their own model licenses and storage requirements.
- HiDream support in the launcher is optional and separate from the node pipeline.
- This is an unofficial community project and is not endorsed by Invoke AI or Black Forest Labs.
