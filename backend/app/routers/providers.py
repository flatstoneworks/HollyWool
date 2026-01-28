"""Remote provider configuration endpoints"""

import json
import logging
import re
from pathlib import Path
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..utils.paths import get_data_dir

router = APIRouter(prefix="/api/providers", tags=["providers"])
logger = logging.getLogger(__name__)

# Known remote providers with metadata
KNOWN_PROVIDERS = {
    "krea": {
        "name": "KREA",
        "default_api_url": "https://api.krea.ai",
        "category": "image",
    },
    "higgsfield": {
        "name": "Higgsfield",
        "default_api_url": "https://api.higgsfield.ai",
        "category": "image",
    },
    "fal": {
        "name": "fal",
        "default_api_url": "https://fal.run",
        "category": "image",
    },
    "anthropic": {
        "name": "Anthropic",
        "default_api_url": "https://api.anthropic.com",
        "category": "llm",
    },
}

# Providers file path
_PROVIDERS_PATH = get_data_dir() / "providers.json"


# ============================================================================
# Models
# ============================================================================

class ProviderUpdateRequest(BaseModel):
    """Request to update a provider configuration"""
    api_key: Optional[str] = None
    api_url: Optional[str] = None
    is_enabled: Optional[bool] = None


class ProviderConfig(BaseModel):
    """Public provider config (never exposes actual keys)"""
    provider: str
    is_configured: bool
    is_enabled: bool
    api_url: Optional[str] = None
    has_api_key: bool


class AllProvidersResponse(BaseModel):
    """Response containing all provider configs"""
    providers: list[ProviderConfig]


class TestConnectionResponse(BaseModel):
    """Response from a provider connection test"""
    success: bool
    message: str
    error: Optional[str] = None


class DiscoveredModel(BaseModel):
    """A model discovered from a provider's API"""
    id: str
    name: str
    description: str
    type: str  # "image" or "video" or "unknown"
    input_type: Optional[str] = None  # e.g. "text-to-image", "image-to-video"
    model_id: str  # provider-specific model identifier
    tags: list[str]
    provider: str


class DiscoverResponse(BaseModel):
    """Response from model discovery"""
    success: bool
    discovered: int
    models: list[DiscoveredModel]
    error: Optional[str] = None


# Providers that support auto-discovery
DISCOVERY_PROVIDERS = {"krea", "fal"}


# ============================================================================
# Storage helpers
# ============================================================================

def _load_providers() -> dict:
    """Load providers from JSON file"""
    if _PROVIDERS_PATH.exists():
        try:
            with open(_PROVIDERS_PATH) as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Failed to load providers: {e}")
    return {}


def _save_providers(data: dict) -> None:
    """Save providers to JSON file"""
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    try:
        with open(_PROVIDERS_PATH, "w") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        logger.error(f"Failed to save providers: {e}")
        raise HTTPException(status_code=500, detail="Failed to save provider configuration")


def _make_config(provider_id: str, raw: dict | None) -> ProviderConfig:
    """Build a public ProviderConfig from stored data"""
    default_url = KNOWN_PROVIDERS.get(provider_id, {}).get("default_api_url")
    if raw is None:
        return ProviderConfig(
            provider=provider_id,
            is_configured=False,
            is_enabled=False,
            api_url=default_url,
            has_api_key=False,
        )
    has_key = bool(raw.get("api_key"))
    is_enabled = raw.get("is_enabled", True)
    return ProviderConfig(
        provider=provider_id,
        is_configured=has_key and is_enabled,
        is_enabled=is_enabled,
        api_url=raw.get("api_url") or default_url,
        has_api_key=has_key,
    )


def _validate_provider(provider_id: str) -> None:
    """Raise 404 if provider is unknown"""
    if provider_id not in KNOWN_PROVIDERS:
        raise HTTPException(status_code=404, detail=f"Unknown provider: {provider_id}")


# ============================================================================
# Endpoints
# ============================================================================

@router.get("", response_model=AllProvidersResponse)
async def get_providers():
    """Get all provider configurations"""
    data = _load_providers()
    configs = [_make_config(pid, data.get(pid)) for pid in sorted(KNOWN_PROVIDERS)]
    return AllProvidersResponse(providers=configs)


@router.get("/{provider_id}", response_model=ProviderConfig)
async def get_provider(provider_id: str):
    """Get a single provider configuration"""
    _validate_provider(provider_id)
    data = _load_providers()
    return _make_config(provider_id, data.get(provider_id))


