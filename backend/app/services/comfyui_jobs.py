"""ComfyUI job manager for handling ComfyUI generation jobs.

Extends BaseJobManager to provide:
- Job creation with workflow and parameter overrides
- Async execution via ComfyUI API
- Progress polling from ComfyUI history
- Image download and storage
"""

import json
import uuid
import asyncio
from datetime import datetime
from pathlib import Path
from typing import Optional

from ..models.schemas import (
    ComfyUIJob, ComfyUIGenerateRequest, ImageResult, JobStatus
)
from ..utils.paths import get_output_dir, get_data_dir
from .base_job_manager import BaseJobManager
from .comfyui_client import get_comfyui_client
from .comfyui_workflow_parser import WorkflowParser


def load_workflows() -> dict:
    """Load saved workflows from JSON file."""
    workflows_file = get_data_dir() / "comfyui_workflows.json"
    if workflows_file.exists():
        try:
            with open(workflows_file, "r") as f:
                return json.load(f)
        except Exception:
            return {"workflows": []}
    return {"workflows": []}


def save_workflows(data: dict) -> None:
    """Save workflows to JSON file."""
    workflows_file = get_data_dir() / "comfyui_workflows.json"
    with open(workflows_file, "w") as f:
        json.dump(data, f, indent=2, default=str)


def get_workflow_by_id(workflow_id: str) -> Optional[dict]:
    """Get a specific workflow by ID."""
    data = load_workflows()
    for wf in data.get("workflows", []):
        if wf.get("id") == workflow_id:
            return wf
    return None


