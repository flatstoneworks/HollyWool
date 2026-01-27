"""fal.ai client for image generation via the queue API."""

import asyncio
import json
import logging
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)

_DATA_DIR = Path(__file__).parent.parent.parent.parent / "data"
_PROVIDERS_PATH = _DATA_DIR / "providers.json"

# Poll interval and timeout
POLL_INTERVAL = 2.0  # seconds
MAX_POLL_TIME = 300.0  # 5 minutes


def _get_fal_key() -> str:
    """Load fal.ai API key from providers.json."""
    if _PROVIDERS_PATH.exists():
        try:
            with open(_PROVIDERS_PATH) as f:
                data = json.load(f)
            raw = data.get("fal", {})
            key = raw.get("api_key", "")
            if key:
                return key
        except Exception as e:
            logger.error(f"Failed to load fal API key: {e}")
    raise ValueError("fal.ai API key not configured. Go to Settings > Providers > fal to add your key.")


async def generate_image(
    prompt: str,
    model_id: str = "fal-ai/flux/schnell",
    width: int = 1024,
    height: int = 1024,
    steps: int | None = None,
    seed: int | None = None,
) -> dict:
    """Generate an image using fal.ai queue API.

    Args:
        prompt: Text prompt for image generation.
        model_id: fal.ai model endpoint ID.
        width: Image width.
        height: Image height.
        steps: Number of inference steps (model-specific default if None).
        seed: Random seed for reproducibility.

    Returns:
        dict with keys: image_url, seed, content_type
    """
    api_key = _get_fal_key()

    headers = {
        "Authorization": f"Key {api_key}",
        "Content-Type": "application/json",
    }

    # Build request payload
    payload: dict = {
        "prompt": prompt,
        "image_size": {
            "width": width,
            "height": height,
        },
    }
    if steps is not None:
        payload["num_inference_steps"] = steps
    if seed is not None:
        payload["seed"] = seed

    async with httpx.AsyncClient(timeout=30.0) as client:
        # Step 1: Submit to queue
        submit_url = f"https://queue.fal.run/{model_id}"
        submit_response = await client.post(submit_url, headers=headers, json=payload)

        if submit_response.status_code != 200:
            error_text = submit_response.text[:500]
            logger.error(f"fal.ai submit error {submit_response.status_code}: {error_text}")
            raise ValueError(f"fal.ai submit error ({submit_response.status_code}): {error_text}")

        submit_data = submit_response.json()
        request_id = submit_data.get("request_id")
        if not request_id:
            raise ValueError(f"No request_id in fal.ai response: {submit_data}")

        logger.info(f"fal.ai job submitted: {request_id} for model {model_id}")

        # Step 2: Poll for completion
        status_url = f"https://queue.fal.run/{model_id}/requests/{request_id}/status"
        elapsed = 0.0

        while elapsed < MAX_POLL_TIME:
            await asyncio.sleep(POLL_INTERVAL)
            elapsed += POLL_INTERVAL

            status_response = await client.get(status_url, headers=headers)
            if status_response.status_code != 200:
                logger.warning(f"fal.ai status poll error: {status_response.status_code}")
                continue

            status_data = status_response.json()
            status = status_data.get("status")

            if status == "COMPLETED":
                break
            elif status in ("FAILED", "CANCELLED"):
                error = status_data.get("error", "Unknown error")
                raise ValueError(f"fal.ai generation failed: {error}")
            # IN_QUEUE or IN_PROGRESS - continue polling

        else:
            raise ValueError(f"fal.ai generation timed out after {MAX_POLL_TIME}s")

        # Step 3: Fetch result
        result_url = f"https://queue.fal.run/{model_id}/requests/{request_id}"
        result_response = await client.get(result_url, headers=headers)

        if result_response.status_code != 200:
            raise ValueError(f"fal.ai result fetch error: {result_response.status_code}")

        result_data = result_response.json()

        # Extract image URL from result - fal.ai returns images in different formats
        images = result_data.get("images") or result_data.get("output", {}).get("images", [])
        if not images:
            # Some models return a single image
            image_url = result_data.get("image", {}).get("url") or result_data.get("output", {}).get("url")
            if not image_url:
                raise ValueError(f"No images in fal.ai result: {list(result_data.keys())}")
        else:
            image_url = images[0].get("url") if isinstance(images[0], dict) else images[0]

        result_seed = result_data.get("seed") or result_data.get("output", {}).get("seed")

        return {
            "image_url": image_url,
            "seed": result_seed,
            "content_type": images[0].get("content_type", "image/png") if images else "image/png",
        }


async def download_image(url: str) -> bytes:
    """Download an image from a URL.

    Args:
        url: URL of the image to download.

    Returns:
        Image data as bytes.
    """
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        response = await client.get(url)
        if response.status_code != 200:
            raise ValueError(f"Failed to download image: HTTP {response.status_code}")
        return response.content
