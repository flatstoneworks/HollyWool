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
    LoRAListResponse, LoRAScanResponse,
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
from ..services.lora_manager import get_lora_manager
from .settings import add_log, RequestLog

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
