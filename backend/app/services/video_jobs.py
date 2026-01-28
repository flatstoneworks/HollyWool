import json
import uuid
import random
from datetime import datetime
from pathlib import Path
from typing import Optional

from ..models.schemas import VideoJob, VideoResult, JobStatus, VideoGenerateRequest
from ..utils.paths import get_output_dir
from .inference import get_inference_service
from .base_job_manager import BaseJobManager


# Estimated base times per video model (seconds per video)
VIDEO_MODEL_BASE_TIMES = {
    "cogvideox-5b": 180,  # ~3 minutes per video
    "cogvideox-2b": 90,   # ~1.5 minutes per video
    "ltx-2": 120,         # ~2 minutes per video (with audio)
    "ltx-2-fp8": 90,      # ~1.5 minutes (FP8 quantized)
    "wan22-t2v": 240,     # ~4 min (MoE + cpu_offload overhead)
    "mochi-1": 200,       # ~3.5 min (10B params, 64 steps)
}

# Time to load a new model (seconds)
MODEL_LOAD_TIME = 60  # Video models are larger


class VideoJobManager(BaseJobManager[VideoJob]):
    _jobs_filename = "video_jobs.json"
    _job_type = VideoJob
    _worker_name = "Video worker"

    def _estimate_time(self, model: str, steps: int, num_frames: int, include_model_load: bool = False) -> float:
        """Estimate video generation time in seconds."""
        base_time = VIDEO_MODEL_BASE_TIMES.get(model, 180)
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

    def create_job(self, request: VideoGenerateRequest) -> VideoJob:
        """Create a new video job and add it to the queue."""
        service = get_inference_service()
        model_config = service.get_model_config(request.model)

        if not model_config:
            raise ValueError(f"Unknown model: {request.model}")

        steps = request.steps if request.steps else model_config["default_steps"]
        num_frames = request.num_frames if request.num_frames else model_config.get("default_num_frames", 49)
        fps = request.fps if request.fps else model_config.get("default_fps", 8)
        # Use config defaults for width/height if model specifies them
        width = model_config.get("default_width", request.width)
        height = model_config.get("default_height", request.height)

        job = VideoJob(
            id=str(uuid.uuid4()),
            session_id=request.session_id,
            status=JobStatus.QUEUED,
            progress=0.0,
            current_frame=0,
            total_frames=num_frames,
            prompt=request.prompt,
            model=request.model,
            width=width,
            height=height,
            steps=steps,
            num_frames=num_frames,
            fps=fps,
            created_at=datetime.utcnow(),
            eta_seconds=self._estimate_time(request.model, steps, num_frames, include_model_load=True),
        )

        with self.lock:
            self.jobs[job.id] = job

        self.job_queue.put(job.id)
        self._save_jobs()

        return job

    def _process_job(self, job_id: str) -> None:
        """Process a single video job."""
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

            # Load progress callback
            def load_progress_callback(progress_pct: float):
                self._update_job(job_id, load_progress=progress_pct)

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
                self._update_job(job_id, status=JobStatus.LOADING_MODEL, load_progress=0)
                service.load_model(job.model, download_callback=download_progress_callback, load_progress_callback=load_progress_callback)
            else:
                # Update to loading model status
                self._update_job(job_id,
                               status=JobStatus.LOADING_MODEL,
                               started_at=datetime.utcnow(),
                               load_progress=0)

                # Load model if needed (no download) with progress tracking
                service.load_model(job.model, load_progress_callback=load_progress_callback)

            # Update to generating status
            self._update_job(job_id,
                           status=JobStatus.GENERATING,
                           progress=10.0)

            output_dir = get_output_dir()

            # Generate video
            asset_id = str(uuid.uuid4())
            video_path = output_dir / f"{asset_id}.mp4"
            metadata_path = output_dir / f"{asset_id}.json"

            # Get actual values
            guidance = model_config["default_guidance"]
            seed = random.randint(0, 2**32 - 1)

            # Generate video (returns audio_path for LTX-2 models)
            output_path, actual_seed, actual_frames, actual_fps, audio_path = service.generate_video(
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

            # Update progress during generation (video gen is one operation)
            self._update_job(job_id, status=JobStatus.SAVING, progress=90.0)

            # Calculate duration
            duration = actual_frames / actual_fps

            # Check if model type supports audio (LTX-2)
            has_audio = model_config.get("type") == "ltx2"

            # Save metadata
            metadata = {
                "id": asset_id,
                "filename": f"{asset_id}.mp4",
                "type": "video",
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
                "has_audio": has_audio,
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
                has_audio=has_audio,
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
            print(f"Video job {job_id} failed: {e}")
            import traceback
            traceback.print_exc()
            self._update_job(job_id,
                           status=JobStatus.FAILED,
                           error=str(e),
                           completed_at=datetime.utcnow())


# Global singleton
_video_job_manager: Optional[VideoJobManager] = None


def get_video_job_manager() -> VideoJobManager:
    global _video_job_manager
    if _video_job_manager is None:
        _video_job_manager = VideoJobManager()
    return _video_job_manager
