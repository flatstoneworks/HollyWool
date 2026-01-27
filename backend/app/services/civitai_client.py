import httpx
from typing import Optional


CIVITAI_API_BASE = "https://civitai.com/api/v1"


class CivitaiClient:
    def __init__(self):
        self.client = httpx.AsyncClient(
            base_url=CIVITAI_API_BASE,
            timeout=30.0,
            follow_redirects=True,
        )

    async def search_models(
        self,
        query: Optional[str] = None,
        types: Optional[str] = None,
        sort: Optional[str] = None,
        nsfw: Optional[bool] = None,
        base_models: Optional[str] = None,
        limit: int = 20,
        cursor: Optional[str] = None,
    ) -> dict:
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
        return resp.json()

    async def get_model(self, model_id: int) -> dict:
        resp = await self.client.get(f"/models/{model_id}")
        resp.raise_for_status()
        return resp.json()

    async def close(self):
        await self.client.aclose()


# Singleton
_civitai_client: Optional[CivitaiClient] = None


def get_civitai_client() -> CivitaiClient:
    global _civitai_client
    if _civitai_client is None:
        _civitai_client = CivitaiClient()
    return _civitai_client