@router.put("/{provider_id}", response_model=ProviderConfig)
async def update_provider(provider_id: str, request: ProviderUpdateRequest):
    """Update a provider's configuration"""
    _validate_provider(provider_id)

    data = _load_providers()
    existing = data.get(provider_id, {})

    if request.api_key is not None:
        existing["api_key"] = request.api_key
    if request.api_url is not None:
        existing["api_url"] = request.api_url
    if request.is_enabled is not None:
        existing["is_enabled"] = request.is_enabled

    data[provider_id] = existing
    _save_providers(data)

    logger.info(f"Updated provider: {provider_id}")
    return _make_config(provider_id, existing)


@router.delete("/{provider_id}", response_model=ProviderConfig)
async def delete_provider(provider_id: str):
    """Remove a provider's configuration (clear key)"""
    _validate_provider(provider_id)

    data = _load_providers()
    if provider_id in data:
        del data[provider_id]
        _save_providers(data)

    logger.info(f"Deleted provider config: {provider_id}")
    return _make_config(provider_id, None)


@router.post("/{provider_id}/test", response_model=TestConnectionResponse)
async def test_provider_connection(provider_id: str):
    """Test connection to a provider using its configured API key and URL"""
    _validate_provider(provider_id)

    data = _load_providers()
    raw = data.get(provider_id)

    if not raw or not raw.get("api_key"):
        return TestConnectionResponse(
            success=False,
            message="No API key configured",
            error="Configure an API key before testing the connection.",
        )

    api_key = raw["api_key"]
    api_url = raw.get("api_url") or KNOWN_PROVIDERS[provider_id]["default_api_url"]

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(
                api_url,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Accept": "application/json",
                },
            )

        if response.status_code < 500:
            return TestConnectionResponse(
                success=True,
                message=f"Connection successful (HTTP {response.status_code})",
            )
        else:
            return TestConnectionResponse(
                success=False,
                message=f"Server error (HTTP {response.status_code})",
                error=response.text[:200] if response.text else None,
            )

    except httpx.TimeoutException:
        return TestConnectionResponse(
            success=False,
            message="Connection timed out",
            error="The provider did not respond within 5 seconds.",
        )
    except httpx.ConnectError as e:
        return TestConnectionResponse(
            success=False,
            message="Connection failed",
            error=str(e),
        )
    except Exception as e:
        logger.error(f"Test connection error for {provider_id}: {e}")
        return TestConnectionResponse(
            success=False,
            message="Connection failed",
            error=str(e),
        )


# ============================================================================
# Model Discovery
# ============================================================================

# Display name mappings for KREA vendors and model slugs
_VENDOR_NAMES: dict[str, str] = {
    "bfl": "Black Forest Labs",
    "google": "Google",
    "bytedance": "ByteDance",
    "openai": "OpenAI",
    "ideogram": "Ideogram",
    "runway": "Runway",
    "qwen": "Qwen",
    "kling": "Kling",
    "topaz": "Topaz",
}

_MODEL_NAMES: dict[str, str] = {
    "flux-1-dev": "FLUX 1 Dev",
    "flux-1-kontext-dev": "FLUX Kontext Dev",
    "flux-1.1-pro": "FLUX 1.1 Pro",
    "flux-1.1-pro-ultra": "FLUX 1.1 Pro Ultra",
    "nano-banana-pro": "Nano Banana Pro",
    "nano-banana": "Nano Banana",
    "imagen-3": "Imagen 3",
    "imagen-4": "Imagen 4",
    "imagen-4-fast": "Imagen 4 Fast",
    "imagen-4-ultra": "Imagen 4 Ultra",
    "ideogram-2-turbo": "Ideogram 2.0A Turbo",
    "ideogram-3": "Ideogram 3.0",
    "gen-4": "Gen-4",
    "gpt-image": "GPT Image",
    "seedream-3": "Seedream 3",
    "seedream-4": "Seedream 4",
    "seededit": "SeedEdit",
    "kling-1": "Kling 1.0",
    "kling-1.5": "Kling 1.5",
    "kling-1.6": "Kling 1.6",
    "generative-enhance": "Generative Enhance",
    "standard-enhance": "Standard Enhance",
    "bloom-enhance": "Bloom Enhance",
}


def _format_model_name(slug: str, vendor: str) -> str:
    """Format a model slug and vendor into a nice display name."""
    nice_name = _MODEL_NAMES.get(slug) or slug.replace("-", " ").title()
    nice_vendor = _VENDOR_NAMES.get(vendor) or vendor.capitalize()
    return f"{nice_name} ({nice_vendor})"


def _sanitize_id(text: str) -> str:
    """Create a safe ID string."""
    return re.sub(r"[^a-z0-9-]", "-", text.lower())


