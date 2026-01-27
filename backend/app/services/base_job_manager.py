"""Base job manager with shared infrastructure for all job types.

Provides generic persistence, queue management, worker thread,
and CRUD operations. Concrete subclasses only need to implement
_process_job() and type-specific job creation methods.
"""

import json
import threading
from datetime import datetime
from pathlib import Path
from typing import TypeVar, Generic, Optional, Dict, Type
from queue import Queue

from ..models.schemas import JobStatus

T = TypeVar("T")


class BaseJobManager(Generic[T]):
    """Generic base class for all job managers.

    Type parameter T is the job model class (Job, VideoJob, I2VJob, UpscaleJob).
    Subclasses must set:
        - _jobs_filename: str  (e.g. "jobs.json")
        - _job_type: Type[T]  (the Pydantic model class)
        - _worker_name: str   (for log messages)
    """

    _jobs_filename: str = "jobs.json"
    _job_type: Type = None  # type: ignore[assignment]
    _worker_name: str = "Worker"

    def __init__(self):
        self.jobs: Dict[str, T] = {}
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
        return data_dir / self._jobs_filename

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
                        job = self._job_type(**job_data)
                        # Only keep recent jobs (last 24 hours) or incomplete ones
                        if job.status not in [JobStatus.COMPLETED, JobStatus.FAILED]:
                            # Re-queue incomplete jobs
                            job.status = JobStatus.QUEUED
                            self.jobs[job.id] = job
                            self.job_queue.put(job.id)
                        elif job.created_at and (datetime.utcnow() - job.created_at).total_seconds() < 86400:
                            self.jobs[job.id] = job
            except Exception as e:
                print(f"Failed to load {self._worker_name.lower()} jobs: {e}")

    def _save_jobs(self) -> None:
        """Save jobs to file. File write is inside the lock to prevent race conditions."""
        jobs_file = self._get_jobs_file()
        with self.lock:
            jobs_data = []
            for job in self.jobs.values():
                job_dict = job.model_dump()
                # Convert datetime to ISO format
                for dt_field in ["created_at", "started_at", "completed_at"]:
                    if job_dict.get(dt_field):
                        job_dict[dt_field] = job_dict[dt_field].isoformat()
                jobs_data.append(job_dict)

            with open(jobs_file, "w") as f:
                json.dump({"jobs": jobs_data}, f, indent=2)

    def get_job(self, job_id: str) -> Optional[T]:
        """Get a job by ID."""
        with self.lock:
            return self.jobs.get(job_id)

    def get_jobs_by_session(self, session_id: str) -> list[T]:
        """Get all jobs for a session."""
        with self.lock:
            return [j for j in self.jobs.values() if j.session_id == session_id]

    def get_active_jobs(self) -> list[T]:
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
                print(f"{self._worker_name} error: {e}")
                if self.current_job_id:
                    self._update_job(self.current_job_id,
                                    status=JobStatus.FAILED,
                                    error=str(e))
                self.current_job_id = None

    def _process_job(self, job_id: str) -> None:
        """Process a single job. Must be implemented by subclasses."""
        raise NotImplementedError("Subclasses must implement _process_job()")
