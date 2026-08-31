# Changelog

## 1.7.0 - 2026-08-31

- Added clipboard image paste after clicking the canvas with `Ctrl+V` on Windows or `Cmd+V` on macOS.
- Positioned pasted image nodes around the last clicked canvas point and cascaded multiple clipboard images without overlap.
- Preserved normal text paste behavior in prompts, search fields, workspace names, and editable image names.

## 1.6.2 - 2026-08-28

- Enabled visibility controls for the protected original Focus Edit layer while keeping its delete and reorder actions locked.
- Added a stable empty-canvas state when every layer is hidden and immediate one-click restoration from any layer eye.
- Preserved all-hidden layer state across workspace saves and Focus Edit reopen cycles.
- Replaced raw connection-refused errors with a clear InvokeAI offline message and HTTP 503 response.

## 1.6.1 - 2026-08-28

- Moved Focus Edit layer visibility controls beside each layer and made eye toggles switch the canvas immediately in both directions.
- Removed the stale layer status dot and kept layer reorder/delete controls separate from the direct visibility action.
- Preserved complete image previews in canvas, node, output, token, variant, and Focus layer surfaces.

## 1.6.0 - 2026-08-28

- Fixed Focus Edit layer eye controls so showing or hiding a layer immediately updates the displayed image without selecting the row first.
- Fixed result endpoint ID matching so generated images can open in Focus Edit and connect into downstream nodes reliably.
- Passed specialized node controls and workflow connections into the generation request and made Full quality explicitly use the standard render path.
- Expanded old specialized nodes to a usable height and changed workflow, result, Focus variant, and layer previews to preserve the complete image instead of cropping it.

## 1.5.0 - 2026-08-28

- Added double-click renaming for the active image version in Focus Edit while keeping the underlying InvokeAI filename stable.
- Reworked Focus Edit's Layers list into a floating rounded panel with responsive horizontal layers on narrow screens.
- Added a Pan tool for left-button dragging and middle-mouse dragging while preserving wheel zoom and inpaint behavior.
- Increased Focus Edit top-bar spacing and added a clear active state for the Pan tool.
- Replaced widely spaced canvas defaults with a compact image, node, and result arrangement plus fit-to-view Layout behavior.
- Added side-aware image and result connectors with bounded curves and stable connection-removal controls.
- Changed connection removal to a red hover state.

## 1.4.0 - 2026-08-28

- Added persistent visibility, reorder, and delete controls to Focus Edit's version layers while protecting the original image.
- Made hiding or deleting the active layer fall back to the highest visible version automatically.
- Added a compact Render standard action directly below an active 360p preview on the detailed image canvas.
- Changed Focus reference removal to a clear red hover and keyboard-focus state.
- Enabled InvokeAI caching for the FLUX.2 Klein loader and reusable reference-conditioning preparation across sequential preview jobs.

## 1.3.1 - 2026-08-28

- Added mouse-wheel and trackpad zoom directly over the image in Focus Edit.
- Prevented page and stage scrolling while the pointer is over the focused image.
- Unified wheel, plus, and minus zoom behavior with the existing 20% to 400% limits.

## 1.3.0 - 2026-08-28

- Made Draft mode a true 360p, four-step render path across the main and specialized workflows.
- Added a Focus Edit promotion step that uses the selected 360p preview as image guidance for one standard-resolution, eight-step render.
- Added focus-only reference uploads with thumbnails, `@2` through `@5` ordering, removal, generation wiring, and workspace persistence.
- Added a persistent Layers sidebar to Focus Edit. Original, preview, standard, and upscaled images remain available as reversible versions.
- Changed Focus generation to append outputs instead of replacing earlier renders, including background polling when result cards are no longer visible.
- Added responsive horizontal Focus layers on small screens while retaining the full-width image stage.

## 1.2.3 - 2026-08-28

- Rebuilt the Focus Edit pending variant as a contained neutral loader with a dedicated spinner and compact status label.
- Removed the shared purple badge styling that distorted the spinner and `Rendering` text.
- Anchored Focus Edit variants to a fixed bottom rail so they no longer move with the image or escape the preview area.

## 1.2.2 - 2026-08-28

- Reduced the Canvas title, selected model, model menu, and queue-note typography.
- Changed the back-menu workflow so selecting another mode transforms the current node instead of creating a duplicate.
- Preserved the node ID, position, prompt, selection, incoming references, result connections, and workspace persistence while switching modes.
- Kept the Canvas `+` and other external creation paths as the explicit way to add another node.

## 1.2.1 - 2026-08-28

- Replaced raw queue-state text such as `in_progress` with a small human-readable `Rendering` label.
- Added a compact model selector that opens on hover or click and lists compatible installed FLUX.2 Klein models.
- Persisted the selected model per workspace and passed it into every image, specialized-node, and Focus Edit graph.
- Matched FLUX.2 Klein 9B and 4B automatically with their corresponding installed Qwen3 encoders.
- Kept generation serial so selecting another model does not run two image models at the same time.

## 1.2.0 - 2026-08-28

- Replaced native Windows select popups with compact neutral dropdown menus across Simple Mode.
- Added purpose-built Variate, New view, and Extract node interfaces with persistent presets.
- Added real 360p draft previews that submit aligned low-resolution, four-step InvokeAI graphs.
- Compiled each specialized node's choices into precise model instructions instead of UI-only labels.
- Kept full-quality generation available per node through the shared InvokeAI quality controls.
- Fixed new-node placement, empty specialized prompts, and stale output-count labels after workspace loading.

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