def _detect_image_input_type(slug: str) -> str:
    """Detect image model input type from its slug."""
    s = slug.lower()
    if "edit" in s or "img2img" in s or "image-to-image" in s:
        return "image-to-image"
    if "inpaint" in s or "outpaint" in s:
        return "image-editing"
    if "face" in s or "faceswap" in s:
        return "face"
    if "upscale" in s or "upscaler" in s:
        return "upscaling"
    return "text-to-image"


def _detect_video_input_type(slug: str) -> str:
    """Detect video model input type from its slug."""
    s = slug.lower()
    if "img2vid" in s or "image-to-video" in s:
        return "image-to-video"
    if "vid2vid" in s or "video-to-video" in s:
        return "video-to-video"
    if "lipsync" in s:
        return "lipsync"
    return "text-to-video"


async def _discover_krea_models() -> list[DiscoveredModel]:
    """Discover models from KREA's public OpenAPI spec."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get("https://api.krea.ai/openapi.json")
        response.raise_for_status()
        spec = response.json()

    models: list[DiscoveredModel] = []

    for path_key, path_value in (spec.get("paths") or {}).items():
        post_spec = (path_value or {}).get("post", {})
        summary = post_spec.get("summary") or post_spec.get("description") or ""

        # /generate/image/{vendor}/{model}
        image_match = re.match(r"^/generate/image/([^/]+)/([^/]+)$", path_key)
        if image_match:
            vendor, model_slug = image_match.group(1), image_match.group(2)
            models.append(DiscoveredModel(
                id=_sanitize_id(f"krea-{vendor}-{model_slug}"),
                name=_format_model_name(model_slug, vendor),
                description=summary or f"{vendor} {model_slug} model",
                type="image",
                input_type=_detect_image_input_type(model_slug),
                model_id=f"{vendor}/{model_slug}",
                tags=[vendor, "image"],
                provider="krea",
            ))

        # /generate/video/{vendor}/{model}
        video_match = re.match(r"^/generate/video/([^/]+)/([^/]+)$", path_key)
        if video_match:
            vendor, model_slug = video_match.group(1), video_match.group(2)
            models.append(DiscoveredModel(
                id=_sanitize_id(f"krea-{vendor}-{model_slug}"),
                name=_format_model_name(model_slug, vendor),
                description=summary or f"{vendor} {model_slug} video model",
                type="video",
                input_type=_detect_video_input_type(model_slug),
                model_id=f"{vendor}/{model_slug}",
                tags=[vendor, "video"],
                provider="krea",
            ))

        # /generate/enhance/{vendor}/{model}
        enhance_match = re.match(r"^/generate/enhance/([^/]+)/([^/]+)$", path_key)
        if enhance_match:
            vendor, model_slug = enhance_match.group(1), enhance_match.group(2)
            models.append(DiscoveredModel(
                id=_sanitize_id(f"krea-enhance-{vendor}-{model_slug}"),
                name=f"{_format_model_name(model_slug, vendor)} (Enhance)",
                description=summary or f"{vendor} {model_slug} enhancement model",
                type="image",
                input_type="upscaling",
                model_id=f"enhance/{vendor}/{model_slug}",
                tags=[vendor, "enhance", "upscale"],
                provider="krea",
            ))

    return models


async def _discover_fal_models(api_key: str) -> list[DiscoveredModel]:
    """Discover models from fal.ai's models API with pagination."""
    models: list[DiscoveredModel] = []
    relevant_categories = {
        "text-to-image", "image-to-image", "text-to-video", "image-to-video",
        "video-to-video", "image-editing", "upscaling", "face", "lipsync", "avatar",
    }

    try:
        cursor: str | None = None
        page_count = 0
        max_pages = 20

        headers: dict[str, str] = {}
        if api_key:
            headers["Authorization"] = f"Key {api_key}"

        async with httpx.AsyncClient(timeout=15.0) as client:
            while page_count < max_pages:
                url = "https://api.fal.ai/v1/models?limit=100&status=active"
                if cursor:
                    url += f"&cursor={cursor}"

                response = await client.get(url, headers=headers)
                if not response.is_success:
                    logger.warning(f"fal API error: {response.status_code}")
                    break

                data = response.json()
                items = data.get("models") or data.get("items") or []

                for model in items:
                    endpoint_id = model.get("endpoint_id") or model.get("id", "")
                    meta = model.get("metadata") or model
                    category = (meta.get("category") or "").lower()

                    # Filter for image/video generation models
                    is_relevant = (
                        any(cat in category for cat in relevant_categories)
                        or "flux" in endpoint_id.lower()
                        or "video" in endpoint_id.lower()
                        or "image" in endpoint_id.lower()
                    )
                    if not is_relevant:
                        continue

                    # Determine type
                    model_type = "image"
                    if "video" in category or "video" in endpoint_id.lower():
                        model_type = "video"

                    # Determine input type
                    ep_lower = endpoint_id.lower()
                    if model_type == "video":
                        input_type = "text-to-video"
                    else:
                        input_type = "text-to-image"

                    # Refine from category
                    for cat_key in relevant_categories:
                        if cat_key in category:
                            input_type = cat_key
                            break

                    # Refine from endpoint ID patterns
                    if "edit" in ep_lower:
                        input_type = "image-to-video" if model_type == "video" else "image-to-image"
                    elif "img2img" in ep_lower or "image-to-image" in ep_lower:
                        input_type = "image-to-image"
                    elif "img2vid" in ep_lower or "image-to-video" in ep_lower:
                        input_type = "image-to-video"
                    elif "inpaint" in ep_lower or "outpaint" in ep_lower:
                        input_type = "image-editing"
                    elif "upscale" in ep_lower:
                        input_type = "upscaling"
                    elif "face" in ep_lower or "faceswap" in ep_lower:
                        input_type = "face"
                    elif "lipsync" in ep_lower:
                        input_type = "lipsync"

                    display_name = (
                        meta.get("display_name")
                        or endpoint_id.split("/")[-1]
                        or endpoint_id
                    )

                    models.append(DiscoveredModel(
                        id=_sanitize_id(f"fal-{endpoint_id}"),
                        name=display_name,
                        description=meta.get("description") or f"{display_name} on fal.ai",
                        type=model_type,
                        input_type=input_type,
                        model_id=endpoint_id,
                        tags=meta.get("tags") or [category.replace("-", " ")] if category else [],
                        provider="fal",
                    ))

                cursor = data.get("next_cursor")
                page_count += 1
                if not cursor:
                    break

        logger.info(f"fal discovery: found {len(models)} relevant models")
        return models

    except Exception as e:
        logger.error(f"fal discovery error: {e}")
        # Fallback curated list
        return [
            DiscoveredModel(id="fal-flux-dev", name="FLUX.1 [dev]", description="High-quality image generation", type="image", input_type="text-to-image", model_id="fal-ai/flux/dev", tags=["flux"], provider="fal"),
            DiscoveredModel(id="fal-flux-schnell", name="FLUX.1 [schnell]", description="Fast image generation", type="image", input_type="text-to-image", model_id="fal-ai/flux/schnell", tags=["flux", "fast"], provider="fal"),
            DiscoveredModel(id="fal-sdxl", name="Stable Diffusion XL", description="High-resolution synthesis", type="image", input_type="text-to-image", model_id="fal-ai/fast-sdxl", tags=["sdxl"], provider="fal"),
            DiscoveredModel(id="fal-luma-dream", name="Luma Dream Machine", description="Video generation", type="video", input_type="text-to-video", model_id="fal-ai/luma-dream-machine", tags=["luma"], provider="fal"),
            DiscoveredModel(id="fal-kling-v2", name="Kling 2.0", description="Kling video generation", type="video", input_type="text-to-video", model_id="fal-ai/kling-video/v2/standard/text-to-video", tags=["kling"], provider="fal"),
        ]