class ComfyUIJobManager(BaseJobManager[ComfyUIJob]):
    """Job manager for ComfyUI generation jobs."""

    _jobs_filename = "comfyui_jobs.json"
    _job_type = ComfyUIJob
    _worker_name = "ComfyUI Worker"

    def __init__(self):
        super().__init__()
        self._parser = WorkflowParser()

    def create_job(self, request: ComfyUIGenerateRequest) -> ComfyUIJob:
        """Create a new ComfyUI generation job.

        Args:
            request: Generation request with workflow_id and parameters

        Returns:
            Created ComfyUIJob instance.

        Raises:
            ValueError: If workflow not found.
        """
        # Load workflow
        workflow = get_workflow_by_id(request.workflow_id)
        if not workflow:
            raise ValueError(f"Workflow not found: {request.workflow_id}")

        job_id = str(uuid.uuid4())

        job = ComfyUIJob(
            id=job_id,
            session_id=request.session_id,
            status=JobStatus.QUEUED,
            progress=0.0,
            workflow_id=request.workflow_id,
            workflow_name=workflow.get("name", "Unknown"),
            parameters=request.parameters,
            created_at=datetime.utcnow(),
        )

        with self.lock:
            self.jobs[job.id] = job

        self.job_queue.put(job.id)
        self._save_jobs()

        return job

    def _process_job(self, job_id: str) -> None:
        """Process a ComfyUI generation job.

        This runs in the worker thread and:
        1. Loads the workflow
        2. Applies parameter overrides
        3. Queues to ComfyUI
        4. Polls for completion
        5. Downloads and saves results
        """
        job = self.get_job(job_id)
        if not job:
            return

        # Run async processing in event loop
        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            loop.run_until_complete(self._process_job_async(job_id))
        except Exception as e:
            print(f"ComfyUI job {job_id} failed: {e}")
            self._update_job(
                job_id,
                status=JobStatus.FAILED,
                error=str(e),
                completed_at=datetime.utcnow()
            )
        finally:
            loop.close()

    async def _process_job_async(self, job_id: str) -> None:
        """Async implementation of job processing."""
        job = self.get_job(job_id)
        if not job:
            return

        client = get_comfyui_client()

        # Check ComfyUI availability
        if not await client.check_health():
            self._update_job(
                job_id,
                status=JobStatus.FAILED,
                error="ComfyUI server is not available",
                completed_at=datetime.utcnow()
            )
            return

        # Load workflow
        workflow_data = get_workflow_by_id(job.workflow_id)
        if not workflow_data:
            self._update_job(
                job_id,
                status=JobStatus.FAILED,
                error=f"Workflow not found: {job.workflow_id}",
                completed_at=datetime.utcnow()
            )
            return

        workflow_json = workflow_data.get("workflow_json", {})

        # Apply parameter overrides
        if job.parameters:
            workflow_json = self._parser.apply_parameters(workflow_json, job.parameters)

        # Update status to generating
        self._update_job(
            job_id,
            status=JobStatus.GENERATING,
            started_at=datetime.utcnow(),
            progress=10.0
        )

        # Queue prompt to ComfyUI
        prompt_id, error = await client.queue_prompt(workflow_json)
        if error:
            self._update_job(
                job_id,
                status=JobStatus.FAILED,
                error=f"Failed to queue prompt: {error}",
                completed_at=datetime.utcnow()
            )
            return

        self._update_job(job_id, prompt_id=prompt_id, progress=20.0)

        # Poll for completion
        outputs, error = await client.poll_until_complete(
            prompt_id,
            timeout_seconds=600,  # 10 minute timeout
            poll_interval=1.0
        )

        if error:
            self._update_job(
                job_id,
                status=JobStatus.FAILED,
                error=error,
                completed_at=datetime.utcnow()
            )
            return

        self._update_job(job_id, status=JobStatus.SAVING, progress=80.0)

        # Download and save images
        images = await self._download_outputs(client, outputs, job_id, job.workflow_name)

        # Update job with results
        with self.lock:
            if job_id in self.jobs:
                self.jobs[job_id].images = images

        self._update_job(
            job_id,
            status=JobStatus.COMPLETED,
            progress=100.0,
            completed_at=datetime.utcnow()
        )

    async def _download_outputs(
        self,
        client,
        outputs: dict,
        job_id: str,
        workflow_name: str
    ) -> list[ImageResult]:
        """Download images from ComfyUI outputs.

        Args:
            client: ComfyUI client
            outputs: Outputs dict from ComfyUI history
            job_id: Job ID for naming
            workflow_name: Workflow name for metadata

        Returns:
            List of ImageResult objects.
        """
        results = []
        output_dir = get_output_dir()

        for node_id, node_output in outputs.items():
            images = node_output.get("images", [])

            for i, image_info in enumerate(images):
                filename = image_info.get("filename", "")
                subfolder = image_info.get("subfolder", "")
                img_type = image_info.get("type", "output")

                if not filename:
                    continue

                # Download image bytes
                image_bytes = await client.get_image(filename, subfolder, img_type)
                if not image_bytes:
                    continue

                # Save locally
                asset_id = str(uuid.uuid4())
                local_filename = f"{asset_id}.png"
                local_path = output_dir / local_filename

                with open(local_path, "wb") as f:
                    f.write(image_bytes)

                # Save metadata
                metadata = {
                    "id": asset_id,
                    "filename": local_filename,
                    "prompt": f"ComfyUI: {workflow_name}",
                    "negative_prompt": None,
                    "model": "comfyui",
                    "width": 0,  # Could parse from image
                    "height": 0,
                    "steps": 0,
                    "guidance_scale": 0,
                    "seed": 0,
                    "batch_id": job_id,
                    "source": "comfyui",
                    "workflow_name": workflow_name,
                    "created_at": datetime.utcnow().isoformat(),
                }

                metadata_path = output_dir / f"{asset_id}.json"
                with open(metadata_path, "w") as f:
                    json.dump(metadata, f, indent=2)

                results.append(ImageResult(
                    id=asset_id,
                    filename=local_filename,
                    url=f"/outputs/{local_filename}",
                    seed=0,  # ComfyUI seeds vary by node
                ))

        return results


# Global singleton
_comfyui_job_manager: Optional[ComfyUIJobManager] = None


def get_comfyui_job_manager() -> ComfyUIJobManager:
    """Get the global ComfyUI job manager instance."""
    global _comfyui_job_manager
    if _comfyui_job_manager is None:
        _comfyui_job_manager = ComfyUIJobManager()
    return _comfyui_job_manager
