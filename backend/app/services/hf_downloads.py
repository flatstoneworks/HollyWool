"""HuggingFace model download tracker.

Provides in-memory job tracking for HF model downloads so they appear
in notifications and request logs, mirroring the CivitAI download system.
"""
import uuid
import threading
from datetime import datetime
from typing import Optional, Dict

from pydantic import BaseModel

from ..routers.settings import add_log, update_log, RequestLog


class HFDownloadJob(BaseModel):
    id: str
    model_id: str
    model_name: str
    model_path: str  # HuggingFace repo path
    status: str  # downloading, completed, failed
    progress: float = 0.0
    total_size_mb: float = 0.0
    speed_mbps: float = 0.0
    error: Optional[str] = None
    created_at: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


class HFDownloadTracker:
    """Lightweight in-memory tracker for HuggingFace model downloads."""

    def __init__(self):
        self.jobs: Dict[str, HFDownloadJob] = {}
        self.lock = threading.Lock()

    def create_job(self, model_id: str, model_name: str, model_path: str) -> HFDownloadJob:
        now = datetime.utcnow().isoformat()
        job = HFDownloadJob(
            id=str(uuid.uuid4()),
            model_id=model_id,
            model_name=model_name,
            model_path=model_path,
            status="downloading",
            created_at=now,
            started_at=now,
        )
        with self.lock:
            self.jobs[job.id] = job

        # Log to request logs
        add_log(RequestLog(
            id=job.id,
            timestamp=now,
            type="download",
            prompt=model_name,
            model=model_path,
            parameters={"model_id": model_id, "source": "huggingface"},
            status="downloading",
        ))

        return job

    def update_progress(self, job_id: str, progress: float, total_mb: float, speed: float) -> None:
        with self.lock:
            job = self.jobs.get(job_id)
            if job:
                job.progress = progress
                job.total_size_mb = total_mb
                job.speed_mbps = speed

    def complete_job(self, job_id: str) -> None:
        now = datetime.utcnow()
        with self.lock:
            job = self.jobs.get(job_id)
            if job:
                job.status = "completed"
                job.progress = 100.0
                job.completed_at = now.isoformat()
                started = datetime.fromisoformat(job.started_at) if job.started_at else now
                duration_ms = int((now - started).total_seconds() * 1000)

        update_log(job_id, {"status": "completed", "duration_ms": duration_ms})

    def fail_job(self, job_id: str, error: str) -> None:
        with self.lock:
            job = self.jobs.get(job_id)
            if job:
                job.status = "failed"
                job.error = error
                job.completed_at = datetime.utcnow().isoformat()

        update_log(job_id, {"status": "failed", "error": error})

    def get_all_jobs(self) -> list[HFDownloadJob]:
        with self.lock:
            return list(self.jobs.values())

    def cleanup_old_jobs(self) -> None:
        """Remove completed/failed jobs older than 5 minutes."""
        now = datetime.utcnow()
        with self.lock:
            to_remove = []
            for job_id, job in self.jobs.items():
                if job.status in ("completed", "failed") and job.completed_at:
                    completed = datetime.fromisoformat(job.completed_at)
                    if (now - completed).total_seconds() > 300:
                        to_remove.append(job_id)
            for job_id in to_remove:
                del self.jobs[job_id]


# Singleton
_tracker: Optional[HFDownloadTracker] = None


def get_hf_download_tracker() -> HFDownloadTracker:
    global _tracker
    if _tracker is None:
        _tracker = HFDownloadTracker()
    return _tracker
