"""Image-to-Video job management service for HollyWool.

Handles asynchronous I2V generation with progress tracking and persistence.
"""

import json
import uuid
import threading
import random
import base64
import io
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict
from queue import Queue
from PIL import Image

from ..models.schemas import I2VJob, VideoResult, JobStatus, I2VGenerateRequest
from .inference import get_inference_service


# Estimated base times per I2V model (seconds per video)
I2V_MODEL_BASE_TIMES = {
    "cogvideox-5b-i2v": 180,  # ~3 minutes per video
    "svd-xt": 90,             # ~1.5 minutes per video
}

# Time to load a new model (seconds)
MODEL_LOAD_TIME = 60


class I2VJobManager:
    def __init__(self):
        self.jobs: Dict[str, I2VJob] = {}
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
        return data_dir / "i2v_jobs.json"

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
                        job = I2VJob(**job_data)
                        # Only keep recent jobs (last 24 hours) or incomplete ones
                        if job.status not in [JobStatus.COMPLETED, JobStatus.FAILED]:
                            # Re-queue incomplete jobs
                            job.status = JobStatus.QUEUED
                            self.jobs[job.id] = job
                            self.job_queue.put(job.id)
                        elif job.created_at and (datetime.utcnow() - job.created_at).total_seconds() < 86400:
                            self.jobs[job.id] = job
            except Exception as e:
                print(f"Failed to load I2V jobs: {e}")

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

    def _estimate_time(self, model: str, steps: int, num_frames: int, include_model_load: bool = False) -> float:
        """Estimate I2V generation time in seconds."""
        base_time = I2V_MODEL_BASE_TIMES.get(model, 180)
        # Adjust for non-default steps
        default_steps = 50
        step_factor = steps / default_steps if default_steps > 0 else 1

        # Adjust for frame count
        default_frames = 49
        frame_factor = num_frames / default_frames if default_frames > 0 else 1

        total_time = base_time * step_factor * frame_factor

        if include_model_load:
            service = get_inference_service()
            if service.current_model_id != model:
                total_time += MODEL_LOAD_TIME

        return total_time

    def _save_source_image(self, image: Image.Image, job_id: str, index: int = 0) -> str:
        """Save a source image and return its URL."""
        output_dir = Path(__file__).parent.parent.parent.parent / "outputs"
        output_dir.mkdir(parents=True, exist_ok=True)

        image_path = output_dir / f"{job_id}_source_{index}.png"
        image.save(image_path, "PNG")
        return f"/outputs/{job_id}_source_{index}.png"

    def _load_source_images(self, request: I2VGenerateRequest, job_id: str) -> tuple[list, list[str]]:
        """Load source images from request and return (list[PIL.Image], list[str urls]).

        Supports the new reference_images array and falls back to legacy
        image_base64/image_asset_id fields for backward compatibility.
        """
        output_dir = Path(__file__).parent.parent.parent.parent / "outputs"
        images = []
        urls = []

        # New: reference_images array
        if request.reference_images:
            for i, ref in enumerate(request.reference_images[:5]):
                if ref.image_base64:
                    image_data = ref.image_base64
                    if "," in image_data:
                        image_data = image_data.split(",", 1)[1]
                    decoded = base64.b64decode(image_data)
                    img = Image.open(io.BytesIO(decoded))
                elif ref.image_asset_id:
                    asset_path = output_dir / f"{ref.image_asset_id}.png"
                    if not asset_path.exists():
                        asset_path = output_dir / f"{ref.image_asset_id}.jpg"
                    if not asset_path.exists():
                        raise ValueError(f"Asset not found: {ref.image_asset_id}")
                    img = Image.open(asset_path)
                else:
                    continue

                url = self._save_source_image(img, job_id, i)
                images.append(img)
                urls.append(url)

            if images:
                return images, urls

        # Legacy: single image_base64 or image_asset_id
        if request.image_base64:
            image_data = request.image_base64
            if "," in image_data:
                image_data = image_data.split(",", 1)[1]
            decoded = base64.b64decode(image_data)
            image = Image.open(io.BytesIO(decoded))
            source_url = self._save_source_image(image, job_id, 0)
            return [image], [source_url]

        elif request.image_asset_id:
            asset_path = output_dir / f"{request.image_asset_id}.png"
            if not asset_path.exists():
                asset_path = output_dir / f"{request.image_asset_id}.jpg"
            if not asset_path.exists():
                raise ValueError(f"Asset not found: {request.image_asset_id}")
            image = Image.open(asset_path)
            return [image], [f"/outputs/{asset_path.name}"]

        else:
            raise ValueError("Must provide reference_images, image_base64, or image_asset_id")

    def create_job(self, request: I2VGenerateRequest) -> I2VJob:
        """Create a new I2V job and add it to the queue."""
        service = get_inference_service()
        model_config = service.get_model_config(request.model)

        if not model_config:
            raise ValueError(f"Unknown model: {request.model}")

        model_type = model_config.get("type")
        if model_type not in ["video-i2v", "svd"]:
            raise ValueError(f"Model {request.model} does not support I2V")

        steps = request.steps if request.steps else model_config["default_steps"]
        num_frames = request.num_frames if request.num_frames else model_config.get("default_num_frames", 49)
        fps = request.fps if request.fps else model_config.get("default_fps", 8)

        job_id = str(uuid.uuid4())

        # Load and save source images
        images, source_urls = self._load_source_images(request, job_id)

        job = I2VJob(
            id=job_id,
            session_id=request.session_id,
            status=JobStatus.QUEUED,
            progress=0.0,
            current_frame=0,
            total_frames=num_frames,
            prompt=request.prompt,
            model=request.model,
            source_image_urls=source_urls,
            width=request.width,
            height=request.height,
            steps=steps,
            num_frames=num_frames,
            fps=fps,
            created_at=datetime.utcnow(),
            eta_seconds=self._estimate_time(request.model, steps, num_frames, include_model_load=True),
        )

        # Store PIL images temporarily for processing
        self._pending_images = getattr(self, '_pending_images', {})
        self._pending_images[job_id] = images

        with self.lock:
            self.jobs[job.id] = job

        self.job_queue.put(job.id)
        self._save_jobs()

        return job

    def get_job(self, job_id: str) -> Optional[I2VJob]:
        """Get an I2V job by ID."""
        with self.lock:
            return self.jobs.get(job_id)

    def get_jobs_by_session(self, session_id: str) -> list[I2VJob]:
        """Get all I2V jobs for a session."""
        with self.lock:
            return [j for j in self.jobs.values() if j.session_id == session_id]

    def get_active_jobs(self) -> list[I2VJob]:
        """Get all active (non-completed) I2V jobs."""
        with self.lock:
            return [j for j in self.jobs.values()
                    if j.status not in [JobStatus.COMPLETED, JobStatus.FAILED]]

    def _update_job(self, job_id: str, **updates) -> None:
        """Update I2V job fields."""
        with self.lock:
            if job_id in self.jobs:
                job = self.jobs[job_id]
                for key, value in updates.items():
                    setattr(job, key, value)
        self._save_jobs()

    def _worker(self) -> None:
        """Background worker that processes I2V jobs."""
        while True:
            try:
                job_id = self.job_queue.get()
                self.current_job_id = job_id
                self._process_job(job_id)
                self.current_job_id = None
            except Exception as e:
                print(f"I2V worker error: {e}")
                if self.current_job_id:
                    self._update_job(self.current_job_id,
                                    status=JobStatus.FAILED,
                                    error=str(e))
                self.current_job_id = None

    def _process_job(self, job_id: str) -> None:
        """Process a single I2V job."""
        job = self.get_job(job_id)
        if not job:
            return

        service = get_inference_service()
        model_config = service.get_model_config(job.model)

        if not model_config:
            self._update_job(job_id, status=JobStatus.FAILED, error=f"Unknown model: {job.model}")
            return

        try:
            # Get the pending images
            images = self._pending_images.pop(job_id, None)
            if images is None:
                # Try to reload from saved source files
                output_dir = Path(__file__).parent.parent.parent.parent / "outputs"
                images = []
                for url in job.source_image_urls:
                    source_path = output_dir / url.split("/")[-1]
                    if source_path.exists():
                        images.append(Image.open(source_path))
                if not images:
                    raise ValueError("Source image not found")

            # Use first image for generation (current models support single source)
            image = images[0]

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

            # Update to generating status
            self._update_job(job_id,
                           status=JobStatus.GENERATING,
                           progress=10.0)

            output_dir = Path(__file__).parent.parent.parent.parent / "outputs"
            output_dir.mkdir(parents=True, exist_ok=True)

            # Generate video from image
            asset_id = str(uuid.uuid4())
            video_path = output_dir / f"{asset_id}.mp4"
            metadata_path = output_dir / f"{asset_id}.json"

            # Get actual values
            guidance = model_config["default_guidance"]
            seed = random.randint(0, 2**32 - 1)

            # Generate I2V
            output_path, actual_seed, actual_frames, actual_fps, audio_path = service.generate_video_from_image(
                image=image,
                prompt=job.prompt,
                model_id=job.model,
                width=job.width,
                height=job.height,
                num_frames=job.num_frames,
                fps=job.fps,
                steps=job.steps,
                guidance_scale=guidance,
                seed=seed,
                output_path=str(video_path),
            )

            # Update progress
            self._update_job(job_id, status=JobStatus.SAVING, progress=90.0)

            # Calculate duration
            duration = actual_frames / actual_fps

            # Save metadata
            metadata = {
                "id": asset_id,
                "filename": f"{asset_id}.mp4",
                "type": "video",
                "generation_type": "i2v",
                "source_images": job.source_image_urls,
                "prompt": job.prompt,
                "model": job.model,
                "width": job.width,
                "height": job.height,
                "steps": job.steps,
                "guidance_scale": guidance,
                "seed": actual_seed,
                "num_frames": actual_frames,
                "fps": actual_fps,
                "duration": duration,
                "has_audio": False,
                "created_at": datetime.utcnow().isoformat(),
            }

            with open(metadata_path, "w") as f:
                json.dump(metadata, f, indent=2)

            # Create video result
            video_result = VideoResult(
                id=asset_id,
                filename=f"{asset_id}.mp4",
                url=f"/outputs/{asset_id}.mp4",
                seed=actual_seed,
                duration=duration,
                fps=actual_fps,
                num_frames=actual_frames,
                width=job.width,
                height=job.height,
                has_audio=False,
            )

            # Update job as completed
            with self.lock:
                if job_id in self.jobs:
                    self.jobs[job_id].video = video_result

            self._update_job(job_id,
                           status=JobStatus.COMPLETED,
                           progress=100.0,
                           current_frame=actual_frames,
                           eta_seconds=0,
                           completed_at=datetime.utcnow())

        except Exception as e:
            print(f"I2V job {job_id} failed: {e}")
            import traceback
            traceback.print_exc()
            self._update_job(job_id,
                           status=JobStatus.FAILED,
                           error=str(e),
                           completed_at=datetime.utcnow())


# Global singleton
_i2v_job_manager: Optional[I2VJobManager] = None


def get_i2v_job_manager() -> I2VJobManager:
    global _i2v_job_manager
    if _i2v_job_manager is None:
        _i2v_job_manager = I2VJobManager()
    return _i2v_job_manager
