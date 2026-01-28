"""Video upscale job endpoints."""

from pathlib import Path

from fastapi import APIRouter, HTTPException

from ..models.schemas import (
    VideoUpscaleRequest, UpscaleJob, UpscaleJobResponse, UpscaleJobListResponse,
    UpscaleModelInfo, UpscaleModelsResponse,
)
from ..services.upscale_jobs import get_upscale_job_manager
from ..services.upscaler import get_upscaler_service
from ..utils.paths import get_output_dir

router = APIRouter(prefix="/api", tags=["upscale"])


@router.get("/upscale/models", response_model=UpscaleModelsResponse)
async def list_upscale_models():
    """List available video upscale models."""
    upscaler_service = get_upscaler_service()
    models_config = upscaler_service.get_upscale_models()

    models = [
        UpscaleModelInfo(
            id=model_id,
            name=config["name"],
            scale=config["scale"],
            description=config.get("description", ""),
        )
        for model_id, config in models_config.items()
    ]

    return UpscaleModelsResponse(models=models)


@router.post("/upscale/jobs", response_model=UpscaleJobResponse)
async def create_upscale_job(request: VideoUpscaleRequest):
    """Create a new video upscale job. Returns immediately with job_id."""
    # Validate upscale model
    upscaler_service = get_upscaler_service()
    model_config = upscaler_service.get_model_config(request.model)
    if not model_config:
        raise HTTPException(status_code=400, detail=f"Unknown upscale model: {request.model}")

    # Validate source video exists
    output_dir = get_output_dir()
    video_path = output_dir / f"{request.video_asset_id}.mp4"
    metadata_path = output_dir / f"{request.video_asset_id}.json"

    if not video_path.exists():
        raise HTTPException(status_code=404, detail=f"Video not found: {request.video_asset_id}")

    if not metadata_path.exists():
        raise HTTPException(status_code=404, detail=f"Video metadata not found: {request.video_asset_id}")

    try:
        upscale_job_manager = get_upscale_job_manager()
        job = upscale_job_manager.create_job(request)

        return UpscaleJobResponse(
            job_id=job.id,
            status=job.status,
            message=f"Upscale job queued. Estimated time: {int(job.eta_seconds or 0)}s",
            eta_seconds=job.eta_seconds,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/upscale/jobs/{job_id}", response_model=UpscaleJob)
async def get_upscale_job(job_id: str):
    """Get the status of a specific upscale job."""
    upscale_job_manager = get_upscale_job_manager()
    job = upscale_job_manager.get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Upscale job not found")

    return job


@router.get("/upscale/jobs", response_model=UpscaleJobListResponse)
async def list_upscale_jobs(session_id: str = None, active_only: bool = False):
    """List upscale jobs, optionally filtered by session or active status."""
    upscale_job_manager = get_upscale_job_manager()

    if session_id:
        jobs = upscale_job_manager.get_jobs_by_session(session_id)
    elif active_only:
        jobs = upscale_job_manager.get_active_jobs()
    else:
        jobs = upscale_job_manager.get_all_jobs()

    # Sort by created_at descending
    jobs = sorted(jobs, key=lambda j: j.created_at, reverse=True)

    return UpscaleJobListResponse(jobs=jobs)
