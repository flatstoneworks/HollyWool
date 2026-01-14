from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class ModelInfo(BaseModel):
    id: str
    name: str
    type: str
    default_steps: int
    default_guidance: float


class GenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=2000)
    model: str = Field(default="flux-schnell")
    negative_prompt: Optional[str] = Field(default=None, max_length=2000)
    width: int = Field(default=1024, ge=256, le=2048)
    height: int = Field(default=1024, ge=256, le=2048)
    steps: Optional[int] = Field(default=None, ge=1, le=100)
    guidance_scale: Optional[float] = Field(default=None, ge=0.0, le=20.0)
    seed: Optional[int] = Field(default=None)
    num_images: int = Field(default=4, ge=1, le=4)
    batch_id: Optional[str] = Field(default=None)  # Groups images from same generation
    session_id: Optional[str] = Field(default=None)  # Link generation to session


class ImageResult(BaseModel):
    id: str
    filename: str
    url: str
    seed: int


# Job status enum
class JobStatus:
    QUEUED = "queued"
    DOWNLOADING = "downloading"
    LOADING_MODEL = "loading_model"
    GENERATING = "generating"
    SAVING = "saving"
    COMPLETED = "completed"
    FAILED = "failed"


class Job(BaseModel):
    id: str
    session_id: Optional[str] = None
    status: str = JobStatus.QUEUED
    progress: float = 0.0  # 0-100
    current_image: int = 0  # Which image we're on (1-4)
    total_images: int = 1
    eta_seconds: Optional[float] = None
    error: Optional[str] = None
    # Download progress
    download_progress: float = 0.0  # 0-100
    download_total_mb: Optional[float] = None
    download_speed_mbps: Optional[float] = None
    # Request details
    prompt: str
    model: str
    width: int
    height: int
    steps: int
    num_images: int
    # Result
    batch_id: Optional[str] = None
    images: list[ImageResult] = []
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class JobResponse(BaseModel):
    job_id: str
    status: str
    message: str


class JobListResponse(BaseModel):
    jobs: list[Job]


class GenerateResponse(BaseModel):
    batch_id: str
    prompt: str
    model: str
    width: int
    height: int
    steps: int
    guidance_scale: float
    images: list[ImageResult]
    created_at: datetime


class AssetMetadata(BaseModel):
    id: str
    filename: str
    url: str
    prompt: str
    negative_prompt: Optional[str]
    model: str
    width: int
    height: int
    steps: int
    guidance_scale: float
    seed: int
    batch_id: Optional[str] = None
    created_at: datetime


class AssetListResponse(BaseModel):
    assets: list[AssetMetadata]
    total: int


class ModelsResponse(BaseModel):
    models: list[ModelInfo]
    current_model: Optional[str]


class HealthResponse(BaseModel):
    status: str
    gpu_available: bool
    current_model: Optional[str]


# Detailed model info for Models page
class ModelDetailedInfo(BaseModel):
    id: str
    name: str
    path: str
    type: str
    category: str
    description: str
    tags: list[str]
    # Status info
    is_cached: bool
    cached_size_mb: Optional[float] = None
    estimated_size_gb: float
    actual_size_gb: Optional[float] = None
    # Cache info
    last_accessed: Optional[float] = None  # Unix timestamp
    last_modified: Optional[float] = None  # Unix timestamp
    num_cached_revisions: int = 0
    # Approval/metadata
    requires_approval: bool
    approval_url: Optional[str] = None
    # Defaults
    default_steps: int
    default_guidance: float


class ModelsDetailedResponse(BaseModel):
    models: list[ModelDetailedInfo]
    current_model: Optional[str] = None
    total_cache_size_gb: float
    cache_items_count: int


class CacheStatusResponse(BaseModel):
    total_size_gb: float
    num_models: int
    num_datasets: int
    cache_dir: Optional[str] = None


class CacheDeleteResponse(BaseModel):
    success: bool
    freed_mb: Optional[float] = None
    model_id: str
    error: Optional[str] = None


# ============== Video Generation Schemas ==============

class VideoGenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=2000)
    model: str = Field(default="cogvideox-5b")
    negative_prompt: Optional[str] = Field(default=None, max_length=2000)
    num_frames: Optional[int] = Field(default=None, ge=1, le=200)
    fps: Optional[int] = Field(default=None, ge=1, le=60)
    width: int = Field(default=720, ge=256, le=1920)
    height: int = Field(default=480, ge=256, le=1080)
    steps: Optional[int] = Field(default=None, ge=1, le=100)
    guidance_scale: Optional[float] = Field(default=None, ge=0.0, le=20.0)
    seed: Optional[int] = Field(default=None)
    session_id: Optional[str] = Field(default=None)


class VideoResult(BaseModel):
    id: str
    filename: str
    url: str
    seed: int
    duration: float  # seconds
    fps: int
    num_frames: int
    width: int
    height: int
    has_audio: bool = False  # LTX-2 generates synchronized audio


class VideoJob(BaseModel):
    id: str
    session_id: Optional[str] = None
    status: str = JobStatus.QUEUED
    progress: float = 0.0  # 0-100
    current_frame: int = 0
    total_frames: int = 1
    eta_seconds: Optional[float] = None
    error: Optional[str] = None
    # Download progress
    download_progress: float = 0.0
    download_total_mb: Optional[float] = None
    download_speed_mbps: Optional[float] = None
    # Request details
    prompt: str
    model: str
    width: int
    height: int
    steps: int
    num_frames: int
    fps: int
    # Result
    video: Optional[VideoResult] = None
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class VideoJobResponse(BaseModel):
    job_id: str
    status: str
    message: str


class VideoJobListResponse(BaseModel):
    jobs: list[VideoJob]


# Video asset for gallery
class VideoAssetMetadata(BaseModel):
    id: str
    filename: str
    url: str
    type: str = "video"
    prompt: str
    model: str
    width: int
    height: int
    steps: int
    guidance_scale: float
    seed: int
    num_frames: int
    fps: int
    duration: float
    created_at: datetime


class VideoAssetListResponse(BaseModel):
    assets: list[VideoAssetMetadata]
    total: int


# ============== System Resource Schemas ==============

class SystemResourceStatus(BaseModel):
    """Current system resource status for video generation."""
    memory_total_gb: float
    memory_available_gb: float
    memory_used_gb: float
    memory_percent: float
    gpu_utilization: Optional[float] = None  # 0-100, None if unavailable
    cpu_percent: float
    is_available: bool
    rejection_reason: Optional[str] = None


class ResourceCheckResponse(BaseModel):
    """Response for resource check endpoint."""
    can_generate: bool
    status: SystemResourceStatus
    recommended_models: list[str] = []  # Models that fit in available memory
