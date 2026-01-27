import uuid
import json
import random
import re
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel

from ..models.schemas import (
    GenerateRequest, GenerateResponse, ImageResult, ModelsResponse, HealthResponse,
    Job, JobResponse, JobListResponse, JobStatus,
    ModelsDetailedResponse, CacheStatusResponse, CacheDeleteResponse,
    VideoGenerateRequest, VideoJob, VideoJobResponse, VideoJobListResponse,
    SystemResourceStatus, ResourceCheckResponse,
    LoRAListResponse, LoRAScanResponse,
    I2VGenerateRequest, I2VJob, I2VJobResponse, I2VJobListResponse,
    VideoUpscaleRequest, UpscaleJob, UpscaleJobResponse, UpscaleJobListResponse,
    UpscaleModelInfo, UpscaleModelsResponse,
)


class TitleRequest(BaseModel):
    prompt: str


class TitleResponse(BaseModel):
    title: str


# Common style prefixes to strip when generating titles
STYLE_PREFIXES = [
    r"cinematic film still,?\s*dramatic lighting,?\s*",
    r"anime style,?\s*vibrant colors,?\s*detailed illustration,?\s*",
    r"professional photography,?\s*8k uhd,?\s*dslr,?\s*",
    r"digital art,?\s*highly detailed,?\s*artstation,?\s*",
    r"oil painting,?\s*classical art style,?\s*textured brushstrokes,?\s*",
    r"^a photo of\s+",
    r"^an image of\s+",
    r"^a picture of\s+",
]


def generate_title_from_prompt(prompt: str) -> str:
    """Generate a short title from a prompt by extracting key concepts."""
    # Remove style prefixes
    cleaned = prompt
    for prefix in STYLE_PREFIXES:
        cleaned = re.sub(prefix, "", cleaned, flags=re.IGNORECASE)

    cleaned = cleaned.strip()

    # Take first sentence or clause
    for sep in [". ", ", ", " - ", " | "]:
        if sep in cleaned:
            cleaned = cleaned.split(sep)[0]
            break

    # Limit to ~5-6 words
    words = cleaned.split()
    if len(words) > 6:
        # Try to find a natural break point
        title_words = words[:6]
        title = " ".join(title_words)
    else:
        title = cleaned

    # Capitalize first letter
    if title:
        title = title[0].upper() + title[1:] if len(title) > 1 else title.upper()

    # Limit length
    if len(title) > 50:
        title = title[:47] + "..."

    return title or "New Session"


from ..services.inference import get_inference_service
from ..services.jobs import get_job_manager
from ..services.video_jobs import get_video_job_manager
from ..services.i2v_jobs import get_i2v_job_manager
from ..services.lora_manager import get_lora_manager
from ..services.resources import check_resources_for_video, get_system_resources
from ..services.upscale_jobs import get_upscale_job_manager
from ..services.upscaler import get_upscaler_service
from .settings import add_log, update_log, RequestLog

router = APIRouter(prefix="/api", tags=["generate"])


def get_output_dir() -> Path:
    output_dir = Path(__file__).parent.parent.parent.parent / "outputs"
    output_dir.mkdir(parents=True, exist_ok=True)
    return output_dir


def _detect_hostname() -> str | None:
    """Detect preferred hostname. Returns 'spark.local' on DGX Spark devices."""
    try:
        with open("/etc/dgx-release") as f:
            for line in f:
                if "DGX Spark" in line:
                    return "spark.local"
    except FileNotFoundError:
        pass
    return None


@router.get("/health", response_model=HealthResponse)
async def health_check():
    service = get_inference_service()
    return HealthResponse(
        status="ok",
        gpu_available=service.is_gpu_available(),
        current_model=service.current_model_id,
        hostname=_detect_hostname(),
    )


@router.get("/models", response_model=ModelsResponse)
async def list_models():
    service = get_inference_service()
    models = service.get_available_models()
    return ModelsResponse(
        models=models,
        current_model=service.current_model_id,
    )


@router.get("/models/detailed", response_model=ModelsDetailedResponse)
async def list_models_detailed():
    """Get detailed model info including actual cache sizes and statistics."""
    service = get_inference_service()
    result = service.get_models_detailed()
    return ModelsDetailedResponse(**result)


@router.get("/models/cache-status", response_model=CacheStatusResponse)
async def get_cache_status():
    """Get overall cache usage statistics."""
    service = get_inference_service()
    result = service.get_cache_status()
    return CacheStatusResponse(**result)


