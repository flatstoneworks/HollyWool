"""
Video upscale job manager.

Handles queuing, processing, and tracking of video upscale jobs.
"""

import json
import uuid
import threading
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict
from queue import Queue

from ..models.schemas import UpscaleJob, VideoResult, JobStatus, VideoUpscaleRequest
from .upscaler import get_upscaler_service


# Estimated time per frame for upscaling (seconds)
UPSCALE_TIME_PER_FRAME = {
    "realesrgan-x4plus": 0.5,      # ~0.5s per frame for 4x
    "realesrgan-x2plus": 0.3,      # ~0.3s per frame for 2x
    "realesrgan-x4-anime": 0.3,    # Lighter model
    "realesrgan-x4-video": 0.3,    # Video-optimized
}

MODEL_LOAD_TIME = 15  # Upscale models are small, load quickly


class UpscaleJobManager:
    """Manages video upscale jobs with queue and background processing."""

    def __init__(self):
        self.jobs: Dict[str, UpscaleJob] = {}
        self.job_queue: Queue = Queue()
        self.current_job_id: Optional[str] = None
        self.lock = threading.Lock()
        self._load_jobs()

        # Start worker thread
        self.worker_thread = threading.Thread(target=self._worker, daemon=True)
        self.worker_thread.start()

    def _get_jobs_file(self) -> Path:
        """Get path to jobs persistence file."""
        data_dir = Path(__file__).parent.parent.parent.parent / "data"
        data_dir.mkdir(parents=True, exist_ok=True)
        return data_dir / "upscale_jobs.json"

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
                        job = UpscaleJob(**job_data)
                        # Only keep recent jobs (last 24 hours) or incomplete ones
                        if job.status not in [JobStatus.COMPLETED, JobStatus.FAILED]:
                            # Re-queue incomplete jobs
                            job.status = JobStatus.QUEUED
                            self.jobs[job.id] = job
                            self.job_queue.put(job.id)
                        elif job.created_at and (datetime.utcnow() - job.created_at).total_seconds() < 86400:
                            self.jobs[job.id] = job
            except Exception as e:
                print(f"Failed to load upscale jobs: {e}")

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

    def _estimate_time(self, model: str, num_frames: int, include_model_load: bool = False) -> float:
        """Estimate upscale time in seconds."""
        time_per_frame = UPSCALE_TIME_PER_FRAME.get(model, 0.5)
        total_time = time_per_frame * num_frames

        if include_model_load:
            service = get_upscaler_service()
            if service.current_model_id != model:
                total_time += MODEL_LOAD_TIME

        return total_time

    def _get_video_metadata(self, video_asset_id: str) -> Optional[dict]:
        """Load metadata for a video asset."""
        outputs_dir = Path(__file__).parent.parent.parent.parent / "outputs"
        metadata_path = outputs_dir / f"{video_asset_id}.json"

        if not metadata_path.exists():
            return None

        with open(metadata_path, "r") as f:
            return json.load(f)

    def create_job(self, request: VideoUpscaleRequest) -> UpscaleJob:
        """Create a new upscale job and add it to the queue."""
        # Load source video metadata
        metadata = self._get_video_metadata(request.video_asset_id)
        if not metadata:
            raise ValueError(f"Video asset not found: {request.video_asset_id}")

        # Get upscale model config
        service = get_upscaler_service()
        model_config = service.get_model_config(request.model)
        if not model_config:
            raise ValueError(f"Unknown upscale model: {request.model}")

        scale = model_config["scale"]
        source_width = metadata.get("width", 720)
        source_height = metadata.get("height", 480)
        source_fps = metadata.get("fps", 8)
        source_duration = metadata.get("duration", 0)
        total_frames = metadata.get("num_frames", int(source_duration * source_fps))

        job = UpscaleJob(
            id=str(uuid.uuid4()),
            session_id=request.session_id,
            status=JobStatus.QUEUED,
            progress=0.0,
            current_frame=0,
            total_frames=total_frames,
            # Source info
            source_video_id=request.video_asset_id,
            source_width=source_width,
            source_height=source_height,
            source_fps=source_fps,
            source_duration=source_duration,
            # Upscale config
            model=request.model,
            scale_factor=scale,
            target_width=source_width * scale,
            target_height=source_height * scale,
            # Timestamps
            created_at=datetime.utcnow(),
            eta_seconds=self._estimate_time(request.model, total_frames, include_model_load=True),
        )

        with self.lock:
            self.jobs[job.id] = job

        self.job_queue.put(job.id)
        self._save_jobs()

        return job

    def get_job(self, job_id: str) -> Optional[UpscaleJob]:
        """Get an upscale job by ID."""
        with self.lock:
            return self.jobs.get(job_id)

    def get_jobs_by_session(self, session_id: str) -> list[UpscaleJob]:
        """Get all upscale jobs for a session."""
        with self.lock:
            return [j for j in self.jobs.values() if j.session_id == session_id]

    def get_active_jobs(self) -> list[UpscaleJob]:
        """Get all active (non-completed) upscale jobs."""
        with self.lock:
            return [j for j in self.jobs.values()
                    if j.status not in [JobStatus.COMPLETED, JobStatus.FAILED]]

    def get_all_jobs(self) -> list[UpscaleJob]:
        """Get all upscale jobs."""
        with self.lock:
            return list(self.jobs.values())

    def _update_job(self, job_id: str, **updates) -> None:
        """Update upscale job fields."""
        with self.lock:
            if job_id in self.jobs:
                job = self.jobs[job_id]
                for key, value in updates.items():
                    setattr(job, key, value)
        self._save_jobs()

    def _worker(self) -> None:
        """Background worker that processes upscale jobs."""
        while True:
            try:
                job_id = self.job_queue.get()
                self.current_job_id = job_id
                self._process_job(job_id)
                self.current_job_id = None
            except Exception as e:
                print(f"Upscale worker error: {e}")
                import traceback
                traceback.print_exc()
                if self.current_job_id:
                    self._update_job(self.current_job_id,
                                    status=JobStatus.FAILED,
                                    error=str(e))
                self.current_job_id = None

    def _process_job(self, job_id: str) -> None:
        """Process a single upscale job."""
        job = self.get_job(job_id)
        if not job:
            return

        service = get_upscaler_service()

        try:
            # Update to loading model status
            self._update_job(job_id,
                           status=JobStatus.LOADING_MODEL,
                           started_at=datetime.utcnow())

            # Load upscale model
            service.load_model(job.model)

            # Update to generating status
            self._update_job(job_id,
                           status=JobStatus.GENERATING,
                           progress=5.0)

            # Setup paths
            outputs_dir = Path(__file__).parent.parent.parent.parent / "outputs"
            source_path = outputs_dir / f"{job.source_video_id}.mp4"

            if not source_path.exists():
                raise ValueError(f"Source video not found: {source_path}")

            # Create output paths
            asset_id = str(uuid.uuid4())
            output_path = outputs_dir / f"{asset_id}.mp4"
            metadata_path = outputs_dir / f"{asset_id}.json"

            # Progress callback for frame-by-frame updates
            def progress_callback(current_frame: int, total_frames: int, progress_pct: float):
                # Scale progress to 5-90% (loading is 0-5%, saving is 90-100%)
                scaled_progress = 5 + (progress_pct * 0.85)
                remaining_frames = total_frames - current_frame
                time_per_frame = UPSCALE_TIME_PER_FRAME.get(job.model, 0.5)
                eta = remaining_frames * time_per_frame

                self._update_job(job_id,
                               current_frame=current_frame,
                               progress=scaled_progress,
                               eta_seconds=eta)

            # Upscale the video
            out_width, out_height, total_frames, fps = service.upscale_video(
                input_path=str(source_path),
                output_path=str(output_path),
                progress_callback=progress_callback
            )

            # Update to saving status
            self._update_job(job_id, status=JobStatus.SAVING, progress=90.0)

            # Load source metadata for reference
            source_metadata = self._get_video_metadata(job.source_video_id)
            source_prompt = source_metadata.get("prompt", "") if source_metadata else ""

            # Calculate duration
            duration = total_frames / fps if fps > 0 else job.source_duration

            # Save metadata
            metadata = {
                "id": asset_id,
                "filename": f"{asset_id}.mp4",
                "type": "video",
                "generation_type": "upscale",
                "source_video_id": job.source_video_id,
                "prompt": source_prompt,
                "model": job.model,
                "width": out_width,
                "height": out_height,
                "scale_factor": job.scale_factor,
                "original_width": job.source_width,
                "original_height": job.source_height,
                "steps": 0,  # Not applicable for upscaling
                "guidance_scale": 0,
                "seed": 0,
                "num_frames": total_frames,
                "fps": int(fps),
                "duration": duration,
                "has_audio": source_metadata.get("has_audio", False) if source_metadata else False,
                "created_at": datetime.utcnow().isoformat(),
            }

            with open(metadata_path, "w") as f:
                json.dump(metadata, f, indent=2)

            # Create video result
            video_result = VideoResult(
                id=asset_id,
                filename=f"{asset_id}.mp4",
                url=f"/outputs/{asset_id}.mp4",
                seed=0,
                duration=duration,
                fps=int(fps),
                num_frames=total_frames,
                width=out_width,
                height=out_height,
                has_audio=metadata["has_audio"],
            )

            # Update job as completed
            with self.lock:
                if job_id in self.jobs:
                    self.jobs[job_id].video = video_result

            self._update_job(job_id,
                           status=JobStatus.COMPLETED,
                           progress=100.0,
                           current_frame=total_frames,
                           eta_seconds=0,
                           completed_at=datetime.utcnow())

        except Exception as e:
            print(f"Upscale job {job_id} failed: {e}")
            import traceback
            traceback.print_exc()
            self._update_job(job_id,
                           status=JobStatus.FAILED,
                           error=str(e),
                           completed_at=datetime.utcnow())


# Global singleton
_upscale_job_manager: Optional[UpscaleJobManager] = None


def get_upscale_job_manager() -> UpscaleJobManager:
    """Get the global upscale job manager instance."""
    global _upscale_job_manager
    if _upscale_job_manager is None:
        _upscale_job_manager = UpscaleJobManager()
    return _upscale_job_manager
