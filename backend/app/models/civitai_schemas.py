from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


# ============== Civitai Search / Browse ==============

class CivitaiSearchParams(BaseModel):
    query: Optional[str] = None
    types: Optional[str] = None  # "Checkpoint", "LORA", etc.
    sort: Optional[str] = "Highest Rated"  # "Highest Rated", "Most Downloaded", "Newest"
    nsfw: Optional[bool] = False
    base_models: Optional[str] = None  # Comma-separated: "SD 1.5,SDXL 1.0"
    limit: int = Field(default=20, ge=1, le=100)
    cursor: Optional[str] = None


class CivitaiModelImage(BaseModel):
    url: Optional[str] = None
    nsfw: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None


class CivitaiModelFile(BaseModel):
    id: Optional[int] = None
    name: Optional[str] = None
    sizeKB: Optional[float] = None
    type: Optional[str] = None


class CivitaiModelVersion(BaseModel):
    id: int
    name: str
    baseModel: Optional[str] = None
    downloadUrl: Optional[str] = None
    files: list[CivitaiModelFile] = []
    images: list[CivitaiModelImage] = []


class CivitaiModelStats(BaseModel):
    downloadCount: Optional[int] = 0
    favoriteCount: Optional[int] = 0
    thumbsUpCount: Optional[int] = 0
    thumbsDownCount: Optional[int] = 0
    commentCount: Optional[int] = 0
    ratingCount: Optional[int] = 0
    rating: Optional[float] = 0


class CivitaiCreator(BaseModel):
    username: Optional[str] = None
    image: Optional[str] = None


class CivitaiModelSummary(BaseModel):
    id: int
    name: str
    type: Optional[str] = None
    tags: list[str] = []
    stats: Optional[CivitaiModelStats] = None
    creator: Optional[CivitaiCreator] = None
    modelVersions: list[CivitaiModelVersion] = []
    nsfw: Optional[bool] = False
    description: Optional[str] = None


class CivitaiSearchResponse(BaseModel):
    items: list[CivitaiModelSummary] = []
    metadata: Optional[dict] = None


# ============== Civitai Download ==============

class CivitaiDownloadRequest(BaseModel):
    civitai_model_id: int
    version_id: int
    model_name: str
    type: str  # "Checkpoint" or "LORA"
    filename: str
    download_url: str
    base_model: Optional[str] = None
    file_size_kb: Optional[float] = None


class CivitaiDownloadStatus:
    QUEUED = "queued"
    DOWNLOADING = "downloading"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class CivitaiDownloadJob(BaseModel):
    id: str
    civitai_model_id: int
    version_id: int
    model_name: str
    type: str
    filename: str
    download_url: str
    base_model: Optional[str] = None
    file_size_kb: Optional[float] = None
    status: str = CivitaiDownloadStatus.QUEUED
    progress: float = 0.0  # 0-100
    downloaded_bytes: int = 0
    total_bytes: int = 0
    speed_bytes_per_sec: float = 0.0
    error: Optional[str] = None
    local_path: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
