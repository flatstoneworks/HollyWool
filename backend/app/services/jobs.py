import json
import uuid
import threading
import time
import random
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict
from queue import Queue

from ..models.schemas import Job, JobStatus, ImageResult, GenerateRequest
from .inference import get_inference_service


# Estimated base times per model type (seconds per image)
MODEL_BASE_TIMES = {
    "sd-turbo": 2,
    "sdxl-turbo": 3,
    "sdxl-lightning": 5,
    "flux-schnell": 15,
    "flux-dev": 45,
    "sd3-medium": 40,
    "sdxl-base": 35,
    "playground-v25": 35,
    "realvisxl": 30,
    "dreamshaper-xl": 8,
    "animagine-xl": 35,
    "juggernaut-xl": 35,
}

# Time to load a new model (seconds)
MODEL_LOAD_TIME = 30


class JobManager:
    def __init__(self):
        self.jobs: Dict[str, Job] = {}
        self.job_queue: Queue = Queue()
        self.current_job_id: Optional[str] = None
        self.lock = threading.Lock()
        self._load_jobs()

        # Start worker thread
        self.worker_thread = threading.Thread(target=self._worker, daemon=True)
        self.worker_thread.start()

    def _get_jobs_file(self) -> Path:
        data_dir = Path(__file__).parent.parent.parent.parent / "data"
        data_dir.mkdir(parents=True, exist_ok=True)
        return data_dir / "jobs.json"

    def _load_jobs(self) -> None:
        """Load jobs from file on startup."""
        jobs_file = self._get_jobs_file()
        if jobs_file.exists():
            try:
                with open(jobs_file, "r") as f:
                    data = json.load(f)
                    for job_data in data.get("jobs", []):
                        # Convert datetime strings
                        for dt_field in ["created_at", "started_at", "completed_at"]:
                            if job_data.get(dt_field):
                                job_data[dt_field] = datetime.fromisoformat(job_data[dt_field])
                        job = Job(**job_data)
                        # Only keep recent jobs (last 24 hours) or incomplete ones
                        if job.status not in [JobStatus.COMPLETED, JobStatus.FAILED]:
                            # Re-queue incomplete jobs
                            job.status = JobStatus.QUEUED
                            self.jobs[job.id] = job
                            self.job_queue.put(job.id)
                        elif job.created_at and (datetime.utcnow() - job.created_at).total_seconds() < 86400:
                            self.jobs[job.id] = job
            except Exception as e:
                print(f"Failed to load jobs: {e}")

    def _save_jobs(self) -> None:
        """Save jobs to file."""
        jobs_file = self._get_jobs_file()
        jobs_data = []
        with self.lock:
            for job in self.jobs.values():
                job_dict = job.model_dump()
                # Convert datetime to ISO format
                for dt_field in ["created_at", "started_at", "completed_at"]:
                    if job_dict.get(dt_field):
                        job_dict[dt_field] = job_dict[dt_field].isoformat()
                jobs_data.append(job_dict)

        with open(jobs_file, "w") as f:
            json.dump({"jobs": jobs_data}, f, indent=2)

    def _estimate_time(self, model: str, steps: int, num_images: int, include_model_load: bool = False) -> float:
        """Estimate generation time in seconds."""
        base_time = MODEL_BASE_TIMES.get(model, 30)
        # Adjust for non-default steps
        default_steps = {"sd-turbo": 1, "sdxl-turbo": 1, "flux-schnell": 4}.get(model, 30)
        step_factor = steps / default_steps if default_steps > 0 else 1

        time_per_image = base_time * step_factor
        total_time = time_per_image * num_images

        if include_model_load:
            service = get_inference_service()
            if service.current_model_id != model:
                total_time += MODEL_LOAD_TIME

        return total_time

    def create_job(self, request: GenerateRequest) -> Job:
        """Create a new job and add it to the queue."""
        service = get_inference_service()
        model_config = service.get_model_config(request.model)

        steps = request.steps if request.steps else model_config["default_steps"]

        job = Job(
            id=str(uuid.uuid4()),
            session_id=request.session_id,
            status=JobStatus.QUEUED,
            progress=0.0,
            current_image=0,
            total_images=request.num_images,
            prompt=request.prompt,
            model=request.model,
            width=request.width,
            height=request.height,
            steps=steps,
            num_images=request.num_images,
            batch_id=request.batch_id or str(uuid.uuid4()),
            created_at=datetime.utcnow(),
            eta_seconds=self._estimate_time(request.model, steps, request.num_images, include_model_load=True),
        )

        with self.lock:
            self.jobs[job.id] = job

        self.job_queue.put(job.id)
        self._save_jobs()

        return job

    def get_job(self, job_id: str) -> Optional[Job]:
        """Get a job by ID."""
        with self.lock:
            return self.jobs.get(job_id)

    def get_jobs_by_session(self, session_id: str) -> list[Job]:
        """Get all jobs for a session."""
        with self.lock:
            return [j for j in self.jobs.values() if j.session_id == session_id]

    def get_active_jobs(self) -> list[Job]:
        """Get all active (non-completed) jobs."""
        with self.lock:
            return [j for j in self.jobs.values()
                    if j.status not in [JobStatus.COMPLETED, JobStatus.FAILED]]

    def _update_job(self, job_id: str, **updates) -> None:
        """Update job fields."""
        with self.lock:
            if job_id in self.jobs:
                job = self.jobs[job_id]
                for key, value in updates.items():
                    setattr(job, key, value)
        self._save_jobs()

    def _worker(self) -> None:
        """Background worker that processes jobs."""
        while True:
            try:
                job_id = self.job_queue.get()
                self.current_job_id = job_id
                self._process_job(job_id)
                self.current_job_id = None
            except Exception as e:
                print(f"Worker error: {e}")
                if self.current_job_id:
                    self._update_job(self.current_job_id,
                                    status=JobStatus.FAILED,
                                    error=str(e))
                self.current_job_id = None

    def _process_job(self, job_id: str) -> None:
        """Process a single job."""
        job = self.get_job(job_id)
        if not job:
            return

        service = get_inference_service()
        model_config = service.get_model_config(job.model)

        if not model_config:
            self._update_job(job_id, status=JobStatus.FAILED, error=f"Unknown model: {job.model}")
            return

        try:
            # Check if model needs downloading
            needs_download = not service.is_model_cached(job.model)

            if needs_download:
                # Update to downloading status
                self._update_job(job_id,
                               status=JobStatus.DOWNLOADING,
                               started_at=datetime.utcnow(),
                               download_progress=0)

                # Download callback to update job progress
                def download_progress_callback(progress_pct: float, total_mb: float, speed_mbps: float):
                    self._update_job(job_id,
                                   download_progress=progress_pct,
                                   download_total_mb=total_mb,
                                   download_speed_mbps=speed_mbps)

                # Load model with download tracking
                self._update_job(job_id, status=JobStatus.LOADING_MODEL)
                service.load_model(job.model, download_callback=download_progress_callback)
            else:
                # Update to loading model status
                self._update_job(job_id,
                               status=JobStatus.LOADING_MODEL,
                               started_at=datetime.utcnow())

                # Load model if needed (no download)
                service.load_model(job.model)

            # Get actual values
            guidance = model_config["default_guidance"]

            # Generate base seed
            base_seed = random.randint(0, 2**32 - 1)

            output_dir = Path(__file__).parent.parent.parent.parent / "outputs"
            output_dir.mkdir(parents=True, exist_ok=True)

            images_results = []

            for i in range(job.num_images):
                # Update progress
                progress = (i / job.num_images) * 100
                remaining_images = job.num_images - i
                eta = self._estimate_time(job.model, job.steps, remaining_images)

                self._update_job(job_id,
                               status=JobStatus.GENERATING,
                               progress=progress,
                               current_image=i + 1,
                               eta_seconds=eta)

                image_seed = base_seed + i

                image, actual_seed = service.generate(
                    prompt=job.prompt,
                    model_id=job.model,
                    width=job.width,
                    height=job.height,
                    steps=job.steps,
                    guidance_scale=guidance,
                    seed=image_seed,
                )

                # Save image
                self._update_job(job_id, status=JobStatus.SAVING)

                asset_id = str(uuid.uuid4())
                image_path = output_dir / f"{asset_id}.png"
                metadata_path = output_dir / f"{asset_id}.json"

                image.save(image_path, "PNG")

                metadata = {
                    "id": asset_id,
                    "filename": f"{asset_id}.png",
                    "prompt": job.prompt,
                    "negative_prompt": None,
                    "model": job.model,
                    "width": job.width,
                    "height": job.height,
                    "steps": job.steps,
                    "guidance_scale": guidance,
                    "seed": actual_seed,
                    "batch_id": job.batch_id,
                    "created_at": datetime.utcnow().isoformat(),
                }

                with open(metadata_path, "w") as f:
                    json.dump(metadata, f, indent=2)

                images_results.append(ImageResult(
                    id=asset_id,
                    filename=f"{asset_id}.png",
                    url=f"/outputs/{asset_id}.png",
                    seed=actual_seed,
                ))

            # Update job as completed
            with self.lock:
                if job_id in self.jobs:
                    self.jobs[job_id].images = images_results

            self._update_job(job_id,
                           status=JobStatus.COMPLETED,
                           progress=100.0,
                           current_image=job.num_images,
                           eta_seconds=0,
                           completed_at=datetime.utcnow())

        except Exception as e:
            print(f"Job {job_id} failed: {e}")
            self._update_job(job_id,
                           status=JobStatus.FAILED,
                           error=str(e),
                           completed_at=datetime.utcnow())


# Global singleton
_job_manager: Optional[JobManager] = None


def get_job_manager() -> JobManager:
    global _job_manager
    if _job_manager is None:
        _job_manager = JobManager()
    return _job_manager
