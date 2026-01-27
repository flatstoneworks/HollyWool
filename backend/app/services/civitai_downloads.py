import json
import os
import uuid
import threading
import time
import httpx
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict
from queue import Queue

from ..models.civitai_schemas import (
    CivitaiDownloadJob,
    CivitaiDownloadRequest,
    CivitaiDownloadStatus,
)


class CivitaiDownloadManager:
    def __init__(self):
        self.jobs: Dict[str, CivitaiDownloadJob] = {}
        self.job_queue: Queue = Queue()
        self.current_job_id: Optional[str] = None
        self.lock = threading.Lock()
        self._cancel_requested: set = set()

        # Storage directories
        self.base_dir = Path(os.path.expanduser("~/.cache/hollywool/civitai"))
        self.checkpoints_dir = self.base_dir / "checkpoints"
        self.loras_dir = self.base_dir / "loras"
        self.checkpoints_dir.mkdir(parents=True, exist_ok=True)
        self.loras_dir.mkdir(parents=True, exist_ok=True)

        self._load_jobs()

        # Start worker thread
        self.worker_thread = threading.Thread(target=self._worker, daemon=True)
        self.worker_thread.start()

    def _get_data_dir(self) -> Path:
        data_dir = Path(__file__).parent.parent.parent.parent / "data"
        data_dir.mkdir(parents=True, exist_ok=True)
        return data_dir

    def _get_jobs_file(self) -> Path:
        return self._get_data_dir() / "civitai-downloads.json"

    def _get_models_registry_file(self) -> Path:
        return self._get_data_dir() / "civitai-models.json"

    def _load_jobs(self) -> None:
        jobs_file = self._get_jobs_file()
        if jobs_file.exists():
            try:
                with open(jobs_file, "r") as f:
                    data = json.load(f)
                    for job_data in data.get("jobs", []):
                        for dt_field in ["created_at", "started_at", "completed_at"]:
                            if job_data.get(dt_field):
                                job_data[dt_field] = datetime.fromisoformat(job_data[dt_field])
                        job = CivitaiDownloadJob(**job_data)
                        if job.status in [CivitaiDownloadStatus.QUEUED, CivitaiDownloadStatus.DOWNLOADING]:
                            # Re-queue incomplete jobs
                            job.status = CivitaiDownloadStatus.QUEUED
                            job.progress = 0.0
                            job.downloaded_bytes = 0
                            self.jobs[job.id] = job
                            self.job_queue.put(job.id)
                        else:
                            # Keep completed/failed jobs
                            self.jobs[job.id] = job
            except Exception as e:
                print(f"Failed to load civitai download jobs: {e}")

    def _save_jobs(self) -> None:
        jobs_file = self._get_jobs_file()
        jobs_data = []
        with self.lock:
            for job in self.jobs.values():
                job_dict = job.model_dump()
                for dt_field in ["created_at", "started_at", "completed_at"]:
                    if job_dict.get(dt_field):
                        job_dict[dt_field] = job_dict[dt_field].isoformat()
                jobs_data.append(job_dict)

        with open(jobs_file, "w") as f:
            json.dump({"jobs": jobs_data}, f, indent=2)

    def create_download(self, request: CivitaiDownloadRequest) -> CivitaiDownloadJob:
        job = CivitaiDownloadJob(
            id=str(uuid.uuid4()),
            civitai_model_id=request.civitai_model_id,
            version_id=request.version_id,
            model_name=request.model_name,
            type=request.type,
            filename=request.filename,
            download_url=request.download_url,
            base_model=request.base_model,
            file_size_kb=request.file_size_kb,
            status=CivitaiDownloadStatus.QUEUED,
            created_at=datetime.utcnow(),
        )

        with self.lock:
            self.jobs[job.id] = job

        self.job_queue.put(job.id)
        self._save_jobs()
        return job

    def get_job(self, job_id: str) -> Optional[CivitaiDownloadJob]:
        with self.lock:
            return self.jobs.get(job_id)

    def get_all_jobs(self) -> list[CivitaiDownloadJob]:
        with self.lock:
            return list(self.jobs.values())

    def get_downloaded_version_ids(self) -> list[int]:
        with self.lock:
            return [
                job.version_id
                for job in self.jobs.values()
                if job.status == CivitaiDownloadStatus.COMPLETED
            ]

    def cancel_download(self, job_id: str) -> bool:
        with self.lock:
            job = self.jobs.get(job_id)
            if not job:
                return False
            if job.status == CivitaiDownloadStatus.DOWNLOADING:
                self._cancel_requested.add(job_id)
                return True
            elif job.status == CivitaiDownloadStatus.QUEUED:
                job.status = CivitaiDownloadStatus.CANCELLED
                self._save_jobs()
                return True
            # For completed/failed/cancelled, remove from tracking
            elif job.status in [CivitaiDownloadStatus.COMPLETED, CivitaiDownloadStatus.FAILED, CivitaiDownloadStatus.CANCELLED]:
                del self.jobs[job_id]
                self._save_jobs()
                return True
        return False

    def _update_job(self, job_id: str, **updates) -> None:
        with self.lock:
            if job_id in self.jobs:
                job = self.jobs[job_id]
                for key, value in updates.items():
                    setattr(job, key, value)
        self._save_jobs()

    def _worker(self) -> None:
        while True:
            try:
                job_id = self.job_queue.get()
                # Check if cancelled before starting
                job = self.get_job(job_id)
                if not job or job.status == CivitaiDownloadStatus.CANCELLED:
                    continue

                self.current_job_id = job_id
                self._process_download(job_id)
                self.current_job_id = None
            except Exception as e:
                print(f"Civitai download worker error: {e}")
                if self.current_job_id:
                    self._update_job(
                        self.current_job_id,
                        status=CivitaiDownloadStatus.FAILED,
                        error=str(e),
                        completed_at=datetime.utcnow(),
                    )
                self.current_job_id = None

    def _process_download(self, job_id: str) -> None:
        job = self.get_job(job_id)
        if not job:
            return

        self._update_job(
            job_id,
            status=CivitaiDownloadStatus.DOWNLOADING,
            started_at=datetime.utcnow(),
        )

        # Determine output directory
        if job.type.upper() == "LORA":
            output_dir = self.loras_dir
        else:
            output_dir = self.checkpoints_dir

        output_path = output_dir / job.filename

        try:
            # Stream download with progress
            with httpx.Client(timeout=None, follow_redirects=True) as client:
                with client.stream("GET", job.download_url) as response:
                    response.raise_for_status()
                    total = int(response.headers.get("content-length", 0))
                    if total == 0 and job.file_size_kb:
                        total = int(job.file_size_kb * 1024)

                    self._update_job(job_id, total_bytes=total)

                    downloaded = 0
                    start_time = time.time()
                    last_update_time = start_time

                    with open(output_path, "wb") as f:
                        for chunk in response.iter_bytes(chunk_size=1024 * 1024):  # 1MB chunks
                            if job_id in self._cancel_requested:
                                self._cancel_requested.discard(job_id)
                                # Clean up partial file
                                f.close()
                                if output_path.exists():
                                    output_path.unlink()
                                self._update_job(
                                    job_id,
                                    status=CivitaiDownloadStatus.CANCELLED,
                                    completed_at=datetime.utcnow(),
                                )
                                return

                            f.write(chunk)
                            downloaded += len(chunk)

                            now = time.time()
                            if now - last_update_time >= 0.5:
                                last_update_time = now
                                elapsed = now - start_time
                                speed = downloaded / elapsed if elapsed > 0 else 0
                                progress = (downloaded / total * 100) if total > 0 else 0

                                self._update_job(
                                    job_id,
                                    downloaded_bytes=downloaded,
                                    progress=progress,
                                    speed_bytes_per_sec=speed,
                                )

            # Download complete
            self._update_job(
                job_id,
                status=CivitaiDownloadStatus.COMPLETED,
                progress=100.0,
                downloaded_bytes=downloaded,
                local_path=str(output_path),
                completed_at=datetime.utcnow(),
            )

            # Write metadata JSON alongside the file
            metadata_path = output_path.with_suffix(".json")
            metadata = {
                "civitai_model_id": job.civitai_model_id,
                "version_id": job.version_id,
                "model_name": job.model_name,
                "type": job.type,
                "base_model": job.base_model,
                "filename": job.filename,
                "downloaded_at": datetime.utcnow().isoformat(),
            }
            with open(metadata_path, "w") as f:
                json.dump(metadata, f, indent=2)

            # Register in civitai-models.json for inference service
            if job.type.upper() == "CHECKPOINT":
                self._register_model(job, str(output_path))

            print(f"Civitai download completed: {job.filename}")

        except Exception as e:
            print(f"Civitai download failed for {job.filename}: {e}")
            # Clean up partial file
            if output_path.exists():
                output_path.unlink()
            self._update_job(
                job_id,
                status=CivitaiDownloadStatus.FAILED,
                error=str(e),
                completed_at=datetime.utcnow(),
            )

    def _register_model(self, job: CivitaiDownloadJob, local_path: str) -> None:
        registry_file = self._get_models_registry_file()
        registry = {}
        if registry_file.exists():
            try:
                with open(registry_file, "r") as f:
                    registry = json.load(f)
            except Exception:
                registry = {}

        model_id = f"civitai-{job.civitai_model_id}-v{job.version_id}"

        # Map base model to pipeline type
        base_model = (job.base_model or "").strip()
        if "SDXL" in base_model:
            model_type = "sdxl"
        elif "SD 3" in base_model or "SD3" in base_model:
            model_type = "sd3"
        elif "SD 1" in base_model or "SD1" in base_model:
            model_type = "sd"
        elif "Flux" in base_model or "FLUX" in base_model:
            model_type = "flux"
        else:
            model_type = "sdxl"  # Default fallback

        registry[model_id] = {
            "name": job.model_name,
            "path": local_path,
            "type": model_type,
            "base_model": job.base_model,
            "civitai_model_id": job.civitai_model_id,
            "version_id": job.version_id,
            "single_file": True,
            "default_steps": 20,
            "default_guidance": 7.0,
            "category": "civitai",
        }

        with open(registry_file, "w") as f:
            json.dump(registry, f, indent=2)


# Singleton
_civitai_download_manager: Optional[CivitaiDownloadManager] = None


def get_civitai_download_manager() -> CivitaiDownloadManager:
    global _civitai_download_manager
    if _civitai_download_manager is None:
        _civitai_download_manager = CivitaiDownloadManager()
    return _civitai_download_manager
