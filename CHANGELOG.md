# Changelog

## 1.1.1 - 2026-08-28

- Replaced raw queue-state labels with a contained neutral rendering indicator.
- Kept loading shimmer and spinner animations inside result image bounds.
- Moved Focus Edit's Add ref action directly above the prompt field.

## 1.1.0 - 2026-08-28

- Added native Wan 2.2 text-to-video and image-to-video generation nodes.
- Added one-click optional video model setup and readiness progress in the node.
- Added playable MP4 result nodes with focus playback and direct download.
- Added brush-based inpainting in Focus Edit using InvokeAI denoise masks.
- Added direct whole-image editing, focus variants, explicit selection, and canvas replacement on back.
- Kept the original node position and connections when a focused image is replaced.
- Added simplified quality, duration, and precision controls backed by real InvokeAI graph parameters.
- Updated compatibility to InvokeAI 6.14.0.

## 1.0.0 - 2026-08-24

- Added the free pan-and-zoom node canvas.
- Added draggable main and reference images with ordered prompt mentions.
- Added Modify, variation, extraction, native InvokeAI, and result nodes.
- Added sequential one-to-four image generation through FLUX.2 Klein 9B.
- Added focus editing, result chaining, upscale, and download actions.
- Added local named workspaces and automatic persistence.
- Added upload progress, pending result previews, and contained loading animation.
- Added multi-selection, group movement, connection removal, and node reordering.
- Added the modern Windows launcher with coordinated InvokeAI, Simple Mode, and optional HiDream process handling.
- Added prompt compilation that prioritizes the user instruction and maps UI references to model-native image numbering.
