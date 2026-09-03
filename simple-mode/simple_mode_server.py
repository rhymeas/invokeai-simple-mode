import cgi
import datetime
import json
import os
import random
import re
import sys
import textwrap
import threading
import time
import urllib.error
import urllib.request
import uuid
from io import BytesIO
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, urlparse

try:
    from PIL import Image, ImageDraw, ImageFont, ImageOps, ImageStat
except Exception:
    Image = None
    ImageDraw = None
    ImageFont = None
    ImageOps = None
    ImageStat = None


ROOT = Path(os.environ.get("INVOKEAI_ROOT", os.path.expanduser("~/invokeai"))).resolve()
APP_DIR = Path(os.environ.get("INVOKEAI_SIMPLE_MODE_DIR", Path(__file__).resolve().parent)).resolve()
WORKSPACES_DIR = APP_DIR / "workspaces"
NATIVE_NAV_SOURCE = APP_DIR / "simple-mode-nav.js"
NATIVE_DIST_DIR = ROOT / ".venv" / "Lib" / "site-packages" / "invokeai" / "frontend" / "web" / "dist"
INVOKE_URL = os.environ.get("INVOKEAI_URL", "http://127.0.0.1:9090").rstrip("/")
HOST = os.environ.get("INVOKEAI_SIMPLE_MODE_HOST", "127.0.0.1")
PORT = int(os.environ.get("INVOKEAI_SIMPLE_MODE_PORT", "9091"))
WORKSPACE_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
WORKSPACE_LOCK = threading.RLock()


def ensure_native_navigation():
    """Restore the Simple Mode nav entry after InvokeAI frontend upgrades."""
    index_path = NATIVE_DIST_DIR / "index.html"
    target_script = NATIVE_DIST_DIR / "simple-mode-nav.js"
    if not index_path.exists() or not NATIVE_NAV_SOURCE.exists():
        return False

    source_bytes = NATIVE_NAV_SOURCE.read_bytes()
    if not target_script.exists() or target_script.read_bytes() != source_bytes:
        target_script.write_bytes(source_bytes)

    html = index_path.read_text(encoding="utf-8")
    script_tag = '  <script defer src="./simple-mode-nav.js?v=simple-mode-1"></script>'
    if "simple-mode-nav.js" in html:
        updated = re.sub(r'\s*<script\s+defer\s+src="\./simple-mode-nav\.js\?v=[^"]+"></script>', f"\n{script_tag}", html)
    else:
        updated = html.replace("</head>", f"{script_tag}\n</head>")
    if updated != html:
        index_path.write_text(updated, encoding="utf-8")
    return True

ROLE_GUIDANCE = {
    "style": "Borrow visual style, render language, mood, texture, lens feel, and finish while retaining the main image layout unless the user changes it.",
    "brand": "Borrow brand system: colors, logos, typography, signage, graphic shapes, and visual identity cues.",
    "object": "Borrow the referenced object or subject details: silhouette, proportions, materials, pose, and recognizable features.",
    "lighting": "Borrow lighting direction, contrast, color temperature, shadow softness, reflections, and atmosphere.",
    "composition": "Borrow framing, camera distance, spatial layout, perspective, negative space, and subject placement.",
    "extra": "Use only the specifically described details from this reference and retain the main image as visual ground truth.",
}

FLUX_PROMPT_EXPANSION_SYSTEM = """You are a constrained prompt compiler for FLUX.2 Klein image generation and editing.
Return only one concise natural-language image prompt of 45 to 90 words.
Preserve every factual requirement, exact quotation, number, relationship, target, and requested change from the user's input.
Resolve shorthand, spelling mistakes, and informal grammar by intended meaning without changing the intent.
Put the most important subject or requested change first. Add only visual details that follow from the request or can be matched from a supplied source image.
For edits, describe the smallest coherent change and preserve unrequested composition, identity, geometry, branding, typography, lighting, materials, colors, and background.
Never invent additional subjects, objects, logos, wording, styles, camera models, or lenses.
Never add generic quality phrases such as masterpiece, best quality, 8K, stunning, cinematic, or ultra-detailed unless the user explicitly requested that exact treatment.
Use concrete positive visual language instead of a negative-prompt list."""

PROMPT_SIGNAL_TERMS = {
    "remove": ("remove", "erase", "delete", "without", "entferne", "entfernen", "lösche", "loesche", "wegmachen"),
    "replace": ("replace", "swap", "instead of", "change", "change into", "turn into", "ersetze", "ersetzen", "aendern", "ändern", "anstatt", "stattdessen"),
    "add": ("add", "insert", "include", "place", "put ", "füge", "fuege", "hinzufügen", "hinzufuegen", "ergänze", "ergaenze"),
    "camera": ("camera", "view", "angle", "framing", "perspective", "lens", "shot", "kamera", "ansicht", "blickwinkel", "perspektive"),
    "geometry": ("round", "rounded", "corner", "curve", "shape", "geometry", "silhouette", "proportion", "larger", "smaller", "rund", "ecke", "kante", "kurve", "form", "geometrie", "größer", "groesser", "kleiner"),
    "typography": ("text", "word", "letter", "font", "typeface", "typography", "logo", "signage", "schrift", "wort", "buchstabe", "typografie", "beschriftung"),
    "color": ("color", "colour", "palette", "hue", "saturation", "contrast", "hex", "red", "blue", "green", "yellow", "orange", "purple", "pink", "black", "white", "gray", "grey", "cyan", "magenta", "teal", "gold", "silver", "farbe", "farbton", "sättigung", "saettigung", "kontrast", "rot", "blau", "grün", "gruen", "gelb", "lila", "rosa", "schwarz", "weiß", "weiss", "grau", "golden", "silber"),
    "lighting": ("light", "lighting", "shadow", "reflection", "exposure", "glow", "bright", "dark", "licht", "beleuchtung", "schatten", "reflexion", "belichtung", "hell", "dunkel"),
    "material": ("material", "texture", "surface", "finish", "fabric", "metal", "glass", "wood", "plastic", "textur", "oberfläche", "oberflaeche", "stoff", "metall", "glas", "holz", "kunststoff"),
    "identity": ("person", "face", "character", "identity", "expression", "pose", "outfit", "mensch", "gesicht", "figur", "identität", "identitaet", "ausdruck", "kleidung"),
    "style": ("style", "mood", "aesthetic", "render", "photo", "illustration", "design", "stil", "stimmung", "ästhetik", "aesthetik", "foto", "zeichnung"),
}

PROMPT_EXPANSION_LOCK = threading.RLock()
PROMPT_EXPANSION_CACHE = {}

OPENAPI_CACHE = None
NATIVE_GROUP_ORDER = [
    "core",
    "workflows",
    "style_presets",
    "image",
    "upscale",
    "control",
    "canvas_masks",
    "generation",
    "model",
    "conditioning",
    "utility",
    "assets",
    "advanced",
]
NATIVE_GROUP_TITLES = {
    "core": "Core actions",
    "workflows": "Workflow library",
    "style_presets": "Style presets",
    "image": "Image operations",
    "upscale": "Upscale",
    "control": "Control & preprocessors",
    "canvas_masks": "Canvas & masks",
    "generation": "Generation graph",
    "model": "Models, LoRAs & adapters",
    "conditioning": "Conditioning",
    "utility": "Utilities",
    "assets": "Assets & library",
    "advanced": "Advanced Invoke nodes",
}
NATIVE_DIRECT_EXCLUDES = {
    "id",
    "type",
    "image",
    "board",
    "metadata",
    "is_intermediate",
    "use_cache",
}

WAN_TI2V_SOURCES = (
    "https://huggingface.co/QuantStack/Wan2.2-TI2V-5B-GGUF/resolve/main/Wan2.2-TI2V-5B-Q4_K_M.gguf",
    "Wan-AI/Wan2.2-TI2V-5B-Diffusers::vae/diffusion_pytorch_model.safetensors",
    "Wan-AI/Wan2.2-T2V-A14B-Diffusers::text_encoder+tokenizer",
)


def utc_now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def workspace_path(workspace_id):
    workspace_id = str(workspace_id or "")
    if not WORKSPACE_ID_PATTERN.fullmatch(workspace_id):
        raise ValueError("Invalid workspace id.")
    return WORKSPACES_DIR / f"{workspace_id}.json"


def clean_workspace_name(value):
    name = " ".join(str(value or "Untitled workspace").split()).strip()
    return (name or "Untitled workspace")[:80]


def read_workspace(workspace_id):
    path = workspace_path(workspace_id)
    if not path.exists():
        raise FileNotFoundError("Workspace not found.")
    with WORKSPACE_LOCK:
        return json.loads(path.read_text(encoding="utf-8"))


def write_workspace(workspace_id, payload, create=False):
    WORKSPACES_DIR.mkdir(parents=True, exist_ok=True)
    path = workspace_path(workspace_id)
    now = utc_now()
    existing = None
    if path.exists():
        existing = read_workspace(workspace_id)
    elif not create:
        raise FileNotFoundError("Workspace not found.")
    state = payload.get("state") if isinstance(payload, dict) else None
    if not isinstance(state, dict):
        state = existing.get("state", {}) if existing else {}
    document = {
        "id": workspace_id,
        "name": clean_workspace_name(payload.get("name") if isinstance(payload, dict) else None),
        "created_at": existing.get("created_at", now) if existing else now,
        "updated_at": now,
        "state": state,
    }
    temp_path = path.with_suffix(".json.tmp")
    encoded = json.dumps(document, ensure_ascii=False, separators=(",", ":"))
    with WORKSPACE_LOCK:
        temp_path.write_text(encoded, encoding="utf-8")
        os.replace(temp_path, path)
    return document


def list_workspaces():
    WORKSPACES_DIR.mkdir(parents=True, exist_ok=True)
    items = []
    with WORKSPACE_LOCK:
        paths = list(WORKSPACES_DIR.glob("*.json"))
    for path in paths:
        try:
            document = json.loads(path.read_text(encoding="utf-8"))
            items.append({
                "id": document.get("id") or path.stem,
                "name": clean_workspace_name(document.get("name")),
                "created_at": document.get("created_at"),
                "updated_at": document.get("updated_at"),
            })
        except Exception:
            continue
    items.sort(key=lambda item: item.get("updated_at") or "", reverse=True)
    return items


