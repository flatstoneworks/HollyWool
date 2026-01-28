"""ComfyUI workflow import and generation endpoints.

Provides:
- GET /api/comfyui/status - Check ComfyUI server status
- POST /api/comfyui/workflows - Import a workflow
- GET /api/comfyui/workflows - List saved workflows
- GET /api/comfyui/workflows/{id} - Get workflow with parameters
- DELETE /api/comfyui/workflows/{id} - Delete a workflow
- POST /api/comfyui/jobs - Create generation job
- GET /api/comfyui/jobs - List jobs
- GET /api/comfyui/jobs/{id} - Get job status
"""

import json
import uuid
import asyncio
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException

from ..models.schemas import (
    ComfyUIStatusResponse,
    ComfyUIEditableParameter,
    SavedWorkflow,
    SavedWorkflowSummary,
    WorkflowImportRequest,
    WorkflowImportResponse,
    ComfyUIGenerateRequest,
    ComfyUIJob,
    ComfyUIJobResponse,
    ComfyUIJobListResponse,
    JobStatus,
)
from ..services.comfyui_client import get_comfyui_client
from ..services.comfyui_workflow_parser import WorkflowParser
from ..services.comfyui_jobs import (
    get_comfyui_job_manager,
    load_workflows,
    save_workflows,
    get_workflow_by_id,
)


router = APIRouter(prefix="/api/comfyui", tags=["comfyui"])


# ============== Status Endpoints ==============

@router.get("/status", response_model=ComfyUIStatusResponse)
async def get_comfyui_status():
    """Check if ComfyUI server is running and get queue status."""
    client = get_comfyui_client()

    available = await client.check_health()

    queue_running = 0
    queue_pending = 0
    error = None

    if available:
        queue = await client.get_queue()
        if queue:
            queue_running = len(queue.get("queue_running", []))
            queue_pending = len(queue.get("queue_pending", []))
    else:
        error = "ComfyUI server is not responding"

    return ComfyUIStatusResponse(
        available=available,
        server_url=client.base_url,
        queue_running=queue_running,
        queue_pending=queue_pending,
        error=error,
    )


# ============== Workflow Endpoints ==============

@router.post("/workflows", response_model=WorkflowImportResponse)
async def import_workflow(request: WorkflowImportRequest):
    """Import a ComfyUI workflow JSON and extract editable parameters."""
    # Validate workflow structure
    parser = WorkflowParser()
    is_valid, error = parser.validate_workflow(request.workflow_json)

    if not is_valid:
        raise HTTPException(status_code=400, detail=f"Invalid workflow: {error}")

    # Try to get object_info from ComfyUI for better COMBO choices
    client = get_comfyui_client()
    object_info = await client.get_object_info()
    if object_info:
        parser = WorkflowParser(object_info=object_info)

    # Extract parameters
    params = parser.parse(request.workflow_json)

    # Convert to Pydantic models
    param_models = [
        ComfyUIEditableParameter(
            node_id=p.node_id,
            node_class=p.node_class,
            input_name=p.input_name,
            input_type=p.input_type,
            current_value=p.current_value,
            constraints=p.constraints,
            display_name=p.display_name,
            category=p.category,
        )
        for p in params
    ]

    # Create workflow entry
    workflow_id = str(uuid.uuid4())
    workflow = {
        "id": workflow_id,
        "name": request.name,
        "workflow_json": request.workflow_json,
        "parameters": [p.model_dump() for p in param_models],
        "created_at": datetime.utcnow().isoformat(),
    }

    # Save to file
    data = load_workflows()
    data["workflows"].append(workflow)
    save_workflows(data)

    return WorkflowImportResponse(
        id=workflow_id,
        name=request.name,
        parameters=param_models,
        message=f"Workflow imported with {len(param_models)} editable parameters",
    )


@router.get("/workflows", response_model=list[SavedWorkflowSummary])
async def list_workflows():
    """List all saved workflows (summaries only)."""
    data = load_workflows()

    summaries = []
    for wf in data.get("workflows", []):
        summaries.append(SavedWorkflowSummary(
            id=wf["id"],
            name=wf["name"],
            parameter_count=len(wf.get("parameters", [])),
            created_at=datetime.fromisoformat(wf["created_at"]),
        ))

    # Sort by created_at descending
    summaries.sort(key=lambda w: w.created_at, reverse=True)
    return summaries


@router.get("/workflows/{workflow_id}", response_model=SavedWorkflow)
async def get_workflow(workflow_id: str):
    """Get a specific workflow with full details and parameters."""
    workflow = get_workflow_by_id(workflow_id)

    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Convert to Pydantic model
    return SavedWorkflow(
        id=workflow["id"],
        name=workflow["name"],
        workflow_json=workflow["workflow_json"],
        parameters=[
            ComfyUIEditableParameter(**p)
            for p in workflow.get("parameters", [])
        ],
        created_at=datetime.fromisoformat(workflow["created_at"]),
        updated_at=datetime.fromisoformat(workflow["updated_at"]) if workflow.get("updated_at") else None,
    )