async def _discover_models(provider_id: str, api_key: str) -> list[DiscoveredModel]:
    """Dispatch discovery to the right provider."""
    if provider_id == "krea":
        return await _discover_krea_models()
    elif provider_id == "fal":
        return await _discover_fal_models(api_key)
    raise ValueError(f"Discovery not supported for: {provider_id}")


@router.post("/{provider_id}/discover", response_model=DiscoverResponse)
async def discover_provider_models(provider_id: str):
    """Discover available models from a provider's API."""
    _validate_provider(provider_id)

    if provider_id not in DISCOVERY_PROVIDERS:
        return DiscoverResponse(
            success=False,
            discovered=0,
            models=[],
            error=f"Model discovery is not supported for {KNOWN_PROVIDERS[provider_id]['name']}.",
        )

    # Load API key (KREA doesn't need one - public OpenAPI spec)
    api_key = ""
    if provider_id != "krea":
        data = _load_providers()
        raw = data.get(provider_id)
        if raw:
            api_key = raw.get("api_key", "")

    try:
        discovered = await _discover_models(provider_id, api_key)
        logger.info(f"Discovered {len(discovered)} models for {provider_id}")
        return DiscoverResponse(
            success=True,
            discovered=len(discovered),
            models=discovered,
        )
    except Exception as e:
        logger.error(f"Discovery error for {provider_id}: {e}")
        return DiscoverResponse(
            success=False,
            discovered=0,
            models=[],
            error=str(e),
        )
