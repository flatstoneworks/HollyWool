"""System resource check endpoints."""

from fastapi import APIRouter, HTTPException

from ..models.schemas import (
    SystemResourceStatus, ResourceCheckResponse,
)
from ..services.inference import get_inference_service
from ..services.resources import check_resources_for_video, get_system_resources

router = APIRouter(prefix="/api", tags=["system"])


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