@router.delete("/models/{model_id}/cache", response_model=CacheDeleteResponse)
async def delete_model_cache(model_id: str):
    """Delete cached files for a specific model to free up space."""
    service = get_inference_service()

    # Don't allow deleting currently loaded model
    if service.current_model_id == model_id:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete cache for currently loaded model. Load a different model first."
        )

    result = service.delete_model_cache(model_id)

    if not result["success"] and result.get("error") == "Model not found":
        raise HTTPException(status_code=404, detail="Model not found")

    return CacheDeleteResponse(**result)


@router.post("/models/{model_id}/download")
async def download_model(model_id: str, background_tasks: BackgroundTasks):
    """Pre-download a model to cache without loading it into memory."""
    service = get_inference_service()

    # Check if model exists in config
    model_config = service.get_model_config(model_id)
    if not model_config:
        raise HTTPException(status_code=404, detail=f"Model not found: {model_id}")

    # Check if already cached
    if service.is_model_cached(model_id):
        return {"status": "already_cached", "model_id": model_id}

    # Start background download
    def do_download():
        try:
            service.download_model(model_id)
        except Exception as e:
            print(f"Error downloading model {model_id}: {e}")

    background_tasks.add_task(do_download)
    return {"status": "downloading", "model_id": model_id}


@router.post("/generate-title", response_model=TitleResponse)
async def generate_title(request: TitleRequest):
    """Generate a short title from a prompt for session naming."""
    title = generate_title_from_prompt(request.prompt)
    return TitleResponse(title=title)


