"""Claude API client for generating prompt variations."""

import json
import logging

import httpx

from ..utils.paths import get_data_dir

logger = logging.getLogger(__name__)

_PROVIDERS_PATH = get_data_dir() / "providers.json"


def _get_anthropic_key() -> str:
    """Load Anthropic API key from providers.json."""
    if _PROVIDERS_PATH.exists():
        try:
            with open(_PROVIDERS_PATH) as f:
                data = json.load(f)
            raw = data.get("anthropic", {})
            key = raw.get("api_key", "")
            if key:
                return key
        except Exception as e:
            logger.error(f"Failed to load Anthropic API key: {e}")
    raise ValueError("Anthropic API key not configured. Go to Settings > Providers > Anthropic to add your key.")


async def generate_prompt_variations(
    base_prompt: str,
    count: int = 10,
    style_guidance: str | None = None,
    model: str = "claude-sonnet-4-20250514",
) -> list[str]:
    """Generate prompt variations using Claude API.

    Args:
        base_prompt: The base prompt to create variations of.
        count: Number of variations to generate.
        style_guidance: Optional style guidance to influence variations.
        model: Claude model to use.

    Returns:
        List of prompt variation strings.
    """
    api_key = _get_anthropic_key()

    system_prompt = (
        "You are a creative prompt engineer for AI image generation. "
        "Given a base prompt, generate unique and diverse variations that explore "
        "different angles, compositions, lighting, styles, moods, and details. "
        "Each variation should be a complete, self-contained image generation prompt. "
        "Keep each prompt concise (under 200 words) but descriptive enough for high-quality generation."
    )
    if style_guidance:
        system_prompt += f"\n\nStyle guidance from the user: {style_guidance}"

    user_message = (
        f"Generate exactly {count} unique prompt variations based on this base prompt:\n\n"
        f"\"{base_prompt}\"\n\n"
        f"Return ONLY a JSON array of {count} strings. No explanation, no markdown formatting, "
        f"just the raw JSON array. Example format:\n"
        f'["variation 1", "variation 2", ...]'
    )

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": model,
                "max_tokens": 4096,
                "system": system_prompt,
                "messages": [
                    {"role": "user", "content": user_message}
                ],
            },
        )

        if response.status_code != 200:
            error_detail = response.text[:500]
            logger.error(f"Anthropic API error {response.status_code}: {error_detail}")
            raise ValueError(f"Anthropic API error ({response.status_code}): {error_detail}")

        data = response.json()
        content = data.get("content", [])
        if not content:
            raise ValueError("Empty response from Claude API")

        text = content[0].get("text", "")

        # Parse JSON array from response - handle potential markdown wrapping
        text = text.strip()
        if text.startswith("```"):
            # Remove markdown code block
            lines = text.split("\n")
            text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
            text = text.strip()

        try:
            variations = json.loads(text)
        except json.JSONDecodeError:
            # Try to extract JSON array from the text
            start = text.find("[")
            end = text.rfind("]")
            if start != -1 and end != -1:
                try:
                    variations = json.loads(text[start:end + 1])
                except json.JSONDecodeError:
                    raise ValueError(f"Failed to parse Claude response as JSON array: {text[:200]}")
            else:
                raise ValueError(f"Claude response does not contain a JSON array: {text[:200]}")

        if not isinstance(variations, list):
            raise ValueError(f"Expected a JSON array, got: {type(variations).__name__}")

        # Ensure all items are strings
        variations = [str(v) for v in variations]

        logger.info(f"Generated {len(variations)} prompt variations from base: {base_prompt[:50]}...")
        return variations
