import httpx
import time
import logging
from typing import Optional


CIVITAI_API_BASE = "https://civitai.com/api/v1"

# Cache TTLs in seconds
SEARCH_CACHE_TTL = 300  # 5 minutes for search results
MODEL_CACHE_TTL = 900   # 15 minutes for individual model details
MAX_CACHE_ENTRIES = 200  # Prevent unbounded memory growth

logger = logging.getLogger(__name__)


class CivitaiClient:
    def __init__(self):
        self.client = httpx.AsyncClient(
            base_url=CIVITAI_API_BASE,
            timeout=30.0,
            follow_redirects=True,
        )
        # In-memory response cache: key -> (timestamp, data)
        self._search_cache: dict[str, tuple[float, dict]] = {}
        self._model_cache: dict[int, tuple[float, dict]] = {}

    def _is_fresh(self, entry: tuple[float, dict], ttl: float) -> bool:
        return (time.monotonic() - entry[0]) < ttl

    def _evict_stale(self, cache: dict, ttl: float) -> None:
        """Remove expired entries and enforce max size."""
        now = time.monotonic()
        stale_keys = [k for k, (ts, _) in cache.items() if (now - ts) >= ttl]
        for k in stale_keys:
            del cache[k]
        # If still over limit, drop oldest entries
        if len(cache) > MAX_CACHE_ENTRIES:
            sorted_keys = sorted(cache, key=lambda k: cache[k][0])
            for k in sorted_keys[: len(cache) - MAX_CACHE_ENTRIES]:
                del cache[k]

    def _search_cache_key(
        self,
        query: Optional[str],
        types: Optional[str],
        sort: Optional[str],
        nsfw: Optional[bool],
        base_models: Optional[str],
        limit: int,
        cursor: Optional[str],
        tag: Optional[str] = None,
    ) -> str:
        return f"{query}|{types}|{sort}|{nsfw}|{base_models}|{limit}|{cursor}|{tag}"

    async def search_models(
        self,
        query: Optional[str] = None,
        types: Optional[str] = None,
        sort: Optional[str] = None,
        nsfw: Optional[bool] = None,
        base_models: Optional[str] = None,
        limit: int = 20,
        cursor: Optional[str] = None,
        tag: Optional[str] = None,
    ) -> dict:
        cache_key = self._search_cache_key(query, types, sort, nsfw, base_models, limit, cursor, tag)

        # Check cache
        cached = self._search_cache.get(cache_key)
        if cached and self._is_fresh(cached, SEARCH_CACHE_TTL):
            logger.debug("CivitAI search cache hit: %s", cache_key)
            return cached[1]

        params = {"limit": limit}
        if query:
            params["query"] = query
        if types:
            params["types"] = types
        if sort:
            params["sort"] = sort
        if nsfw is not None:
            params["nsfw"] = str(nsfw).lower()
        if base_models:
            # Civitai API expects repeated baseModels params
            pass
        if cursor:
            params["cursor"] = cursor
        if tag:
            params["tag"] = tag

        # Handle baseModels as repeated query params
        url = "/models"
        if base_models:
            parts = [f"baseModels={bm.strip()}" for bm in base_models.split(",")]
            extra = "&".join(parts)
            param_str = "&".join(f"{k}={v}" for k, v in params.items())
            url = f"/models?{param_str}&{extra}"
            resp = await self.client.get(url)
        else:
            resp = await self.client.get("/models", params=params)

        resp.raise_for_status()
        data = resp.json()

        # Store in cache
        self._search_cache[cache_key] = (time.monotonic(), data)
        self._evict_stale(self._search_cache, SEARCH_CACHE_TTL)

        return data

    async def get_model(self, model_id: int) -> dict:
        # Check cache
        cached = self._model_cache.get(model_id)
        if cached and self._is_fresh(cached, MODEL_CACHE_TTL):
            logger.debug("CivitAI model cache hit: %d", model_id)
            return cached[1]

        resp = await self.client.get(f"/models/{model_id}")
        resp.raise_for_status()
        data = resp.json()

        # Store in cache
        self._model_cache[model_id] = (time.monotonic(), data)
        self._evict_stale(self._model_cache, MODEL_CACHE_TTL)

        return data

    async def close(self):
        await self.client.aclose()


# Singleton
_civitai_client: Optional[CivitaiClient] = None


def get_civitai_client() -> CivitaiClient:
    global _civitai_client
    if _civitai_client is None:
        _civitai_client = CivitaiClient()
    return _civitai_client
