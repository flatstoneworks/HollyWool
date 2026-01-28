from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime


class ModelInfo(BaseModel):
    id: str
    name: str
    type: str
    default_steps: int
    default_guidance: float
    category: str = ""
    description: str = ""
    tags: list[str] = []
    size_gb: float = 0
    requires_approval: bool = False
    approval_url: Optional[str] = None
    is_cached: bool = False
    hf_path: str = ""


# ============== LoRA Schemas ==============

class ReferenceImage(BaseModel):
    """A reference image for img2img or I2V workflows."""
    image_base64: Optional[str] = Field(default=None)
    image_asset_id: Optional[str] = Field(default=None)


class LoRAApply(BaseModel):
    """Request to apply a LoRA with a specific weight."""
    lora_id: str
    weight: float = Field(default=0.8, ge=0.0, le=1.5)


class LoRAInfo(BaseModel):
    """Information about an available LoRA."""
    id: str
    name: str
    path: str
    source: Literal["preset", "local", "huggingface"]
    compatible_types: list[str]
    default_weight: float = 0.8
    description: str = ""
    is_downloaded: bool = False


class LoRAListResponse(BaseModel):
    """Response for listing available LoRAs."""
    loras: list[LoRAInfo]
    local_lora_dir: str


class LoRAScanResponse(BaseModel):
    """Response for scanning local LoRA directory."""
    count: int
    loras: list[LoRAInfo]


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
    loras: Optional[list[LoRAApply]] = Field(default=None)  # LoRAs to apply with weights
    reference_images: Optional[list[ReferenceImage]] = Field(default=None)  # Up to 5 reference images for I2I
    strength: Optional[float] = Field(default=0.75, ge=0.0, le=1.0)  # I2I denoising strength


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
    # Load progress (model loading into GPU)
    load_progress: float = 0.0  # 0-100
    # Request details
    prompt: str
    model: str
    width: int
    height: int
    steps: int
    num_images: int
    # I2I fields
    source_image_urls: list[str] = []
    strength: Optional[float] = None
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
    hostname: Optional[str] = None


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
    # Load progress (model loading into GPU)
    load_progress: float = 0.0  # 0-100
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
    cpu_name: Optional[str] = None
    cpu_cores: Optional[int] = None
    cpu_threads: Optional[int] = None
    is_available: bool
    rejection_reason: Optional[str] = None


class ResourceCheckResponse(BaseModel):
    """Response for resource check endpoint."""
    can_generate: bool
    status: SystemResourceStatus
    recommended_models: list[str] = []  # Models that fit in available memory


# ============== Image-to-Video (I2V) Schemas ==============

class I2VGenerateRequest(BaseModel):
    """Request for image-to-video generation."""
    prompt: str = Field(..., min_length=1, max_length=2000)
    model: str = Field(default="cogvideox-5b-i2v")
    image_base64: Optional[str] = Field(default=None)  # Direct base64 image upload (legacy)
    image_asset_id: Optional[str] = Field(default=None)  # Use existing asset as source (legacy)
    reference_images: Optional[list[ReferenceImage]] = Field(default=None)  # New: array of reference images
    negative_prompt: Optional[str] = Field(default=None, max_length=2000)
    num_frames: Optional[int] = Field(default=None, ge=1, le=200)
    fps: Optional[int] = Field(default=None, ge=1, le=60)
    width: int = Field(default=720, ge=256, le=1920)
    height: int = Field(default=480, ge=256, le=1080)
    steps: Optional[int] = Field(default=None, ge=1, le=100)
    guidance_scale: Optional[float] = Field(default=None, ge=0.0, le=20.0)
    seed: Optional[int] = Field(default=None)
    session_id: Optional[str] = Field(default=None)
    # SVD-specific parameters
    motion_bucket_id: int = Field(default=127, ge=1, le=255)
    noise_aug_strength: float = Field(default=0.02, ge=0.0, le=1.0)


class I2VJob(BaseModel):
    """Image-to-video generation job status."""
    id: str
    session_id: Optional[str] = None
    status: str = JobStatus.QUEUED
    progress: float = 0.0
    current_frame: int = 0
    total_frames: int = 1
    eta_seconds: Optional[float] = None
    error: Optional[str] = None
    # Download progress
    download_progress: float = 0.0
    download_total_mb: Optional[float] = None
    download_speed_mbps: Optional[float] = None
    # Load progress (model loading into GPU)
    load_progress: float = 0.0  # 0-100
    # Request details
    prompt: str
    model: str
    source_image_urls: list[str] = []  # URL/paths of source images
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


class I2VJobResponse(BaseModel):
    """Response when creating an I2V job."""
    job_id: str
    status: str
    message: str


class I2VJobListResponse(BaseModel):
    """Response listing I2V jobs."""
    jobs: list[I2VJob]


# ============== Video Upscale Schemas ==============

class VideoUpscaleRequest(BaseModel):
    """Request to upscale an existing video using Real-ESRGAN."""
    video_asset_id: str = Field(..., description="ID of the source video to upscale")
    model: str = Field(default="realesrgan-x4plus", description="Upscale model to use")
    session_id: Optional[str] = Field(default=None, description="Session to link the upscaled video to")


class UpscaleModelInfo(BaseModel):
    """Information about an available upscale model."""
    id: str
    name: str
    scale: int
    description: str


class UpscaleModelsResponse(BaseModel):
    """Response listing available upscale models."""
    models: list[UpscaleModelInfo]