def invoke_json(path, method="GET", payload=None, timeout=30):
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(INVOKE_URL + path, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as response:
        body = response.read()
        if not body:
            return None
        return json.loads(body.decode("utf-8"))


def clear_invoke_model_cache_best_effort():
    try:
        invoke_json("/api/v2/models/empty_model_cache", method="POST", timeout=60)
        return True
    except Exception:
        return False


def invoke_error_message(error):
    if isinstance(error, urllib.error.HTTPError):
        detail = ""
        try:
            payload = json.loads((error.read() or b"").decode("utf-8") or "{}")
            if isinstance(payload, dict):
                detail = str(payload.get("detail") or payload.get("message") or "").strip()
        except Exception:
            detail = ""
        if detail:
            return f"InvokeAI rejected the request ({error.code}): {detail}"
        return f"InvokeAI rejected the request ({error.code})."
    if isinstance(error, urllib.error.URLError):
        return "InvokeAI is offline. Start InvokeAI to load models, upload images, or render."
    return str(error)


def invoke_error_status(error):
    if isinstance(error, urllib.error.HTTPError):
        if error.code in (400, 404, 409, 422):
            return error.code
        return 502
    return 503 if isinstance(error, urllib.error.URLError) else 500


def load_openapi():
    global OPENAPI_CACHE
    if OPENAPI_CACHE is None:
        OPENAPI_CACHE = invoke_json("/openapi.json", timeout=15)
    return OPENAPI_CACHE


def humanize_identifier(value):
    value = str(value or "")
    if value.endswith("Invocation"):
        value = value[:-10]
    text = []
    previous = ""
    for char in value.replace("_", " ").replace("-", " "):
        if previous and char.isupper() and (previous.islower() or previous.isdigit()):
            text.append(" ")
        text.append(char)
        previous = char
    return " ".join("".join(text).split()).strip() or value


def native_group_for_schema(name, schema):
    category = str(schema.get("category") or "").lower()
    tags = " ".join(schema.get("tags") or []).lower()
    combined = f"{name} {category} {tags}".lower()
    if "workflow" in combined:
        return "workflows"
    if "upscale" in combined or "esrgan" in combined:
        return "upscale"
    if "controlnet" in combined or "preprocessor" in combined or "edge" in combined or "depth" in combined or "pose" in combined:
        return "control"
    if "canvas" in combined or "mask" in combined or "inpaint" in combined or "infill" in combined or "crop" in combined:
        return "canvas_masks"
    if "model" in combined or "lora" in combined or "adapter" in combined or "loader" in combined:
        return "model"
    if "conditioning" in combined or "latents" in combined:
        return "conditioning"
    if "denoise" in combined or "flux" in combined or "qwen" in combined or "generate" in combined:
        return "generation"
    if category == "image" or "image" in combined:
        return "image"
    if category in {"math", "collection", "collections", "prompt", "utility", "utilities"}:
        return "utility"
    return "advanced"


def schema_invocation_type(schema, fallback_name):
    field = (schema.get("properties") or {}).get("type") or {}
    return field.get("const") or field.get("default") or humanize_identifier(fallback_name).lower().replace(" ", "_")


def schema_field_type(field):
    if "enum" in field:
        return "enum"
    if field.get("type"):
        return field.get("type")
    for key in ("anyOf", "oneOf", "allOf"):
        for item in field.get(key) or []:
            if item.get("type"):
                return item.get("type")
            if item.get("$ref"):
                return Path(item.get("$ref")).name
    if field.get("$ref"):
        return Path(field.get("$ref")).name
    return "value"


def is_direct_field_runnable(name, field):
    if name in NATIVE_DIRECT_EXCLUDES:
        return False
    if field.get("ui_hidden") is True:
        return False
    if field.get("field_kind") != "input":
        return False
    if field.get("input") == "connection":
        return False
    if field.get("ui_model_type") or field.get("ui_model_base"):
        return False
    return True


def direct_settings_from_schema(schema):
    settings = []
    for name, field in (schema.get("properties") or {}).items():
        if not is_direct_field_runnable(name, field):
            continue
        field_type = schema_field_type(field)
        if field_type not in {"enum", "integer", "number", "boolean", "string"}:
            continue
        value = field.get("default", field.get("orig_default", None))
        if isinstance(value, (dict, list)):
            continue
        setting = {
            "name": name,
            "label": field.get("title") or humanize_identifier(name),
            "type": field_type,
            "default": value,
            "required": field.get("orig_required") is True and value is None,
            "description": field.get("description") or "",
        }
        if field.get("enum"):
            setting["options"] = field.get("enum")
        if field.get("minimum") is not None:
            setting["min"] = field.get("minimum")
        if field.get("maximum") is not None:
            setting["max"] = field.get("maximum")
        settings.append(setting)
    return settings


def runnable_missing_fields(schema):
    missing = []
    for name, field in (schema.get("properties") or {}).items():
        if name in NATIVE_DIRECT_EXCLUDES:
            continue
        if field.get("field_kind") != "input":
            continue
        field_type = schema_field_type(field)
        scalar = field_type in {"enum", "integer", "number", "boolean", "string"}
        default = field.get("default", field.get("orig_default"))
        if field.get("input") == "connection" or field.get("ui_model_type") or field.get("ui_model_base"):
            missing.append(name)
            continue
        if not scalar and default is None:
            missing.append(name)
    return missing


def invocation_feature_from_schema(name, schema):
    props = schema.get("properties") or {}
    inv_type = schema_invocation_type(schema, name)
    output_ref = (schema.get("output") or {}).get("$ref", "")
    has_image_input = "image" in props and props["image"].get("field_kind") == "input"
    outputs_image = "ImageOutput" in output_ref
    missing = runnable_missing_fields(schema)
    runnable = has_image_input and outputs_image and not missing
    settings = direct_settings_from_schema(schema)
    group = native_group_for_schema(name, schema)
    title = schema.get("title") or humanize_identifier(name)
    return {
        "id": f"invocation:{inv_type}",
        "block_kind": f"native:invocation:{inv_type}",
        "schema": name,
        "type": inv_type,
        "title": title,
        "group": group,
        "group_title": NATIVE_GROUP_TITLES.get(group, humanize_identifier(group)),
        "description": schema.get("description") or "",
        "tags": schema.get("tags") or [],
        "category": schema.get("category") or group,
        "classification": schema.get("classification") or "",
        "node_pack": schema.get("node_pack") or "",
        "runnable": runnable,
        "action": "native_image_invocation" if runnable else "schema",
        "status": "Runnable image node" if runnable else ("Needs connected/model inputs" if missing else "Schema only"),
        "missing": missing,
        "settings": settings[:10],
        "input_count": len([p for p in props.values() if p.get("field_kind") == "input"]),
        "output": Path(output_ref).name if output_ref else "",
    }


def coerce_setting(value, setting):
    field_type = setting.get("type")
    if value in (None, ""):
        return setting.get("default")
    if field_type == "integer":
        return int(value)
    if field_type == "number":
        return float(value)
    if field_type == "boolean":
        if isinstance(value, bool):
            return value
        return str(value).lower() in {"1", "true", "yes", "on"}
    return value


def native_feature_catalog():
    openapi = load_openapi()
    schemas = openapi.get("components", {}).get("schemas", {})
    try:
        image_to_prompt_available = choose_image_to_prompt_model() is not None
    except Exception:
        image_to_prompt_available = False
    features = [
        {
            "id": "core:modify",
            "block_kind": "modify",
            "title": "Modify",
            "group": "core",
            "group_title": NATIVE_GROUP_TITLES["core"],
            "description": "Our FLUX.2 Klein image edit path with @1 main image, up to four references, queued variants, and prompt roles.",
            "runnable": True,
            "action": "simple_generate",
            "status": "Runnable",
            "tags": ["flux2", "kontext", "generate"],
        },
        {
            "id": "core:local_upscale",
            "block_kind": "native:core:local_upscale",
            "title": "AI Upscale + Download",
            "group": "core",
            "group_title": NATIVE_GROUP_TITLES["core"],
            "description": "RealESRGAN upscale queued through InvokeAI, saved to the gallery, then downloaded when ready.",
            "runnable": True,
            "action": "upscale",
            "status": "Runnable",
            "tags": ["upscale", "download"],
            "settings": [{"name": "scale", "label": "Scale", "type": "enum", "default": 2, "options": [2, 4]}],
        },
        {
            "id": "core:image_to_prompt",
            "block_kind": "native:core:image_to_prompt",
            "title": "Image to Prompt",
            "group": "core",
            "group_title": NATIVE_GROUP_TITLES["core"],
            "description": "Native InvokeAI utility endpoint for describing an image as a reusable prompt when a vision/prompt model is installed.",
            "runnable": image_to_prompt_available,
            "action": "image_to_prompt",
            "status": "Runnable" if image_to_prompt_available else "Needs local image-to-prompt model",
            "tags": ["prompt", "describe", "utility"],
        },
        {
            "id": "asset:image_gallery",
            "block_kind": "native:asset:image_gallery",
            "title": "Image Gallery",
            "group": "assets",
            "group_title": NATIVE_GROUP_TITLES["assets"],
            "description": "Load recent InvokeAI images onto the canvas, then open, upscale, or download them.",
            "runnable": True,
            "action": "image_gallery",
            "status": "Runnable",
            "tags": ["images", "gallery", "download"],
            "settings": [{"name": "limit", "label": "Recent images", "type": "enum", "default": 6, "options": [4, 6, 8, 12]}],
        },
        {
            "id": "asset:boards",
            "block_kind": "native:asset:boards",
            "title": "Boards",
            "group": "assets",
            "group_title": NATIVE_GROUP_TITLES["assets"],
            "description": "Read InvokeAI board names and image counts in the workspace.",
            "runnable": True,
            "action": "boards",
            "status": "Runnable",
            "tags": ["boards", "library"],
        },
        {
            "id": "asset:queue",
            "block_kind": "native:asset:queue",
            "title": "Queue Control",
            "group": "assets",
            "group_title": NATIVE_GROUP_TITLES["assets"],
            "description": "View InvokeAI queue status, pause or resume processing, cancel pending jobs, and prune finished records.",
            "runnable": True,
            "action": "queue_control",
            "status": "Runnable",
            "tags": ["queue", "cancel", "pause"],
            "settings": [{
                "name": "action",
                "label": "Action",
                "type": "enum",
                "default": "refresh",
                "options": [
                    {"value": "refresh", "label": "Refresh status"},
                    {"value": "pause", "label": "Pause processor"},
                    {"value": "resume", "label": "Resume processor"},
                    {"value": "cancel_pending", "label": "Cancel pending"},
                    {"value": "prune_finished", "label": "Prune finished"},
                ],
            }],
        },
        {
            "id": "model:model_manager",
            "block_kind": "native:model:model_manager",
            "title": "Model Manager",
            "group": "model",
            "group_title": NATIVE_GROUP_TITLES["model"],
            "description": "Native model install, scan, Hugging Face login, missing model resolution, cache clearing, and model metadata.",
            "runnable": False,
            "action": "open_native",
            "status": "Open in InvokeAI",
            "tags": ["models", "huggingface", "install", "cache"],
        },
        {
            "id": "model:custom_nodes",
            "block_kind": "native:model:custom_nodes",
            "title": "Custom Nodes",
            "group": "model",
            "group_title": NATIVE_GROUP_TITLES["model"],
            "description": "Native custom node pack discovery, install, and reload.",
            "runnable": False,
            "action": "open_native",
            "status": "Open in InvokeAI",
            "tags": ["custom nodes", "node packs"],
        },
    ]
    for name, schema in schemas.items():
        if schema.get("class") == "invocation" and name.endswith("Invocation"):
            features.append(invocation_feature_from_schema(name, schema))

    workflows = {"items": [], "total": 0}
    style_presets = []
    boards = {"items": [], "total": 0}
    models = {"models": []}
    custom_nodes = {}
    try:
        workflows = invoke_json("/api/v1/workflows/?page=0&per_page=50", timeout=8) or workflows
    except Exception:
        pass
    try:
        style_presets = invoke_json("/api/v1/style_presets/", timeout=8) or []
    except Exception:
        pass
    try:
        boards = invoke_json("/api/v1/boards/?offset=0&limit=50", timeout=8) or boards
    except Exception:
        pass
    try:
        models = invoke_json("/api/v2/models/?with_config=true", timeout=10) or models
    except Exception:
        pass
    try:
        custom_nodes = invoke_json("/api/v2/custom_nodes/", timeout=8) or {}
    except Exception:
        pass

    for workflow in workflows.get("items") or []:
        title = workflow.get("name") or workflow.get("workflow_id")
        features.append({
            "id": f"workflow:{workflow.get('workflow_id')}",
            "block_kind": f"native:workflow:{workflow.get('workflow_id')}",
            "title": title,
            "group": "workflows",
            "group_title": NATIVE_GROUP_TITLES["workflows"],
            "description": workflow.get("description") or "Saved native InvokeAI workflow.",
            "runnable": False,
            "action": "open_workflow",
            "status": "Open in InvokeAI",
            "tags": [tag.strip() for tag in str(workflow.get("tags") or "").split(",") if tag.strip()],
            "workflow_id": workflow.get("workflow_id"),
        })
    for preset in style_presets:
        features.append({
            "id": f"style:{preset.get('id')}",
            "block_kind": f"native:style:{preset.get('id')}",
            "title": preset.get("name") or "Style preset",
            "group": "style_presets",
            "group_title": NATIVE_GROUP_TITLES["style_presets"],
            "description": "Native InvokeAI style preset; use it as prompt guidance in this node UI.",
            "runnable": True,
            "action": "style_preset",
            "status": "Runnable prompt preset",
            "tags": ["style", "preset"],
            "preset": preset.get("preset_data") or {},
        })

    counts_by_group = {}
    for feature in features:
        counts_by_group[feature["group"]] = counts_by_group.get(feature["group"], 0) + 1
    groups = [
        {"id": group, "title": NATIVE_GROUP_TITLES.get(group, humanize_identifier(group)), "count": counts_by_group[group]}
        for group in NATIVE_GROUP_ORDER
        if counts_by_group.get(group)
    ]
    leftovers = sorted(set(counts_by_group) - set(NATIVE_GROUP_ORDER))
    groups.extend({"id": group, "title": humanize_identifier(group), "count": counts_by_group[group]} for group in leftovers)
    model_counts = {}
    for model in models.get("models") or []:
        model_type = model.get("type") or "unknown"
        model_counts[model_type] = model_counts.get(model_type, 0) + 1
    return {
        "ok": True,
        "invoke_version": invoke_json("/api/v1/app/version", timeout=3),
        "groups": groups,
        "features": features,
        "installed": {
            "models": model_counts,
            "workflows": workflows.get("total", len(workflows.get("items") or [])),
            "style_presets": len(style_presets),
            "boards": boards.get("total", len(boards.get("items") or [])) if isinstance(boards, dict) else len(boards),
            "custom_node_packs": len(custom_nodes.get("node_packs") or []),
        },
    }


def find_native_invocation_feature(feature_id):
    if not feature_id.startswith("invocation:"):
        return None
    wanted_type = feature_id.split(":", 1)[1]
    for name, schema in load_openapi().get("components", {}).get("schemas", {}).items():
        if schema.get("class") == "invocation" and schema_invocation_type(schema, name) == wanted_type:
            return invocation_feature_from_schema(name, schema), schema
    return None


def invoke_raw(path, method="GET", body=None, headers=None, timeout=30):
    req = urllib.request.Request(INVOKE_URL + path, data=body, headers=headers or {}, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return response.status, response.read(), response.headers.get("Content-Type", "application/octet-stream")


def normalize_image_payload(payload):
    image_name = payload.get("image_name")
    if image_name:
        safe_name = quote(image_name)
        image_url = str(payload.get("image_url") or "")
        thumbnail_url = str(payload.get("thumbnail_url") or "")
        payload["image_url"] = image_url if image_url.startswith(("http://", "https://")) else f"{INVOKE_URL}/api/v1/images/i/{safe_name}/full"
        payload["thumbnail_url"] = thumbnail_url if thumbnail_url.startswith(("http://", "https://")) else f"{INVOKE_URL}/api/v1/images/i/{safe_name}/thumbnail"
    return payload


def normalize_video_payload(payload):
    video_name = payload.get("video_name")
    if video_name:
        safe_name = quote(video_name)
        payload["media_type"] = "video"
        payload["video_url"] = f"{INVOKE_URL}/api/v1/videos/i/{safe_name}/full"
        payload["thumbnail_url"] = f"{INVOKE_URL}/api/v1/videos/i/{safe_name}/thumbnail"
    return payload


def upload_image_bytes(file_bytes, filename, content_type="image/png", is_intermediate=False):
    filename = Path(filename or "image.png").name.replace('"', "")
    boundary = f"----InvokeSimpleModeBoundary{random.randint(100000, 999999)}"
    body = []
    body.append(f"--{boundary}\r\n".encode("utf-8"))
    body.append(f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'.encode("utf-8"))
    body.append(f"Content-Type: {content_type}\r\n\r\n".encode("utf-8"))
    body.append(file_bytes)
    body.append(f"\r\n--{boundary}--\r\n".encode("utf-8"))
    status, response, _ = invoke_raw(
        f"/api/v1/images/upload?image_category=user&is_intermediate={'true' if is_intermediate else 'false'}",
        method="POST",
        body=b"".join(body),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        timeout=90,
    )
    return status, normalize_image_payload(json.loads(response.decode("utf-8")))


def _image_resample():
    return Image.Resampling.LANCZOS if hasattr(Image, "Resampling") else Image.LANCZOS


def _atlas_font(size, bold=False):
    if ImageFont is None:
        return None
    candidates = (
        ("C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf"),
        ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    )
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size=size)
        except Exception:
            continue
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def _source_location_filter(candidates, instruction):
    text = str(instruction or "").casefold()
    location = None
    for key, terms in {
        "left": ("left", "linke", "links"),
        "right": ("right", "rechte", "rechts"),
        "top": ("top", "upper", "oben", "obere"),
        "bottom": ("bottom", "lower", "unten", "untere"),
        "center": ("center", "centre", "middle", "mitte", "mittlere"),
    }.items():
        if any(term in text for term in terms):
            location = key
            break
    if not location:
        return candidates

    def matches(candidate):
        x, y = candidate["center"]
        if location == "left":
            return x <= 0.58
        if location == "right":
            return x >= 0.42
        if location == "top":
            return y <= 0.58
        if location == "bottom":
            return y >= 0.42
        return 0.24 <= x <= 0.76 and 0.24 <= y <= 0.76

    filtered = [candidate for candidate in candidates if matches(candidate)]
    return filtered if len(filtered) >= 3 else candidates


def source_region_samples(source, target="material", sample="hierarchy", instruction=""):
    """Select diverse, representative source crops without synthesizing pixels."""
    if Image is None or ImageStat is None:
        raise RuntimeError("Pillow is required for contextual extraction.")
    source = ImageOps.exif_transpose(source).convert("RGB")
    width, height = source.size
    requested = {
        "dominant": 4,
        "hierarchy": 6,
        "detailed": 8,
    }.get(str(sample), 6)
    crop_fraction = 0.20 if target == "material" else 0.34
    crop_side = max(48, min(width, height, int(min(width, height) * crop_fraction)))
    x_steps = 7
    y_steps = 5
    candidates = []
    for row in range(y_steps):
        center_y = int(height * (0.09 + (0.82 * row / max(1, y_steps - 1))))
        for column in range(x_steps):
            center_x = int(width * (0.07 + (0.86 * column / max(1, x_steps - 1))))
            left = max(0, min(width - crop_side, center_x - crop_side // 2))
            top = max(0, min(height - crop_side, center_y - crop_side // 2))
            box = (left, top, left + crop_side, top + crop_side)
            patch = source.crop(box).resize((28, 28), _image_resample())
            statistics = ImageStat.Stat(patch)
            mean = statistics.mean[:3]
            variance = statistics.var[:3]
            texture = sum(variance) / (3 * 255 * 255)
            feature = tuple(value / 255 for value in mean) + (min(1.0, texture * 8),)
            candidates.append({
                "box": box,
                "center": (center_x / max(1, width), center_y / max(1, height)),
                "feature": feature,
                "texture": texture,
            })
    candidates = _source_location_filter(candidates, instruction)

    def distance(first, second):
        return sum((a - b) ** 2 for a, b in zip(first, second))

    cluster_count = min(requested, len(candidates))
    overall = tuple(sum(item["feature"][i] for item in candidates) / len(candidates) for i in range(4))
    first = min(candidates, key=lambda item: distance(item["feature"], overall))
    centroids = [first["feature"]]
    while len(centroids) < cluster_count:
        candidate = max(candidates, key=lambda item: min(distance(item["feature"], center) for center in centroids))
        centroids.append(candidate["feature"])

    clusters = []
    for _ in range(8):
        clusters = [[] for _ in centroids]
        for candidate in candidates:
            index = min(range(len(centroids)), key=lambda i: distance(candidate["feature"], centroids[i]))
            clusters[index].append(candidate)
        centroids = [
            tuple(sum(item["feature"][axis] for item in cluster) / len(cluster) for axis in range(4))
            if cluster else centroids[index]
            for index, cluster in enumerate(clusters)
        ]

    representatives = []
    for index, cluster in enumerate(clusters):
        if not cluster:
            continue
        representative = min(cluster, key=lambda item: distance(item["feature"], centroids[index]))
        representatives.append((len(cluster), representative["texture"], representative))
    if sample == "detailed":
        representatives.sort(key=lambda item: (item[1], item[0]), reverse=True)
    else:
        representatives.sort(key=lambda item: (item[0], item[1]), reverse=True)
    return [item[2] for item in representatives[:requested]]


def _draw_source_preview(board, draw, source, frame, samples=None):
    x, y, width, height = frame
    draw.rounded_rectangle((x, y, x + width, y + height), radius=12, fill=(37, 39, 43), outline=(74, 77, 84), width=2)
    preview = ImageOps.contain(source, (width - 24, height - 24), _image_resample())
    preview_x = x + (width - preview.width) // 2
    preview_y = y + (height - preview.height) // 2
    board.paste(preview, (preview_x, preview_y))
    if not samples:
        return
    scale_x = preview.width / max(1, source.width)
    scale_y = preview.height / max(1, source.height)
    colors = ((206, 255, 21), (98, 207, 255), (255, 126, 92), (175, 130, 255), (255, 203, 71), (82, 225, 167), (255, 110, 190), (184, 196, 211))
    label_font = _atlas_font(18, bold=True)
    for index, sample in enumerate(samples):
        left, top, right, bottom = sample["box"]
        mapped = (
            preview_x + int(left * scale_x),
            preview_y + int(top * scale_y),
            preview_x + int(right * scale_x),
            preview_y + int(bottom * scale_y),
        )
        color = colors[index % len(colors)]
        draw.rectangle(mapped, outline=color, width=4)
        draw.rounded_rectangle((mapped[0] + 5, mapped[1] + 5, mapped[0] + 47, mapped[1] + 33), radius=6, fill=color)
        draw.text((mapped[0] + 14, mapped[1] + 8), f"{index + 1}", fill=(12, 13, 15), font=label_font)


def build_region_reference_atlas(source, target="material", sample="hierarchy", instruction=""):
    source = ImageOps.exif_transpose(source).convert("RGB")
    samples = source_region_samples(source, target=target, sample=sample, instruction=instruction)
    board = Image.new("RGB", (1400, 900), (16, 17, 20))
    draw = ImageDraw.Draw(board)
    title_font = _atlas_font(34, bold=True)
    body_font = _atlas_font(20)
    label_font = _atlas_font(20, bold=True)
    title = "MATERIALS FROM SOURCE" if target == "material" else "PARTS FROM SOURCE"
    draw.text((40, 32), title, fill=(244, 245, 247), font=title_font)
    draw.text((40, 76), "Exact source regions, ordered by visual importance", fill=(161, 166, 176), font=body_font)
    _draw_source_preview(board, draw, source, (40, 122, 500, 730), samples)

    columns = 3
    gap = 18
    start_x = 580
    start_y = 122
    cell_width = 247
    cell_height = 229
    for index, selected in enumerate(samples):
        column = index % columns
        row = index // columns
        x = start_x + column * (cell_width + gap)
        y = start_y + row * (cell_height + gap)
        draw.rounded_rectangle((x, y, x + cell_width, y + cell_height), radius=10, fill=(37, 39, 43), outline=(67, 70, 77), width=2)
        crop = source.crop(selected["box"])
        crop = ImageOps.fit(crop, (cell_width - 20, cell_height - 54), _image_resample())
        board.paste(crop, (x + 10, y + 10))
        prefix = "M" if target == "material" else "P"
        draw.text((x + 12, y + cell_height - 35), f"{prefix}{index + 1}  SOURCE REGION", fill=(225, 228, 234), font=label_font)
    return board, {"target": target, "sample": sample, "source_derived": True, "sample_count": len(samples)}


def build_color_reference_atlas(source, sample="hierarchy"):
    source = ImageOps.exif_transpose(source).convert("RGB")
    color_count = {"dominant": 5, "hierarchy": 7, "detailed": 10}.get(str(sample), 7)
    reduced = source.copy()
    reduced.thumbnail((320, 320), _image_resample())
    quantized = reduced.quantize(colors=color_count, method=Image.Quantize.MEDIANCUT)
    palette = quantized.getpalette()
    total = max(1, reduced.width * reduced.height)
    colors = []
    for count, palette_index in sorted(quantized.getcolors() or [], reverse=True):
        offset = palette_index * 3
        rgb = tuple(palette[offset:offset + 3])
        colors.append({"rgb": rgb, "hex": "#%02X%02X%02X" % rgb, "percent": round(count * 100 / total, 1)})

    board = Image.new("RGB", (1400, 820), (16, 17, 20))
    draw = ImageDraw.Draw(board)
    title_font = _atlas_font(34, bold=True)
    body_font = _atlas_font(20)
    value_font = _atlas_font(22, bold=True)
    draw.text((40, 32), "COLORS FROM SOURCE", fill=(244, 245, 247), font=title_font)
    draw.text((40, 76), "Measured source palette, ordered by pixel coverage", fill=(161, 166, 176), font=body_font)
    _draw_source_preview(board, draw, source, (40, 122, 500, 650))
    columns = 2
    gap = 18
    start_x = 580
    start_y = 122
    cell_width = 372
    cell_height = 112
    for index, color in enumerate(colors):
        column = index % columns
        row = index // columns
        x = start_x + column * (cell_width + gap)
        y = start_y + row * (cell_height + gap)
        draw.rounded_rectangle((x, y, x + cell_width, y + cell_height), radius=10, fill=(37, 39, 43), outline=(67, 70, 77), width=2)
        draw.rounded_rectangle((x + 10, y + 10, x + 118, y + cell_height - 10), radius=7, fill=color["rgb"])
        draw.text((x + 138, y + 22), color["hex"], fill=(235, 237, 241), font=value_font)
        draw.text((x + 138, y + 61), f'{color["percent"]}% of source', fill=(161, 166, 176), font=body_font)
    return board, {"target": "color", "sample": sample, "source_derived": True, "palette": colors}


def build_extract_reference(source, target="material", sample="hierarchy", instruction=""):
    target = str(target or "material").lower()
    sample = str(sample or "hierarchy").lower()
    if target == "color":
        return build_color_reference_atlas(source, sample=sample)
    if target not in {"material", "parts"}:
        raise ValueError("Unknown extraction target.")
    return build_region_reference_atlas(source, target=target, sample=sample, instruction=instruction)


MATERIAL_TYPE_RULES = (
    ("LED display panel", ("led display", "display panel", "digital screen", "video wall", "screen")),
    ("Polished concrete", ("polished concrete", "concrete")),
    ("Painted steel", ("painted steel", "steel", "metal frame", "metallic", "metal")),
    ("Architectural glass", ("frosted glass", "translucent glass", "glass")),
    ("Natural wood", ("timber", "wooden", "wood")),
    ("Fabric textile", ("upholstery", "textile", "fabric", "cloth")),
    ("Molded plastic", ("polymer", "plastic")),
    ("Stone", ("marble", "granite", "limestone", "stone")),
    ("Ceramic", ("porcelain", "ceramic", "tile")),
    ("Leather", ("leather",)),
    ("Rubber", ("rubber",)),
)

MATERIAL_MACRO_DETAILS = {
    "LED display panel": "A true macro view resolves the repeating LED pixel matrix, dark module substrate, fine panel seams, protective face finish, and controlled specular reflections.",
    "Polished concrete": "A true macro view shows fine mineral aggregate, subtle tonal mottling, shallow pores, polishing variation, and soft broad reflections rather than a perfectly uniform gray surface.",
    "Painted steel": "A true macro view shows the coating texture over rigid metal, crisp fabricated edges, welded or bolted joins where present, minor orange-peel roughness, and narrow specular highlights.",
    "Architectural glass": "A true macro view shows a smooth continuous face, edge tint or internal diffusion when visible, faint surface reflections, and any frosting or printed treatment as a separate fine layer.",
    "Natural wood": "A true macro view resolves directional grain, pores, fibers, finish buildup, small color variation, and wear that follows the grain rather than random noise.",
    "Fabric textile": "A true macro view resolves individual yarns, weave direction, fiber softness, pile or knit structure, and small compression or wear changes.",
    "Molded plastic": "A true macro view shows a consistent polymer surface with fine molding texture, controlled gloss, subtle flow or tooling marks, and softened manufactured edges.",
    "Stone": "A true macro view resolves mineral grains, veins or inclusions, pores, cut or honed finish, and irregular natural variation at the correct scale.",
    "Ceramic": "A true macro view shows the fired glaze or matte body, fine surface variation, crisp joints, and localized reflections that follow the finish.",
    "Leather": "A true macro view resolves grain, pores, wrinkles, finish variation, stitching or edge treatment, and wear concentrated along contact areas.",
    "Rubber": "A true macro view shows a fine molded or matte texture, low broad reflectivity, compression marks, and subtle edge wear.",
}

MATERIAL_LOCATION_RULES = (
    ("Floor", ("floor", "floors", "ground")),
    ("Ceiling", ("ceiling", "ceilings", "roof", "roofs")),
    ("Structural frame", ("structural frame", "structural frames", "frame", "frames", "beam", "beams", "truss", "trusses", "column", "columns")),
    ("Display wall", ("display wall", "display walls", "display-panel", "display panel", "display panels", "led display", "led displays", "screen", "screens", "video wall", "video walls")),
    ("Wall", ("wall", "walls", "facade", "facades")),
    ("Window", ("window", "windows", "glazing")),
    ("Furniture", ("chair", "chairs", "table", "tables", "desk", "desks", "sofa", "sofas", "furniture")),
    ("Subject surface", ("clothing", "outfit", "shoe", "skin")),
)


def _first_matching_label(text, rules, default):
    lowered = str(text or "").casefold()
    for label, terms in rules:
        if any(re.search(rf"(?<!\w){re.escape(term)}(?!\w)", lowered) for term in terms):
            return label
    return default


def material_profiles_from_analysis(analysis, limit=4):
    text = " ".join(str(analysis or "").replace("\r", "\n").split())
    if not text:
        return []
    sentences = [item.strip() for item in re.split(r"(?<=[.!?])\s+", text) if item.strip()]
    groups = []
    current = None
    for sentence in sentences:
        location = _first_matching_label(sentence, MATERIAL_LOCATION_RULES, "")
        if location and (current is None or location != current["location"]):
            current = {"location": location, "sentences": [sentence]}
            groups.append(current)
        elif current is not None:
            current["sentences"].append(sentence)
        elif not groups:
            current = {"location": "Visible surface", "sentences": [sentence]}
            groups.append(current)

    profiles = []
    seen = set()
    for group in groups:
        description = " ".join(group["sentences"])
        material_type = _first_matching_label(description, MATERIAL_TYPE_RULES, f'{group["location"]} finish')
        key = (group["location"], material_type)
        if key in seen:
            continue
        seen.add(key)
        description = re.sub(r"\b(high-quality|easy to clean|easy cleaning and maintenance)\b", "", description, flags=re.IGNORECASE)
        description = re.sub(r"\s+", " ", description).strip()
        if len(description) > 360:
            description = description[:357].rsplit(" ", 1)[0] + "..."
        profiles.append({
            "name": material_type,
            "location": group["location"],
            "observed": description,
            "close_up": MATERIAL_MACRO_DETAILS.get(
                material_type,
                "A true macro view should preserve the observed color, microtexture, roughness, reflectivity, seams, fabrication marks, and wear at physically plausible scale.",
            ),
            "confidence": "Vision inferred from the connected source",
        })
        if len(profiles) >= max(1, min(4, int(limit or 4))):
            break
    return profiles


def material_analysis_instruction(user_instruction=""):
    focus = str(user_instruction or "").strip()
    focus_line = f" Give priority to this requested scope: {focus}." if focus else ""
    return (
        "Describe the four main physical surface systems in this image for a professional material study. "
        "Include large scene-defining floor, ceiling, structural, wall, display-panel, furniture, or object surfaces that are visibly present. "
        "Treat an LED display as a physical LED panel surface, but ignore all words, logos, people, pictures, screen graphics, and lighting effects. "
        "Write one concise paragraph per material. Start each paragraph with its visible location and most likely common physical material type. "
        "Describe only observed base color, close-up microtexture, pattern scale, roughness, gloss or reflectivity, seams or joints, fabrication, and wear. "
        "If exact composition cannot be confirmed visually, say visually inferred instead of inventing certainty."
        + focus_line
    )


def analyze_materials_with_vision(image_name, user_instruction="", limit=4):
    model = choose_image_to_prompt_model()
    if not model:
        raise RuntimeError("Install an InvokeAI image-to-prompt vision model to analyze material types.")
    ensure_generation_queue_idle()
    try:
        response = invoke_json(
            "/api/v1/utilities/image-to-prompt",
            method="POST",
            payload={
                "image_name": Path(image_name).name,
                "model_key": model["key"],
                "instruction": material_analysis_instruction(user_instruction),
            },
            timeout=180,
        ) or {}
    finally:
        cache_cleared = clear_invoke_model_cache_best_effort()
    analysis = str(response.get("prompt") or response.get("text") or "").strip()
    profiles = material_profiles_from_analysis(analysis, limit=limit)
    if not profiles:
        raise RuntimeError("The local vision model could not identify usable material surfaces in this image.")
    return profiles, analysis, {
        "key": model["key"],
        "name": model.get("name"),
        "cache_policy": "unload_after_analysis",
        "cache_cleared": cache_cleared,
    }


def _wrapped_lines(text, width, max_lines):
    lines = textwrap.wrap(str(text or ""), width=max(12, int(width)), break_long_words=False, break_on_hyphens=False)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        lines[-1] = lines[-1].rstrip(" .") + "..."
    return lines


def build_material_study_report(macro_board, source, materials):
    macro_board = ImageOps.exif_transpose(macro_board).convert("RGB")
    source = ImageOps.exif_transpose(source).convert("RGB")
    materials = list(materials or [])[:4]
    board = Image.new("RGB", (1800, 1200), (16, 17, 20))
    draw = ImageDraw.Draw(board)
    title_font = _atlas_font(38, bold=True)
    subtitle_font = _atlas_font(19)
    panel_title_font = _atlas_font(25, bold=True)
    label_font = _atlas_font(15, bold=True)
    body_font = _atlas_font(17)
    draw.text((40, 28), "MATERIAL STUDY", fill=(244, 245, 247), font=title_font)
    draw.text((40, 78), "Vision-inferred material types with generated macro reconstruction", fill=(161, 166, 176), font=subtitle_font)
    source_thumb = ImageOps.contain(source, (270, 82), _image_resample())
    board.paste(source_thumb, (1490 + (270 - source_thumb.width) // 2, 22 + (82 - source_thumb.height) // 2))
    draw.rounded_rectangle((1480, 12, 1770, 114), radius=10, outline=(67, 70, 77), width=2)

    half_width = macro_board.width // 2
    half_height = macro_board.height // 2
    quadrants = (
        (0, 0, half_width, half_height),
        (half_width, 0, macro_board.width, half_height),
        (0, half_height, half_width, macro_board.height),
        (half_width, half_height, macro_board.width, macro_board.height),
    )
    panel_positions = ((40, 138), (920, 138), (40, 664), (920, 664))
    for index, material in enumerate(materials):
        x, y = panel_positions[index]
        panel_width, panel_height = 840, 496
        draw.rounded_rectangle((x, y, x + panel_width, y + panel_height), radius=12, fill=(35, 37, 41), outline=(69, 72, 79), width=2)
        macro = macro_board.crop(quadrants[index])
        macro = ImageOps.fit(macro, (350, 464), _image_resample())
        board.paste(macro, (x + 16, y + 16))
        text_x = x + 390
        cursor_y = y + 18
        title = f'{index + 1}. {material.get("name") or "Material"}'
        for line in _wrapped_lines(title, 30, 2):
            draw.text((text_x, cursor_y), line, fill=(242, 244, 247), font=panel_title_font)
            cursor_y += 31
        cursor_y += 6
        draw.text((text_x, cursor_y), "LOCATION", fill=(151, 156, 167), font=label_font)
        cursor_y += 22
        draw.text((text_x, cursor_y), str(material.get("location") or "Visible surface"), fill=(217, 220, 226), font=body_font)
        cursor_y += 31
        draw.text((text_x, cursor_y), "OBSERVED", fill=(151, 156, 167), font=label_font)
        cursor_y += 22
        for line in _wrapped_lines(material.get("observed"), 48, 6):
            draw.text((text_x, cursor_y), line, fill=(207, 210, 217), font=body_font)
            cursor_y += 22
        cursor_y += 8
        draw.text((text_x, cursor_y), "TRUE CLOSE-UP", fill=(151, 156, 167), font=label_font)
        cursor_y += 22
        for line in _wrapped_lines(material.get("close_up"), 48, 6):
            draw.text((text_x, cursor_y), line, fill=(207, 210, 217), font=body_font)
            cursor_y += 22
    return board


def model_field(model):
    return {
        "key": model["key"],
        "hash": model["hash"],
        "name": model["name"],
        "base": model["base"],
        "type": model["type"],
        "submodel_type": None,
    }


def flux2_klein_models(models):
    compatible = [
        model for model in models
        if model.get("base") == "flux2"
        and model.get("type") == "main"
        and model.get("variant") in {"klein_9b", "klein_4b"}
    ]
    return sorted(compatible, key=lambda model: model.get("variant") != "klein_9b")


def image_model_catalog():
    models = invoke_json("/api/v2/models/?with_config=true", timeout=15).get("models") or []
    compatible = flux2_klein_models(models)
    has_vae = any(model.get("type") == "vae" and model.get("base") == "flux2" for model in models)
    items = []
    for model in compatible:
        encoder_variant = "qwen3_8b" if model.get("variant") == "klein_9b" else "qwen3_4b"
        has_encoder = any(
            candidate.get("type") == "qwen3_encoder" and candidate.get("variant") == encoder_variant
            for candidate in models
        )
        if not has_vae or not has_encoder:
            continue
        size = "9B" if model.get("variant") == "klein_9b" else "4B"
        quant_match = re.search(r"(Q\d+(?:_[A-Z0-9]+)*)", str(model.get("name") or ""), re.IGNORECASE)
        quant = f" ({quant_match.group(1).replace('_', ' ')})" if quant_match else ""
        items.append({
            "key": model.get("key"),
            "name": model.get("name"),
            "label": f"FLUX.2 Klein {size}{quant}",
            "variant": model.get("variant"),
        })
    return {"models": items, "default_key": items[0]["key"] if items else None}


def choose_models(model_key=None):
    models = invoke_json("/api/v2/models/?with_config=true", timeout=15).get("models") or []
    compatible = flux2_klein_models(models)
    if model_key:
        main = next((model for model in compatible if model.get("key") == model_key), None)
        if main is None:
            raise RuntimeError("The selected FLUX.2 Klein model is not installed.")
    else:
        main = compatible[0] if compatible else None
    if main is None:
        raise RuntimeError("No FLUX.2 Klein main model is installed.")

    if main.get("variant") == "klein_9b":
        qwen = next((m for m in models if m.get("type") == "qwen3_encoder" and m.get("variant") == "qwen3_8b"), None)
    else:
        qwen = next((m for m in models if m.get("type") == "qwen3_encoder" and m.get("variant") == "qwen3_4b"), None)
    if qwen is None:
        raise RuntimeError("No compatible Qwen3 encoder is installed.")

    vae = next((m for m in models if m.get("type") == "vae" and m.get("base") == "flux2"), None)
    if vae is None:
        raise RuntimeError("No FLUX.2 VAE is installed.")

    return main, qwen, vae


def choose_wan_models(required=True):
    models = invoke_json("/api/v2/models/?with_config=true", timeout=15).get("models") or []
    mains = [
        model for model in models
        if model.get("base") == "wan" and model.get("type") == "main" and model.get("variant") == "ti2v_5b"
    ]
    main = next((model for model in mains if "Q4_K_M" in str(model.get("name") or "")), None)
    main = main or next((model for model in mains if "Q8_0" in str(model.get("name") or "")), None)
    main = main or (mains[0] if mains else None)
    vae = next(
        (
            model for model in models
            if model.get("base") == "wan"
            and model.get("type") == "vae"
            and "TI2V-5B" in str(model.get("name") or "")
        ),
        None,
    )
    vae = vae or next(
        (model for model in models if model.get("base") == "wan" and model.get("type") == "vae"),
        None,
    )
    t5 = next((model for model in models if model.get("type") == "wan_t5_encoder"), None)
    if required and not all((main, vae, t5)):
        missing = []
        if not main:
            missing.append("Wan 2.2 TI2V-5B Q4")
        if not vae:
            missing.append("Wan TI2V VAE")
        if not t5:
            missing.append("Wan T5 encoder")
        raise RuntimeError(f"Video setup is incomplete: {', '.join(missing)}. Use Set up video in the Video node first.")
    return main, vae, t5


def install_source_id(source):
    if not isinstance(source, dict):
        return str(source or "")
    if source.get("url"):
        return str(source["url"])
    repo_id = str(source.get("repo_id") or "")
    subfolder = str(source.get("subfolder") or "").replace("\\", "/")
    return f"{repo_id}::{subfolder}" if subfolder else repo_id


def video_status():
    main, vae, t5 = choose_wan_models(required=False)
    jobs = invoke_json("/api/v2/models/install", timeout=15) or []
    relevant_jobs = [
        {
            "id": job.get("id"),
            "source": install_source_id(job.get("source")),
            "status": job.get("status"),
            "bytes": job.get("bytes") or 0,
            "total_bytes": job.get("total_bytes") or 0,
            "error": job.get("error"),
        }
        for job in jobs
        if "Wan2.2" in json.dumps(job.get("source") or {}, ensure_ascii=False)
    ]
    return {
        "supported": True,
        "ready": all((main, vae, t5)),
        "model": main and {"key": main.get("key"), "name": main.get("name")},
        "components": {
            "transformer": bool(main),
            "vae": bool(vae),
            "text_encoder": bool(t5),
        },
        "jobs": relevant_jobs,
        "profile": "Wan 2.2 TI2V-5B Q4, serial queue",
    }


def install_wan_models():
    status = video_status()
    if status["ready"]:
        return status
    active_sources = {
        str(job.get("source") or "")
        for job in status.get("jobs") or []
        if job.get("status") in {"waiting", "downloading", "running", "paused"}
    }
    created = []
    for source in WAN_TI2V_SOURCES:
        if any(source in active_source for active_source in active_sources):
            continue
        try:
            job = invoke_json(
                f"/api/v2/models/install?source={quote(source, safe='')}&inplace=false",
                method="POST",
                payload={},
                timeout=60,
            )
            created.append(job)
        except urllib.error.HTTPError as error:
            if error.code != 409:
                raise
    result = video_status()
    result["created_jobs"] = [job.get("id") for job in created if isinstance(job, dict)]
    return result


def clamp_dimension(value):
    value = max(256, min(1280, int(value)))
    return max(16, value - (value % 16))


def dimensions_for(aspect, source_image, preview_size=None):
    if aspect == "original" and source_image:
        width = int(source_image.get("width") or 1024)
        height = int(source_image.get("height") or 1024)
        scale = min(1024 / max(width, height), 1)
        width, height = clamp_dimension(width * scale), clamp_dimension(height * scale)
    else:
        sizes = {
            "1:1": (1024, 1024),
            "16:9": (1280, 720),
            "9:16": (720, 1280),
            "4:3": (1152, 864),
            "3:4": (864, 1152),
            "21:9": (1280, 544),
        }
        width, height = sizes.get(aspect, (1024, 1024))

    if preview_size:
        short_edge = max(256, min(512, int(preview_size)))
        scale = min(short_edge / max(1, min(width, height)), 1280 / max(width, height))
        width = max(256, min(1280, int((width * scale / 16) + 0.5) * 16))
        height = max(256, min(1280, int((height * scale / 16) + 0.5) * 16))
    return width, height


def detect_prompt_signals(prompt):
    text = str(prompt or "").casefold()

    def contains(term):
        term = str(term).strip().casefold()
        return bool(term and re.search(rf"(?<!\w){re.escape(term)}(?!\w)", text))

    return [
        signal
        for signal, terms in PROMPT_SIGNAL_TERMS.items()
        if any(contains(term) for term in terms)
    ]


def flux_execution_guidance(prompt, images, generation_profile=None):
    signals = detect_prompt_signals(prompt)
    guidance = [
        "Interpret shorthand, spelling mistakes, and informal phrasing by intended visual meaning while keeping every named subject, object, relationship, quantity, color, and quoted word exact.",
    ]
    if images:
        guidance.append(
            "Use image 1 as visual ground truth. Apply the smallest coherent change that fully satisfies the request, while retaining all unrequested framing, crop, camera, perspective, subject identity, object placement, branding, typography, lighting, materials, colors, and background."
        )
        guidance.append(
            "Integrate changed areas into the source with consistent scale, perspective, edges, occlusion, shadows, reflections, texture, sharpness, and image grain."
        )
    else:
        guidance.append(
            "Describe the requested subject and action first, followed by only the explicitly supplied composition, environment, lighting, material, color, and style details."
        )

    signal_guidance = {
        "remove": "Remove the named target completely and reconstruct the newly exposed background with continuous geometry, texture, lighting, and perspective.",
        "replace": "Replace only the named target and integrate the replacement at the same intended position, scale, perspective, and lighting unless the request states otherwise.",
        "add": "Place the requested addition with plausible scale, perspective, contact, occlusion, lighting, and shadows relative to the existing scene.",
        "camera": "Treat camera position, viewing direction, framing, and perspective as explicit spatial constraints while maintaining scene and identity continuity.",
        "geometry": "Resolve the requested geometry with continuous surfaces, plausible thickness, clean joins, correct intersections, and matching material response.",
        "typography": "Render requested wording exactly as written, preserving capitalization, punctuation, logo identity, letter order, alignment, and legibility.",
        "color": "Attach each requested color to its named object or region and preserve coherent value contrast, material response, and reflected color.",
        "lighting": "Apply the requested light direction, softness, exposure, shadow, reflection, and color temperature consistently across affected surfaces.",
        "material": "Express the requested material through physically coherent texture scale, roughness, reflectivity, translucency, wear, seams, and edge response.",
        "identity": "Preserve recognizable identity, anatomy, proportions, clothing continuity, and pose unless the request explicitly changes one of them.",
        "style": "Apply the requested visual language consistently through medium, texture, color treatment, contrast, and finish while preserving factual scene content.",
    }
    if "remove" in signals and "add" not in signals and "replace" not in signals:
        signal_guidance["color"] = "Do not reintroduce removed colors elsewhere; let reconstructed areas take color, texture, and light from the surrounding source."
        signal_guidance["material"] = "Do not reintroduce removed materials elsewhere; let reconstructed areas take surface character from the surrounding source."
    guidance.extend(signal_guidance[signal] for signal in signals[:4] if signal in signal_guidance)

    if isinstance(generation_profile, dict) and generation_profile.get("kind"):
        guidance.append("Treat the selected node mode and controls as production constraints rather than optional style suggestions.")
    return guidance


def choose_prompt_expansion_model():
    models = invoke_json("/api/v2/models/?with_config=true", timeout=10).get("models") or []
    compatible = [model for model in models if str(model.get("type") or "").lower() == "text_llm"]
    if not compatible:
        return None

    def preference(model):
        # Smallest capable Qwen first: this is a constrained 45-90 word
        # rewrite, so a sub-2B model loads in seconds with minimal VRAM.
        name = str(model.get("name") or "").casefold()
        size = re.search(r"(\d+(?:\.\d+)?)\s*b\b", name)
        billions = float(size.group(1)) if size else None
        if ("qwen3" in name or "qwen2" in name) and billions is not None:
            if billions <= 1:
                return 0
            if billions <= 2:
                return 1
            if billions <= 4:
                return 2
            return 3
        if "smollm" in name:
            return 4
        return 5

    return sorted(compatible, key=preference)[0]


def queue_is_idle():
    try:
        status = invoke_json("/api/v1/queue/default/status", timeout=5) or {}
        queue = status.get("queue") or {}
        processor = status.get("processor") or {}
        return not (
            int(queue.get("pending") or 0)
            or int(queue.get("in_progress") or 0)
            or processor.get("is_processing")
        )
    except Exception:
        return False


def expand_prompt_locally(prompt, images, generation_profile=None):
    words = str(prompt or "").split()
    if not words or len(words) > 32 or len(images) > 3 or isinstance(generation_profile, dict):
        return None, None
    if str(prompt).lstrip().startswith(("{", "[")) or not queue_is_idle():
        return None, None
    try:
        model = choose_prompt_expansion_model()
    except Exception:
        return None, None
    if not model:
        return None, None

    cache_key = (str(model.get("key")), str(prompt).strip(), bool(images))
    with PROMPT_EXPANSION_LOCK:
        cached = PROMPT_EXPANSION_CACHE.get(cache_key)
        if cached:
            return cached, model
        try:
            try:
                response = invoke_json(
                    "/api/v1/utilities/expand-prompt",
                    method="POST",
                    payload={
                        "prompt": str(prompt).strip(),
                        "model_key": model["key"],
                        "max_tokens": 160,
                        "system_prompt": FLUX_PROMPT_EXPANSION_SYSTEM,
                        "seed": 0,
                    },
                    timeout=180,
                ) or {}
            finally:
                clear_invoke_model_cache_best_effort()
            expanded = " ".join(str(response.get("expanded_prompt") or "").split()).strip()
            if not expanded or expanded.casefold() == str(prompt).strip().casefold():
                return None, model
            if len(PROMPT_EXPANSION_CACHE) >= 128:
                PROMPT_EXPANSION_CACHE.pop(next(iter(PROMPT_EXPANSION_CACHE)))
            PROMPT_EXPANSION_CACHE[cache_key] = expanded
            return expanded, model
        except Exception:
            return None, model


def build_prompt(prompt, images, connections=None, generation_profile=None, expanded_prompt=None):
    slot_to_input = {
        int(image.get("slot", index - 1)) + 1: index
        for index, image in enumerate(images, start=1)
    }

    def replace_reference_token(match):
        ui_slot = int(match.group(1))
        return f"image {slot_to_input.get(ui_slot, ui_slot)}"

    primary_instruction = re.sub(r"@(\d+)", replace_reference_token, prompt.strip())
    lines = ["AUTHORITATIVE USER REQUEST:", primary_instruction]
    if images:
        lines.append("")
        lines.append("IMAGE INPUTS:")
        lines.append("Image 1 is the main visual source and primary composition.")
        for input_index, image in enumerate(images[1:], start=2):
            role = image.get("role") or "reference"
            note = image.get("note") or ""
            role_instruction = ROLE_GUIDANCE.get(role, ROLE_GUIDANCE["extra"])
            if note:
                lines.append(f"Image {input_index} serves as the {role} reference. {role_instruction} Apply this note: {note}")
            else:
                lines.append(f"Image {input_index} serves as the {role} reference. {role_instruction}")
    if expanded_prompt:
        lines.append("")
        lines.append("CONSTRAINED VISUAL INTERPRETATION:")
        lines.append(re.sub(r"@(\d+)", replace_reference_token, expanded_prompt))
    if isinstance(generation_profile, dict):
        node_kind = str(generation_profile.get("kind") or "workflow").strip()
        settings = generation_profile.get("settings")
        lines.append("")
        lines.append("NODE CONTROLS:")
        lines.append(f"This request comes from the {node_kind} node. Apply its selected controls as hard constraints.")
        if isinstance(settings, dict):
            for key, value in settings.items():
                if value in (None, "") or key in {"count", "quality"}:
                    continue
                label = str(key).replace("_", " ")
                lines.append(f"- {label}: {value}")
    lines.append("")
    lines.append("FLUX.2 EXECUTION GUIDANCE:")
    lines.extend(f"- {item}" for item in flux_execution_guidance(prompt, images, generation_profile))
    if connections:
        lines.append("")
        lines.append("WORKFLOW CONNECTIONS:")
        lines.extend(f"- {str(connection).strip()}" for connection in connections if str(connection).strip())
    return "\n".join(lines)


def build_graph(images, prompt, aspect, steps, seed, connections=None, mode="pro", mask_image_name=None, preview_size=None, model_key=None, generation_profile=None, expanded_prompt=None):
    main_model, qwen_model, vae_model = choose_models(model_key)
    source_image = next((image for image in images if image), None)
    width, height = dimensions_for(aspect, source_image, preview_size)
    prompt_text = build_prompt(prompt, images, connections, generation_profile, expanded_prompt)
    image_fields = [{"image_name": image["image_name"]} for image in images if image.get("image_name")]
    guidance = 3.5 if mode == "draft" else 4.0

    nodes = {
        "loader": {
            "id": "loader",
            "is_intermediate": True,
            "use_cache": True,
            "model": model_field(main_model),
            "vae_model": model_field(vae_model),
            "qwen3_encoder_model": model_field(qwen_model),
            "qwen3_source_model": None,
            "max_seq_len": 512,
            "type": "flux2_klein_model_loader",
        },
        "prompt": {
            "id": "prompt",
            "is_intermediate": True,
            "use_cache": True,
            "prompt": prompt_text,
            "qwen3_encoder": None,
            "max_seq_len": 512,
            "mask": None,
            "type": "flux2_klein_text_encoder",
        },
        "denoise": {
            "id": "denoise",
            "is_intermediate": True,
            "use_cache": False,
            "latents": None,
            "noise": None,
            "denoise_mask": None,
            "denoising_start": 0.0,
            "denoising_end": 1.0,
            "add_noise": True,
            "transformer": None,
            "positive_text_conditioning": None,
            "negative_text_conditioning": None,
            "guidance": guidance,
            "cfg_scale": 1.0,
            "width": width,
            "height": height,
            "num_steps": steps,
            "scheduler": "euler",
            "seed": seed,
            "vae": None,
            "kontext_conditioning": None,
            "type": "flux2_denoise",
        },
        "decode": {
            "board": None,
            "metadata": None,
            "id": "decode",
            "is_intermediate": True,
            "use_cache": False,
            "latents": None,
            "vae": None,
            "type": "flux2_vae_decode",
        },
        "save": {
            "board": None,
            "metadata": None,
            "id": "save",
            "is_intermediate": False,
            "use_cache": False,
            "image": None,
            "type": "save_image",
        },
    }

    if isinstance(generation_profile, dict) and generation_profile.get("kind") == "extract-material":
        nodes["save"]["is_intermediate"] = True

    edges = [
        {"source": {"node_id": "loader", "field": "qwen3_encoder"}, "destination": {"node_id": "prompt", "field": "qwen3_encoder"}},
        {"source": {"node_id": "loader", "field": "max_seq_len"}, "destination": {"node_id": "prompt", "field": "max_seq_len"}},
        {"source": {"node_id": "loader", "field": "transformer"}, "destination": {"node_id": "denoise", "field": "transformer"}},
        {"source": {"node_id": "loader", "field": "vae"}, "destination": {"node_id": "denoise", "field": "vae"}},
        {"source": {"node_id": "prompt", "field": "conditioning"}, "destination": {"node_id": "denoise", "field": "positive_text_conditioning"}},
        {"source": {"node_id": "denoise", "field": "latents"}, "destination": {"node_id": "decode", "field": "latents"}},
        {"source": {"node_id": "loader", "field": "vae"}, "destination": {"node_id": "decode", "field": "vae"}},
        {"source": {"node_id": "decode", "field": "image"}, "destination": {"node_id": "save", "field": "image"}},
    ]

    if image_fields:
        nodes["prep"] = {
            "board": None,
            "metadata": None,
            "id": "prep",
            "is_intermediate": True,
            "use_cache": True,
            "images": image_fields,
            "use_preferred_resolution": True,
            "type": "flux_kontext_image_prep",
        }
        nodes["kontext"] = {
            "id": "kontext",
            "is_intermediate": True,
            "use_cache": True,
            "image": None,
            "type": "flux_kontext",
        }
        edges.insert(5, {"source": {"node_id": "prep", "field": "image"}, "destination": {"node_id": "kontext", "field": "image"}})
        edges.insert(6, {"source": {"node_id": "kontext", "field": "kontext_cond"}, "destination": {"node_id": "denoise", "field": "kontext_conditioning"}})

    if mask_image_name and source_image and source_image.get("image_name"):
        nodes["init_latents"] = {
            "id": "init_latents",
            "is_intermediate": True,
            "use_cache": False,
            "image": {"image_name": source_image["image_name"]},
            "vae": None,
            "type": "flux2_vae_encode",
        }
        nodes["denoise_mask"] = {
            "id": "denoise_mask",
            "is_intermediate": True,
            "use_cache": False,
            "vae": None,
            "image": None,
            "mask": {"image_name": Path(mask_image_name).name},
            "tiled": False,
            "fp32": False,
            "type": "create_denoise_mask",
        }
        edges.extend([
            {"source": {"node_id": "loader", "field": "vae"}, "destination": {"node_id": "init_latents", "field": "vae"}},
            {"source": {"node_id": "init_latents", "field": "latents"}, "destination": {"node_id": "denoise", "field": "latents"}},
            {"source": {"node_id": "loader", "field": "vae"}, "destination": {"node_id": "denoise_mask", "field": "vae"}},
            {"source": {"node_id": "denoise_mask", "field": "denoise_mask"}, "destination": {"node_id": "denoise", "field": "denoise_mask"}},
        ])

    return {"id": "simple_mode_generate", "nodes": nodes, "edges": edges}


def video_dimensions(source_image, resolution):
    target = 720 if resolution == "720p" else 480
    width = int((source_image or {}).get("width") or 832)
    height = int((source_image or {}).get("height") or 480)
    scale = target / max(1, min(width, height))
    width = max(32, int(round(width * scale / 32)) * 32)
    height = max(32, int(round(height * scale / 32)) * 32)
    return min(width, 1280), min(height, 1280)


def build_video_graph(prompt, source_image=None, resolution="480p", frames=49, fps=16, steps=20, seed=0):
    main, vae, t5 = choose_wan_models()
    width, height = video_dimensions(source_image, resolution)
    frames = max(5, min(81, int(frames)))
    frames = 1 + 4 * max(1, round((frames - 1) / 4))
    nodes = {
        "loader": {
            "id": "loader", "type": "wan_model_loader", "is_intermediate": True, "use_cache": False,
            "model": model_field(main), "transformer_low_noise_model": None,
            "vae_model": model_field(vae), "wan_t5_encoder_model": model_field(t5), "component_source": None,
        },
        "positive": {
            "id": "positive", "type": "wan_text_encoder", "is_intermediate": True, "use_cache": True,
            "prompt": prompt.strip(), "wan_t5_encoder": None,
        },
        "negative": {
            "id": "negative", "type": "wan_text_encoder", "is_intermediate": True, "use_cache": True,
            "prompt": "low quality, flicker, unstable geometry, warped anatomy, text artifacts", "wan_t5_encoder": None,
        },
        "denoise": {
            "id": "denoise", "type": "wan_video_denoise", "is_intermediate": True, "use_cache": False,
            "transformer": None, "positive_conditioning": None, "negative_conditioning": None, "ref_image": None,
            "guidance_scale": 1.0 if source_image else 5.0,
            "guidance_scale_low_noise": 1.0 if source_image else 4.0,
            "width": width, "height": height, "num_frames": frames,
            "steps": max(4, min(40, int(steps))), "seed": int(seed),
        },
        "video": {
            "id": "video", "type": "wan_l2v", "is_intermediate": False, "use_cache": False,
            "board": None, "metadata": None, "latents": None, "vae": None, "fps": max(1, min(60, int(fps))),
        },
    }
    edges = [
        {"source": {"node_id": "loader", "field": "transformer"}, "destination": {"node_id": "denoise", "field": "transformer"}},
        {"source": {"node_id": "loader", "field": "wan_t5_encoder"}, "destination": {"node_id": "positive", "field": "wan_t5_encoder"}},
        {"source": {"node_id": "loader", "field": "wan_t5_encoder"}, "destination": {"node_id": "negative", "field": "wan_t5_encoder"}},
        {"source": {"node_id": "positive", "field": "conditioning"}, "destination": {"node_id": "denoise", "field": "positive_conditioning"}},
        {"source": {"node_id": "negative", "field": "conditioning"}, "destination": {"node_id": "denoise", "field": "negative_conditioning"}},
        {"source": {"node_id": "denoise", "field": "latents"}, "destination": {"node_id": "video", "field": "latents"}},
        {"source": {"node_id": "loader", "field": "vae"}, "destination": {"node_id": "video", "field": "vae"}},
    ]
    if source_image and source_image.get("image_name"):
        nodes["reference"] = {
            "id": "reference", "type": "wan_ref_image_encoder", "is_intermediate": True, "use_cache": False,
            "image": {"image_name": source_image["image_name"]},
            "end_image": None,
            "vae": None, "width": width, "height": height, "num_frames": 1,
        }
        edges.extend([
            {"source": {"node_id": "loader", "field": "vae"}, "destination": {"node_id": "reference", "field": "vae"}},
            {"source": {"node_id": "reference", "field": "ref_image"}, "destination": {"node_id": "denoise", "field": "ref_image"}},
        ])
    return {"id": "simple_mode_video", "nodes": nodes, "edges": edges}


def find_media_result(item):
    session = item.get("session") or {}
    results = session.get("results") or {}
    final_image = None
    final_video = None
    for value in results.values():
        image = value.get("image") if isinstance(value, dict) else None
        if isinstance(image, dict) and image.get("image_name"):
            final_image = normalize_image_payload({**image, "media_type": "image"})
        video = value.get("video") if isinstance(value, dict) else None
        if isinstance(video, dict) and video.get("video_name"):
            final_video = normalize_video_payload({
                **video,
                "width": value.get("width"),
                "height": value.get("height"),
                "num_frames": value.get("num_frames"),
                "fps": value.get("fps"),
                "duration": value.get("duration"),
            })
    if final_video:
        return final_video
    if final_image:
        return final_image
    return None


def find_image_result(item):
    media = find_media_result(item)
    return media if media and media.get("image_name") else None


def choose_image_to_prompt_model():
    models = invoke_json("/api/v2/models/?with_config=true", timeout=10).get("models") or []
    for model in models:
        if str(model.get("type") or "").lower() == "llava_onevision":
            return model
    return None


def native_gallery(limit=6):
    limit = max(1, min(24, int(limit or 6)))
    payload = invoke_json(
        f"/api/v1/images/?is_intermediate=false&offset=0&limit={limit}&order_dir=DESC&starred_first=true",
        timeout=15,
    ) or {"items": [], "total": 0}
    payload["items"] = [normalize_image_payload(dict(item)) for item in payload.get("items") or []]
    return payload


def native_boards(limit=50):
    limit = max(1, min(100, int(limit or 50)))
    return invoke_json(f"/api/v1/boards/?offset=0&limit={limit}", timeout=15) or {"items": [], "total": 0}


def native_queue_action(action):
    routes = {
        "pause": "/api/v1/queue/default/processor/pause",
        "resume": "/api/v1/queue/default/processor/resume",
        "cancel_pending": "/api/v1/queue/default/cancel_all_except_current",
        "prune_finished": "/api/v1/queue/default/prune",
    }
    if action in routes:
        invoke_json(routes[action], method="PUT", timeout=20)
    elif action != "refresh":
        raise ValueError("Unknown queue action.")
    status = invoke_json("/api/v1/queue/default/status", timeout=10) or {}
    status["action"] = action
    return status


def ensure_generation_queue_idle():
    status = invoke_json("/api/v1/queue/default/status", timeout=10) or {}
    queue = status.get("queue") or {}
    processor = status.get("processor") or {}
    if int(queue.get("pending") or 0) > 0 or int(queue.get("in_progress") or 0) > 0 or processor.get("is_processing"):
        raise RuntimeError("Wait for the current InvokeAI render queue to finish before running the vision model.")


class Handler(BaseHTTPRequestHandler):
    server_version = "InvokeSimpleMode/1.8.0"

    def log_message(self, fmt, *args):
        return

    def send_json(self, payload, status=200):
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def send_file(self, path, content_type):
        data = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def send_bytes(self, data, content_type, filename=None):
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        if filename:
            self.send_header("Content-Disposition", f'attachment; filename="{Path(filename).name}"')
        self.end_headers()
        self.wfile.write(data)

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        try:
            if path == "/" or (path.startswith("/workspace/") and len(path.split("/")) == 3):
                self.send_file(APP_DIR / "index.html", "text/html; charset=utf-8")
            elif path == "/app.js":
                self.send_file(APP_DIR / "app.js", "application/javascript; charset=utf-8")
            elif path == "/styles.css":
                self.send_file(APP_DIR / "styles.css", "text/css; charset=utf-8")
            elif path == "/icon-source":
                self.send_file(ROOT / "launcher" / "InvokeAI-icon-source.png", "image/png")
            elif path == "/favicon.ico":
                self.send_file(ROOT / "launcher" / "InvokeAI.ico", "image/x-icon")
            elif path == "/api/ping":
                self.send_json({"ok": True})
            elif path == "/api/status":
                try:
                    version = invoke_json("/api/v1/app/version", timeout=3)
                    self.send_json({"ok": True, "invoke": version})
                except urllib.error.URLError as error:
                    self.send_json({"ok": False, "status": "offline", "error": invoke_error_message(error)}, status=503)
            elif path == "/api/models":
                self.send_json(image_model_catalog())
            elif path == "/api/native/features":
                self.send_json(native_feature_catalog())
            elif path == "/api/native/gallery":
                query = parse_qs(parsed.query)
                self.send_json(native_gallery((query.get("limit") or [6])[0]))
            elif path == "/api/native/boards":
                self.send_json(native_boards())
            elif path == "/api/native/queue":
                self.send_json(native_queue_action("refresh"))
            elif path == "/api/video/status":
                self.send_json(video_status())
            elif path == "/api/workspaces":
                self.send_json({"items": list_workspaces()})
            elif path.startswith("/api/workspaces/"):
                workspace_id = path.rsplit("/", 1)[-1]
                self.send_json(read_workspace(workspace_id))
            elif path.startswith("/api/item/"):
                item_id = path.rsplit("/", 1)[-1]
                item = invoke_json(f"/api/v1/queue/default/i/{item_id}", timeout=15)
                media = find_media_result(item)
                self.send_json({
                    "item_id": int(item_id),
                    "status": item.get("status"),
                    "error": item.get("error") or item.get("error_traceback"),
                    "media": media,
                    "image": media if media and media.get("image_name") else None,
                    "video": media if media and media.get("video_name") else None,
                })
            elif path.startswith("/api/download/"):
                image_name = Path(path.rsplit("/", 1)[-1]).name
                _, data, content_type = invoke_raw(f"/api/v1/images/i/{quote(image_name)}/full", timeout=30)
                self.send_bytes(data, content_type, filename=image_name)
            elif path.startswith("/api/download-video/"):
                video_name = Path(path.rsplit("/", 1)[-1]).name
                _, data, content_type = invoke_raw(f"/api/v1/videos/i/{quote(video_name)}/full", timeout=120)
                self.send_bytes(data, content_type, filename=video_name)
            else:
                self.send_json({"error": "Not found"}, status=404)
        except Exception as exc:
            self.send_json({"error": invoke_error_message(exc)}, status=invoke_error_status(exc))

    def do_POST(self):
        parsed = urlparse(self.path)
        try:
            if parsed.path == "/api/workspaces":
                payload = self.read_json()
                workspace_id = uuid.uuid4().hex[:12]
                self.send_json(write_workspace(workspace_id, payload, create=True), status=201)
            elif parsed.path.startswith("/api/workspaces/") and parsed.path.endswith("/save"):
                workspace_id = parsed.path.split("/")[-2]
                self.send_json(write_workspace(workspace_id, self.read_json()))
            elif parsed.path == "/api/upload":
                query = parse_qs(parsed.query)
                self.handle_upload(is_intermediate=(query.get("is_intermediate") or ["false"])[0].lower() == "true")
            elif parsed.path == "/api/extract-reference":
                self.handle_extract_reference()
            elif parsed.path == "/api/material-analysis":
                self.handle_material_analysis()
            elif parsed.path == "/api/material-report":
                self.handle_material_report()
            elif parsed.path == "/api/generate":
                self.handle_generate()
            elif parsed.path == "/api/video/generate":
                self.handle_video_generate()
            elif parsed.path == "/api/video/install":
                self.send_json(install_wan_models(), status=202)
            elif parsed.path == "/api/upscale":
                self.handle_upscale()
            elif parsed.path == "/api/native/run":
                self.handle_native_run()
            elif parsed.path == "/api/native/image-to-prompt":
                self.handle_native_image_to_prompt()
            elif parsed.path == "/api/native/queue":
                payload = self.read_json()
                self.send_json(native_queue_action(payload.get("action") or "refresh"))
            else:
                self.send_json({"error": "Not found"}, status=404)
        except Exception as exc:
            self.send_json({"error": invoke_error_message(exc)}, status=invoke_error_status(exc))

    def do_PUT(self):
        parsed = urlparse(self.path)
        try:
            if parsed.path.startswith("/api/workspaces/"):
                workspace_id = parsed.path.rsplit("/", 1)[-1]
                self.send_json(write_workspace(workspace_id, self.read_json()))
            else:
                self.send_json({"error": "Not found"}, status=404)
        except FileNotFoundError as exc:
            self.send_json({"error": str(exc)}, status=404)
        except ValueError as exc:
            self.send_json({"error": str(exc)}, status=400)
        except Exception as exc:
            self.send_json({"error": invoke_error_message(exc)}, status=invoke_error_status(exc))

    def handle_upload(self, is_intermediate=False):
        form = cgi.FieldStorage(
            fp=self.rfile,
            headers=self.headers,
            environ={
                "REQUEST_METHOD": "POST",
                "CONTENT_TYPE": self.headers.get("Content-Type"),
                "CONTENT_LENGTH": self.headers.get("Content-Length", "0"),
            },
        )
        if "file" not in form:
            self.send_json({"error": "No image file was received."}, status=400)
            return
        field = form["file"]
        if isinstance(field, list):
            field = field[0]
        file_bytes = field.file.read()
        if not file_bytes:
            self.send_json({"error": "The uploaded image was empty."}, status=400)
            return
        filename = Path(field.filename or "upload.png").name.replace('"', "")
        content_type = field.type or "image/png"
        status, payload = upload_image_bytes(file_bytes, filename, content_type, is_intermediate=is_intermediate)
        self.send_json(payload, status=status)

    def handle_extract_reference(self):
        if Image is None:
            self.send_json({"error": "Contextual extraction requires Pillow in the Simple Mode environment."}, status=500)
            return
        payload = self.read_json()
        image_name = Path(payload.get("image_name") or "").name
        if not image_name:
            self.send_json({"error": "Connect a source image to the Extract node first."}, status=400)
            return
        target = str(payload.get("target") or "material").lower()
        sample = str(payload.get("sample") or "hierarchy").lower()
        instruction = str(payload.get("instruction") or "").strip()
        if target not in {"color", "material", "parts"}:
            self.send_json({"error": "Unknown extraction target. Use color, material, or parts."}, status=400)
            return
        _, source_bytes, _ = invoke_raw(f"/api/v1/images/i/{quote(image_name)}/full", timeout=45)
        with Image.open(BytesIO(source_bytes)) as loaded:
            atlas, metadata = build_extract_reference(loaded.copy(), target=target, sample=sample, instruction=instruction)
        output = BytesIO()
        atlas.save(output, format="PNG", optimize=True)
        filename = f"extract-{target}-{uuid.uuid4().hex[:10]}.png"
        status, image = upload_image_bytes(output.getvalue(), filename, "image/png", is_intermediate=False)
        image["width"], image["height"] = atlas.size
        self.send_json({"image": image, "metadata": metadata}, status=status)

    def handle_material_analysis(self):
        payload = self.read_json()
        image_name = Path(payload.get("image_name") or "").name
        if not image_name:
            self.send_json({"error": "Connect a source image to the Material node first."}, status=400)
            return
        sample = str(payload.get("sample") or "hierarchy").lower()
        limit = {"dominant": 3, "hierarchy": 4, "detailed": 4}.get(sample, 4)
        profiles, analysis, model = analyze_materials_with_vision(
            image_name,
            user_instruction=payload.get("instruction") or "",
            limit=limit,
        )
        self.send_json({"materials": profiles, "analysis": analysis, "model": model})

    def handle_material_report(self):
        if Image is None:
            self.send_json({"error": "Material report composition requires Pillow."}, status=500)
            return
        payload = self.read_json()
        macro_name = Path(payload.get("macro_image_name") or "").name
        source_name = Path(payload.get("source_image_name") or "").name
        materials = payload.get("materials") or []
        if not macro_name or not source_name or not isinstance(materials, list) or not materials:
            self.send_json({"error": "Macro image, source image, and material analysis are required."}, status=400)
            return
        _, macro_bytes, _ = invoke_raw(f"/api/v1/images/i/{quote(macro_name)}/full", timeout=45)
        _, source_bytes, _ = invoke_raw(f"/api/v1/images/i/{quote(source_name)}/full", timeout=45)
        with Image.open(BytesIO(macro_bytes)) as macro_loaded, Image.open(BytesIO(source_bytes)) as source_loaded:
            report = build_material_study_report(macro_loaded.copy(), source_loaded.copy(), materials)
        output = BytesIO()
        report.save(output, format="PNG", optimize=True)
        filename = f"material-study-{uuid.uuid4().hex[:10]}.png"
        status, image = upload_image_bytes(output.getvalue(), filename, "image/png", is_intermediate=False)
        image["width"], image["height"] = report.size
        self.send_json({"image": image}, status=status)

    def handle_upscale(self):
        payload = self.read_json()
        image_name = Path(payload.get("image_name") or "").name
        if not image_name:
            self.send_json({"error": "image_name is required."}, status=400)
            return
        requested_scale = int(payload.get("scale") or 2)
        scale = 4 if requested_scale >= 4 else 2
        model_name = "RealESRGAN_x4plus.pth" if scale == 4 else "RealESRGAN_x2plus.pth"
        graph = {
            "id": "simple_mode_realesrgan",
            "nodes": {
                "upscale": {
                    "id": "upscale",
                    "type": "esrgan",
                    "is_intermediate": False,
                    "use_cache": False,
                    "image": {"image_name": image_name},
                    "model_name": model_name,
                    "tile_size": 400,
                    "board": None,
                    "metadata": None,
                }
            },
            "edges": [],
        }
        body = {
            "batch": {
                "batch_id": f"simple-upscale-{random.randint(100000, 999999)}",
                "origin": "simple-mode-upscale",
                "destination": "gallery",
                "graph": graph,
                "runs": 1,
            },
            "prepend": False,
        }
        queued = invoke_json("/api/v1/queue/default/enqueue_batch", method="POST", payload=body, timeout=30)
        item_ids = queued.get("item_ids") or []
        if not item_ids:
            self.send_json({"error": "InvokeAI did not return an upscale queue item."}, status=500)
            return

        deadline = time.monotonic() + 900
        item = None
        while time.monotonic() < deadline:
            item = invoke_json(f"/api/v1/queue/default/i/{item_ids[0]}", timeout=30)
            queue_status = str(item.get("status") or "").lower()
            if queue_status == "completed":
                break
            if queue_status in {"failed", "canceled"}:
                error = item.get("error") or item.get("error_traceback") or "RealESRGAN upscale failed."
                self.send_json({"error": error, "item_id": item_ids[0]}, status=500)
                return
            time.sleep(1)
        else:
            self.send_json({"error": "RealESRGAN upscale timed out after 15 minutes.", "item_id": item_ids[0]}, status=504)
            return

        result = find_image_result(item or {})
        if not result:
            self.send_json({"error": "RealESRGAN completed without a saved image result.", "item_id": item_ids[0]}, status=500)
            return
        result.update({
            "upscaled_from": image_name,
            "scale": scale,
            "model_name": model_name,
            "item_id": item_ids[0],
        })
        self.send_json(result)

    def handle_native_run(self):
        payload = self.read_json()
        feature_id = payload.get("feature_id") or ""
        image_name = Path(payload.get("image_name") or "").name
        if not image_name:
            self.send_json({"error": "Connect an image to this native node first."}, status=400)
            return
        match = find_native_invocation_feature(feature_id)
        if not match:
            self.send_json({"error": "Native feature was not found in InvokeAI's OpenAPI schema."}, status=404)
            return
        feature, _schema = match
        if not feature.get("runnable"):
            missing = ", ".join(feature.get("missing") or [])
            suffix = f" Missing connected/model inputs: {missing}." if missing else ""
            self.send_json({"error": f"This native Invoke node is mapped but not directly runnable here yet.{suffix}"}, status=400)
            return
        settings_payload = payload.get("settings") or {}
        missing_settings = [
            setting["label"]
            for setting in feature.get("settings") or []
            if setting.get("required") and settings_payload.get(setting["name"]) in (None, "")
        ]
        if missing_settings:
            self.send_json({"error": f"Required setting missing: {', '.join(missing_settings)}."}, status=400)
            return
        node = {
            "id": "native_node",
            "type": feature["type"],
            "is_intermediate": False,
            "use_cache": False,
            "image": {"image_name": image_name},
        }
        for setting in feature.get("settings") or []:
            if setting["name"] in settings_payload or setting.get("default") is not None:
                node[setting["name"]] = coerce_setting(settings_payload.get(setting["name"], setting.get("default")), setting)
        graph = {"id": "simple_native_node", "nodes": {"native_node": node}, "edges": []}
        body = {
            "batch": {
                "batch_id": f"simple-native-{random.randint(100000, 999999)}",
                "origin": "simple-mode-native",
                "destination": "gallery",
                "graph": graph,
                "runs": 1,
            },
            "prepend": False,
        }
        response = invoke_json("/api/v1/queue/default/enqueue_batch", method="POST", payload=body, timeout=30)
        self.send_json({"item_ids": response.get("item_ids") or [], "feature": feature})

    def handle_native_image_to_prompt(self):
        payload = self.read_json()
        image_name = Path(payload.get("image_name") or "").name
        if not image_name:
            self.send_json({"error": "Connect an image first."}, status=400)
            return
        model = choose_image_to_prompt_model()
        if not model:
            self.send_json({"error": "InvokeAI has no local image-to-prompt/vision model installed for this utility."}, status=400)
            return
        ensure_generation_queue_idle()
        instruction = (payload.get("instruction") or "Describe this image in detail for use as an AI image generation prompt.").strip()
        response = invoke_json(
            "/api/v1/utilities/image-to-prompt",
            method="POST",
            payload={"image_name": image_name, "model_key": model["key"], "instruction": instruction},
            timeout=120,
        )
        self.send_json({"model": {"key": model["key"], "name": model.get("name")}, "result": response})

    def handle_generate(self):
        payload = self.read_json()
        images = payload.get("images") or []
        connections = payload.get("connections") or []
        generation_profile = payload.get("generation_profile")
        if not isinstance(generation_profile, dict):
            generation_profile = None
        prompt = (payload.get("prompt") or "").strip()
        if not prompt:
            self.send_json({"error": "Prompt is required."}, status=400)
            return
        count = max(1, min(4, int(payload.get("count") or 4)))
        steps = max(1, min(16, int(payload.get("steps") or 8)))
        mode = (payload.get("mode") or "pro").lower()
        if mode == "draft":
            steps = min(steps, 4)
        else:
            mode = "pro"
        aspect = payload.get("aspect") or "original"
        preview_size = max(0, min(512, int(payload.get("preview_size") or 0)))
        model_key = str(payload.get("model_key") or "").strip() or None
        base_seed = payload.get("seed")
        mask_image_name = Path(payload.get("mask_image_name") or "").name or None
        if base_seed in (None, "", 0, "0"):
            base_seed = random.randint(1, 4294960000)
        else:
            base_seed = int(base_seed)

        expanded_prompt, prompt_expander = expand_prompt_locally(prompt, images, generation_profile)
        item_ids = []
        for index in range(count):
            seed = (base_seed + index * 9973) % 4294967295
            graph = build_graph(
                images, prompt, aspect, steps, seed, connections, mode, mask_image_name, preview_size,
                model_key=model_key, generation_profile=generation_profile, expanded_prompt=expanded_prompt,
            )
            body = {
                "batch": {
                    "batch_id": f"simple-mode-{random.randint(100000, 999999)}-{index}",
                    "origin": "simple-mode",
                    "destination": "gallery",
                    "graph": graph,
                    "runs": 1,
                },
                "prepend": False,
            }
            response = invoke_json("/api/v1/queue/default/enqueue_batch", method="POST", payload=body, timeout=30)
            item_ids.extend(response.get("item_ids") or [])

        self.send_json({
            "item_ids": item_ids,
            "seed": base_seed,
            "preview_size": preview_size,
            "prompt_enhancement": {
                "structured": True,
                "local_llm": bool(expanded_prompt),
                "model": prompt_expander.get("name") if prompt_expander and expanded_prompt else None,
            },
        })

    def handle_video_generate(self):
        payload = self.read_json()
        prompt = (payload.get("prompt") or "").strip()
        if not prompt:
            self.send_json({"error": "A motion prompt is required."}, status=400)
            return
        images = [image for image in (payload.get("images") or []) if image.get("image_name")]
        source_image = images[0] if images else None
        count = max(1, min(2, int(payload.get("count") or 1)))
        base_seed = int(payload.get("seed") or random.randint(1, 2147483000))
        item_ids = []
        for index in range(count):
            graph = build_video_graph(
                prompt,
                source_image=source_image,
                resolution=payload.get("resolution") or "480p",
                frames=payload.get("frames") or 49,
                fps=payload.get("fps") or 16,
                steps=payload.get("steps") or 20,
                seed=(base_seed + index * 7919) % 2147483647,
            )
            body = {
                "batch": {
                    "batch_id": f"simple-video-{random.randint(100000, 999999)}-{index}",
                    "origin": "simple-mode-video",
                    "destination": "gallery",
                    "graph": graph,
                    "runs": 1,
                },
                "prepend": False,
            }
            response = invoke_json("/api/v1/queue/default/enqueue_batch", method="POST", payload=body, timeout=30)
            item_ids.extend(response.get("item_ids") or [])
        self.send_json({"item_ids": item_ids, "seed": base_seed, "media_type": "video"})


def main():
    os.chdir(str(APP_DIR))
    try:
        ensure_native_navigation()
    except OSError as error:
        print(f"Simple Mode navigation could not be installed into InvokeAI: {error}", file=sys.stderr, flush=True)
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Simple Mode running at http://{HOST}:{PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
