from fastapi import APIRouter, HTTPException, Query
from typing import Optional

from ..models.civitai_schemas import (
    CivitaiDownloadRequest,
    CivitaiDownloadJob,
    CivitaiSearchResponse,
    CivitaiModelSummary,
)
from ..services.civitai_client import get_civitai_client
from ..services.civitai_downloads import get_civitai_download_manager

router = APIRouter(prefix="/api/civitai", tags=["civitai"])


# ============== Browse Endpoints ==============

@router.get("/models")
async def search_models(
    query: Optional[str] = None,
    types: Optional[str] = None,
    sort: Optional[str] = "Highest Rated",
    nsfw: Optional[bool] = False,
    base_models: Optional[str] = None,
    limit: int = Query(default=20, ge=1, le=100),
    cursor: Optional[str] = None,
):
    client = get_civitai_client()
    try:
        data = await client.search_models(
            query=query,
            types=types,
            sort=sort,
            nsfw=nsfw,
            base_models=base_models,
            limit=limit,
            cursor=cursor,
        )
        return data
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Civitai API error: {str(e)}")


@router.get("/models/{model_id}")
async def get_model(model_id: int):
    client = get_civitai_client()
    try:
        data = await client.get_model(model_id)
        return data
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Civitai API error: {str(e)}")


# ============== Download Endpoints ==============

@router.post("/downloads", response_model=CivitaiDownloadJob)
async def start_download(request: CivitaiDownloadRequest):
    manager = get_civitai_download_manager()

    # Check if already downloading this version
    existing = [
        j for j in manager.get_all_jobs()
        if j.version_id == request.version_id
        and j.status in ["queued", "downloading", "completed"]
    ]
    if existing:
        return existing[0]

    job = manager.create_download(request)
    return job


@router.get("/downloads", response_model=list[CivitaiDownloadJob])
async def list_downloads():
    manager = get_civitai_download_manager()
    return manager.get_all_jobs()


@router.get("/downloads/{job_id}", response_model=CivitaiDownloadJob)
async def get_download(job_id: str):
    manager = get_civitai_download_manager()
    job = manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Download job not found")
    return job


@router.delete("/downloads/{job_id}")
async def cancel_download(job_id: str):
    manager = get_civitai_download_manager()
    success = manager.cancel_download(job_id)
    if not success:
        raise HTTPException(status_code=404, detail="Download job not found")
    return {"status": "cancelled", "job_id": job_id}


@router.get("/downloaded-versions", response_model=list[int])
async def get_downloaded_versions():
    manager = get_civitai_download_manager()
    return manager.get_downloaded_version_ids()
