"""Bulk job manager for batch image generation via fal.ai."""

import asyncio
import json
import uuid
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional

from ..models.schemas import BulkJob, BulkImageItem, JobStatus
from .base_job_manager import BaseJobManager
from . import fal_client

logger = logging.getLogger(__name__)


class BulkJobManager(BaseJobManager[BulkJob]):
    _jobs_filename = "bulk_jobs.json"
    _job_type = BulkJob
    _worker_name = "Bulk worker"

    def create_job(
        self,
        prompts: list[str],
        fal_model: str = "fal-ai/flux/schnell",
        width: int = 1024,
        height: int = 1024,
        steps: int | None = None,
        base_prompt: str | None = None,
    ) -> BulkJob:
        """Create a new bulk generation job."""
        job_id = str(uuid.uuid4())

        items = [
            BulkImageItem(index=i, prompt=prompt)
            for i, prompt in enumerate(prompts)
        ]

        job = BulkJob(
            id=job_id,
            status=JobStatus.QUEUED,
            progress=0.0,
            total=len(prompts),
            completed=0,
            failed=0,
            items=items,
            base_prompt=base_prompt,
            fal_model=fal_model,
            width=width,
            height=height,
            steps=steps,
            created_at=datetime.utcnow(),
        )

        with self.lock:
            self.jobs[job.id] = job

        self.job_queue.put(job.id)
        self._save_jobs()

        logger.info(f"Created bulk job {job_id} with {len(prompts)} prompts")
        return job

    def delete_job(self, job_id: str) -> bool:
        """Cancel and delete a bulk job."""
        with self.lock:
            job = self.jobs.get(job_id)
            if not job:
                return False
            if job.status not in [JobStatus.COMPLETED, JobStatus.FAILED]:
                job.status = JobStatus.FAILED
                job.error = "Cancelled by user"
                job.completed_at = datetime.utcnow()
            del self.jobs[job_id]
        self._save_jobs()
        return True

    def _process_job(self, job_id: str) -> None:
        """Process a bulk job by generating images sequentially."""
        job = self.get_job(job_id)
        if not job:
            return

        # Run async processing in a new event loop (we're in a worker thread)
        loop = asyncio.new_event_loop()
        try:
            loop.run_until_complete(self._process_job_async(job_id))
        finally:
            loop.close()

    async def _process_job_async(self, job_id: str) -> None:
        """Async implementation of bulk job processing."""
        self._update_job(
            job_id,
            status=JobStatus.GENERATING,
            started_at=datetime.utcnow(),
        )

        job = self.get_job(job_id)
        if not job:
            return

        output_dir = Path(__file__).parent.parent.parent.parent / "outputs"
        output_dir.mkdir(parents=True, exist_ok=True)

        for i, item in enumerate(job.items):
            # Check if job was cancelled
            current_job = self.get_job(job_id)
            if not current_job or current_job.status == JobStatus.FAILED:
                return

            # Update item status
            with self.lock:
                if job_id in self.jobs:
                    self.jobs[job_id].items[i].status = "generating"
            self._save_jobs()

            try:
                # Generate image via fal.ai
                result = await fal_client.generate_image(
                    prompt=item.prompt,
                    model_id=job.fal_model,
                    width=job.width,
                    height=job.height,
                    steps=job.steps,
                )

                # Download the generated image
                image_data = await fal_client.download_image(result["image_url"])

                # Save to outputs/
                asset_id = str(uuid.uuid4())
                ext = "png"
                if result.get("content_type", "").endswith("jpeg"):
                    ext = "jpg"
                image_path = output_dir / f"{asset_id}.{ext}"
                metadata_path = output_dir / f"{asset_id}.json"

                with open(image_path, "wb") as f:
                    f.write(image_data)

                metadata = {
                    "id": asset_id,
                    "filename": f"{asset_id}.{ext}",
                    "prompt": item.prompt,
                    "negative_prompt": None,
                    "model": f"fal:{job.fal_model}",
                    "width": job.width,
                    "height": job.height,
                    "steps": job.steps or 0,
                    "guidance_scale": 0,
                    "seed": result.get("seed") or 0,
                    "batch_id": job_id,
                    "created_at": datetime.utcnow().isoformat(),
                }

                with open(metadata_path, "w") as f:
                    json.dump(metadata, f, indent=2)

                # Update item as completed
                with self.lock:
                    if job_id in self.jobs:
                        self.jobs[job_id].items[i].status = "completed"
                        self.jobs[job_id].items[i].image_url = f"/outputs/{asset_id}.{ext}"
                        self.jobs[job_id].items[i].asset_id = asset_id
                        self.jobs[job_id].items[i].seed = result.get("seed")
                        self.jobs[job_id].completed += 1

                logger.info(f"Bulk job {job_id}: completed image {i + 1}/{job.total}")

            except Exception as e:
                logger.error(f"Bulk job {job_id}: image {i} failed: {e}")
                with self.lock:
                    if job_id in self.jobs:
                        self.jobs[job_id].items[i].status = "failed"
                        self.jobs[job_id].items[i].error = str(e)
                        self.jobs[job_id].failed += 1

            # Update overall progress
            current = self.get_job(job_id)
            if current:
                done = current.completed + current.failed
                progress = (done / current.total) * 100 if current.total > 0 else 0
                self._update_job(job_id, progress=progress)

        # Mark job as completed
        self._update_job(
            job_id,
            status=JobStatus.COMPLETED,
            progress=100.0,
            completed_at=datetime.utcnow(),
        )
        logger.info(f"Bulk job {job_id} completed: {job.total} images")


# Global singleton
_bulk_job_manager: Optional[BulkJobManager] = None


def get_bulk_job_manager() -> BulkJobManager:
    global _bulk_job_manager
    if _bulk_job_manager is None:
        _bulk_job_manager = BulkJobManager()
    return _bulk_job_manager
