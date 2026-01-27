"""Image-to-Video (I2V) job endpoints."""

from datetime import datetime

from fastapi import APIRouter, HTTPException

from ..models.schemas import (
    I2VGenerateRequest, I2VJob, I2VJobResponse, I2VJobListResponse,
)
from ..services.inference import get_inference_service
from ..services.i2v_jobs import get_i2v_job_manager
from ..services.resources import check_resources_for_video
from .settings import add_log, RequestLog

router = APIRouter(prefix="/api", tags=["i2v"])


@router.post("/i2v/jobs", response_model=I2VJobResponse)
async def create_i2v_job(request: I2VGenerateRequest):
    """Create a new image-to-video generation job. Returns immediately with job_id."""
    service = get_inference_service()

    # Validate model exists and is an I2V model
    model_config = service.get_model_config(request.model)
    if not model_config:
        raise HTTPException(status_code=400, detail=f"Unknown model: {request.model}")

    if model_config.get("type") not in ["video-i2v", "svd"]:
        raise HTTPException(status_code=400, detail=f"Model {request.model} does not support I2V")

    # Validate image source is provided
    if not request.reference_images and not request.image_base64 and not request.image_asset_id:
        raise HTTPException(status_code=400, detail="Must provide reference_images, image_base64, or image_asset_id")

    # Check system resources before accepting job
    model_size_gb = model_config.get("size_gb", 12)
    model_name = model_config.get("name", request.model)
    resource_status = check_resources_for_video(model_size_gb, model_name)

    if not resource_status.is_available:
        raise HTTPException(
            status_code=507,
            detail={
                "error": "insufficient_resources",
                "message": resource_status.rejection_reason,
                "resources": {
                    "memory_available_gb": round(resource_status.memory_available_gb, 1),
                    "memory_required_gb": round(model_size_gb + 5.0 + 10.0, 1),
                    "gpu_utilization": resource_status.gpu_utilization,
                    "cpu_percent": round(resource_status.cpu_percent, 1),
                }
            }
        )

    try:
        i2v_job_manager = get_i2v_job_manager()
        job = i2v_job_manager.create_job(request)

        # Log the request
        log_entry = RequestLog(
            id=job.id,
            timestamp=datetime.now().isoformat(),
            type="i2v",
            prompt=request.prompt or "Image-to-Video",
            negative_prompt=request.negative_prompt,
            model=request.model,
            parameters={
                "width": request.width,
                "height": request.height,
                "num_frames": request.num_frames or 24,
                "fps": request.fps or 6,
                "motion_bucket_id": request.motion_bucket_id,
                "noise_aug_strength": request.noise_aug_strength,
                "seed": request.seed,
                "image_asset_id": request.image_asset_id,
            },
            status="pending",
        )
        add_log(log_entry)

        return I2VJobResponse(
            job_id=job.id,
            status=job.status,
            message=f"I2V job queued. Estimated time: {int(job.eta_seconds or 0)}s"
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/i2v/jobs/{job_id}", response_model=I2VJob)
async def get_i2v_job(job_id: str):
    """Get the status of a specific I2V job."""
    i2v_job_manager = get_i2v_job_manager()
    job = i2v_job_manager.get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="I2V job not found")

    return job


@router.get("/i2v/jobs", response_model=I2VJobListResponse)
async def list_i2v_jobs(session_id: str = None, active_only: bool = False):
    """List I2V jobs, optionally filtered by session or active status."""
    i2v_job_manager = get_i2v_job_manager()

    if session_id:
        jobs = i2v_job_manager.get_jobs_by_session(session_id)
    elif active_only:
        jobs = i2v_job_manager.get_active_jobs()
    else:
        jobs = list(i2v_job_manager.jobs.values())

    # Sort by created_at descending
    jobs = sorted(jobs, key=lambda j: j.created_at, reverse=True)

    return I2VJobListResponse(jobs=jobs)