@router.post("/generate", response_model=GenerateResponse)
async def generate_images(request: GenerateRequest):
    service = get_inference_service()

    # Validate model exists
    model_config = service.get_model_config(request.model)
    if not model_config:
        raise HTTPException(status_code=400, detail=f"Unknown model: {request.model}")

    try:
        batch_id = request.batch_id or str(uuid.uuid4())
        output_dir = get_output_dir()
        created_at = datetime.utcnow()

        # Determine actual values used
        steps_used = request.steps if request.steps else model_config["default_steps"]
        guidance_used = request.guidance_scale if request.guidance_scale is not None else model_config["default_guidance"]

        # Generate base seed if not provided
        base_seed = request.seed if request.seed is not None else random.randint(0, 2**32 - 1)

        images_results = []

        # Generate multiple images with different seeds
        for i in range(request.num_images):
            # Use different seed for each image (base_seed + offset)
            image_seed = base_seed + i

            image, actual_seed = service.generate(
                prompt=request.prompt,
                model_id=request.model,
                negative_prompt=request.negative_prompt,
                width=request.width,
                height=request.height,
                steps=request.steps,
                guidance_scale=request.guidance_scale,
                seed=image_seed,
                loras=request.loras,
            )

            # Save image and metadata
            asset_id = str(uuid.uuid4())
            image_path = output_dir / f"{asset_id}.png"
            metadata_path = output_dir / f"{asset_id}.json"

            # Save image
            image.save(image_path, "PNG")

            # Save metadata
            metadata = {
                "id": asset_id,
                "filename": f"{asset_id}.png",
                "prompt": request.prompt,
                "negative_prompt": request.negative_prompt,
                "model": request.model,
                "width": request.width,
                "height": request.height,
                "steps": steps_used,
                "guidance_scale": guidance_used,
                "seed": actual_seed,
                "batch_id": batch_id,
                "created_at": created_at.isoformat(),
                "loras": [{"lora_id": l.lora_id, "weight": l.weight} for l in request.loras] if request.loras else None,
            }

            with open(metadata_path, "w") as f:
                json.dump(metadata, f, indent=2)

            images_results.append(ImageResult(
                id=asset_id,
                filename=f"{asset_id}.png",
                url=f"/outputs/{asset_id}.png",
                seed=actual_seed,
            ))

        return GenerateResponse(
            batch_id=batch_id,
            prompt=request.prompt,
            model=request.model,
            width=request.width,
            height=request.height,
            steps=steps_used,
            guidance_scale=guidance_used,
            images=images_results,
            created_at=created_at,
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============== Job-based Generation Endpoints ==============

@router.post("/jobs", response_model=JobResponse)
async def create_job(request: GenerateRequest):
    """Create a new generation job. Returns immediately with job_id."""
    service = get_inference_service()

    # Validate model exists
    model_config = service.get_model_config(request.model)
    if not model_config:
        raise HTTPException(status_code=400, detail=f"Unknown model: {request.model}")

    job_manager = get_job_manager()
    job = job_manager.create_job(request)

    # Log the request
    log_entry = RequestLog(
        id=job.id,
        timestamp=datetime.now().isoformat(),
        type="image",
        prompt=request.prompt,
        negative_prompt=request.negative_prompt,
        model=request.model,
        parameters={
            "width": request.width or 1024,
            "height": request.height or 1024,
            "steps": request.steps,
            "guidance_scale": request.guidance_scale,
            "seed": request.seed,
            "num_images": request.num_images or 1,
            "loras": [{"lora_id": l.lora_id, "weight": l.weight} for l in (request.loras or [])],
        },
        status="pending",
    )
    add_log(log_entry)

    return JobResponse(
        job_id=job.id,
        status=job.status,
        message=f"Job queued. Estimated time: {int(job.eta_seconds or 0)}s"
    )


@router.get("/jobs/{job_id}", response_model=Job)
async def get_job(job_id: str):
    """Get the status of a specific job."""
    job_manager = get_job_manager()
    job = job_manager.get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    return job


@router.get("/jobs", response_model=JobListResponse)
async def list_jobs(session_id: str = None, active_only: bool = False):
    """List jobs, optionally filtered by session or active status."""
    job_manager = get_job_manager()

    if session_id:
        jobs = job_manager.get_jobs_by_session(session_id)
    elif active_only:
        jobs = job_manager.get_active_jobs()
    else:
        jobs = list(job_manager.jobs.values())

    # Sort by created_at descending
    jobs = sorted(jobs, key=lambda j: j.created_at, reverse=True)

    return JobListResponse(jobs=jobs)


# ============== Video Generation Endpoints ==============

@router.post("/video/jobs", response_model=VideoJobResponse)
async def create_video_job(request: VideoGenerateRequest):
    """Create a new video generation job. Returns immediately with job_id."""
    service = get_inference_service()

    # Validate model exists and is a video model
    model_config = service.get_model_config(request.model)
    if not model_config:
        raise HTTPException(status_code=400, detail=f"Unknown model: {request.model}")

    if model_config.get("type") not in ["video", "ltx2"]:
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


# ============== System Resource Endpoints ==============

@router.get("/system/status", response_model=SystemResourceStatus)
async def get_system_status():
    """Get current system resource status."""
    status = get_system_resources()
    return SystemResourceStatus(
        memory_total_gb=round(status.memory_total_gb, 2),
        memory_available_gb=round(status.memory_available_gb, 2),
        memory_used_gb=round(status.memory_used_gb, 2),
        memory_percent=round(status.memory_percent, 1),
        gpu_utilization=round(status.gpu_utilization, 1) if status.gpu_utilization is not None else None,
        cpu_percent=round(status.cpu_percent, 1),
        is_available=status.is_available,
        rejection_reason=status.rejection_reason,
    )


@router.get("/system/can-generate/{model_id}", response_model=ResourceCheckResponse)
async def check_can_generate(model_id: str):
    """Check if system can run a specific model."""
    service = get_inference_service()
    model_config = service.get_model_config(model_id)

    if not model_config:
        raise HTTPException(status_code=404, detail=f"Model not found: {model_id}")

    model_size_gb = model_config.get("size_gb", 12)
    model_name = model_config.get("name", model_id)

    status = check_resources_for_video(model_size_gb, model_name)

    # Find video models that would fit in current memory
    recommended = []
    for mid, mconfig in service.config["models"].items():
        if mconfig.get("type") in ["video", "ltx2"]:
            size = mconfig.get("size_gb", 12)
            # Required: model + 5GB overhead + 10GB buffer
            if status.memory_available_gb >= (size + 5.0 + 10.0):
                recommended.append(mid)

    return ResourceCheckResponse(
        can_generate=status.is_available,
        status=SystemResourceStatus(
            memory_total_gb=round(status.memory_total_gb, 2),
            memory_available_gb=round(status.memory_available_gb, 2),
            memory_used_gb=round(status.memory_used_gb, 2),
            memory_percent=round(status.memory_percent, 1),
            gpu_utilization=round(status.gpu_utilization, 1) if status.gpu_utilization is not None else None,
            cpu_percent=round(status.cpu_percent, 1),
            is_available=status.is_available,
            rejection_reason=status.rejection_reason,
        ),
        recommended_models=recommended,
    )


# ============== LoRA Endpoints ==============

@router.get("/loras", response_model=LoRAListResponse)
async def list_loras(model_type: str = None):
    """List available LoRAs, optionally filtered by compatible model type."""
    lora_manager = get_lora_manager()
    loras = lora_manager.get_available_loras(model_type)
    return LoRAListResponse(
        loras=loras,
        local_lora_dir=str(lora_manager.local_dir),
    )


@router.post("/loras/scan", response_model=LoRAScanResponse)
async def scan_local_loras():
    """Rescan local LoRA directory for new files."""
    lora_manager = get_lora_manager()
    local_loras = lora_manager.scan_local_loras()
    return LoRAScanResponse(
        count=len(local_loras),
        loras=local_loras,
    )


# ============== Image-to-Video (I2V) Endpoints ==============

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


# ============== Video Upscale Endpoints ==============

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
