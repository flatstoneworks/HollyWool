"""Video generation job endpoints."""

from datetime import datetime

from fastapi import APIRouter, HTTPException

from ..models.schemas import (
    VideoGenerateRequest, VideoJob, VideoJobResponse, VideoJobListResponse,
    JobStatus,
)
from ..services.inference import get_inference_service
from ..services.video_jobs import get_video_job_manager
from ..services.resources import check_resources_for_video
from .settings import add_log, RequestLog

router = APIRouter(prefix="/api", tags=["video"])


@router.post("/video/jobs", response_model=VideoJobResponse)
async def create_video_job(request: VideoGenerateRequest):
    """Create a new video generation job. Returns immediately with job_id."""
    service = get_inference_service()

    # Validate model exists and is a video model
    model_config = service.get_model_config(request.model)
    if not model_config:
        raise HTTPException(status_code=400, detail=f"Unknown model: {request.model}")

    if model_config.get("type") not in ["video", "ltx2", "wan", "mochi"]:
        raise HTTPException(status_code=400, detail=f"Model {request.model} is not a video model")

    # Check system resources before accepting job
    model_size_gb = model_config.get("size_gb", 12)  # Default to 12GB if not specified
    model_name = model_config.get("name", request.model)
    resource_status = check_resources_for_video(model_size_gb, model_name)

    if not resource_status.is_available:
        raise HTTPException(
            status_code=507,  # Insufficient Storage
            detail={
                "error": "insufficient_resources",
                "message": resource_status.rejection_reason,
                "resources": {
                    "memory_available_gb": round(resource_status.memory_available_gb, 1),
                    "memory_required_gb": round(model_size_gb + 5.0 + 10.0, 1),  # model + overhead + buffer
                    "gpu_utilization": resource_status.gpu_utilization,
                    "cpu_percent": round(resource_status.cpu_percent, 1),
                }
            }
        )

    video_job_manager = get_video_job_manager()
    job = video_job_manager.create_job(request)

    # Log the request
    log_entry = RequestLog(
        id=job.id,
        timestamp=datetime.now().isoformat(),
        type="video",
        prompt=request.prompt,
        negative_prompt=request.negative_prompt,
        model=request.model,
        parameters={
            "width": request.width or 768,
            "height": request.height or 512,
            "num_frames": request.num_frames or 97,
            "fps": request.fps or 24,
            "steps": request.steps,
            "guidance_scale": request.guidance_scale,
            "seed": request.seed,
        },
        status="pending",
    )
    add_log(log_entry)

    return VideoJobResponse(
        job_id=job.id,
        status=job.status,
        message=f"Video job queued. Estimated time: {int(job.eta_seconds or 0)}s"
    )


@router.get("/video/jobs/{job_id}", response_model=VideoJob)
async def get_video_job(job_id: str):
    """Get the status of a specific video job."""
    video_job_manager = get_video_job_manager()
    job = video_job_manager.get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Video job not found")

    return job


@router.get("/video/jobs", response_model=VideoJobListResponse)
async def list_video_jobs(session_id: str = None, active_only: bool = False):
    """List video jobs, optionally filtered by session or active status."""
    video_job_manager = get_video_job_manager()

    if session_id:
        jobs = video_job_manager.get_jobs_by_session(session_id)
    elif active_only:
        jobs = video_job_manager.get_active_jobs()
    else:
        jobs = list(video_job_manager.jobs.values())

    # Sort by created_at descending
    jobs = sorted(jobs, key=lambda j: j.created_at, reverse=True)

    return VideoJobListResponse(jobs=jobs)
