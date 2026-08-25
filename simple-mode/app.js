const state = {
  images: [null, null, null, null, null],
  nodes: [],
  blocks: [],
  outputs: [],
  edges: [],
  busy: false,
  view: { x: 28, y: 36, scale: 0.68 },
  dragNode: null,
  dragBlock: null,
  resizeNode: null,
  pan: null,
  connectFrom: null,
  connectDrag: null,
  dropTargetBlockId: null,
  skipNextClick: 0,
  selectedItems: [],
  marquee: null,
  dragSelection: null,
  focus: null,
  focusBusy: false,
  lastCanvasDragAt: 0,
  nodeClickTimer: null,
  selected: null,
  blockCounter: 0,
  menuAnchor: null,
  outputsExpanded: false,
  lastPromptRange: null,
  nativeCatalog: null,
  nativeCatalogLoading: false,
  renderAfterPointer: false,
  blockTokenDrag: null,
  globalTokenDrag: null,
  slotDrag: null,
  slotPointerDrag: null,
  suspendAutosave: true,
  workspace: {
    id: null,
    name: 'Untitled workspace',
    updatedAt: null,
    saveTimer: null,
    saving: false,
    saveQueued: false,
  },
};

const invokeBase = 'http://127.0.0.1:9090';
const refSlots = document.getElementById('refSlots');
const resultsGrid = document.getElementById('resultsGrid');
const tokenRow = document.getElementById('tokenRow');
const generateButton = document.getElementById('generate');
const serverStatus = document.getElementById('serverStatus');
const promptEditor = document.getElementById('prompt');
const canvasViewport = document.getElementById('canvasViewport');
const canvasContent = document.getElementById('canvasContent');
const nodeLayer = document.getElementById('nodeLayer');
const connectionLayer = document.getElementById('connectionLayer');
const canvasHint = document.getElementById('canvasHint');
const uploadStatus = document.getElementById('uploadStatus');
const zoomValue = document.getElementById('zoomValue');
const blockMenu = document.getElementById('blockMenu');
const blockSearch = document.getElementById('blockSearch');
const canvasUpload = document.getElementById('canvasUpload');
const toggleOutputsButton = document.getElementById('toggleOutputs');
const nativeFeatureList = document.getElementById('nativeFeatureList');
const workspaceSelect = document.getElementById('workspaceSelect');
const workspaceName = document.getElementById('workspaceName');
const newWorkspaceButton = document.getElementById('newWorkspace');
const saveStatus = document.getElementById('saveStatus');
const deleteSelectedButton = document.getElementById('deleteSelected');
const defaultPromptText = promptEditor.innerText.replace(/\u00a0/g, ' ').trim();