class UpscaleJob(BaseModel):
    """Video upscale job status."""
    id: str
    session_id: Optional[str] = None
    status: str = JobStatus.QUEUED
    progress: float = 0.0  # 0-100
    current_frame: int = 0
    total_frames: int = 1
    eta_seconds: Optional[float] = None
    error: Optional[str] = None
    # Source info
    source_video_id: str
    source_width: int
    source_height: int
    source_fps: int
    source_duration: float
    # Upscale config
    model: str
    scale_factor: int
    target_width: int
    target_height: int
    # Result
    video: Optional[VideoResult] = None
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class UpscaleJobResponse(BaseModel):
    """Response when creating an upscale job."""
    job_id: str
    status: str
    message: str
    eta_seconds: Optional[float] = None


class UpscaleJobListResponse(BaseModel):
    """Response listing upscale jobs."""
    jobs: list[UpscaleJob]


# ============== Bulk Operation Schemas ==============

class BulkVariationRequest(BaseModel):
    """Request to generate prompt variations via Claude."""
    base_prompt: str = Field(..., min_length=1, max_length=2000)
    count: int = Field(default=10, ge=1, le=200)
    style_guidance: Optional[str] = Field(default=None, max_length=1000)
    claude_model: str = Field(default="claude-sonnet-4-20250514")


class BulkVariationResponse(BaseModel):
    """Response containing generated prompt variations."""
    variations: list[str]
    base_prompt: str
    count: int


class BulkImageItem(BaseModel):
    """Status of a single image in a bulk job."""
    index: int
    prompt: str
    status: str = "pending"  # pending, generating, completed, failed
    image_url: Optional[str] = None
    asset_id: Optional[str] = None
    error: Optional[str] = None
    seed: Optional[int] = None


class BulkImageRequest(BaseModel):
    """Request to start bulk image generation."""
    prompts: list[str] = Field(..., min_length=1, max_length=200)
    fal_model: str = Field(default="fal-ai/flux/schnell")
    width: int = Field(default=1024, ge=256, le=2048)
    height: int = Field(default=1024, ge=256, le=2048)
    steps: Optional[int] = Field(default=None, ge=1, le=100)
    base_prompt: Optional[str] = None
    session_id: Optional[str] = None


class BulkJob(BaseModel):
    """A bulk image generation job."""
    id: str
    session_id: Optional[str] = None
    status: str = JobStatus.QUEUED
    progress: float = 0.0
    total: int = 0
    completed: int = 0
    failed: int = 0
    items: list[BulkImageItem] = []
    base_prompt: Optional[str] = None
    fal_model: str = "fal-ai/flux/schnell"
    width: int = 1024
    height: int = 1024
    steps: Optional[int] = None
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error: Optional[str] = None


class BulkJobResponse(BaseModel):
    """Response when creating a bulk job."""
    job_id: str
    status: str
    message: str


class BulkJobListResponse(BaseModel):
    """Response listing bulk jobs."""
    jobs: list[BulkJob]


# ============== ComfyUI Workflow Schemas ==============

class ComfyUIEditableParameter(BaseModel):
    """A single editable parameter extracted from a ComfyUI workflow."""
    node_id: str
    node_class: str
    input_name: str
    input_type: str  # STRING, INT, FLOAT, COMBO, IMAGE
    current_value: Optional[str | int | float | list] = None
    constraints: dict = {}  # min, max, step for numbers; choices for COMBO
    display_name: str = ""
    category: str = "advanced"  # prompt, sampler, dimensions, model, advanced


class SavedWorkflow(BaseModel):
    """A saved ComfyUI workflow with extracted parameters."""
    id: str
    name: str
    workflow_json: dict  # The raw ComfyUI workflow
    parameters: list[ComfyUIEditableParameter] = []
    created_at: datetime
    updated_at: Optional[datetime] = None


class SavedWorkflowSummary(BaseModel):
    """Summary of a saved workflow (without full JSON)."""
    id: str
    name: str
    parameter_count: int
    created_at: datetime


class ComfyUIGenerateRequest(BaseModel):
    """Request to generate images using a ComfyUI workflow."""
    workflow_id: str = Field(..., description="ID of the saved workflow to use")
    parameters: dict = Field(default={}, description="Parameter overrides: {'node_id.input_name': value}")
    session_id: Optional[str] = Field(default=None)


class ComfyUIJob(BaseModel):
    """ComfyUI generation job status."""
    id: str
    session_id: Optional[str] = None
    status: str = JobStatus.QUEUED
    progress: float = 0.0  # 0-100
    eta_seconds: Optional[float] = None
    error: Optional[str] = None
    # Request details
    workflow_id: str
    workflow_name: str
    parameters: dict = {}  # Applied parameters
    # Execution tracking
    prompt_id: Optional[str] = None  # ComfyUI prompt ID
    current_node: Optional[str] = None  # Node being executed
    # Result
    images: list[ImageResult] = []
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class ComfyUIJobResponse(BaseModel):
    """Response when creating a ComfyUI job."""
    job_id: str
    status: str
    message: str


class ComfyUIJobListResponse(BaseModel):
    """Response listing ComfyUI jobs."""
    jobs: list[ComfyUIJob]


class ComfyUIStatusResponse(BaseModel):
    """ComfyUI server status."""
    available: bool
    server_url: str
    queue_running: int = 0
    queue_pending: int = 0
    error: Optional[str] = None


class WorkflowImportRequest(BaseModel):
    """Request to import a ComfyUI workflow."""
    name: str = Field(..., min_length=1, max_length=100)
    workflow_json: dict = Field(..., description="ComfyUI workflow in API format")


class WorkflowImportResponse(BaseModel):
    """Response after importing a workflow."""
    id: str
    name: str
    parameters: list[ComfyUIEditableParameter]
    message: str