@router.put("/workflows/{workflow_id}", response_model=SavedWorkflow)
async def update_workflow(workflow_id: str, request: WorkflowImportRequest):
    """Update an existing workflow (replace workflow JSON and re-extract parameters)."""
    data = load_workflows()

    # Find workflow
    workflow_idx = None
    for i, wf in enumerate(data.get("workflows", [])):
        if wf["id"] == workflow_id:
            workflow_idx = i
            break

    if workflow_idx is None:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Validate new workflow
    parser = WorkflowParser()
    is_valid, error = parser.validate_workflow(request.workflow_json)
    if not is_valid:
        raise HTTPException(status_code=400, detail=f"Invalid workflow: {error}")

    # Get object_info for better COMBO choices
    client = get_comfyui_client()
    object_info = await client.get_object_info()
    if object_info:
        parser = WorkflowParser(object_info=object_info)

    # Extract parameters
    params = parser.parse(request.workflow_json)
    param_dicts = [
        {
            "node_id": p.node_id,
            "node_class": p.node_class,
            "input_name": p.input_name,
            "input_type": p.input_type,
            "current_value": p.current_value,
            "constraints": p.constraints,
            "display_name": p.display_name,
            "category": p.category,
        }
        for p in params
    ]

    # Update workflow
    data["workflows"][workflow_idx]["name"] = request.name
    data["workflows"][workflow_idx]["workflow_json"] = request.workflow_json
    data["workflows"][workflow_idx]["parameters"] = param_dicts
    data["workflows"][workflow_idx]["updated_at"] = datetime.utcnow().isoformat()

    save_workflows(data)

    workflow = data["workflows"][workflow_idx]
    return SavedWorkflow(
        id=workflow["id"],
        name=workflow["name"],
        workflow_json=workflow["workflow_json"],
        parameters=[ComfyUIEditableParameter(**p) for p in param_dicts],
        created_at=datetime.fromisoformat(workflow["created_at"]),
        updated_at=datetime.fromisoformat(workflow["updated_at"]),
    )


@router.delete("/workflows/{workflow_id}")
async def delete_workflow(workflow_id: str):
    """Delete a saved workflow."""
    data = load_workflows()

    # Find and remove workflow
    original_count = len(data.get("workflows", []))
    data["workflows"] = [wf for wf in data.get("workflows", []) if wf["id"] != workflow_id]

    if len(data["workflows"]) == original_count:
        raise HTTPException(status_code=404, detail="Workflow not found")

    save_workflows(data)
    return {"message": "Workflow deleted"}


# ============== Job Endpoints ==============

@router.post("/jobs", response_model=ComfyUIJobResponse)
async def create_comfyui_job(request: ComfyUIGenerateRequest):
    """Create a new ComfyUI generation job."""
    # Verify workflow exists
    workflow = get_workflow_by_id(request.workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail=f"Workflow not found: {request.workflow_id}")

    # Check ComfyUI availability
    client = get_comfyui_client()
    if not await client.check_health():
        raise HTTPException(
            status_code=503,
            detail="ComfyUI server is not available. Please ensure ComfyUI is running."
        )

    # Create job
    job_manager = get_comfyui_job_manager()

    try:
        job = job_manager.create_job(request)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return ComfyUIJobResponse(
        job_id=job.id,
        status=job.status,
        message=f"ComfyUI job queued: {workflow['name']}",
    )


@router.get("/jobs/{job_id}", response_model=ComfyUIJob)
async def get_comfyui_job(job_id: str):
    """Get the status of a specific ComfyUI job."""
    job_manager = get_comfyui_job_manager()
    job = job_manager.get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    return job


@router.get("/jobs", response_model=ComfyUIJobListResponse)
async def list_comfyui_jobs(session_id: Optional[str] = None, active_only: bool = False):
    """List ComfyUI jobs, optionally filtered."""
    job_manager = get_comfyui_job_manager()

    if session_id:
        jobs = job_manager.get_jobs_by_session(session_id)
    elif active_only:
        jobs = job_manager.get_active_jobs()
    else:
        jobs = list(job_manager.jobs.values())

    # Sort by created_at descending
    jobs = sorted(jobs, key=lambda j: j.created_at, reverse=True)

    return ComfyUIJobListResponse(jobs=jobs)


# ============== Utility Endpoints ==============

@router.post("/interrupt")
async def interrupt_comfyui():
    """Interrupt current ComfyUI execution."""
    client = get_comfyui_client()

    if await client.interrupt():
        return {"message": "Interrupt signal sent"}
    else:
        raise HTTPException(status_code=500, detail="Failed to send interrupt")


@router.post("/clear-queue")
async def clear_comfyui_queue():
    """Clear the ComfyUI queue."""
    client = get_comfyui_client()

    if await client.clear_queue():
        return {"message": "Queue cleared"}
    else:
        raise HTTPException(status_code=500, detail="Failed to clear queue")


@router.get("/object-info")
async def get_object_info():
    """Get ComfyUI node information (useful for debugging)."""
    client = get_comfyui_client()

    info = await client.get_object_info()
    if info is None:
        raise HTTPException(status_code=503, detail="ComfyUI not available")

    # Return just node names for brevity
    return {"nodes": list(info.keys()), "total": len(info)}