const roles = ['style', 'brand', 'object', 'lighting', 'composition', 'extra'];
const roleLabels = {
  style: 'Style / look',
  brand: 'Brand system',
  object: 'Object / subject',
  lighting: 'Lighting',
  composition: 'Composition',
  extra: 'Specific detail',
};
const rolePlaceholders = {
  style: 'mood, texture, render style',
  brand: 'logos, colors, signage',
  object: 'shape, pose, material',
  lighting: 'direction, contrast, reflections',
  composition: 'framing, layout, camera',
  extra: 'exact thing to borrow',
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function truncateText(value, limit = 130) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function setSaveStatus(text, kind = '') {
  saveStatus.textContent = text;
  saveStatus.classList.toggle('saving', kind === 'saving');
  saveStatus.classList.toggle('saved', kind === 'saved');
  saveStatus.classList.toggle('error', kind === 'error');
}

function setEditableText(element, text) {
  const safe = escapeHtml(String(text || '')).replace(/\n/g, '<br>');
  element.innerHTML = safe.replace(/(@\d+)/g, '<span class="prompt-mention">$1</span>');
}

function serializableImage(image) {
  if (!image || image.pending || !image.image_name) return null;
  const copy = { ...image };
  delete copy.pending;
  delete copy.tempObjectUrl;
  return copy;
}

function workspaceSnapshot() {
  syncAllImageMetaFromControls();
  return {
    version: 1,
    images: state.images.map(serializableImage),
    nodes: state.nodes.map((node) => ({ ...node })),
    blocks: state.blocks.map((block) => ({
      ...block,
      slotOrder: [...(block.slotOrder || [])],
      sourceOrder: [...(block.sourceOrder || [])],
      hiddenSources: [...(block.hiddenSources || [])],
    })),
    outputs: state.outputs.map((output) => ({ ...output, image: serializableImage(output.image) })),
    edges: state.edges.map((edge) => ({ ...edge })),
    view: { ...state.view },
    blockCounter: state.blockCounter,
    outputsExpanded: state.outputsExpanded,
    controls: {
      prompt: getPromptText(),
      aspect: document.getElementById('aspect').value,
      mode: document.getElementById('mode').value,
      steps: document.getElementById('steps').value,
      count: document.getElementById('count').value,
    },
  };
}

function workspaceIdFromUrl() {
  const match = window.location.pathname.match(/^\/workspace\/([A-Za-z0-9_-]+)$/);
  if (match) return match[1];
  return new URL(window.location.href).searchParams.get('workspace');
}

function updateWorkspaceUrl(workspaceId) {
  const next = `/workspace/${encodeURIComponent(workspaceId)}`;
  if (window.location.pathname !== next) window.history.replaceState({}, '', next);
}

function updateWorkspaceOption(workspaceDocument) {
  let option = [...workspaceSelect.options].find((item) => item.value === workspaceDocument.id);
  if (!option) option = document.createElement('option');
  option.value = workspaceDocument.id;
  option.textContent = workspaceDocument.name || 'Untitled workspace';
  if (!option.parentElement) workspaceSelect.prepend(option);
  workspaceSelect.value = workspaceDocument.id;
}

function resetRuntimeState() {
  state.images.forEach(revokePendingPreview);
  state.images = [null, null, null, null, null];
  state.nodes = [];
  state.blocks = [];
  state.outputs = [];
  state.edges = [];
  state.view = { x: 28, y: 36, scale: 0.68 };
  state.selectedItems = [];
  state.selected = null;
  state.focus = null;
  state.blockCounter = 0;
  state.outputsExpanded = false;
  state.connectFrom = null;
  state.connectDrag = null;
  state.blockTokenDrag = null;
  state.globalTokenDrag = null;
  state.slotDrag = null;
  state.slotPointerDrag = null;
}

function restoreControlValue(id, value) {
  const control = document.getElementById(id);
  if (!control || value === undefined || value === null) return;
  const option = [...control.options].find((item) => item.value === String(value));
  if (option) control.value = option.value;
}

function applyWorkspaceDocument(document) {
  state.suspendAutosave = true;
  resetRuntimeState();
  const saved = document?.state || {};
  const images = Array.isArray(saved.images) ? saved.images.slice(0, 5) : [];
  images.forEach((image, slot) => {
    if (image?.image_name) state.images[slot] = { ...image, pending: false };
  });
  state.nodes = (Array.isArray(saved.nodes) ? saved.nodes : [])
    .filter((node) => Number.isInteger(Number(node.slot)) && state.images[Number(node.slot)])
    .map((node) => ({ ...node, slot: Number(node.slot) }));
  state.images.forEach((image, slot) => {
    if (image && !state.nodes.some((node) => node.slot === slot)) {
      state.nodes.push({ slot, ...defaultPositions[slot] });
    }
  });
  state.blocks = (Array.isArray(saved.blocks) ? saved.blocks : []).map((block) => ({
    ...block,
    nativeFeature: nativeFeatureForKind(block.kind) || block.nativeFeature || null,
    slotOrder: Array.isArray(block.slotOrder) ? block.slotOrder.map(Number) : [],
    sourceOrder: Array.isArray(block.sourceOrder) ? block.sourceOrder.map(String) : [],
    hiddenSources: Array.isArray(block.hiddenSources) ? block.hiddenSources.map(String) : [],
  }));
  state.outputs = (Array.isArray(saved.outputs) ? saved.outputs : []).map((output) => ({
    ...output,
    id: String(output.id),
    itemId: output.itemId ?? output.id,
  }));
  state.edges = (Array.isArray(saved.edges) ? saved.edges : [])
    .filter((edge) => typeof edge?.from === 'string' && typeof edge?.to === 'string')
    .map((edge) => ({ from: edge.from, to: edge.to }));
  if (saved.view && ['x', 'y', 'scale'].every((key) => Number.isFinite(Number(saved.view[key])))) {
    state.view = {
      x: Number(saved.view.x),
      y: Number(saved.view.y),
      scale: Math.max(0.42, Math.min(2.25, Number(saved.view.scale))),
    };
  }
  state.blockCounter = Math.max(
    Number(saved.blockCounter) || 0,
    ...state.blocks.map((block) => Number(String(block.id || '').match(/-(\d+)$/)?.[1]) || 0),
  );
  state.outputsExpanded = Boolean(saved.outputsExpanded);
  setEditableText(promptEditor, saved.controls?.prompt || defaultPromptText);
  restoreControlValue('aspect', saved.controls?.aspect);
  restoreControlValue('mode', saved.controls?.mode);
  restoreControlValue('steps', saved.controls?.steps);
  restoreControlValue('count', saved.controls?.count);
  refreshSlotPreviews();
  renderTokens();
  restoreResultCards();
  renderCanvas();
  updateOutputMode();
  syncModeControls();
  state.workspace.id = document.id;
  state.workspace.name = document.name || 'Untitled workspace';
  state.workspace.updatedAt = document.updated_at || null;
  workspaceName.value = state.workspace.name;
  updateWorkspaceOption(document);
  updateWorkspaceUrl(document.id);
  state.suspendAutosave = false;
  setSaveStatus('Saved', 'saved');
}

async function fetchWorkspace(workspaceId) {
  const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Workspace could not be opened.');
  return data;
}

async function refreshWorkspaceList() {
  const response = await fetch('/api/workspaces');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Workspace list could not be loaded.');
  workspaceSelect.innerHTML = '';
  (data.items || []).forEach((item) => {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.name || 'Untitled workspace';
    workspaceSelect.appendChild(option);
  });
  return data.items || [];
}

async function saveWorkspaceNow() {
  if (state.suspendAutosave || !state.workspace.id) return;
  if (state.workspace.saveTimer) {
    window.clearTimeout(state.workspace.saveTimer);
    state.workspace.saveTimer = null;
  }
  if (state.workspace.saving) {
    state.workspace.saveQueued = true;
    return;
  }
  state.workspace.saving = true;
  state.workspace.saveQueued = false;
  setSaveStatus('Saving', 'saving');
  try {
    const response = await fetch(`/api/workspaces/${encodeURIComponent(state.workspace.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: workspaceName.value, state: workspaceSnapshot() }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Workspace could not be saved.');
    state.workspace.name = data.name;
    state.workspace.updatedAt = data.updated_at;
    workspaceName.value = data.name;
    updateWorkspaceOption(data);
    setSaveStatus('Saved', 'saved');
  } catch (error) {
    setSaveStatus('Save failed', 'error');
    setUploadStatus(error.message, 'error');
  } finally {
    state.workspace.saving = false;
    if (state.workspace.saveQueued) saveWorkspaceNow();
  }
}

function scheduleAutosave() {
  if (state.suspendAutosave || !state.workspace.id) return;
  if (state.workspace.saveTimer) window.clearTimeout(state.workspace.saveTimer);
  setSaveStatus('Unsaved', 'saving');
  state.workspace.saveTimer = window.setTimeout(saveWorkspaceNow, 650);
}

async function createWorkspace() {
  await saveWorkspaceNow();
  setSaveStatus('Creating', 'saving');
  const name = `Workspace ${new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
  const response = await fetch('/api/workspaces', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, state: { version: 1, controls: { prompt: defaultPromptText } } }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Workspace could not be created.');
  await refreshWorkspaceList();
  applyWorkspaceDocument(data);
}

async function openWorkspace(workspaceId) {
  if (!workspaceId || workspaceId === state.workspace.id) return;
  await saveWorkspaceNow();
  setSaveStatus('Loading', 'saving');
  applyWorkspaceDocument(await fetchWorkspace(workspaceId));
}

async function initializeWorkspaces() {
  try {
    const items = await refreshWorkspaceList();
    const requestedId = workspaceIdFromUrl();
    const target = requestedId && items.some((item) => item.id === requestedId)
      ? requestedId
      : items[0]?.id;
    if (target) {
      applyWorkspaceDocument(await fetchWorkspace(target));
    } else {
      await createWorkspace();
    }
  } catch (error) {
    state.suspendAutosave = false;
    setSaveStatus('Storage error', 'error');
    setUploadStatus(error.message, 'error');
    renderCanvas();
  }
}
const defaultPositions = [
  { x: 55, y: 214 },
  { x: 372, y: 70 },
  { x: 372, y: 260 },
  { x: 372, y: 450 },
  { x: 605, y: 170 },
];

const blockDefaults = {
  modify: {
    title: 'Modify',
    icon: '⌕',
    prompt: '',
    hint: 'Describe your changes (use @ to reference images or assets)',
  },
  variate: {
    title: 'Variate',
    icon: '⇄',
    prompt: 'Create controlled variations of @1. Keep the same scene logic, but vary form, color, and material feel.',
    hint: 'Describe what should vary',
  },
  'variate-form-color': {
    title: 'Variate form and color',
    icon: '⇄',
    prompt: 'Use @1 as the source. Vary the form, color palette, materials, and surface treatment while keeping the core composition readable.',
    hint: 'Describe the variation',
  },
  'new-view': {
    title: 'New view',
    icon: '◎',
    prompt: 'Use @1 as the source. Create a new camera view of the same scene with consistent objects, branding, lighting, and spatial logic.',
    hint: 'Describe the new view',
  },
  'change-expression': {
    title: 'Change expression',
    icon: '☻',
    prompt: 'Use @1 as the source. Change the subject expression and pose while preserving identity, outfit, lighting, and scene composition.',
    hint: 'Describe the expression',
  },
  extract: {
    title: 'Extract',
    icon: '▱',
    prompt: 'Extract the key visual language from @1 as a clean reusable reference: shapes, materials, lighting, color palette, and composition rules.',
    hint: 'Describe what should be extracted',
  },
};

function nativeFeatures() {
  return state.nativeCatalog?.features || [];
}

function nativeFeatureForKind(kind) {
  return nativeFeatures().find((feature) => feature.block_kind === kind) || null;
}

function iconForFeature(feature) {
  const group = feature?.group || '';
  if (feature?.action === 'upscale') return '⇱';
  if (feature?.action === 'image_to_prompt') return 'Aa';
  if (group === 'workflows') return '▦';
  if (group === 'style_presets') return '◐';
  if (group === 'control') return '⌁';
  if (group === 'canvas_masks') return '▱';
  if (group === 'model') return '◈';
  if (group === 'generation') return '✦';
  if (group === 'upscale') return '⇱';
  if (group === 'image') return '▧';
  return '◇';
}

function featurePrompt(feature) {
  if (!feature) return '';
  if (feature.action === 'image_to_prompt') {
    return 'Describe this image in detail for use as an AI image generation prompt.';
  }
  if (feature.action === 'upscale') {
    return 'Upscale the connected image and download the upscaled result when ready.';
  }
  if (feature.action === 'native_image_invocation') {
    return `Run native InvokeAI node "${feature.title}" on the connected image.`;
  }
  if (feature.action === 'style_preset') {
    const preset = feature.preset || {};
    return [preset.positive_prompt, preset.negative_prompt ? `Avoid: ${preset.negative_prompt}` : '']
      .filter(Boolean)
      .join('\n');
  }
  return feature.description || '';
}

function configForBlock(kind) {
  const nativeFeature = nativeFeatureForKind(kind);
  if (nativeFeature) {
    const isCoreModify = nativeFeature.id === 'core:modify';
    return {
      title: isCoreModify ? 'Modify' : nativeFeature.title,
      icon: isCoreModify ? '' : iconForFeature(nativeFeature),
      prompt: featurePrompt(nativeFeature),
      hint: nativeFeature.status || 'Native InvokeAI feature',
      nativeFeature,
    };
  }
  return blockDefaults[kind] || blockDefaults.modify;
}

function displayBlockTitle(block) {
  return block?.kind === 'modify' || block?.nativeFeature?.id === 'core:modify'
    ? 'Modify'
    : block?.title || 'Node';
}

function imageEndpoint(slot) {
  return `image:${slot}`;
}

function blockEndpoint(id) {
  return `block:${id}`;
}

function outputEndpoint(id) {
  return `output:${id}`;
}

function endpointType(endpoint) {
  return endpoint?.split(':')[0] || '';
}

function endpointId(endpoint) {
  return endpoint?.split(':').slice(1).join(':') || '';
}

function imageUrl(image, kind = 'thumbnail') {
  const url = image?.[kind === 'full' ? 'image_url' : 'thumbnail_url'];
  if (!url) return '';
  if (url.startsWith('http') || url.startsWith('blob:') || url.startsWith('data:')) return url;
  const cleanUrl = url.startsWith('/') ? url.slice(1) : url;
  return `${invokeBase}/${cleanUrl}`;
}

function labelFor(slot) {
  return slot === 0 ? '@1 main' : `@${slot + 1}`;
}

function roleFor(slot) {
  if (slot === 0) return 'main';
  return state.images[slot]?.role || document.querySelector(`[data-role="${slot}"]`)?.value || 'reference';
}

function noteFor(slot) {
  if (slot === 0) return '';
  return state.images[slot]?.note || document.querySelector(`[data-note="${slot}"]`)?.value || '';
}

function syncImageMetaFromControls(slot) {
  if (slot <= 0 || !state.images[slot]) return;
  state.images[slot].role = document.querySelector(`[data-role="${slot}"]`)?.value || state.images[slot].role || 'style';
  state.images[slot].note = document.querySelector(`[data-note="${slot}"]`)?.value || '';
}

function syncAllImageMetaFromControls() {
  for (let slot = 1; slot < state.images.length; slot += 1) {
    syncImageMetaFromControls(slot);
  }
}

function applyImageMetaToControls(slot) {
  if (slot <= 0) return;
  const select = document.querySelector(`[data-role="${slot}"]`);
  const note = document.querySelector(`[data-note="${slot}"]`);
  const image = state.images[slot];
  if (select) {
    select.value = image?.role && roles.includes(image.role) ? image.role : 'style';
    if (note) note.placeholder = rolePlaceholders[select.value] || 'what to borrow';
  }
  if (note) note.value = image?.note || '';
}

function setUploadStatus(text, kind = '') {
  uploadStatus.textContent = text;
  uploadStatus.classList.toggle('busy', kind === 'busy');
  uploadStatus.classList.toggle('error', kind === 'error');
}

function createRefSlots() {
  for (let i = 1; i <= 4; i += 1) {
    const card = document.createElement('div');
    card.className = 'ref-card';
    card.innerHTML = `
      <div class="slot" data-slot="${i}">
        <input type="file" accept="image/*" />
        <div class="empty"><strong>@${i + 1}</strong><span>Drop or click</span><em>Choose</em></div>
      </div>
      <div class="ref-meta">
        <select data-role="${i}">
          ${roles.map((role) => `<option value="${role}">${roleLabels[role] || role}</option>`).join('')}
        </select>
        <input data-note="${i}" placeholder="${rolePlaceholders.style}" />
      </div>
    `;
    refSlots.appendChild(card);
  }
}

function setSlotProgress(slot, text, percent = 0, kind = 'busy') {
  const element = document.querySelector(`.slot[data-slot="${slot}"]`);
  if (!element) return;
  element.classList.toggle('uploading', kind === 'busy');
  element.classList.toggle('error', kind === 'error');
  element.querySelector('.slot-progress')?.remove();
  if (!text) return;
  const progress = document.createElement('div');
  progress.className = 'slot-progress';
  progress.innerHTML = `
    <span>${text}</span>
    <div class="slot-progress-bar"><span style="width:${Math.max(0, Math.min(100, percent))}%"></span></div>
  `;
  element.appendChild(progress);
}

function setSlotPreview(slot, image) {
  const element = document.querySelector(`.slot[data-slot="${slot}"]`);
  const input = element?.querySelector('input[type="file"]');
  if (!element || !input) return;
  element.innerHTML = '';
  element.appendChild(input);
  const img = document.createElement('img');
  img.src = imageUrl(image);
  img.alt = labelFor(slot);
  img.draggable = !image.pending;
  img.dataset.slotDrag = String(slot);
  const tag = document.createElement('div');
  tag.className = 'slot-label';
  tag.textContent = image.pending ? `${labelFor(slot)} uploading` : labelFor(slot);
  element.appendChild(img);
  element.appendChild(tag);
  element.classList.toggle('pending', Boolean(image.pending));
  element.classList.add('has-image');
  element.classList.remove('uploading', 'error');
}

function setEmptySlot(slot) {
  const element = document.querySelector(`.slot[data-slot="${slot}"]`);
  const input = element?.querySelector('input[type="file"]');
  if (!element || !input) return;
  element.innerHTML = '';
  element.appendChild(input);
  const empty = document.createElement('div');
  empty.className = 'empty';
  empty.innerHTML = slot === 0
    ? '<strong>@1 Main image</strong><span>Drop or click to upload</span><em>Choose image</em>'
    : `<strong>@${slot + 1}</strong><span>Drop or click</span><em>Choose</em>`;
  element.appendChild(empty);
  element.classList.remove('has-image', 'pending', 'uploading', 'error', 'slot-dragging', 'slot-drop-target');
}

function refreshSlotPreviews() {
  state.images.forEach((image, slot) => {
    if (image) setSlotPreview(slot, image);
    else setEmptySlot(slot);
    applyImageMetaToControls(slot);
  });
}

function swapImageSlots(fromSlot, targetSlot) {
  if (fromSlot === targetSlot || !state.images[fromSlot]) return false;
  syncAllImageMetaFromControls();
  if (state.images[targetSlot]) {
    [state.images[fromSlot], state.images[targetSlot]] = [state.images[targetSlot], state.images[fromSlot]];
  } else {
    state.images[targetSlot] = state.images[fromSlot];
    state.images[fromSlot] = null;
    const sourceEndpoint = imageEndpoint(fromSlot);
    const targetEndpoint = imageEndpoint(targetSlot);
    const node = state.nodes.find((item) => item.slot === fromSlot);
    if (node) node.slot = targetSlot;
    state.edges = state.edges
      .map((edge) => ({
        from: edge.from === sourceEndpoint ? targetEndpoint : edge.from,
        to: edge.to === sourceEndpoint ? targetEndpoint : edge.to,
      }))
      .filter((edge, index, edges) => edge.from !== edge.to
        && edges.findIndex((candidate) => candidate.from === edge.from && candidate.to === edge.to) === index);
    state.blocks.forEach((block) => {
      block.slotOrder = (block.slotOrder || []).map((slot) => (slot === fromSlot ? targetSlot : slot));
    });
    state.selectedItems = state.selectedItems.map((endpoint) => (endpoint === sourceEndpoint ? targetEndpoint : endpoint));
    if (state.selected === sourceEndpoint) state.selected = targetEndpoint;
  }
  refreshSlotPreviews();
  renderTokens();
  renderCanvas();
  setUploadStatus(`${labelFor(targetSlot)} is now ${targetSlot === 0 ? 'the main image' : 'updated'}.`);
  return true;
}

function revokePendingPreview(image) {
  if (image?.tempObjectUrl) {
    URL.revokeObjectURL(image.tempObjectUrl);
  }
}

function setPendingPreview(slot, file) {
  revokePendingPreview(state.images[slot]);
  const previewUrl = URL.createObjectURL(file);
  const pendingImage = {
    image_name: null,
    image_url: previewUrl,
    thumbnail_url: previewUrl,
    width: 1024,
    height: 1024,
    pending: true,
    tempObjectUrl: previewUrl,
    file_name: file.name,
  };
  state.images[slot] = pendingImage;
  setSlotPreview(slot, pendingImage);
  upsertNode(slot);
  renderTokens();
  renderCanvas();
}

function firstEmptySlot(start = 0) {
  for (let i = start; i < state.images.length; i += 1) {
    if (!state.images[i]) return i;
  }
  for (let i = 0; i < state.images.length; i += 1) {
    if (!state.images[i]) return i;
  }
  return -1;
}

function slotSize(slot, node = null) {
  const base = slot === 0 ? { w: 260, h: 196 } : { w: 178, h: 154 };
  return {
    w: node?.w || base.w,
    h: node?.h || base.h,
  };
}

function endpointBox(endpoint) {
  if (endpointType(endpoint) === 'image') {
    const slot = Number(endpointId(endpoint));
    const node = state.nodes.find((item) => item.slot === slot);
    if (!node) return null;
    const size = slotSize(slot, node);
    return { x: node.x, y: node.y, w: size.w, h: size.h, kind: 'image', slot };
  }
  if (endpointType(endpoint) === 'block') {
    const block = state.blocks.find((item) => item.id === endpointId(endpoint));
    if (!block) return null;
    return { x: block.x, y: block.y, w: block.w || 340, h: block.h || 300, kind: 'block', block };
  }
  if (endpointType(endpoint) === 'output') {
    const output = state.outputs.find((item) => item.id === endpointId(endpoint));
    if (!output) return null;
    return { x: output.x, y: output.y, w: output.w || 178, h: output.h || 154, kind: 'output', output };
  }
  return null;
}

function uniqueEndpoints(endpoints) {
  return [...new Set((endpoints || []).filter(Boolean))];
}

function setSelection(endpoints, primary = null) {
  state.selectedItems = uniqueEndpoints(Array.isArray(endpoints) ? endpoints : [endpoints]);
  state.selected = primary || state.selectedItems[state.selectedItems.length - 1] || null;
  syncSelectionControls();
}

function syncSelectionControls() {
  if (!deleteSelectedButton) return;
  const count = state.selectedItems.length;
  deleteSelectedButton.disabled = count === 0;
  deleteSelectedButton.title = count
    ? `Delete ${count} selected canvas item${count === 1 ? '' : 's'}`
    : 'Select images or nodes to delete';
}

function deleteCanvasEndpoints(endpoints = state.selectedItems) {
  const targets = new Set(uniqueEndpoints(endpoints));
  if (!targets.size) return false;
  const deletedLabels = [];

  targets.forEach((endpoint) => {
    const type = endpointType(endpoint);
    const id = endpointId(endpoint);
    if (type === 'image') {
      const slot = Number(id);
      const image = state.images[slot];
      if (!Number.isInteger(slot) || !image) return;
      revokePendingPreview(image);
      state.images[slot] = null;
      state.nodes = state.nodes.filter((node) => node.slot !== slot);
      state.blocks.forEach((block) => {
        block.slotOrder = (block.slotOrder || []).filter((item) => Number(item) !== slot);
        block.hiddenSlots = (block.hiddenSlots || []).filter((item) => Number(item) !== slot);
      });
      deletedLabels.push(labelFor(slot));
    } else if (type === 'block') {
      const block = state.blocks.find((item) => item.id === id);
      if (!block) return;
      state.blocks = state.blocks.filter((item) => item.id !== id);
      deletedLabels.push(displayBlockTitle(block));
    } else if (type === 'output') {
      const output = state.outputs.find((item) => String(item.id) === String(id));
      if (!output) return;
      state.outputs = state.outputs.filter((item) => String(item.id) !== String(id));
      deletedLabels.push(output.label || 'output image');
    }
  });

  state.edges = state.edges.filter((edge) => !targets.has(edge.from) && !targets.has(edge.to));
  state.blocks.forEach((block) => {
    block.sourceOrder = (block.sourceOrder || []).filter((endpoint) => !targets.has(endpoint));
    block.hiddenSources = (block.hiddenSources || []).filter((endpoint) => !targets.has(endpoint));
  });
  if (targets.has(state.connectFrom)) state.connectFrom = null;
  if (state.focus && targets.has(state.focus.endpoint)) closeFocus();
  setSelection([]);
  refreshSlotPreviews();
  renderTokens();
  restoreResultCards();
  renderCanvas();
  setUploadStatus(`Deleted ${deletedLabels.join(', ')} from this workspace.`);
  return true;
}

function isSelected(endpoint) {
  return state.selected === endpoint || state.selectedItems.includes(endpoint);
}

function selectedBoxes() {
  return state.selectedItems
    .map((endpoint) => ({ endpoint, box: endpointBox(endpoint) }))
    .filter((item) => item.box);
}

function imageForEndpoint(endpoint) {
  if (endpointType(endpoint) === 'image') {
    return state.images[Number(endpointId(endpoint))] || null;
  }
  if (endpointType(endpoint) === 'output') {
    return state.outputs.find((output) => output.id === endpointId(endpoint))?.image || null;
  }
  return null;
}

function labelForEndpoint(endpoint) {
  if (endpointType(endpoint) === 'image') {
    const slot = Number(endpointId(endpoint));
    return labelFor(slot);
  }
  if (endpointType(endpoint) === 'output') {
    return state.outputs.find((output) => output.id === endpointId(endpoint))?.label || 'Output';
  }
  if (endpointType(endpoint) === 'block') {
    return state.blocks.find((block) => block.id === endpointId(endpoint))?.title || 'Block';
  }
  return 'Image';
}

function allSelectableBoxes() {
  return [
    ...state.nodes.map((node) => ({ endpoint: imageEndpoint(node.slot), box: endpointBox(imageEndpoint(node.slot)) })),
    ...state.blocks.map((block) => ({ endpoint: blockEndpoint(block.id), box: endpointBox(blockEndpoint(block.id)) })),
    ...state.outputs.map((output) => ({ endpoint: outputEndpoint(output.id), box: endpointBox(outputEndpoint(output.id)) })),
  ].filter((item) => item.box);
}

function canvasBounds() {
  const boxes = allSelectableBoxes().map((item) => item.box);
  let width = 1400;
  let height = 900;
  boxes.forEach((box) => {
    width = Math.max(width, box.x + box.w + 420);
    height = Math.max(height, box.y + box.h + 320);
  });
  if (state.connectDrag?.current) {
    width = Math.max(width, state.connectDrag.current.x + 240);
    height = Math.max(height, state.connectDrag.current.y + 180);
  }
  return { width: Math.ceil(width), height: Math.ceil(height) };
}

function updateCanvasGeometry() {
  const { width, height } = canvasBounds();
  canvasContent.style.width = `${width}px`;
  canvasContent.style.height = `${height}px`;
  nodeLayer.style.width = `${width}px`;
  nodeLayer.style.height = `${height}px`;
  connectionLayer.style.width = `${width}px`;
  connectionLayer.style.height = `${height}px`;
  connectionLayer.setAttribute('viewBox', `0 0 ${width} ${height}`);
}

function isPointerInteractionActive() {
  return Boolean(state.dragNode || state.dragBlock || state.resizeNode || state.connectDrag || state.dragSelection || state.marquee || state.pan);
}

function requestCanvasRender() {
  if (isPointerInteractionActive()) {
    state.renderAfterPointer = true;
    return;
  }
  renderCanvas();
}

function rectFromPoints(a, b) {
  const x1 = Math.min(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const x2 = Math.max(a.x, b.x);
  const y2 = Math.max(a.y, b.y);
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

function boxesIntersect(rect, box) {
  return rect.x <= box.x + box.w
    && rect.x + rect.w >= box.x
    && rect.y <= box.y + box.h
    && rect.y + rect.h >= box.y;
}

function screenToWorld(clientX, clientY) {
  const rect = canvasViewport.getBoundingClientRect();
  return {
    x: (clientX - rect.left - state.view.x) / state.view.scale,
    y: (clientY - rect.top - state.view.y) / state.view.scale,
  };
}

function workflowBlockAtPoint(clientX, clientY, ignoredElement = null) {
  const previousPointerEvents = ignoredElement?.style.pointerEvents;
  if (ignoredElement) ignoredElement.style.pointerEvents = 'none';
  const element = document.elementFromPoint(clientX, clientY)?.closest?.('.workflow-block') || null;
  if (ignoredElement) ignoredElement.style.pointerEvents = previousPointerEvents || '';
  return element;
}

function imageNodeAtPoint(clientX, clientY, ignoredElement = null) {
  const previousPointerEvents = ignoredElement?.style.pointerEvents;
  if (ignoredElement) ignoredElement.style.pointerEvents = 'none';
  const element = document.elementFromPoint(clientX, clientY)?.closest?.('.canvas-node') || null;
  if (ignoredElement) ignoredElement.style.pointerEvents = previousPointerEvents || '';
  return element;
}

function completeConnectionDrag(drag, clientX, clientY) {
  const sourceElement = drag.sourceElement
    || nodeLayer.querySelector(`[data-endpoint="${drag.from}"]`);
  const targetBlock = workflowBlockAtPoint(clientX, clientY, sourceElement);
  if (targetBlock) {
    connectEndpointToBlock(drag.from, targetBlock.dataset.blockId);
    state.skipNextClick = performance.now() + 650;
    return;
  }
  if (endpointType(drag.from) === 'image') {
    const sourceSlot = Number(endpointId(drag.from));
    const targetImage = imageNodeAtPoint(clientX, clientY, sourceElement);
    const targetSlot = targetImage ? Number(targetImage.dataset.slot) : null;
    if (Number.isInteger(targetSlot) && targetSlot !== sourceSlot) {
      addEdge(drag.from, imageEndpoint(targetSlot));
      state.connectFrom = null;
      setDropTargetBlock(null);
      setUploadStatus(`Connected @${sourceSlot + 1} as a reference to @${targetSlot + 1}.`);
      state.skipNextClick = performance.now() + 650;
      renderCanvas();
      return;
    }
  }
  const rect = canvasViewport.getBoundingClientRect();
  showBlockMenu({ x: clientX - rect.left + 8, y: clientY - rect.top - 18 }, drag.from);
  setDropTargetBlock(null);
  renderCanvas();
}

function setDropTargetBlock(blockId = null) {
  if (state.dropTargetBlockId === blockId) return;
  state.dropTargetBlockId = blockId;
  document.querySelectorAll('.workflow-block.drop-target').forEach((element) => {
    element.classList.remove('drop-target');
  });
  if (!blockId) return;
  const element = document.querySelector(`.workflow-block[data-block-id="${blockId}"]`);
  element?.classList.add('drop-target');
}

function isSimpleGenerateBlock(block) {
  return !block?.nativeFeature || ['simple_generate', 'style_preset'].includes(block.nativeFeature.action);
}

function connectActiveImagesToBlock(blockId) {
  const block = state.blocks.find((item) => item.id === blockId);
  if (!isSimpleGenerateBlock(block)) return;
  allActiveSlots().forEach((slot) => addEdge(imageEndpoint(slot), blockEndpoint(blockId)));
}

function connectSlotToSimpleBlocks(slot) {
  state.blocks
    .filter(isSimpleGenerateBlock)
    .forEach((block) => addEdge(imageEndpoint(slot), blockEndpoint(block.id)));
}

function upsertNode(slot) {
  if (!state.images[slot]) return;
  let node = state.nodes.find((item) => item.slot === slot);
  if (!node) {
    node = { slot, ...defaultPositions[slot] };
    state.nodes.push(node);
  }
  setSelection([imageEndpoint(slot)]);
  connectSlotToSimpleBlocks(slot);
  if (slot === 0 && !state.blocks.length) {
    addBlock('modify', { x: 410, y: 160 }, imageEndpoint(0));
  }
}

function renderTokens() {
  tokenRow.innerHTML = '';
  state.images.forEach((image, index) => {
    if (!image) return;
    const token = document.createElement('button');
    token.className = `token${index === 0 ? ' main-token' : ''}${image.pending ? ' pending' : ''}`;
    token.type = 'button';
    token.draggable = true;
    token.dataset.tokenSlot = index;
    token.title = `Drag to reorder. Click to insert ${index === 0 ? 'main image @1' : `@${index + 1}`}.`;
    token.innerHTML = `<img src="${imageUrl(image)}" alt="" draggable="false"><span>${index === 0 ? 'MAIN @1' : index + 1}</span>`;
    token.addEventListener('click', (event) => {
      if (state.skipNextClick && performance.now() < state.skipNextClick) {
        event.preventDefault();
        return;
      }
      insertPromptToken(index);
    });
    tokenRow.appendChild(token);
  });
}

function renderConnections() {
  updateCanvasGeometry();
  connectionLayer.innerHTML = '';
  state.edges.forEach((edge, edgeIndex) => {
    const from = endpointBox(edge.from);
    const to = endpointBox(edge.to);
    if (!from || !to) return;
    const x1 = from.x + from.w;
    const y1 = from.y + from.h / 2;
    const x2 = to.x;
    const y2 = to.y + to.h / 2;
    const curve = Math.max(90, Math.abs(x2 - x1) * 0.45);
    const d = `M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`;
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.classList.add('connection-group');
    group.dataset.edgeIndex = edgeIndex;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.classList.add('connection-path');
    path.setAttribute('d', d);
    group.appendChild(path);
    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hit.classList.add('connection-hit');
    hit.setAttribute('d', d);
    group.appendChild(hit);
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.classList.add('connection-dot');
    dot.setAttribute('cx', x2);
    dot.setAttribute('cy', y2);
    dot.setAttribute('r', '4');
    group.appendChild(dot);

    const remove = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    remove.classList.add('connection-remove');
    remove.dataset.edgeIndex = edgeIndex;
    const visibleLeft = (-state.view.x / state.view.scale) + 18;
    const visibleRight = ((canvasViewport.clientWidth - state.view.x) / state.view.scale) - 18;
    const visibleTop = (-state.view.y / state.view.scale) + 18;
    const visibleBottom = ((canvasViewport.clientHeight - state.view.y) / state.view.scale) - 18;
    let removeX = Math.min(visibleRight, Math.max(visibleLeft, x2 - 28));
    const removeY = Math.min(visibleBottom, Math.max(visibleTop, y2));
    if (removeX >= to.x && removeX <= to.x + to.w && removeY >= to.y && removeY <= to.y + to.h) {
      removeX = Math.min(visibleRight, to.x + to.w + 18);
    }
    remove.setAttribute('transform', `translate(${removeX} ${removeY})`);
    const removeCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    removeCircle.setAttribute('r', '10');
    const removeText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    removeText.setAttribute('text-anchor', 'middle');
    removeText.setAttribute('dominant-baseline', 'central');
    removeText.textContent = '−';
    remove.append(removeCircle, removeText);
    group.appendChild(remove);
    connectionLayer.appendChild(group);
  });
  if (state.connectDrag) {
    const from = endpointBox(state.connectDrag.from);
    if (!from) return;
    const x1 = from.x + from.w;
    const y1 = from.y + from.h / 2;
    const x2 = state.connectDrag.current.x;
    const y2 = state.connectDrag.current.y;
    const curve = Math.max(70, Math.abs(x2 - x1) * 0.45);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.classList.add('draft-connection');
    path.setAttribute('d', `M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`);
    connectionLayer.appendChild(path);
  }
}

function isImageSourceEndpoint(endpoint) {
  return ['image', 'output'].includes(endpointType(endpoint)) && Boolean(imageForEndpoint(endpoint));
}

function connectedSourcesForBlock(blockId) {
  const target = blockEndpoint(blockId);
  const direct = state.edges
    .filter((edge) => edge.to === target && isImageSourceEndpoint(edge.from))
    .map((edge) => edge.from);
  const directImages = new Set(direct.filter((endpoint) => endpointType(endpoint) === 'image'));
  const indirect = state.edges
    .filter((edge) => directImages.has(edge.to) && isImageSourceEndpoint(edge.from))
    .map((edge) => edge.from);
  return [...new Set([...direct, ...indirect])];
}

function orderedSourcesForBlock(block) {
  if (!block) return [];
  const connected = connectedSourcesForBlock(block.id);
  const hidden = new Set([
    ...(Array.isArray(block.hiddenSources) ? block.hiddenSources : []),
    ...(Array.isArray(block.hiddenSlots) ? block.hiddenSlots.map((slot) => imageEndpoint(slot)) : []),
  ]);
  const fallback = (connected.length ? connected : allActiveSlots().map(imageEndpoint))
    .filter((endpoint) => !hidden.has(endpoint) && isImageSourceEndpoint(endpoint));
  const known = new Set(fallback);
  const legacyOrder = Array.isArray(block.slotOrder) ? block.slotOrder.map(imageEndpoint) : [];
  const preferred = Array.isArray(block.sourceOrder) && block.sourceOrder.length
    ? block.sourceOrder
    : legacyOrder;
  const ordered = preferred.filter((endpoint) => known.has(endpoint) && isImageSourceEndpoint(endpoint));
  fallback.forEach((endpoint) => {
    if (!ordered.includes(endpoint)) ordered.push(endpoint);
  });
  block.sourceOrder = ordered;
  block.slotOrder = ordered
    .filter((endpoint) => endpointType(endpoint) === 'image')
    .map((endpoint) => Number(endpointId(endpoint)));
  return ordered;
}

function appendSourceToBlockOrder(blockId, sourceEndpoint) {
  const block = state.blocks.find((item) => item.id === blockId);
  if (!block || !isImageSourceEndpoint(sourceEndpoint)) return;
  block.hiddenSources = (Array.isArray(block.hiddenSources) ? block.hiddenSources : [])
    .filter((endpoint) => endpoint !== sourceEndpoint);
  if (endpointType(sourceEndpoint) === 'image') {
    const slot = Number(endpointId(sourceEndpoint));
    block.hiddenSlots = (Array.isArray(block.hiddenSlots) ? block.hiddenSlots : [])
      .filter((item) => Number(item) !== slot);
  }
  block.sourceOrder = Array.isArray(block.sourceOrder) ? block.sourceOrder : [];
  if (!block.sourceOrder.includes(sourceEndpoint)) block.sourceOrder.push(sourceEndpoint);
}

function disconnectSourceFromBlock(sourceEndpoint, blockId) {
  const block = state.blocks.find((item) => item.id === blockId);
  if (!block) return false;
  const to = blockEndpoint(blockId);
  state.edges = state.edges.filter((edge) => !(edge.from === sourceEndpoint && edge.to === to));
  block.sourceOrder = (Array.isArray(block.sourceOrder) ? block.sourceOrder : [])
    .filter((endpoint) => endpoint !== sourceEndpoint);
  block.hiddenSources = Array.isArray(block.hiddenSources) ? block.hiddenSources : [];
  if (!block.hiddenSources.includes(sourceEndpoint)) block.hiddenSources.push(sourceEndpoint);
  if (endpointType(sourceEndpoint) === 'image') {
    const slot = Number(endpointId(sourceEndpoint));
    block.slotOrder = (Array.isArray(block.slotOrder) ? block.slotOrder : []).filter((item) => item !== slot);
    block.hiddenSlots = Array.isArray(block.hiddenSlots) ? block.hiddenSlots : [];
    if (!block.hiddenSlots.includes(slot)) block.hiddenSlots.push(slot);
  }
  setUploadStatus(`Removed ${labelForEndpoint(sourceEndpoint)} from ${displayBlockTitle(block)}.`);
  return true;
}

function localTokenForBlockSource(block, sourceEndpoint) {
  const index = orderedSourcesForBlock(block).indexOf(sourceEndpoint);
  return index >= 0 ? index + 1 : 1;
}

function localTokenForBlockSlot(block, slot) {
  return localTokenForBlockSource(block, imageEndpoint(slot));
}

function reorderBlockSource(blockId, draggedEndpoint, targetEndpoint) {
  const block = state.blocks.find((item) => item.id === blockId);
  if (!block || draggedEndpoint === targetEndpoint) return false;
  const order = orderedSourcesForBlock(block);
  const from = order.indexOf(draggedEndpoint);
  const to = order.indexOf(targetEndpoint);
  if (from < 0 || to < 0) return false;
  order.splice(from, 1);
  order.splice(to, 0, draggedEndpoint);
  block.sourceOrder = order;
  block.slotOrder = order
    .filter((endpoint) => endpointType(endpoint) === 'image')
    .map((endpoint) => Number(endpointId(endpoint)));
  setUploadStatus(`${labelForEndpoint(order[0])} is MAIN @1 for ${displayBlockTitle(block)}.`);
  return true;
}

function clearBlockTokenDragState() {
  nodeLayer.querySelectorAll('.block-token.dragging, .block-token.drop-target').forEach((element) => {
    element.classList.remove('dragging', 'drop-target');
  });
  state.blockTokenDrag = null;
}

function clearGlobalTokenDragState() {
  tokenRow.querySelectorAll('.token.dragging, .token.drop-target').forEach((element) => {
    element.classList.remove('dragging', 'drop-target');
  });
  state.globalTokenDrag = null;
}

function allActiveSlots() {
  return state.images
    .map((image, slot) => (image ? slot : null))
    .filter((slot) => slot !== null);
}

function renderBlockTokens(block) {
  const activeSources = orderedSourcesForBlock(block);
  if (!activeSources.length) {
    return '<div class="block-chip-muted">Connect an image or drop files on the canvas.</div>';
  }
  return activeSources
    .map((sourceEndpoint, index) => `
      <div class="block-token${index === 0 ? ' main-token' : ''}" draggable="true" data-block-token-endpoint="${escapeHtml(sourceEndpoint)}" data-insert-source="${escapeHtml(sourceEndpoint)}" title="Drag to reorder. Click to insert @${index + 1}. Source: ${escapeHtml(labelForEndpoint(sourceEndpoint))}">
        <img src="${imageUrl(imageForEndpoint(sourceEndpoint))}" alt="" draggable="false">
        <span>${index === 0 ? 'MAIN @1' : `@${index + 1}`}</span>
        <button class="block-token-remove" data-remove-block-source="${escapeHtml(sourceEndpoint)}" type="button" title="Remove from this node">×</button>
      </div>
    `)
    .join('');
}

function blockPromptHtml(block) {
  const text = block.prompt || configForBlock(block.kind)?.prompt || '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/(@\d+)/g, '<span class="prompt-mention">$1</span>');
}

function showBlockMenu(point = null, sourceEndpoint = null) {
  if (sourceEndpoint) state.connectFrom = sourceEndpoint;
  const fallback = { x: 24, y: 24 };
  const anchor = point || fallback;
  state.menuAnchor = anchor;
  blockMenu.style.left = `${Math.max(12, anchor.x)}px`;
  blockMenu.style.top = `${Math.max(12, anchor.y)}px`;
  blockMenu.hidden = false;
  renderNativeFeatureMenu();
  blockSearch.focus();
}

function hideBlockMenu() {
  blockMenu.hidden = true;
  state.menuAnchor = null;
}

function addBlock(kind, position = null, sourceEndpoint = null) {
  if (kind === 'animate') {
    setUploadStatus('Animate needs a local video model; image workflows can use Modify, Variate, or Extract.', 'error');
    return null;
  }
  const config = configForBlock(kind);
  const id = `${kind}-${state.blockCounter += 1}`;
  const block = {
    id,
    kind,
    title: config.title,
    icon: config.icon,
    prompt: config.prompt,
    nativeFeature: config.nativeFeature || null,
    nativeSettings: Object.fromEntries((config.nativeFeature?.settings || []).map((setting) => [setting.name, setting.default])),
    sourceOrder: [],
    hiddenSources: [],
    x: position?.x ?? 410,
    y: position?.y ?? 160,
    w: config.nativeFeature ? 370 : 340,
    h: config.nativeFeature ? 260 : 300,
  };
  state.blocks.push(block);
  const from = sourceEndpoint || state.connectFrom || state.selected;
  if (from && ['image', 'output', 'block'].includes(endpointType(from))) {
    addEdge(from, blockEndpoint(block.id));
  }
  connectActiveImagesToBlock(block.id);
  state.connectFrom = null;
  setSelection([blockEndpoint(block.id)]);
  hideBlockMenu();
  renderCanvas();
  return block;
}

function addEdge(from, to) {
  if (!from || !to || from === to) return;
  const exists = state.edges.some((edge) => edge.from === from && edge.to === to);
  if (!exists) state.edges.push({ from, to });
  if (isImageSourceEndpoint(from) && endpointType(to) === 'block') {
    appendSourceToBlockOrder(endpointId(to), from);
  }
}

function connectEndpointToBlock(sourceEndpoint, blockId, options = {}) {
  const block = state.blocks.find((item) => item.id === blockId);
  if (!imageForEndpoint(sourceEndpoint) || !block) return false;
  addEdge(sourceEndpoint, blockEndpoint(blockId));
  state.connectFrom = null;
  setSelection([blockEndpoint(blockId)]);
  setDropTargetBlock(null);
  if (options.insertToken) {
    insertBlockSourceToken(blockId, sourceEndpoint);
  }
  const tokenNumber = localTokenForBlockSource(block, sourceEndpoint);
  setUploadStatus(`Linked ${labelForEndpoint(sourceEndpoint)} as @${tokenNumber} to ${displayBlockTitle(block)}.`);
  if (options.render !== false) renderCanvas();
  return true;
}

function connectImageToBlock(slot, blockId, options = {}) {
  return connectEndpointToBlock(imageEndpoint(slot), blockId, options);
}

function blockIdForImageMention(preferredBlockId = null) {
  if (preferredBlockId && state.blocks.some((block) => block.id === preferredBlockId)) {
    return preferredBlockId;
  }
  if (state.blocks.length === 1) return state.blocks[0].id;
  return null;
}

function renderNativeSetting(block, setting) {
  const value = block.nativeSettings?.[setting.name] ?? setting.default ?? '';
  const label = `${escapeHtml(setting.label || setting.name)}${setting.required ? ' *' : ''}`;
  const name = escapeHtml(setting.name);
  if (setting.type === 'enum' && Array.isArray(setting.options)) {
    return `
      <label class="native-setting-row">
        <span>${label}</span>
        <select data-native-setting="${name}">
          ${setting.options.map((option) => {
            const optionValue = typeof option === 'object' ? option.value : option;
            const optionLabel = typeof option === 'object' ? option.label : option;
            return `<option value="${escapeHtml(optionValue)}"${String(optionValue) === String(value) ? ' selected' : ''}>${escapeHtml(optionLabel)}</option>`;
          }).join('')}
        </select>
      </label>
    `;
  }
  if (setting.type === 'boolean') {
    return `
      <label class="native-setting-row compact">
        <span>${label}</span>
        <input data-native-setting="${name}" type="checkbox"${value ? ' checked' : ''} />
      </label>
    `;
  }
  const inputType = setting.type === 'integer' || setting.type === 'number' ? 'number' : 'text';
  const step = setting.type === 'number' ? ' step="0.01"' : '';
  const min = setting.min !== undefined ? ` min="${escapeHtml(setting.min)}"` : '';
  const max = setting.max !== undefined ? ` max="${escapeHtml(setting.max)}"` : '';
  return `
    <label class="native-setting-row">
      <span>${label}</span>
      <input data-native-setting="${name}" type="${inputType}" value="${escapeHtml(value)}"${step}${min}${max} />
    </label>
  `;
}

function nativeDataHtml(block) {
  const data = block.nativeData;
  if (!data) return '';
  if (data.kind === 'queue') {
    const queue = data.queue || {};
    const processor = data.processor || {};
    return `
      <div class="native-live-data">
        <div><span>Processor</span><strong>${processor.is_processing ? 'Rendering' : (processor.is_started ? 'Ready' : 'Paused')}</strong></div>
        <div><span>Pending</span><strong>${Number(queue.pending || 0)}</strong></div>
        <div><span>Running</span><strong>${Number(queue.in_progress || 0)}</strong></div>
        <div><span>Completed</span><strong>${Number(queue.completed || 0)}</strong></div>
        <div><span>Failed</span><strong>${Number(queue.failed || 0)}</strong></div>
      </div>
    `;
  }
  if (data.kind === 'boards') {
    const items = data.items || [];
    return `
      <div class="native-board-list">
        ${items.length
          ? items.slice(0, 8).map((board) => `<div><span>${escapeHtml(board.board_name || board.board_id || 'Board')}</span><strong>${Number(board.image_count || 0)}</strong></div>`).join('')
          : '<div class="native-empty-data">No boards yet.</div>'}
      </div>
    `;
  }
  return '';
}

function renderNativeBlockBody(block) {
  const feature = block.nativeFeature;
  const runnable = Boolean(feature?.runnable);
  const libraryAction = ['image_gallery', 'boards', 'queue_control'].includes(feature?.action);
  const settings = (feature?.settings || []).slice(0, 6);
  const promptLabel = feature?.id === 'core:modify'
    ? 'Prompt'
    : feature?.action === 'image_to_prompt'
      ? 'Instruction'
      : feature?.action === 'style_preset'
        ? 'Preset prompt'
        : 'Notes';
  return `
    <div class="workflow-body native-body">
      ${libraryAction ? '' : `<div class="block-token-row">${renderBlockTokens(block)}</div>`}
      ${nativeDataHtml(block)}
      ${libraryAction ? '' : `
        <label class="native-prompt-label">${promptLabel}</label>
        <div class="block-prompt native-prompt" data-block-prompt="${block.id}" contenteditable="true" spellcheck="true">${blockPromptHtml(block)}</div>
      `}
      ${settings.length ? `<div class="native-settings">${settings.map((setting) => renderNativeSetting(block, setting)).join('')}</div>` : ''}
      <div class="block-actions native-actions">
        <button class="native-open" type="button" title="Open InvokeAI">↗</button>
        <button class="run-block" type="button" title="${runnable ? 'Run native node' : 'Mapped, open in InvokeAI'}">${runnable ? '→' : 'i'}</button>
      </div>
    </div>
  `;
}

function renderBlockDetailsPopover(block) {
  if (!block.infoOpen) return '';
  const feature = block.nativeFeature;
  const config = blockDefaults[block.kind] || blockDefaults.modify;
  const description = truncateText(
    feature?.description || config?.hint || 'Connect images, write a prompt, and run this node.',
    240,
  );
  const tags = (feature?.tags || []).slice(0, 4);
  return `
    <aside class="node-details-popover" role="dialog" aria-label="Node details">
      <div class="node-popover-head">
        <strong>Node details</strong>
        <button class="close-node-details" type="button" title="Close details">×</button>
      </div>
      <div class="native-meta-row">
        <span>${escapeHtml(feature?.group_title || 'Image action')}</span>
        <strong>${escapeHtml(feature?.status || 'Ready')}</strong>
      </div>
      <p class="native-description">${escapeHtml(description)}</p>
      ${tags.length ? `<div class="native-chip-row">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
    </aside>
  `;
}

function renderBlockActionMenu(block) {
  if (!block.menuOpen) return '';
  return `
    <div class="node-action-menu" role="menu" aria-label="Continue with">
      <span>Continue with</span>
      <button type="button" data-followup-kind="modify">Modify</button>
      <button type="button" data-followup-kind="variate">Variate</button>
      <button type="button" data-followup-kind="new-view">New view</button>
      <button type="button" data-followup-kind="extract">Extract</button>
    </div>
  `;
}

function renderWorkflowBlock(block) {
  const element = document.createElement('div');
  const endpoint = blockEndpoint(block.id);
  const isModify = block.kind === 'modify' || block.nativeFeature?.id === 'core:modify';
  const title = displayBlockTitle(block);
  if (isModify) block.title = title;
  const icon = isModify ? '' : block.icon;
  element.className = `workflow-block ${block.nativeFeature ? 'native-block' : block.kind}${block.infoOpen ? ' info-open' : ''}${block.menuOpen ? ' menu-open' : ''}${isSelected(endpoint) ? ' selected' : ''}${state.dropTargetBlockId === block.id ? ' drop-target' : ''}`;
  element.dataset.blockId = block.id;
  element.dataset.endpoint = endpoint;
  element.style.left = `${block.x}px`;
  element.style.top = `${block.y}px`;
  element.style.width = `${block.w || 340}px`;
  element.style.minHeight = `${block.h || 300}px`;
  element.innerHTML = `
    <button class="canvas-item-delete" data-delete-endpoint="${endpoint}" type="button" title="Delete node">×</button>
    <button class="block-connect" type="button" title="Connect image"></button>
    <div class="workflow-block-header">
      <button class="block-back" type="button" title="Choose next action">‹</button>
      ${icon ? `<span class="workflow-icon">${icon}</span>` : ''}
      <strong>${title}</strong>
      <button class="workflow-info" type="button" title="Show node details">i</button>
    </div>
    ${block.nativeFeature ? renderNativeBlockBody(block) : `<div class="workflow-body">
      <div class="block-token-row">${renderBlockTokens(block)}</div>
      <div class="block-prompt" data-block-prompt="${block.id}" contenteditable="true" spellcheck="true">${blockPromptHtml(block)}</div>
      <div class="block-actions">
        <button class="improve-prompt" type="button" title="Improve prompt">✧</button>
        <button class="voice-button" type="button" title="Voice input is not connected yet">♬</button>
        <button class="run-block" type="button" title="Generate">→</button>
      </div>
    </div>`}
    ${renderBlockActionMenu(block)}
    ${renderBlockDetailsPopover(block)}
  `;
  return element;
}

function renderOutputNode(output) {
  const element = document.createElement('div');
  const endpoint = outputEndpoint(output.id);
  element.className = `canvas-output-node ${output.status || 'queued'}${isSelected(endpoint) ? ' selected' : ''}`;
  element.dataset.outputId = output.id;
  element.dataset.endpoint = endpoint;
  element.style.left = `${output.x}px`;
  element.style.top = `${output.y}px`;
  element.style.width = `${output.w || 178}px`;
  element.style.height = `${output.h || 154}px`;
  const label = output.label || 'Output';
  if (output.image?.image_url) {
    element.innerHTML = `
      <button class="canvas-item-delete" data-delete-endpoint="${endpoint}" type="button" title="Delete image from canvas">×</button>
      <div class="node-head"><span>${label}</span><span>ready</span></div>
      <div class="node-body">
        <img src="${imageUrl(output.image, 'full')}" alt="" draggable="false">
      </div>
      <div class="image-actions" aria-label="Image actions">
        <button data-image-action="focus" type="button" title="Open large">↗</button>
        <button data-image-action="upscale" type="button" title="Upscale and download">2×</button>
        <button data-image-action="download" type="button" title="Download">↓</button>
      </div>
      <button class="node-connect${state.connectFrom === endpoint ? ' active' : ''}" type="button" title="Connect result to a node"></button>
    `;
  } else {
    element.innerHTML = `
      <button class="canvas-item-delete" data-delete-endpoint="${endpoint}" type="button" title="Delete output">×</button>
      <div class="node-head"><span>${label}</span><span>${output.status || 'queued'}</span></div>
      <div class="node-body"><div class="output-placeholder"><span></span></div></div>
    `;
  }
  return element;
}

function renderCanvas() {
  canvasContent.style.transform = `translate(${state.view.x}px, ${state.view.y}px) scale(${state.view.scale})`;
  zoomValue.textContent = `${Math.round(state.view.scale * 100)}%`;
  canvasHint.style.display = state.nodes.length || state.blocks.length || state.outputs.length ? 'none' : 'block';
  nodeLayer.innerHTML = '';
  state.nodes
    .slice()
    .sort((a, b) => a.slot - b.slot)
    .forEach((node) => {
      const image = state.images[node.slot];
      if (!image) return;
      const size = slotSize(node.slot, node);
      const element = document.createElement('div');
      const endpoint = imageEndpoint(node.slot);
      element.className = `canvas-node${node.slot === 0 ? ' main' : ''}${isSelected(endpoint) ? ' selected' : ''}${image.pending ? ' pending' : ''}`;
      element.dataset.slot = node.slot;
      element.dataset.endpoint = endpoint;
      element.style.left = `${node.x}px`;
      element.style.top = `${node.y}px`;
      element.style.width = `${size.w}px`;
      element.style.height = `${size.h}px`;
      const tokenLabel = node.slot === 0 ? '@1 MAIN' : `@${node.slot + 1}`;
      const roleLabel = image.pending ? 'uploading' : (node.slot === 0 ? 'MAIN SOURCE' : roleFor(node.slot));
      const insertLabel = node.slot === 0 ? 'MAIN @1' : `@${node.slot + 1}`;
      element.innerHTML = `
        <button class="canvas-item-delete" data-delete-endpoint="${endpoint}" type="button" title="Delete image from canvas">×</button>
        <div class="node-head"><span>${tokenLabel}</span><span>${roleLabel}</span></div>
        <div class="node-body">
          <img src="${imageUrl(image)}" alt="" draggable="false">
          ${image.pending ? '<div class="node-loading"><span></span></div>' : ''}
          <button class="node-insert" type="button">${insertLabel}</button>
        </div>
        ${image.pending ? '' : `<div class="image-actions" aria-label="Image actions">
          <button data-image-action="focus" type="button" title="Open large">↗</button>
          <button data-image-action="upscale" type="button" title="Upscale and download">2×</button>
          <button data-image-action="download" type="button" title="Download">↓</button>
        </div>`}
        <button class="node-connect${state.connectFrom === imageEndpoint(node.slot) ? ' active' : ''}" type="button" title="Connect"></button>
        <span class="resize-handle nw" data-resize="nw"></span>
        <span class="resize-handle ne" data-resize="ne"></span>
        <span class="resize-handle sw" data-resize="sw"></span>
        <span class="resize-handle se" data-resize="se"></span>
      `;
      nodeLayer.appendChild(element);
    });
  state.blocks.forEach((block) => nodeLayer.appendChild(renderWorkflowBlock(block)));
  state.outputs.forEach((output) => nodeLayer.appendChild(renderOutputNode(output)));
  if (state.marquee?.moved) {
    const rect = rectFromPoints(state.marquee.start, state.marquee.current);
    const marquee = document.createElement('div');
    marquee.className = 'selection-marquee';
    marquee.style.left = `${rect.x}px`;
    marquee.style.top = `${rect.y}px`;
    marquee.style.width = `${rect.w}px`;
    marquee.style.height = `${rect.h}px`;
    nodeLayer.appendChild(marquee);
  }
  renderConnections();
  syncSelectionControls();
  scheduleAutosave();
}

function nativeFeatureMatches(feature, query) {
  if (!query) return true;
  const text = [
    feature.title,
    feature.description,
    feature.group_title,
    feature.type,
    feature.schema,
    ...(feature.tags || []),
  ].join(' ').toLowerCase();
  return text.includes(query);
}

function renderNativeFeatureMenu() {
  if (!nativeFeatureList) return;
  if (state.nativeCatalogLoading) {
    nativeFeatureList.innerHTML = '<div class="native-loading">Loading native InvokeAI nodes...</div>';
    return;
  }
  if (!state.nativeCatalog?.features?.length) {
    nativeFeatureList.innerHTML = '<div class="native-loading">Native catalog unavailable.</div>';
    return;
  }
  const query = (blockSearch.value || '').trim().toLowerCase();
  const groups = state.nativeCatalog.groups || [];
  const features = nativeFeatures()
    .filter((feature) => nativeFeatureMatches(feature, query))
    .sort((a, b) => {
      const runDelta = Number(Boolean(b.runnable)) - Number(Boolean(a.runnable));
      if (runDelta) return runDelta;
      return String(a.title).localeCompare(String(b.title));
    });
  const html = groups.map((group) => {
    const groupFeatures = features.filter((feature) => feature.group === group.id);
    if (!groupFeatures.length) return '';
    const visible = query ? groupFeatures.slice(0, 60) : groupFeatures.slice(0, group.id === 'core' ? 8 : 12);
    const hiddenCount = groupFeatures.length - visible.length;
    return `
      <div class="native-group" data-native-group="${escapeHtml(group.id)}">
        <div class="native-group-head">
          <span>${escapeHtml(group.title)}</span>
          <small>${groupFeatures.length}</small>
        </div>
        ${visible.map((feature) => `
          <button class="block-choice native-choice${feature.runnable ? ' runnable' : ''}" data-block="${escapeHtml(feature.block_kind)}" type="button">
            <span>${escapeHtml(iconForFeature(feature))}</span>
            <div>
              <strong>${escapeHtml(feature.title)}</strong>
              <small>${escapeHtml(feature.status || feature.group_title || '')}</small>
            </div>
          </button>
        `).join('')}
        ${hiddenCount > 0 ? `<div class="native-more">+${hiddenCount} more. Type to search this group.</div>` : ''}
      </div>
    `;
  }).join('');
  const installed = state.nativeCatalog.installed || {};
  const runnableCount = features.filter((feature) => feature.runnable).length;
  const schemaCount = features.filter((feature) => feature.action === 'schema').length;
  nativeFeatureList.innerHTML = `
    <div class="native-summary">
      <span>${features.length} mapped</span>
      <span>${runnableCount} runnable</span>
      <span>${schemaCount} schema only</span>
      <span>${installed.workflows || 0} workflows</span>
      <span>${installed.style_presets || 0} styles</span>
    </div>
    ${html || '<div class="native-loading">No native feature matches.</div>'}
  `;
}

function addCatalogGroup(catalog, id, title) {
  catalog.groups = catalog.groups || [];
  const existing = catalog.groups.find((group) => group.id === id);
  const count = catalog.features.filter((feature) => feature.group === id).length;
  if (existing) {
    existing.count = count;
    return;
  }
  catalog.groups.push({ id, title, count });
}

function augmentNativeCatalog(catalog) {
  const extraFeatures = [
    {
      id: 'asset:image_gallery',
      block_kind: 'native:asset:image_gallery',
      title: 'Image Gallery',
      group: 'assets',
      group_title: 'Assets & library',
      description: 'Native InvokeAI image browser: recent images, metadata, star/unstar, delete, download, and workflow recall.',
      runnable: false,
      action: 'open_native',
      status: 'Open in InvokeAI',
      tags: ['images', 'gallery', 'metadata', 'recall'],
    },
    {
      id: 'asset:boards',
      block_kind: 'native:asset:boards',
      title: 'Boards',
      group: 'assets',
      group_title: 'Assets & library',
      description: 'Native InvokeAI board organization and board-image assignment.',
      runnable: false,
      action: 'open_native',
      status: 'Open in InvokeAI',
      tags: ['boards', 'library'],
    },
    {
      id: 'asset:queue',
      block_kind: 'native:asset:queue',
      title: 'Queue Control',
      group: 'assets',
      group_title: 'Assets & library',
      description: 'Native InvokeAI queue status, cancel, retry, prune, pause, and resume controls.',
      runnable: false,
      action: 'open_native',
      status: 'Open in InvokeAI',
      tags: ['queue', 'cancel', 'retry'],
    },
    {
      id: 'model:model_manager',
      block_kind: 'native:model:model_manager',
      title: 'Model Manager',
      group: 'model',
      group_title: 'Models, LoRAs & adapters',
      description: 'Native model install, scan, Hugging Face login, missing model resolution, cache clearing, and model metadata.',
      runnable: false,
      action: 'open_native',
      status: 'Open in InvokeAI',
      tags: ['models', 'huggingface', 'install', 'cache'],
    },
    {
      id: 'model:custom_nodes',
      block_kind: 'native:model:custom_nodes',
      title: 'Custom Nodes',
      group: 'model',
      group_title: 'Models, LoRAs & adapters',
      description: 'Native custom node pack discovery, install, and reload.',
      runnable: false,
      action: 'open_native',
      status: 'Open in InvokeAI',
      tags: ['custom nodes', 'node packs'],
    },
  ];
  const ids = new Set((catalog.features || []).map((feature) => feature.id));
  catalog.features = [...(catalog.features || []), ...extraFeatures.filter((feature) => !ids.has(feature.id))];
  addCatalogGroup(catalog, 'assets', 'Assets & library');
  addCatalogGroup(catalog, 'model', 'Models, LoRAs & adapters');
  return catalog;
}

async function loadNativeCatalog() {
  if (!nativeFeatureList || state.nativeCatalogLoading) return;
  state.nativeCatalogLoading = true;
  renderNativeFeatureMenu();
  try {
    const response = await fetch('/api/native/features');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Native catalog failed');
    state.nativeCatalog = augmentNativeCatalog(data);
    state.blocks.forEach((block) => {
      const feature = nativeFeatureForKind(block.kind);
      if (feature) block.nativeFeature = feature;
    });
    renderCanvas();
  } catch (error) {
    nativeFeatureList.innerHTML = `<div class="native-loading error">${escapeHtml(error.message)}</div>`;
  } finally {
    state.nativeCatalogLoading = false;
    renderNativeFeatureMenu();
  }
}

function collectConnections() {
  return state.edges
    .map((edge) => {
      let from = null;
      let to = null;
      if (endpointType(edge.from) === 'image') {
        const slot = Number(endpointId(edge.from));
        from = state.images[slot] ? `@${slot + 1}` : null;
      } else if (endpointType(edge.from) === 'block') {
        const block = state.blocks.find((item) => item.id === endpointId(edge.from));
        from = block ? `${displayBlockTitle(block)} block` : null;
      }
      if (endpointType(edge.to) === 'image') {
        const slot = Number(endpointId(edge.to));
        to = state.images[slot] ? `@${slot + 1}` : null;
      } else if (endpointType(edge.to) === 'block') {
        const block = state.blocks.find((item) => item.id === endpointId(edge.to));
        to = block ? `${displayBlockTitle(block)} block` : null;
      }
      if (!from || !to) return null;
      return `${from} connected to ${to}`;
    })
    .filter(Boolean);
}

function collectImages() {
  return state.images
    .map((image, index) => {
      if (!image || image.pending || !image.image_name) return null;
      return {
        ...image,
        slot: index,
        role: roleFor(index),
        note: noteFor(index),
      };
    })
    .filter(Boolean);
}

function collectImagesForBlock(block) {
  return orderedSourcesForBlock(block)
    .map((sourceEndpoint, index) => {
      const image = imageForEndpoint(sourceEndpoint);
      if (!image || image.pending || !image.image_name) return null;
      const sourceSlot = endpointType(sourceEndpoint) === 'image'
        ? Number(endpointId(sourceEndpoint))
        : null;
      return {
        ...image,
        slot: index,
        sourceEndpoint,
        sourceSlot,
        role: index === 0 ? 'main' : (sourceSlot === null ? 'reference' : roleFor(sourceSlot)),
        note: index === 0 || sourceSlot === null ? '' : noteFor(sourceSlot),
      };
    })
    .filter(Boolean);
}

function collectConnectionsForBlock(block) {
  const sources = orderedSourcesForBlock(block);
  const tokenBySource = new Map(sources.map((endpoint, index) => [endpoint, `@${index + 1}`]));
  const target = blockEndpoint(block.id);
  return state.edges
    .map((edge) => {
      if (edge.to === target && isImageSourceEndpoint(edge.from)) {
        const from = tokenBySource.get(edge.from);
        return from ? `${from} connected to ${displayBlockTitle(block)} block` : null;
      }
      if (isImageSourceEndpoint(edge.from) && isImageSourceEndpoint(edge.to)) {
        const from = tokenBySource.get(edge.from);
        const to = tokenBySource.get(edge.to);
        return from && to ? `${from} connected to ${to}` : null;
      }
      return null;
    })
    .filter(Boolean);
}

function savePromptRange() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  const container = range.commonAncestorContainer;
  const element = container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement;
  if (promptEditor.contains(container) || element?.closest?.('[data-block-prompt]')) {
    state.lastPromptRange = range.cloneRange();
  }
}

function getPromptText() {
  return promptEditor.innerText.replace(/\u00a0/g, ' ').trim();
}

function plainTextFromEditable(element) {
  return element.innerText.replace(/\u00a0/g, ' ').trim();
}

function insertTokenNumberIntoEditable(element, tokenNumber) {
  element.focus();
  const selection = window.getSelection();
  let range = state.lastPromptRange;
  if (!range || !element.contains(range.commonAncestorContainer)) {
    range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
  }
  selection.removeAllRanges();
  selection.addRange(range);
  const token = document.createElement('span');
  token.className = 'prompt-mention';
  token.textContent = `@${tokenNumber}`;
  const spacer = document.createTextNode(' ');
  range.deleteContents();
  range.insertNode(spacer);
  range.insertNode(token);
  range.setStartAfter(spacer);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  savePromptRange();
  scheduleAutosave();
}

function insertTokenIntoEditable(element, slot) {
  insertTokenNumberIntoEditable(element, slot + 1);
}

function insertPromptToken(slot) {
  const selection = window.getSelection();
  let activeBlockPrompt = null;
  if (selection?.rangeCount) {
    const container = selection.getRangeAt(0).commonAncestorContainer;
    const element = container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement;
    activeBlockPrompt = element?.closest?.('[data-block-prompt]') || null;
  }
  if (activeBlockPrompt) {
    const block = state.blocks.find((item) => item.id === activeBlockPrompt.dataset.blockPrompt);
    insertTokenNumberIntoEditable(activeBlockPrompt, localTokenForBlockSlot(block, slot));
    updateBlockPrompt(activeBlockPrompt.dataset.blockPrompt, activeBlockPrompt);
    return;
  }
  insertTokenIntoEditable(promptEditor, slot);
}

function insertBlockToken(blockId, slot) {
  insertBlockSourceToken(blockId, imageEndpoint(slot));
}

function insertBlockSourceToken(blockId, sourceEndpoint) {
  const editable = document.querySelector(`[data-block-prompt="${blockId}"]`);
  if (!editable) return;
  const block = state.blocks.find((item) => item.id === blockId);
  insertTokenNumberIntoEditable(editable, localTokenForBlockSource(block, sourceEndpoint));
  if (block) block.prompt = plainTextFromEditable(editable);
}

function updateBlockPrompt(blockId, element) {
  const block = state.blocks.find((item) => item.id === blockId);
  if (!block) return;
  block.prompt = plainTextFromEditable(element);
  scheduleAutosave();
}

function improveBlockPrompt(blockId) {
  const block = state.blocks.find((item) => item.id === blockId);
  const editable = document.querySelector(`[data-block-prompt="${blockId}"]`);
  if (!block || !editable) return;
  const additions = {
    modify: 'make the requested change precise, keep camera angle and important layout stable, preserve recognizable subjects, improve realism and material detail',
    variate: 'create a distinct but related variant, adjust form and color while preserving composition and core subject identity',
    'variate-form-color': 'explore alternate silhouettes, accent colors, material finishes, and graphic treatment without changing the scene purpose',
    'new-view': 'shift camera position while preserving room layout, object identities, lighting direction, and brand placement',
    'change-expression': 'make the facial expression and body language clear while preserving identity, wardrobe, camera angle, and lighting',
    extract: 'extract a clean reusable visual system with palette, lighting, materials, shapes, and composition rules',
  };
  const addition = additions[block.kind] || additions.modify;
  editable.innerText = `${plainTextFromEditable(editable)} — ${addition}`.trim();
  block.prompt = plainTextFromEditable(editable);
}

function uploadWithProgress(slot, file) {
  return new Promise((resolve, reject) => {
    const body = new FormData();
    body.append('file', file);
    const request = new XMLHttpRequest();
    request.open('POST', '/api/upload');
    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) {
        setSlotProgress(slot, `Uploading ${labelFor(slot)}`, 25);
        setUploadStatus(`Uploading ${labelFor(slot)}...`, 'busy');
        return;
      }
      const percent = Math.round((event.loaded / event.total) * 100);
      setSlotProgress(slot, `Uploading ${labelFor(slot)} ${percent}%`, percent);
      setUploadStatus(`Uploading ${labelFor(slot)} ${percent}%`, 'busy');
    };
    request.onload = () => {
      let data = null;
      try {
        data = JSON.parse(request.responseText || '{}');
      } catch (_) {}
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(data?.error || `Upload failed (${request.status})`));
        return;
      }
      resolve(data);
    };
    request.onerror = () => reject(new Error('Upload failed. Check that InvokeAI is running.'));
    request.send(body);
  });
}

async function uploadFile(slot, file) {
  if (!file.type.startsWith('image/')) {
    throw new Error(`${file.name} is not an image.`);
  }
  setPendingPreview(slot, file);
  setSlotProgress(slot, `Preparing ${labelFor(slot)}`, 8);
  setUploadStatus(`Preparing ${labelFor(slot)}...`, 'busy');
  try {
    const image = await uploadWithProgress(slot, file);
    revokePendingPreview(state.images[slot]);
    state.images[slot] = image;
    setSlotPreview(slot, image);
    upsertNode(slot);
    renderTokens();
    renderCanvas();
    setSlotProgress(slot, '', 0);
    setUploadStatus(`${labelFor(slot)} uploaded: ${file.name}`);
  } catch (error) {
    setSlotProgress(slot, error.message, 100, 'error');
    setUploadStatus(error.message, 'error');
    throw error;
  }
}

async function uploadFiles(startSlot, fileList) {
  const files = Array.from(fileList || []).filter((file) => file.type.startsWith('image/'));
  if (!files.length) return;
  let next = typeof startSlot === 'number' ? startSlot : firstEmptySlot(0);
  for (const file of files) {
    if (next < 0) {
      setUploadStatus('All five image slots are already filled.', 'error');
      return;
    }
    await uploadFile(next, file);
    next = firstEmptySlot(next + 1);
  }
}

function clearSlotDragState() {
  document.querySelectorAll('.slot.slot-dragging, .slot.slot-drop-target').forEach((element) => {
    element.classList.remove('slot-dragging', 'slot-drop-target');
  });
  state.slotDrag = null;
  state.slotPointerDrag = null;
}

function wireUploads() {
  document.querySelectorAll('[data-role]').forEach((select) => {
    const slot = Number(select.dataset.role);
    const note = document.querySelector(`[data-note="${slot}"]`);
    select.addEventListener('change', () => {
      if (note) note.placeholder = rolePlaceholders[select.value] || 'what to borrow';
      if (state.images[slot]) state.images[slot].role = select.value;
      setUploadStatus(`${labelFor(slot)} role set to ${roleLabels[select.value] || select.value}.`);
      renderCanvas();
    });
    note?.addEventListener('input', () => {
      if (state.images[slot]) state.images[slot].note = note.value;
      scheduleAutosave();
    });
  });
  document.querySelectorAll('.slot').forEach((slotElement) => {
    const input = slotElement.querySelector('input[type="file"]');
    const slot = Number(slotElement.dataset.slot);
    slotElement.addEventListener('click', (event) => {
      if (state.skipNextClick && performance.now() < state.skipNextClick) {
        event.preventDefault();
        return;
      }
      if (event.target === input) return;
      input.click();
    });
    input.addEventListener('change', async (event) => {
      try {
        await uploadFiles(slot, event.target.files);
      } catch (_) {}
      input.value = '';
    });
    slotElement.addEventListener('dragover', (event) => {
      event.preventDefault();
      if (state.slotDrag !== null) {
        event.dataTransfer.dropEffect = 'move';
        slotElement.classList.add('slot-drop-target');
      } else {
        slotElement.classList.add('drag-over');
      }
    });
    slotElement.addEventListener('dragleave', () => slotElement.classList.remove('drag-over', 'slot-drop-target'));
    slotElement.addEventListener('drop', async (event) => {
      event.preventDefault();
      slotElement.classList.remove('drag-over', 'slot-drop-target');
      if (state.slotDrag !== null) {
        const changed = swapImageSlots(state.slotDrag, slot);
        clearSlotDragState();
        state.skipNextClick = performance.now() + 500;
        if (changed) renderConnections();
        return;
      }
      try {
        await uploadFiles(slot, event.dataTransfer.files);
      } catch (_) {}
    });
    slotElement.addEventListener('dragstart', (event) => {
      const image = event.target.closest('img[data-slot-drag]');
      if (!image || !state.images[slot] || state.images[slot].pending) return;
      state.slotDrag = slot;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('application/x-invoke-simple-slot', String(slot));
      event.dataTransfer.setData('text/plain', String(slot));
      slotElement.classList.add('slot-dragging');
    });
    slotElement.addEventListener('dragend', () => {
      clearSlotDragState();
      state.skipNextClick = performance.now() + 500;
    });
    slotElement.addEventListener('pointerdown', (event) => {
      const image = event.target.closest('img[data-slot-drag]');
      if (!image || event.button !== 0 || !state.images[slot] || state.images[slot].pending) return;
      state.slotPointerDrag = {
        pointerId: event.pointerId,
        slot,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
        source: slotElement,
      };
      image.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
  });
  window.addEventListener('pointermove', (event) => {
    const drag = state.slotPointerDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 6) drag.moved = true;
    if (!drag.moved) return;
    drag.source.classList.add('slot-dragging');
    document.querySelectorAll('.slot.slot-drop-target').forEach((element) => element.classList.remove('slot-drop-target'));
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('.slot[data-slot]');
    if (target && Number(target.dataset.slot) !== drag.slot) target.classList.add('slot-drop-target');
  });
  window.addEventListener('pointerup', (event) => {
    const drag = state.slotPointerDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('.slot[data-slot]');
    const targetSlot = target ? Number(target.dataset.slot) : drag.slot;
    const changed = drag.moved && target && targetSlot !== drag.slot
      ? swapImageSlots(drag.slot, targetSlot)
      : false;
    clearSlotDragState();
    if (drag.moved) state.skipNextClick = performance.now() + 500;
    if (changed) renderConnections();
  });
  window.addEventListener('pointercancel', clearSlotDragState);
}

function setBusy(busy) {
  state.busy = busy;
  generateButton.disabled = busy;
  const count = document.getElementById('count').value;
  generateButton.textContent = busy ? 'Generating...' : `Generate ${count}`;
}

function updateOutputMode() {
  document.querySelector('.canvas-area')?.classList.toggle('outputs-expanded', state.outputsExpanded);
  toggleOutputsButton.textContent = state.outputsExpanded ? 'Large' : 'Strip';
}

function syncModeControls() {
  const mode = document.getElementById('mode').value;
  const steps = document.getElementById('steps');
  if (mode === 'draft') {
    steps.value = '4';
    steps.disabled = true;
    setUploadStatus('Draft mode: fast 4-step previews.');
  } else {
    steps.disabled = false;
    setUploadStatus('Pro mode: uses the selected steps.');
  }
}

function createResultCards(ids, sourceEndpointOverride = null) {
  resultsGrid.innerHTML = '';
  const sourceEndpoint = sourceEndpointOverride || (state.selected && endpointType(state.selected) === 'block'
    ? state.selected
    : (state.blocks[0] ? blockEndpoint(state.blocks[0].id) : imageEndpoint(0)));
  state.outputs = ids.map((id, index) => ({
    id: String(id),
    itemId: id,
    label: `Variant ${index + 1}`,
    status: 'queued',
    x: 790 + (index % 2) * 188,
    y: 110 + Math.floor(index / 2) * 190,
    w: 168,
    h: 146,
    image: null,
  }));
  state.outputs.forEach((output) => addEdge(sourceEndpoint, outputEndpoint(output.id)));
  ids.forEach((id, index) => {
    const card = document.createElement('div');
    card.className = 'result-card loading';
    card.dataset.itemId = id;
    card.innerHTML = `<div class="result-placeholder"><span></span></div><small>Variant ${index + 1}</small>`;
    resultsGrid.appendChild(card);
  });
  updateOutputMode();
  renderCanvas();
}

function restoreResultCards() {
  resultsGrid.innerHTML = '';
  state.outputs.forEach((output) => {
    const card = document.createElement('div');
    card.className = `result-card${output.image ? '' : ' loading'}`;
    card.dataset.itemId = output.itemId;
    if (output.image) {
      card.innerHTML = `
        <button class="result-open" data-output-id="${escapeHtml(output.id)}" type="button"><img src="${imageUrl(output.image, 'full')}" alt="Generated result"></button>
        <div class="result-actions">
          <button data-output-id="${escapeHtml(output.id)}" data-image-action="focus" type="button" title="Open large">↗</button>
          <button data-output-id="${escapeHtml(output.id)}" data-image-action="upscale" type="button" title="Upscale">2×</button>
          <button data-output-id="${escapeHtml(output.id)}" data-image-action="download" type="button" title="Download">↓</button>
        </div>
      `;
    } else if (output.status === 'failed' || output.status === 'canceled') {
      card.classList.remove('loading');
      card.innerHTML = `<span>${escapeHtml(output.status)}<br><small>Generation did not complete.</small></span>`;
    } else {
      card.innerHTML = `<div class="result-placeholder"><span></span></div><small>${escapeHtml(output.status || 'waiting')}</small>`;
      if (/^\d+$/.test(String(output.itemId))) window.setTimeout(() => pollItem(output.itemId), 250);
    }
    resultsGrid.appendChild(card);
  });
}

async function pollItem(id) {
  const card = document.querySelector(`.result-card[data-item-id="${id}"]`);
  if (!card) return;
  const response = await fetch(`/api/item/${id}`);
  const item = await response.json();
  if (item.status === 'completed' && item.image) {
    const output = state.outputs.find((entry) => String(entry.itemId) === String(id));
    if (output) {
      output.status = 'completed';
      output.image = item.image;
      requestCanvasRender();
      renderFocusVariants();
    }
    card.innerHTML = `
      <button class="result-open" data-output-id="${id}" type="button"><img src="${item.image.image_url}" alt="Generated result"></button>
      <div class="result-actions">
        <button data-output-id="${id}" data-image-action="focus" type="button" title="Open large">↗</button>
        <button data-output-id="${id}" data-image-action="upscale" type="button" title="Upscale">2×</button>
        <button data-output-id="${id}" data-image-action="download" type="button" title="Download">↓</button>
      </div>
    `;
    card.classList.remove('loading');
    return;
  }
  if (item.status === 'failed' || item.status === 'canceled') {
    const output = state.outputs.find((entry) => String(entry.itemId) === String(id));
    if (output) {
      output.status = item.status;
      requestCanvasRender();
      renderFocusVariants();
    }
    card.innerHTML = `<span>Failed<br><small>${item.error || 'No error details'}</small></span>`;
    card.classList.remove('loading');
    return;
  }
  const output = state.outputs.find((entry) => String(entry.itemId) === String(id));
  if (output) {
    output.status = item.status || 'waiting';
    requestCanvasRender();
    renderFocusVariants();
  }
  card.innerHTML = `<div class="result-placeholder"><span></span></div><small>${item.status || 'waiting'}</small>`;
  setTimeout(() => pollItem(id), 3500);
}

async function submitGeneration({ prompt, images, sourceEndpoint = null, connections = collectConnections() }) {
  const cleanPrompt = (prompt || '').trim();
  if (!cleanPrompt) {
    alert('Prompt is required.');
    return;
  }
  if (state.images.some((image) => image?.pending)) {
    alert('Wait for image uploads to finish first.');
    return;
  }
  if (!images.length) {
    alert('Add at least the @1 main image for this workflow.');
    return;
  }

  setBusy(true);
  setUploadStatus('Queueing variants one after another...', 'busy');
  try {
    const payload = {
      images,
      prompt: cleanPrompt,
      connections,
      aspect: document.getElementById('aspect').value,
      mode: document.getElementById('mode').value,
      steps: Number(document.getElementById('steps').value),
      count: Number(document.getElementById('count').value),
    };
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Generate failed');
    createResultCards(data.item_ids, sourceEndpoint);
    data.item_ids.forEach((id) => pollItem(id));
    setUploadStatus(`Queued ${data.item_ids.length} variant${data.item_ids.length === 1 ? '' : 's'}.`);
    return data.item_ids;
  } catch (error) {
    setUploadStatus(error.message, 'error');
    alert(error.message);
    return null;
  } finally {
    setBusy(false);
  }
}

async function generate(promptOverride = null) {
  const prompt = typeof promptOverride === 'string' ? promptOverride : getPromptText();
  await submitGeneration({ prompt, images: collectImages() });
}

async function generateFromBlock(blockId) {
  const block = state.blocks.find((item) => item.id === blockId);
  const editable = document.querySelector(`[data-block-prompt="${blockId}"]`);
  if (!block) return;
  if (editable) updateBlockPrompt(blockId, editable);
  if (block.nativeFeature) {
    await runNativeBlock(blockId);
    return;
  }
  const prompt = block.prompt || configForBlock(block.kind)?.prompt || '';
  await submitGeneration({
    prompt,
    images: collectImagesForBlock(block),
    sourceEndpoint: blockEndpoint(block.id),
    connections: collectConnectionsForBlock(block),
  });
}

function replaceGalleryOutputs(block, images) {
  const previous = new Set(block.nativeOutputIds || []);
  state.outputs = state.outputs.filter((output) => !previous.has(output.id));
  state.edges = state.edges.filter((edge) => !previous.has(endpointId(edge.from)) && !previous.has(endpointId(edge.to)));
  const source = endpointBox(blockEndpoint(block.id));
  const createdAt = Date.now();
  block.nativeOutputIds = (images || []).map((image, index) => {
    const id = `gallery-${createdAt}-${index}`;
    state.outputs.push({
      id,
      itemId: id,
      label: `Recent ${index + 1}`,
      status: 'completed',
      x: (source?.x || block.x) + (source?.w || block.w || 370) + 170 + (index % 3) * 190,
      y: (source?.y || block.y) + Math.floor(index / 3) * 172,
      w: 168,
      h: 146,
      image,
    });
    addEdge(blockEndpoint(block.id), outputEndpoint(id));
    return id;
  });
  restoreResultCards();
  renderCanvas();
}

async function runNativeLibraryAction(block, feature) {
  if (feature.action === 'image_gallery') {
    setUploadStatus('Loading recent InvokeAI images...', 'busy');
    const limit = Number(block.nativeSettings?.limit || 6);
    const response = await fetch(`/api/native/gallery?limit=${encodeURIComponent(limit)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Gallery could not be loaded.');
    replaceGalleryOutputs(block, data.items || []);
    setUploadStatus(`Loaded ${Math.min(limit, (data.items || []).length)} recent images.`);
    return true;
  }
  if (feature.action === 'boards') {
    setUploadStatus('Loading InvokeAI boards...', 'busy');
    const response = await fetch('/api/native/boards');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Boards could not be loaded.');
    block.nativeData = { kind: 'boards', items: data.items || [], total: data.total || 0 };
    renderCanvas();
    setUploadStatus(`Loaded ${data.total || 0} board${Number(data.total || 0) === 1 ? '' : 's'}.`);
    return true;
  }
  if (feature.action === 'queue_control') {
    const action = block.nativeSettings?.action || 'refresh';
    if (['cancel_pending', 'prune_finished'].includes(action)) {
      const label = action === 'cancel_pending' ? 'cancel every pending job' : 'remove finished queue records';
      if (!window.confirm(`Queue Control will ${label}. Continue?`)) return true;
    }
    setUploadStatus(`Queue: ${action.replace(/_/g, ' ')}...`, 'busy');
    const response = await fetch('/api/native/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Queue action failed.');
    block.nativeData = { kind: 'queue', queue: data.queue || {}, processor: data.processor || {} };
    renderCanvas();
    setUploadStatus(`Queue updated: ${Number(data.queue?.pending || 0)} pending, ${Number(data.queue?.in_progress || 0)} running.`);
    return true;
  }
  return false;
}

function connectedImageForBlock(block) {
  const sources = orderedSourcesForBlock(block);
  const endpoint = sources.length ? sources[0] : imageEndpoint(allActiveSlots()[0]);
  const image = imageForEndpoint(endpoint);
  if (!endpoint || !image) return null;
  const slot = endpointType(endpoint) === 'image' ? Number(endpointId(endpoint)) : null;
  return { slot, image, endpoint };
}

async function runNativeBlock(blockId) {
  const block = state.blocks.find((item) => item.id === blockId);
  if (!block?.nativeFeature) return;
  const feature = block.nativeFeature;
  try {
    if (await runNativeLibraryAction(block, feature)) return;
  } catch (error) {
    setUploadStatus(error.message, 'error');
    alert(error.message);
    return;
  }
  if (!feature.runnable) {
    setUploadStatus(`${feature.title} is mapped but needs InvokeAI's native editor or an additional local model.`, 'error');
    window.open('http://127.0.0.1:9090', '_blank', 'noopener,noreferrer');
    return;
  }
  const connected = connectedImageForBlock(block);
  if (!connected?.image?.image_name) {
    setUploadStatus('Connect a saved image to this native node first.', 'error');
    return;
  }
  if (feature.action === 'simple_generate') {
    await submitGeneration({
      prompt: block.prompt || getPromptText(),
      images: collectImagesForBlock(block),
      sourceEndpoint: blockEndpoint(block.id),
      connections: collectConnectionsForBlock(block),
    });
    return;
  }
  if (feature.action === 'style_preset') {
    await submitGeneration({
      prompt: block.prompt || featurePrompt(feature),
      images: collectImagesForBlock(block),
      sourceEndpoint: blockEndpoint(block.id),
      connections: collectConnectionsForBlock(block),
    });
    return;
  }
  if (feature.action === 'upscale') {
    await upscaleImage(connected.image, blockEndpoint(block.id), true, block.nativeSettings?.scale || 2);
    return;
  }
  if (feature.action === 'image_to_prompt') {
    setUploadStatus('Asking InvokeAI to describe the image...', 'busy');
    try {
      const response = await fetch('/api/native/image-to-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_name: connected.image.image_name,
          instruction: block.prompt || featurePrompt(feature),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Image-to-prompt failed');
      const prompt = data.result?.prompt || data.result?.text || JSON.stringify(data.result);
      block.prompt = prompt;
      const editable = document.querySelector(`[data-block-prompt="${block.id}"]`);
      if (editable) editable.innerText = prompt;
      setUploadStatus('Image-to-prompt result inserted into the node.');
      renderCanvas();
    } catch (error) {
      setUploadStatus(error.message, 'error');
      alert(error.message);
    }
    return;
  }
  if (feature.action !== 'native_image_invocation' || !feature.runnable) {
    setUploadStatus(`${feature.title} is mapped. Open InvokeAI for the full native workflow editor.`, 'error');
    window.open('http://127.0.0.1:9090', '_blank', 'noopener,noreferrer');
    return;
  }
  setUploadStatus(`Running native InvokeAI node: ${feature.title}...`, 'busy');
  try {
    const response = await fetch('/api/native/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        feature_id: feature.id,
        image_name: connected.image.image_name,
        settings: block.nativeSettings || {},
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Native node failed');
    createResultCards(data.item_ids, blockEndpoint(block.id));
    data.item_ids.forEach((id) => pollItem(id));
    setUploadStatus(`Queued native node: ${feature.title}.`);
  } catch (error) {
    setUploadStatus(error.message, 'error');
    alert(error.message);
  }
}

function imageDownloadUrl(image) {
  if (!image?.image_name) return image?.image_url || '';
  return `/api/download/${encodeURIComponent(image.image_name)}`;
}

function triggerDownload(image) {
  const url = imageDownloadUrl(image);
  if (!url) return;
  const link = document.createElement('a');
  link.href = url;
  link.download = image.image_name || 'invokeai-image.png';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function createCompletedOutput(image, label, sourceEndpoint = null) {
  const id = `local-${Date.now()}-${Math.round(Math.random() * 10000)}`;
  const source = endpointBox(sourceEndpoint);
  const output = {
    id,
    itemId: id,
    label,
    status: 'completed',
    x: source ? source.x + source.w + 210 : 790,
    y: source ? source.y : 110 + state.outputs.length * 34,
    w: 168,
    h: 146,
    image,
  };
  state.outputs.push(output);
  if (sourceEndpoint) addEdge(sourceEndpoint, outputEndpoint(id));
  setSelection([outputEndpoint(id)]);
  renderCanvas();
  return output;
}

function openFocus(endpoint) {
  const image = imageForEndpoint(endpoint);
  if (!image?.image_url) return;
  state.focus = {
    endpoint,
    image,
    label: labelForEndpoint(endpoint),
    zoom: 1,
  };
  renderFocusView();
}

function closeFocus() {
  state.focus = null;
  renderFocusView();
}

function ensureFocusView() {
  let view = document.getElementById('focusView');
  if (view) return view;
  view = document.createElement('section');
  view.id = 'focusView';
  view.className = 'focus-view';
  view.hidden = true;
  view.innerHTML = `
    <div class="focus-topbar">
      <button data-focus-action="back" type="button">Back</button>
      <div class="focus-title">
        <strong id="focusTitle">Image</strong>
        <span id="focusMeta">Ready</span>
      </div>
      <div class="focus-actions">
        <button data-focus-action="zoom-out" type="button">-</button>
        <span id="focusZoom">100%</span>
        <button data-focus-action="zoom-in" type="button">+</button>
        <button data-focus-action="use-main" type="button">Use as @1</button>
        <button data-focus-action="use-ref" type="button">Add ref</button>
        <button data-focus-action="upscale" type="button">2x upscale</button>
        <button data-focus-action="download" type="button">Download</button>
      </div>
    </div>
    <div class="focus-main">
      <div class="focus-stage">
        <img id="focusImage" alt="">
        <div id="focusVariants" class="focus-variants"></div>
      </div>
      <aside class="focus-panel">
        <div class="panel-title">Focus edit</div>
        <div class="focus-prompt-wrap">
          <div id="focusPrompt" class="prompt-editor" contenteditable="true" spellcheck="true" data-placeholder="Describe the edit for this image."></div>
          <button data-focus-action="enhance-prompt" class="focus-enhance-prompt" type="button" title="Improve prompt">✧</button>
        </div>
        <button data-focus-action="generate" class="generate-button" type="button">Generate from focus</button>
        <p id="focusStatus" class="note">The focused image is sent as @1. Current references remain available as @2, @3, and so on.</p>
      </aside>
    </div>
  `;
  document.body.appendChild(view);
  view.addEventListener('click', handleFocusAction);
  return view;
}

function setFocusBusy(busy, text = '') {
  state.focusBusy = busy;
  const view = ensureFocusView();
  view.querySelectorAll('[data-focus-action], .generate-button').forEach((button) => {
    button.disabled = busy;
  });
  const status = view.querySelector('#focusStatus');
  if (status && text) status.textContent = text;
}

function renderFocusView() {
  const view = ensureFocusView();
  const focus = state.focus;
  view.hidden = !focus;
  if (!focus) return;
  view.querySelector('#focusTitle').textContent = focus.label || 'Image';
  view.querySelector('#focusMeta').textContent = focus.image?.image_name || 'Ready';
  view.querySelector('#focusZoom').textContent = `${Math.round((focus.zoom || 1) * 100)}%`;
  const img = view.querySelector('#focusImage');
  img.src = imageUrl(focus.image, 'full') || focus.image.image_url;
  img.style.transform = `scale(${focus.zoom || 1})`;
  renderFocusVariants();
  setFocusBusy(state.focusBusy);
}

function renderFocusVariants() {
  const view = ensureFocusView();
  const rail = view.querySelector('#focusVariants');
  if (!rail || !state.focus?.variantIds?.length) {
    if (rail) rail.innerHTML = '';
    return;
  }
  rail.innerHTML = state.focus.variantIds.map((id, index) => {
    const output = state.outputs.find((item) => String(item.itemId) === String(id) || String(item.id) === String(id));
    const image = output?.image;
    const status = output?.status || 'queued';
    if (!image?.image_url) {
      return `
        <div class="focus-variant loading" data-focus-variant-id="${escapeHtml(id)}">
          <div class="result-placeholder"><span></span></div>
          <small>${escapeHtml(status)}</small>
        </div>
      `;
    }
    return `
      <button class="focus-variant ready" data-focus-variant-action="choose" data-focus-variant-id="${escapeHtml(id)}" type="button" title="Choose variant ${index + 1}">
        <img src="${imageUrl(image)}" alt="">
        <span>${index + 1}</span>
      </button>
    `;
  }).join('');
}

function useFocusImageAsSlot(slot) {
  if (!state.focus?.image) return;
  state.images[slot] = { ...state.focus.image };
  setSlotPreview(slot, state.images[slot]);
  upsertNode(slot);
  renderTokens();
  renderCanvas();
  setUploadStatus(`${labelFor(slot)} now uses ${state.focus.label}.`);
}

function addFocusImageAsReference() {
  const slot = firstEmptySlot(1);
  if (slot < 1) {
    setUploadStatus('All four reference slots are already filled.', 'error');
    return;
  }
  useFocusImageAsSlot(slot);
}

function moveEndpoint(endpoint, dx, dy, origin) {
  if (endpointType(endpoint) === 'image') {
    const node = state.nodes.find((item) => item.slot === Number(endpointId(endpoint)));
    if (node) {
      node.x = origin.x + dx;
      node.y = origin.y + dy;
    }
  }
  if (endpointType(endpoint) === 'block') {
    const block = state.blocks.find((item) => item.id === endpointId(endpoint));
    if (block) {
      block.x = origin.x + dx;
      block.y = origin.y + dy;
    }
  }
  if (endpointType(endpoint) === 'output') {
    const output = state.outputs.find((item) => item.id === endpointId(endpoint));
    if (output) {
      output.x = origin.x + dx;
      output.y = origin.y + dy;
    }
  }
}

function updateEndpointPositions(endpoints) {
  uniqueEndpoints(endpoints).forEach((endpoint) => {
    const box = endpointBox(endpoint);
    if (!box) return;
    const element = Array.from(nodeLayer.querySelectorAll('[data-endpoint]')).find((item) => item.dataset.endpoint === endpoint);
    if (!element) return;
    element.style.left = `${box.x}px`;
    element.style.top = `${box.y}px`;
  });
}

function updateMarqueeSelection() {
  if (!state.marquee) return;
  const rect = rectFromPoints(state.marquee.start, state.marquee.current);
  const selected = allSelectableBoxes()
    .filter((item) => boxesIntersect(rect, item.box))
    .map((item) => item.endpoint);
  setSelection(selected);
}

function finalizeMarqueeSelection() {
  if (!state.marquee) return false;
  if (state.marquee.moved) {
    updateMarqueeSelection();
    state.lastCanvasDragAt = performance.now();
  }
  state.marquee = null;
  canvasViewport.classList.remove('is-selecting');
  renderCanvas();
  return true;
}

async function upscaleImage(image, sourceEndpoint = null, directDownload = true, scale = 2) {
  if (!image?.image_name) {
    setUploadStatus('Only saved InvokeAI images can be upscaled.', 'error');
    return null;
  }
  const requestedScale = Math.max(1, Math.min(4, Number(scale) || 2));
  setFocusBusy(true, 'RealESRGAN is queued. Download starts when the AI upscale is ready...');
  setUploadStatus(`Queueing ${requestedScale}x RealESRGAN upscale...`, 'busy');
  try {
    const response = await fetch('/api/upscale', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_name: image.image_name, scale: requestedScale }),
    });
    const upscaled = await response.json();
    if (!response.ok) throw new Error(upscaled.error || 'Upscale failed');
    const completedScale = Number(upscaled.scale || requestedScale);
    const output = createCompletedOutput(upscaled, `${completedScale}x AI Upscale`, sourceEndpoint);
    if (state.focus) {
      state.focus = {
        ...state.focus,
        endpoint: outputEndpoint(output.id),
        image: upscaled,
        label: `${completedScale}x AI Upscale`,
        zoom: 1,
      };
      renderFocusView();
    }
    setUploadStatus('RealESRGAN upscale ready. Download started.');
    setFocusBusy(false, 'RealESRGAN upscale ready. Download started.');
    if (directDownload) triggerDownload(upscaled);
    return upscaled;
  } catch (error) {
    setUploadStatus(error.message, 'error');
    setFocusBusy(false, error.message);
    alert(error.message);
    return null;
  }
}

async function generateFromFocus() {
  const focus = state.focus;
  if (!focus?.image) return;
  const prompt = focusPromptText();
  const focusImage = {
    ...focus.image,
    slot: 0,
    role: 'main',
    note: 'Focused source image for this edit.',
  };
  const references = collectImages()
    .filter((image) => image.slot > 0 && image.image_name !== focus.image.image_name);
  setFocusBusy(true, 'Queueing focused variants...');
  state.focus.variantIds = [];
  renderFocusVariants();
  const ids = await submitGeneration({
    prompt,
    images: [focusImage, ...references],
    sourceEndpoint: focus.endpoint,
    connections: [`${labelForEndpoint(focus.endpoint)} opened in Focus Edit as @1`],
  });
  if (ids?.length) {
    state.focus.variantIds = ids.map(String);
    renderFocusVariants();
    setFocusBusy(false, 'Choose a variant below, or generate again with a tighter prompt.');
  } else {
    setFocusBusy(false, 'Focus generation did not queue.');
  }
}

function focusPromptText() {
  return ensureFocusView().querySelector('#focusPrompt')?.innerText?.trim() || '';
}

function improveFocusPrompt() {
  const editable = ensureFocusView().querySelector('#focusPrompt');
  if (!editable) return;
  const text = focusPromptText();
  const addition = 'make the requested cleanup precise, remove artifacts only, preserve composition and identities, improve facial clarity, sharpness, realistic lighting, and high definition';
  editable.innerText = text ? `${text} — ${addition}` : addition;
}

function chooseFocusVariant(id) {
  const output = state.outputs.find((item) => String(item.itemId) === String(id) || String(item.id) === String(id));
  if (!output?.image) return;
  state.focus = {
    ...state.focus,
    endpoint: outputEndpoint(output.id),
    image: output.image,
    label: output.label || 'Focused variant',
    zoom: 1,
    variantIds: [],
  };
  renderFocusView();
  setUploadStatus(`${state.focus.label} selected in Focus Edit.`);
}

function handleFocusAction(event) {
  const variantButton = event.target.closest('[data-focus-variant-action]');
  if (variantButton) {
    chooseFocusVariant(variantButton.dataset.focusVariantId);
    return;
  }
  const button = event.target.closest('[data-focus-action]');
  if (!button || !state.focus || state.focusBusy) return;
  const action = button.dataset.focusAction;
  if (action === 'back') closeFocus();
  if (action === 'zoom-in') {
    state.focus.zoom = Math.min(4, (state.focus.zoom || 1) * 1.2);
    renderFocusView();
  }
  if (action === 'zoom-out') {
    state.focus.zoom = Math.max(0.2, (state.focus.zoom || 1) / 1.2);
    renderFocusView();
  }
  if (action === 'download') triggerDownload(state.focus.image);
  if (action === 'upscale') upscaleImage(state.focus.image, state.focus.endpoint, true);
  if (action === 'use-main') useFocusImageAsSlot(0);
  if (action === 'use-ref') addFocusImageAsReference();
  if (action === 'enhance-prompt') improveFocusPrompt();
  if (action === 'generate') generateFromFocus();
}

function handleImageAction(event) {
  const button = event.target.closest('[data-image-action], .result-open');
  if (!button) return false;
  const outputId = button.dataset.outputId || button.closest('[data-output-id]')?.dataset.outputId;
  const endpoint = button.closest('[data-endpoint]')?.dataset.endpoint
    || (outputId ? outputEndpoint(String(outputId)) : null);
  const image = imageForEndpoint(endpoint);
  if (!image) return true;
  const action = button.dataset.imageAction || 'focus';
  if (action === 'focus') openFocus(endpoint);
  if (action === 'download') triggerDownload(image);
  if (action === 'upscale') upscaleImage(image, endpoint, true);
  return true;
}

function setZoom(scale, center = null) {
  const oldScale = state.view.scale;
  const nextScale = Math.max(0.42, Math.min(2.25, scale));
  if (center) {
    const wx = (center.x - state.view.x) / oldScale;
    const wy = (center.y - state.view.y) / oldScale;
    state.view.x = center.x - wx * nextScale;
    state.view.y = center.y - wy * nextScale;
  }
  state.view.scale = nextScale;
  renderCanvas();
}

function resetView() {
  state.view = { x: 28, y: 36, scale: 0.68 };
  renderCanvas();
}

function autoLayout() {
  state.nodes.forEach((node) => {
    node.x = defaultPositions[node.slot].x;
    node.y = defaultPositions[node.slot].y;
  });
  renderCanvas();
}

function finishPointerInteraction(pointerId = null) {
  if (pointerId === null || state.dragNode?.pointerId === pointerId) state.dragNode = null;
  if (pointerId === null || state.dragBlock?.pointerId === pointerId) state.dragBlock = null;
  if (pointerId === null || state.resizeNode?.pointerId === pointerId) state.resizeNode = null;
  if (pointerId === null || state.connectDrag?.pointerId === pointerId) state.connectDrag = null;
  if (pointerId === null || state.dragSelection?.pointerId === pointerId) state.dragSelection = null;
  if (pointerId === null || state.marquee?.pointerId === pointerId) state.marquee = null;
  if (pointerId === null || state.pan?.pointerId === pointerId) {
    state.pan = null;
    canvasViewport.classList.remove('is-panning');
  }
  canvasViewport.classList.remove('is-selecting');
  setDropTargetBlock(null);
  if (state.renderAfterPointer) {
    state.renderAfterPointer = false;
    renderCanvas();
  }
}

function wireCanvas() {
  canvasUpload.addEventListener('change', async (event) => {
    try {
      await uploadFiles(firstEmptySlot(0), event.target.files);
    } catch (_) {}
    canvasUpload.value = '';
  });
  canvasViewport.addEventListener('dragover', (event) => {
    event.preventDefault();
    canvasViewport.classList.add('drag-over');
  });
  canvasViewport.addEventListener('dragleave', () => canvasViewport.classList.remove('drag-over'));
  canvasViewport.addEventListener('drop', async (event) => {
    event.preventDefault();
    canvasViewport.classList.remove('drag-over');
    try {
      await uploadFiles(firstEmptySlot(0), event.dataTransfer.files);
    } catch (_) {}
  });
  canvasViewport.addEventListener('wheel', (event) => {
    event.preventDefault();
    const rect = canvasViewport.getBoundingClientRect();
    const center = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    setZoom(state.view.scale * (event.deltaY > 0 ? 0.9 : 1.1), center);
  }, { passive: false });
  canvasViewport.addEventListener('contextmenu', (event) => event.preventDefault());
  canvasViewport.addEventListener('click', (event) => {
    if (!state.marquee) return;
    event.preventDefault();
    event.stopPropagation();
    finalizeMarqueeSelection();
  }, true);
  canvasViewport.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.canvas-node')
      || event.target.closest('.workflow-block')
      || event.target.closest('.canvas-output-node')
      || event.target.closest('.block-menu')
      || event.target.closest('.canvas-add-node')
      || event.target.closest('.connection-remove, .connection-hit')) return;
    if (event.button === 1 || event.button === 2) {
      state.pan = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        vx: state.view.x,
        vy: state.view.y,
        moved: false,
      };
      canvasViewport.classList.add('is-panning');
    } else {
      const point = screenToWorld(event.clientX, event.clientY);
      state.marquee = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        start: point,
        current: point,
        moved: false,
      };
      canvasViewport.classList.add('is-selecting');
    }
    canvasViewport.setPointerCapture(event.pointerId);
  });
  canvasViewport.addEventListener('pointermove', (event) => {
    if (state.marquee && state.marquee.pointerId === event.pointerId) {
      state.marquee.current = screenToWorld(event.clientX, event.clientY);
      if (Math.hypot(event.clientX - state.marquee.x, event.clientY - state.marquee.y) > 5) {
        state.marquee.moved = true;
        state.lastCanvasDragAt = performance.now();
      }
      if (state.marquee.moved) updateMarqueeSelection();
      renderCanvas();
      return;
    }
    if (state.pan && state.pan.pointerId === event.pointerId) {
      if (Math.hypot(event.clientX - state.pan.x, event.clientY - state.pan.y) > 5) {
        state.pan.moved = true;
      }
      state.view.x = state.pan.vx + event.clientX - state.pan.x;
      state.view.y = state.pan.vy + event.clientY - state.pan.y;
      renderCanvas();
    }
  });
  canvasViewport.addEventListener('pointerup', (event) => {
    if (state.marquee?.pointerId === event.pointerId) {
      state.marquee.current = screenToWorld(event.clientX, event.clientY);
      if (Math.hypot(event.clientX - state.marquee.x, event.clientY - state.marquee.y) > 5) {
        state.marquee.moved = true;
        state.lastCanvasDragAt = performance.now();
      }
      const moved = state.marquee.moved;
      const shouldOpenUpload = !moved && state.images.every((image) => !image);
      if (moved) {
        updateMarqueeSelection();
        state.lastCanvasDragAt = performance.now();
        state.skipNextClick = performance.now() + 1000;
      }
      if (!moved && !shouldOpenUpload) setSelection([]);
      finishPointerInteraction(event.pointerId);
      canvasViewport.classList.remove('is-selecting');
      try {
        canvasViewport.releasePointerCapture(event.pointerId);
      } catch (_) {}
      if (shouldOpenUpload) canvasUpload.click();
      renderCanvas();
      return;
    }
    if (state.pan?.pointerId === event.pointerId) {
      const shouldOpenUpload = !state.pan.moved && state.images.every((image) => !image);
      finishPointerInteraction(event.pointerId);
      try {
        canvasViewport.releasePointerCapture(event.pointerId);
      } catch (_) {}
      if (shouldOpenUpload) {
        canvasUpload.click();
      }
    }
  });
  nodeLayer.addEventListener('dragstart', (event) => {
    const token = event.target.closest('.block-token[data-block-token-endpoint]');
    const blockElement = token?.closest('.workflow-block');
    if (!token || !blockElement) return;
    state.blockTokenDrag = {
      blockId: blockElement.dataset.blockId,
      sourceEndpoint: token.dataset.blockTokenEndpoint,
    };
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', JSON.stringify(state.blockTokenDrag));
    window.setTimeout(() => token.classList.add('dragging'), 0);
    event.stopPropagation();
  });
  nodeLayer.addEventListener('dragover', (event) => {
    const token = event.target.closest('.block-token[data-block-token-endpoint]');
    const blockElement = token?.closest('.workflow-block');
    if (!token || !blockElement || !state.blockTokenDrag) return;
    if (state.blockTokenDrag.blockId !== blockElement.dataset.blockId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    nodeLayer.querySelectorAll('.block-token.drop-target').forEach((item) => item.classList.remove('drop-target'));
    token.classList.add('drop-target');
  });
  nodeLayer.addEventListener('drop', (event) => {
    const token = event.target.closest('.block-token[data-block-token-endpoint]');
    const blockElement = token?.closest('.workflow-block');
    if (!token || !blockElement || !state.blockTokenDrag) return;
    if (state.blockTokenDrag.blockId !== blockElement.dataset.blockId) return;
    event.preventDefault();
    const changed = reorderBlockSource(
      blockElement.dataset.blockId,
      state.blockTokenDrag.sourceEndpoint,
      token.dataset.blockTokenEndpoint,
    );
    clearBlockTokenDragState();
    state.skipNextClick = performance.now() + 500;
    if (changed) renderCanvas();
  });
  nodeLayer.addEventListener('dragend', () => {
    clearBlockTokenDragState();
    state.skipNextClick = performance.now() + 500;
  });
  nodeLayer.addEventListener('click', (event) => {
    if (state.marquee && finalizeMarqueeSelection()) return;
    if (state.lastCanvasDragAt && performance.now() - state.lastCanvasDragAt < 1000) return;
    const deleteControl = event.target.closest('[data-delete-endpoint]');
    if (deleteControl) {
      event.preventDefault();
      event.stopPropagation();
      deleteCanvasEndpoints([deleteControl.dataset.deleteEndpoint]);
      return;
    }
    if (handleImageAction(event)) return;
    if (state.skipNextClick) {
      const shouldSkip = performance.now() < state.skipNextClick;
      state.skipNextClick = 0;
      if (!shouldSkip) {
        // Continue with normal click handling.
      } else {
        return;
      }
    }
    const blockElement = event.target.closest('.workflow-block');
    if (blockElement) {
      const blockId = blockElement.dataset.blockId;
      setSelection([blockEndpoint(blockId)]);
      const block = state.blocks.find((item) => item.id === blockId);
      const editable = event.target.closest('[contenteditable="true"], input, select, textarea');
      if (editable) {
        nodeLayer.querySelectorAll('.workflow-block.selected').forEach((item) => item.classList.remove('selected'));
        blockElement.classList.add('selected');
        return;
      }
      const followup = event.target.closest('[data-followup-kind]');
      if (followup && block) {
        block.menuOpen = false;
        addBlock(
          followup.dataset.followupKind,
          { x: block.x + (block.w || 340) + 120, y: block.y },
          blockEndpoint(blockId),
        );
        return;
      }
      if (event.target.closest('.close-node-details')) {
        if (block) block.infoOpen = false;
        renderCanvas();
        return;
      }
      if (event.target.closest('.workflow-info')) {
        if (block) {
          block.infoOpen = !block.infoOpen;
          block.menuOpen = false;
        }
        renderCanvas();
        return;
      }
      const removeToken = event.target.closest('[data-remove-block-source]');
      if (removeToken) {
        disconnectSourceFromBlock(removeToken.dataset.removeBlockSource, blockId);
        renderCanvas();
        return;
      }
      const token = event.target.closest('[data-insert-source]');
      if (token) {
        const sourceEndpoint = token.dataset.insertSource;
        addEdge(sourceEndpoint, blockEndpoint(blockId));
        insertBlockSourceToken(blockId, sourceEndpoint);
        renderConnections();
        return;
      }
      if (event.target.closest('.native-open')) {
        window.open('http://127.0.0.1:9090', '_blank', 'noopener,noreferrer');
        return;
      }
      if (event.target.closest('.improve-prompt')) {
        improveBlockPrompt(blockId);
        return;
      }
      if (event.target.closest('.run-block')) {
        generateFromBlock(blockId);
        return;
      }
      if (event.target.closest('.block-back')) {
        if (block) {
          block.menuOpen = !block.menuOpen;
          block.infoOpen = false;
        }
        renderCanvas();
        return;
      }
      if (event.target.closest('.block-connect')) {
        if (state.connectFrom && ['image', 'output'].includes(endpointType(state.connectFrom))) {
          addEdge(state.connectFrom, blockEndpoint(blockId));
          state.connectFrom = null;
        } else {
          state.connectFrom = blockEndpoint(blockId);
        }
        renderCanvas();
        return;
      }
      if (event.target.closest('.node-details-popover, .node-action-menu')) return;
      renderCanvas();
      return;
    }

    const node = event.target.closest('.canvas-node');
    if (!node) {
      const outputElement = event.target.closest('.canvas-output-node');
      if (outputElement) {
        const endpoint = outputEndpoint(outputElement.dataset.outputId);
        setSelection([endpoint]);
        if (event.target.closest('.node-connect')) {
          const rect = canvasViewport.getBoundingClientRect();
          showBlockMenu({ x: event.clientX - rect.left + 8, y: event.clientY - rect.top - 18 }, endpoint);
          renderCanvas();
          return;
        }
        nodeLayer.querySelectorAll('.canvas-node.selected, .workflow-block.selected, .canvas-output-node.selected')
          .forEach((item) => item.classList.remove('selected'));
        outputElement.classList.add('selected');
      }
      return;
    }
    const previouslySelectedBlockId = endpointType(state.selected) === 'block' ? endpointId(state.selected) : null;
    const slot = Number(node.dataset.slot);
    const endpoint = imageEndpoint(slot);
    setSelection([endpoint]);
    if (event.target.closest('.node-connect')) {
      const rect = canvasViewport.getBoundingClientRect();
      showBlockMenu({ x: event.clientX - rect.left + 8, y: event.clientY - rect.top - 18 }, endpoint);
      renderCanvas();
      return;
    }
    if (event.target.closest('.node-insert')) {
      insertPromptToken(slot);
      renderCanvas();
      return;
    }
    const mentionBlockId = blockIdForImageMention(previouslySelectedBlockId);
    if (mentionBlockId && event.target.closest('.node-body')) {
      window.clearTimeout(state.nodeClickTimer);
      state.nodeClickTimer = window.setTimeout(() => {
        connectImageToBlock(slot, mentionBlockId, { insertToken: true });
        state.nodeClickTimer = null;
      }, 220);
      return;
    }
    nodeLayer.querySelectorAll('.canvas-node.selected, .workflow-block.selected, .canvas-output-node.selected')
      .forEach((item) => item.classList.remove('selected'));
    node.classList.add('selected');
  });
  nodeLayer.addEventListener('dblclick', (event) => {
    if (event.target.closest('button') || event.target.closest('[contenteditable="true"]')) return;
    window.clearTimeout(state.nodeClickTimer);
    state.nodeClickTimer = null;
    const element = event.target.closest('.canvas-node, .canvas-output-node');
    const endpoint = element?.dataset.endpoint;
    if (endpoint && imageForEndpoint(endpoint)) {
      openFocus(endpoint);
    }
  });
  resultsGrid.addEventListener('click', (event) => {
    handleImageAction(event);
  });
  resultsGrid.addEventListener('dblclick', (event) => {
    const card = event.target.closest('[data-item-id]');
    const id = card?.dataset.itemId;
    if (!id) return;
    const endpoint = outputEndpoint(String(id));
    if (imageForEndpoint(endpoint)) openFocus(endpoint);
  });
  connectionLayer.addEventListener('click', (event) => {
    const remove = event.target.closest('.connection-remove');
    if (!remove) return;
    const edgeIndex = Number(remove.dataset.edgeIndex);
    if (!Number.isInteger(edgeIndex) || !state.edges[edgeIndex]) return;
    state.edges.splice(edgeIndex, 1);
    state.connectFrom = null;
    setUploadStatus('Connection removed.');
    renderCanvas();
  });
  nodeLayer.addEventListener('pointerdown', (event) => {
    const resizeHandle = event.target.closest('.resize-handle');
    if (resizeHandle) {
      const nodeElement = event.target.closest('.canvas-node');
      const slot = Number(nodeElement.dataset.slot);
      const node = state.nodes.find((item) => item.slot === slot);
      if (!node) return;
      const size = slotSize(slot, node);
      setSelection([imageEndpoint(slot)]);
      state.resizeNode = {
        pointerId: event.pointerId,
        slot,
        handle: resizeHandle.dataset.resize,
        x: event.clientX,
        y: event.clientY,
        nx: node.x,
        ny: node.y,
        nw: size.w,
        nh: size.h,
      };
      nodeElement.setPointerCapture(event.pointerId);
      return;
    }
    const connectHandle = event.target.closest('.node-connect');
    if (connectHandle) {
      const sourceElement = connectHandle.closest('.canvas-node, .canvas-output-node');
      if (!sourceElement) return;
      const endpoint = sourceElement.dataset.endpoint;
      if (!isImageSourceEndpoint(endpoint)) return;
      const point = screenToWorld(event.clientX, event.clientY);
      setSelection([endpoint]);
      state.connectFrom = endpoint;
      state.connectDrag = {
        pointerId: event.pointerId,
        from: endpoint,
        startX: event.clientX,
        startY: event.clientY,
        current: point,
        moved: false,
        sourceElement,
      };
      hideBlockMenu();
      connectHandle.setPointerCapture(event.pointerId);
      event.preventDefault();
      renderConnections();
      return;
    }
    if (event.target.closest('button')) return;
    const blockElement = event.target.closest('.workflow-block');
    const outputElement = event.target.closest('.canvas-output-node');
    const nodeElementForDrag = event.target.closest('.canvas-node');
    const blockHeaderDrag = blockElement && event.target.closest('.workflow-block-header');
    const dragEndpoint = outputElement?.dataset.endpoint
      || nodeElementForDrag?.dataset.endpoint
      || (blockHeaderDrag ? blockElement.dataset.endpoint : null);
    if (dragEndpoint) {
      if (!state.selectedItems.includes(dragEndpoint)) setSelection([dragEndpoint]);
      const endpoints = state.selectedItems.includes(dragEndpoint) ? state.selectedItems : [dragEndpoint];
      if (endpoints.length > 1 || endpointType(dragEndpoint) === 'output') {
        state.dragSelection = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          moved: false,
          endpoints,
          origins: endpoints.map((endpoint) => {
            const box = endpointBox(endpoint);
            return { endpoint, x: box?.x || 0, y: box?.y || 0 };
          }),
        };
        (outputElement || nodeElementForDrag || blockElement).setPointerCapture(event.pointerId);
        return;
      }
    }
    if (blockElement && event.target.closest('.workflow-block-header')) {
      const block = state.blocks.find((item) => item.id === blockElement.dataset.blockId);
      if (!block) return;
      setSelection([blockEndpoint(block.id)]);
      state.dragBlock = {
        pointerId: event.pointerId,
        id: block.id,
        x: event.clientX,
        y: event.clientY,
        bx: block.x,
        by: block.y,
      };
      blockElement.setPointerCapture(event.pointerId);
      return;
    }
    const nodeElement = event.target.closest('.canvas-node');
    if (!nodeElement) return;
    const slot = Number(nodeElement.dataset.slot);
    const node = state.nodes.find((item) => item.slot === slot);
    if (!node) return;
    setSelection([imageEndpoint(slot)]);
    state.dragNode = {
      pointerId: event.pointerId,
      slot,
      x: event.clientX,
      y: event.clientY,
      nx: node.x,
      ny: node.y,
      moved: false,
    };
    nodeElement.setPointerCapture(event.pointerId);
  });
  nodeLayer.addEventListener('pointermove', (event) => {
    if (state.connectDrag && state.connectDrag.pointerId === event.pointerId) {
      const drag = state.connectDrag;
      drag.current = screenToWorld(event.clientX, event.clientY);
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 4) {
        drag.moved = true;
      }
      const target = workflowBlockAtPoint(event.clientX, event.clientY);
      setDropTargetBlock(target?.dataset.blockId || null);
      renderConnections();
      return;
    }
    if (state.dragSelection && state.dragSelection.pointerId === event.pointerId) {
      if (!state.dragSelection.moved
        && Math.hypot(event.clientX - state.dragSelection.x, event.clientY - state.dragSelection.y) <= 4) {
        return;
      }
      state.dragSelection.moved = true;
      const dx = (event.clientX - state.dragSelection.x) / state.view.scale;
      const dy = (event.clientY - state.dragSelection.y) / state.view.scale;
      state.dragSelection.origins.forEach((origin) => moveEndpoint(origin.endpoint, dx, dy, origin));
      updateEndpointPositions(state.dragSelection.endpoints);
      if (state.dragSelection.endpoints.length === 1) {
        const sourceEndpoint = state.dragSelection.endpoints[0];
        const sourceElement = nodeLayer.querySelector(`[data-endpoint="${sourceEndpoint}"]`);
        const target = isImageSourceEndpoint(sourceEndpoint)
          ? workflowBlockAtPoint(event.clientX, event.clientY, sourceElement)
          : null;
        setDropTargetBlock(target?.dataset.blockId || null);
      }
      renderConnections();
      return;
    }
    if (state.resizeNode && state.resizeNode.pointerId === event.pointerId) {
      const node = state.nodes.find((item) => item.slot === state.resizeNode.slot);
      if (!node) return;
      const dx = (event.clientX - state.resizeNode.x) / state.view.scale;
      const dy = (event.clientY - state.resizeNode.y) / state.view.scale;
      const handle = state.resizeNode.handle;
      const minW = node.slot === 0 ? 180 : 120;
      const minH = node.slot === 0 ? 128 : 92;
      if (handle.includes('e')) node.w = Math.max(minW, state.resizeNode.nw + dx);
      if (handle.includes('s')) node.h = Math.max(minH, state.resizeNode.nh + dy);
      if (handle.includes('w')) {
        const nextW = Math.max(minW, state.resizeNode.nw - dx);
        node.x = state.resizeNode.nx + (state.resizeNode.nw - nextW);
        node.w = nextW;
      }
      if (handle.includes('n')) {
        const nextH = Math.max(minH, state.resizeNode.nh - dy);
        node.y = state.resizeNode.ny + (state.resizeNode.nh - nextH);
        node.h = nextH;
      }
      const element = nodeLayer.querySelector(`.canvas-node[data-slot="${node.slot}"]`);
      if (element) {
        element.style.left = `${node.x}px`;
        element.style.top = `${node.y}px`;
        element.style.width = `${node.w}px`;
        element.style.height = `${node.h}px`;
      }
      renderConnections();
      return;
    }
    if (state.dragBlock && state.dragBlock.pointerId === event.pointerId) {
      const block = state.blocks.find((item) => item.id === state.dragBlock.id);
      if (!block) return;
      block.x = state.dragBlock.bx + (event.clientX - state.dragBlock.x) / state.view.scale;
      block.y = state.dragBlock.by + (event.clientY - state.dragBlock.y) / state.view.scale;
      const element = nodeLayer.querySelector(`.workflow-block[data-block-id="${block.id}"]`);
      if (element) {
        element.style.left = `${block.x}px`;
        element.style.top = `${block.y}px`;
      }
      renderConnections();
      return;
    }
    if (!state.dragNode || state.dragNode.pointerId !== event.pointerId) return;
    const node = state.nodes.find((item) => item.slot === state.dragNode.slot);
    if (!node) return;
    if (Math.hypot(event.clientX - state.dragNode.x, event.clientY - state.dragNode.y) > 4) {
      state.dragNode.moved = true;
    }
    node.x = state.dragNode.nx + (event.clientX - state.dragNode.x) / state.view.scale;
    node.y = state.dragNode.ny + (event.clientY - state.dragNode.y) / state.view.scale;
    const element = nodeLayer.querySelector(`.canvas-node[data-slot="${node.slot}"]`);
    if (element) {
      element.style.left = `${node.x}px`;
      element.style.top = `${node.y}px`;
    }
    const target = state.dragNode.moved ? workflowBlockAtPoint(event.clientX, event.clientY, element) : null;
    setDropTargetBlock(target?.dataset.blockId || null);
    renderConnections();
  });
  nodeLayer.addEventListener('pointerup', (event) => {
    if (state.dragSelection?.pointerId === event.pointerId) {
      const drag = state.dragSelection;
      const moved = drag.moved;
      if (moved && drag.endpoints.length === 1 && isImageSourceEndpoint(drag.endpoints[0])) {
        const sourceEndpoint = drag.endpoints[0];
        const sourceElement = nodeLayer.querySelector(`[data-endpoint="${sourceEndpoint}"]`);
        const target = workflowBlockAtPoint(event.clientX, event.clientY, sourceElement);
        if (target) {
          const origin = drag.origins[0];
          const output = endpointType(sourceEndpoint) === 'output'
            ? state.outputs.find((item) => outputEndpoint(item.id) === sourceEndpoint)
            : null;
          if (output && origin) {
            output.x = origin.x;
            output.y = origin.y;
          }
          state.dragSelection = null;
          connectEndpointToBlock(sourceEndpoint, target.dataset.blockId, { render: false });
          state.skipNextClick = performance.now() + 650;
          setDropTargetBlock(null);
          renderCanvas();
          try {
            event.target.releasePointerCapture(event.pointerId);
          } catch (_) {}
          return;
        }
      }
      state.dragSelection = null;
      setDropTargetBlock(null);
      if (moved) {
        state.skipNextClick = performance.now() + 1000;
        renderCanvas();
      }
      try {
        event.target.releasePointerCapture(event.pointerId);
      } catch (_) {}
      return;
    }
    if (state.connectDrag?.pointerId === event.pointerId) {
      const drag = state.connectDrag;
      state.connectDrag = null;
      completeConnectionDrag(drag, event.clientX, event.clientY);
      try {
        event.target.releasePointerCapture(event.pointerId);
      } catch (_) {}
      return;
    }
    if (state.dragNode?.pointerId === event.pointerId && state.dragNode.moved) {
      const drag = state.dragNode;
      const node = state.nodes.find((item) => item.slot === drag.slot);
      const element = nodeLayer.querySelector(`.canvas-node[data-slot="${drag.slot}"]`);
      const target = workflowBlockAtPoint(event.clientX, event.clientY, element);
      if (target && node) {
        node.x = drag.nx;
        node.y = drag.ny;
        connectImageToBlock(drag.slot, target.dataset.blockId, { render: false });
        state.dragNode = null;
        state.skipNextClick = performance.now() + 650;
        renderCanvas();
        try {
          event.target.releasePointerCapture(event.pointerId);
        } catch (_) {}
        return;
      }
    }
    finishPointerInteraction(event.pointerId);
    try {
      event.target.releasePointerCapture(event.pointerId);
    } catch (_) {}
  });
  window.addEventListener('pointerup', (event) => {
    if (state.dragSelection?.pointerId === event.pointerId) {
      const moved = state.dragSelection.moved;
      state.dragSelection = null;
      if (moved) renderCanvas();
      return;
    }
    if (state.connectDrag?.pointerId === event.pointerId) {
      const drag = state.connectDrag;
      state.connectDrag = null;
      completeConnectionDrag(drag, event.clientX, event.clientY);
      return;
    }
    finishPointerInteraction(event.pointerId);
  });
  window.addEventListener('pointercancel', (event) => finishPointerInteraction(event.pointerId));
  window.addEventListener('mouseup', () => {
    if (state.marquee) {
      finalizeMarqueeSelection();
      state.skipNextClick = performance.now() + 1000;
    }
    if (state.dragSelection) {
      state.dragSelection = null;
      renderCanvas();
    }
  });
  nodeLayer.addEventListener('input', (event) => {
    const setting = event.target.closest('[data-native-setting]');
    if (setting && setting.type !== 'checkbox') {
      const blockElement = setting.closest('.workflow-block');
      const block = state.blocks.find((item) => item.id === blockElement?.dataset.blockId);
      if (block) {
        block.nativeSettings = block.nativeSettings || {};
        block.nativeSettings[setting.dataset.nativeSetting] = setting.value;
        scheduleAutosave();
      }
      return;
    }
    const editable = event.target.closest('[data-block-prompt]');
    if (!editable) return;
    updateBlockPrompt(editable.dataset.blockPrompt, editable);
  });
  nodeLayer.addEventListener('change', (event) => {
    const setting = event.target.closest('[data-native-setting]');
    if (!setting) return;
    const blockElement = setting.closest('.workflow-block');
    const block = state.blocks.find((item) => item.id === blockElement?.dataset.blockId);
    if (!block) return;
    block.nativeSettings = block.nativeSettings || {};
    block.nativeSettings[setting.dataset.nativeSetting] = setting.type === 'checkbox' ? setting.checked : setting.value;
    scheduleAutosave();
  });
}

