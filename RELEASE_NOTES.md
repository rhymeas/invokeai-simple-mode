# InvokeAI Simple Mode v1.2.1

This patch replaces raw queue text such as `in_progress` with a compact `Rendering` status and a restrained animated indicator.

The gray model line beneath Canvas is now a designed selector that opens on hover or click. It discovers compatible FLUX.2 Klein models already installed in InvokeAI, currently supports both 9B and 4B, and automatically pairs each model with its matching Qwen3 encoder.

The selection is saved per workspace and is passed into normal generation, specialized nodes, and Focus Edit. Jobs still use InvokeAI's serial queue, so switching models does not run 9B and 4B simultaneously.

## Important

- Windows 10/11 only for v1.2.1.
- Requires an existing InvokeAI 6.14.0 installation.
- Model weights are not included.
- FLUX.2 Klein 9B has its own license and may require Hugging Face approval.
- Wan 2.2 video components are optional downloads with their own model licenses and storage requirements.
- HiDream support in the launcher is optional and separate from the node pipeline.
- This is an unofficial community project and is not endorsed by Invoke AI or Black Forest Labs.
