"""Bulk image generation endpoints."""

import logging

from fastapi import APIRouter, HTTPException

from ..models.schemas import (
    BulkVariationRequest,
    BulkVariationResponse,
    BulkImageRequest,
    BulkJobResponse,
    BulkJobListResponse,
    BulkJob,
)
from ..services.llm_client import generate_prompt_variations
from ..services.bulk_jobs import get_bulk_job_manager

router = APIRouter(prefix="/api/bulk", tags=["bulk"])
logger = logging.getLogger(__name__)


# ============================================================================
# Endpoints
# ============================================================================

@router.post("/variations", response_model=BulkVariationResponse)
async def create_variations(request: BulkVariationRequest):
    """Generate prompt variations using Claude API."""
    try:
        variations = await generate_prompt_variations(
            base_prompt=request.base_prompt,
            count=request.count,
            style_guidance=request.style_guidance,
            model=request.claude_model,
        )
        return BulkVariationResponse(
            variations=variations,
            base_prompt=request.base_prompt,
            count=len(variations),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Variation generation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate variations: {e}")


@router.post("/jobs", response_model=BulkJobResponse)
async def create_bulk_job(request: BulkImageRequest):
    """Create a new bulk image generation job."""
    if not request.prompts:
        raise HTTPException(status_code=400, detail="At least one prompt is required")

    manager = get_bulk_job_manager()
    job = manager.create_job(
        prompts=request.prompts,
        fal_model=request.fal_model,
        width=request.width,
        height=request.height,
        steps=request.steps,
        base_prompt=request.base_prompt,
    )

    return BulkJobResponse(
        job_id=job.id,
        status=job.status,
        message=f"Bulk job created with {len(request.prompts)} images",
    )


@router.get("/jobs/{job_id}", response_model=BulkJob)
async def get_bulk_job(job_id: str):
    """Get the status of a bulk job."""
    manager = get_bulk_job_manager()
    job = manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Bulk job not found")
    return job


@router.get("/jobs", response_model=BulkJobListResponse)
async def list_bulk_jobs():
    """List all bulk jobs."""
    manager = get_bulk_job_manager()
    with manager.lock:
        jobs = list(manager.jobs.values())
    # Sort by created_at descending
    jobs.sort(key=lambda j: j.created_at, reverse=True)
    return BulkJobListResponse(jobs=jobs)


@router.delete("/jobs/{job_id}")
async def delete_bulk_job(job_id: str):
    """Cancel and delete a bulk job."""
    manager = get_bulk_job_manager()
    if not manager.delete_job(job_id):
        raise HTTPException(status_code=404, detail="Bulk job not found")
    return {"status": "deleted", "job_id": job_id}