async function checkStatus() {
  try {
    const response = await fetch('/api/status');
    const data = await response.json();
    if (data.ok) {
      serverStatus.textContent = 'Ready';
      serverStatus.classList.add('ready');
      return;
    }
  } catch (_) {}
  serverStatus.textContent = 'Waiting';
  serverStatus.classList.remove('ready');
}

document.addEventListener('selectionchange', savePromptRange);
promptEditor.addEventListener('keyup', savePromptRange);
promptEditor.addEventListener('mouseup', savePromptRange);
promptEditor.addEventListener('input', scheduleAutosave);
tokenRow.addEventListener('dragstart', (event) => {
  const token = event.target.closest('.token[data-token-slot]');
  if (!token) return;
  state.globalTokenDrag = Number(token.dataset.tokenSlot);
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', String(state.globalTokenDrag));
  window.setTimeout(() => token.classList.add('dragging'), 0);
});
tokenRow.addEventListener('dragover', (event) => {
  const token = event.target.closest('.token[data-token-slot]');
  if (!token || state.globalTokenDrag === null) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  tokenRow.querySelectorAll('.token.drop-target').forEach((item) => item.classList.remove('drop-target'));
  token.classList.add('drop-target');
});
tokenRow.addEventListener('drop', (event) => {
  const token = event.target.closest('.token[data-token-slot]');
  if (!token || state.globalTokenDrag === null) return;
  event.preventDefault();
  const changed = swapImageSlots(state.globalTokenDrag, Number(token.dataset.tokenSlot));
  clearGlobalTokenDragState();
  state.skipNextClick = performance.now() + 500;
  if (changed) renderConnections();
});
tokenRow.addEventListener('dragend', () => {
  clearGlobalTokenDragState();
  state.skipNextClick = performance.now() + 500;
});
document.getElementById('insertMain').addEventListener('click', () => insertPromptToken(0));
document.getElementById('insertRef').addEventListener('click', () => insertPromptToken(1));
document.getElementById('count').addEventListener('change', () => {
  if (!state.busy) generateButton.textContent = `Generate ${document.getElementById('count').value}`;
  scheduleAutosave();
});
document.getElementById('mode').addEventListener('change', () => {
  syncModeControls();
  scheduleAutosave();
});
document.getElementById('aspect').addEventListener('change', scheduleAutosave);
document.getElementById('steps').addEventListener('change', scheduleAutosave);
document.getElementById('zoomOut').addEventListener('click', () => setZoom(state.view.scale * 0.9));
document.getElementById('zoomIn').addEventListener('click', () => setZoom(state.view.scale * 1.1));
document.getElementById('resetView').addEventListener('click', resetView);
document.getElementById('autoLayout').addEventListener('click', autoLayout);
deleteSelectedButton.addEventListener('click', () => deleteCanvasEndpoints());
document.getElementById('openBlocks').addEventListener('click', () => showBlockMenu());
document.getElementById('canvasAddNode').addEventListener('click', (event) => {
  const viewportRect = canvasViewport.getBoundingClientRect();
  const buttonRect = event.currentTarget.getBoundingClientRect();
  showBlockMenu({
    x: buttonRect.right - viewportRect.left + 10,
    y: Math.max(12, buttonRect.top - viewportRect.top - 110),
  });
});
document.getElementById('closeBlocks').addEventListener('click', hideBlockMenu);
blockSearch.addEventListener('input', renderNativeFeatureMenu);
toggleOutputsButton.addEventListener('click', () => {
  state.outputsExpanded = !state.outputsExpanded;
  updateOutputMode();
  scheduleAutosave();
});
blockMenu.addEventListener('click', (event) => {
  const choice = event.target.closest('.block-choice');
  if (!choice || choice.classList.contains('disabled')) return;
  const rect = canvasViewport.getBoundingClientRect();
  const point = state.menuAnchor || { x: 120, y: 120 };
  const worldPoint = {
    x: (point.x - state.view.x) / state.view.scale + 70,
    y: (point.y - state.view.y) / state.view.scale - 70,
  };
  addBlock(choice.dataset.block, worldPoint);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    hideBlockMenu();
    return;
  }
  if (!['Delete', 'Backspace'].includes(event.key) || !state.selectedItems.length) return;
  const active = document.activeElement;
  if (active?.matches?.('input, textarea, select, [contenteditable="true"]')) return;
  event.preventDefault();
  deleteCanvasEndpoints();
});
generateButton.addEventListener('click', generate);
workspaceSelect.addEventListener('change', async () => {
  try {
    await openWorkspace(workspaceSelect.value);
  } catch (error) {
    workspaceSelect.value = state.workspace.id || '';
    setSaveStatus('Open failed', 'error');
    setUploadStatus(error.message, 'error');
  }
});
workspaceName.addEventListener('input', scheduleAutosave);
workspaceName.addEventListener('blur', saveWorkspaceNow);
newWorkspaceButton.addEventListener('click', async () => {
  try {
    await createWorkspace();
  } catch (error) {
    setSaveStatus('Create failed', 'error');
    setUploadStatus(error.message, 'error');
  }
});
window.addEventListener('pagehide', () => {
  if (state.suspendAutosave || !state.workspace.id) return;
  const payload = JSON.stringify({ name: workspaceName.value, state: workspaceSnapshot() });
  navigator.sendBeacon(
    `/api/workspaces/${encodeURIComponent(state.workspace.id)}/save`,
    new Blob([payload], { type: 'application/json' }),
  );
});

createRefSlots();
wireUploads();
wireCanvas();
renderTokens();
renderCanvas();
updateOutputMode();
syncModeControls();
checkStatus();
loadNativeCatalog();
initializeWorkspaces();
setInterval(checkStatus, 5000);
