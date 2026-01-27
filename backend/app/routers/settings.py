"""Settings and request logs router."""
import json
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Literal
from pydantic import BaseModel
from fastapi import APIRouter, Query

router = APIRouter(prefix="/api/settings", tags=["settings"])


# ============== Models ==============

class RequestLog(BaseModel):
    id: str
    timestamp: str
    type: Literal["image", "video", "i2v"]
    prompt: str
    negative_prompt: Optional[str] = None
    model: str
    parameters: dict  # width, height, steps, guidance, seed, etc.
    status: Literal["pending", "generating", "completed", "failed"]
    duration_ms: Optional[int] = None
    error: Optional[str] = None
    result_id: Optional[str] = None  # Asset ID if completed


class RequestLogsResponse(BaseModel):
    logs: List[RequestLog]
    total: int
    page: int
    page_size: int


class AppSettings(BaseModel):
    theme: Literal["light", "dark", "system"] = "dark"
    default_model: Optional[str] = None
    default_video_model: Optional[str] = None
    auto_save_history: bool = True
    max_log_entries: int = 1000
    favorite_models: List[str] = []


class SystemInfo(BaseModel):
    app_name: str = "HollyWool"
    version: str
    hostname: str
    os_name: str  # "macOS Tahoe 26.2", "Ubuntu 24.04", "Windows 11"
    platform: str  # "mac", "linux", "windows"
    device_type: str  # "Spark", "Mac", "PC"
    compute_mode: str  # "GPU", "CPU"
    cuda_available: bool  # GPU hardware detected (via torch or NVML)
    torch_cuda_enabled: bool = False  # torch compiled with CUDA support
    gpu_name: Optional[str] = None
    gpu_memory_gb: Optional[float] = None
    gpu_warning: Optional[str] = None  # Warning when GPU present but torch is CPU-only
    python_version: str
    torch_version: Optional[str] = None


# ============== File Helpers ==============

def get_data_dir() -> Path:
    """Get the data directory."""
    data_dir = Path(__file__).parent.parent.parent.parent / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir


def get_settings_file() -> Path:
    """Get the path to the settings JSON file."""
    return get_data_dir() / "settings.json"


def get_logs_file() -> Path:
    """Get the path to the request logs JSON file."""
    return get_data_dir() / "request-logs.json"


def load_settings() -> AppSettings:
    """Load settings from file."""
    settings_file = get_settings_file()
    if settings_file.exists():
        try:
            with open(settings_file, "r") as f:
                data = json.load(f)
                return AppSettings(**data)
        except Exception:
            pass
    return AppSettings()


def save_settings(settings: AppSettings) -> None:
    """Save settings to file."""
    settings_file = get_settings_file()
    with open(settings_file, "w") as f:
        json.dump(settings.model_dump(), f, indent=2)


def load_logs() -> List[RequestLog]:
    """Load request logs from file."""
    logs_file = get_logs_file()
    if logs_file.exists():
        try:
            with open(logs_file, "r") as f:
                data = json.load(f)
                return [RequestLog(**log) for log in data]
        except Exception:
            pass
    return []


def save_logs(logs: List[RequestLog]) -> None:
    """Save request logs to file."""
    logs_file = get_logs_file()
    with open(logs_file, "w") as f:
        json.dump([log.model_dump() for log in logs], f, indent=2)


def add_log(log: RequestLog) -> None:
    """Add a request log entry."""
    logs = load_logs()
    settings = load_settings()

    # Add new log at the beginning
    logs.insert(0, log)

    # Trim to max entries
    if len(logs) > settings.max_log_entries:
        logs = logs[:settings.max_log_entries]

    save_logs(logs)


def update_log(log_id: str, updates: dict) -> Optional[RequestLog]:
    """Update a log entry."""
    logs = load_logs()
    for i, log in enumerate(logs):
        if log.id == log_id:
            log_dict = log.model_dump()
            log_dict.update(updates)
            logs[i] = RequestLog(**log_dict)
            save_logs(logs)
            return logs[i]
    return None


# ============== Settings Endpoints ==============

@router.get("", response_model=AppSettings)
async def get_settings():
    """Get application settings."""
    return load_settings()


@router.post("", response_model=AppSettings)
async def update_settings(settings: AppSettings):
    """Update application settings."""
    save_settings(settings)
    return settings


# ============== Request Logs Endpoints ==============

@router.get("/logs", response_model=RequestLogsResponse)
async def get_logs(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    type: Optional[str] = Query(default=None, description="Filter by type: image, video, i2v"),
    status: Optional[str] = Query(default=None, description="Filter by status"),
):
    """Get request logs with pagination."""
    logs = load_logs()

    # Apply filters
    if type:
        logs = [log for log in logs if log.type == type]
    if status:
        logs = [log for log in logs if log.status == status]

    total = len(logs)

    # Pagination
    start = (page - 1) * page_size
    end = start + page_size
    paginated_logs = logs[start:end]

    return RequestLogsResponse(
        logs=paginated_logs,
        total=total,
        page=page,
        page_size=page_size
    )


@router.get("/logs/{log_id}", response_model=RequestLog)
async def get_log(log_id: str):
    """Get a specific log entry."""
    logs = load_logs()
    for log in logs:
        if log.id == log_id:
            return log
    return None


@router.delete("/logs")
async def clear_logs():
    """Clear all request logs."""
    save_logs([])
    return {"status": "cleared"}


@router.delete("/logs/{log_id}")
async def delete_log(log_id: str):
    """Delete a specific log entry."""
    logs = load_logs()
    logs = [log for log in logs if log.id != log_id]
    save_logs(logs)
    return {"status": "deleted", "id": log_id}


# ============== System Info Endpoint ==============

def _detect_gpu_via_nvml() -> tuple[bool, str | None, float | None]:
    """Detect GPU using NVML (pynvml/nvidia-ml-py) as fallback when torch.cuda is unavailable."""
    try:
        import pynvml
        pynvml.nvmlInit()
        count = pynvml.nvmlDeviceGetCount()
        if count == 0:
            pynvml.nvmlShutdown()
            return False, None, None
        handle = pynvml.nvmlDeviceGetHandleByIndex(0)
        name = pynvml.nvmlDeviceGetName(handle)
        memory_gb = None
        try:
            mem = pynvml.nvmlDeviceGetMemoryInfo(handle)
            memory_gb = round(mem.total / (1024**3), 2)
        except Exception:
            # GB10 / unified-memory SoCs don't support memory queries;
            # fall back to total system RAM (unified memory is shared).
            try:
                import os
                page_size = os.sysconf("SC_PAGE_SIZE")
                page_count = os.sysconf("SC_PHYS_PAGES")
                memory_gb = round((page_size * page_count) / (1024**3), 2)
            except Exception:
                pass
        pynvml.nvmlShutdown()
        return True, name, memory_gb
    except Exception:
        return False, None, None


@router.get("/system", response_model=SystemInfo)
async def get_system_info():
    """Get system information."""
    import sys
    import socket
    import platform as plat

    cuda_available = False
    torch_cuda_enabled = False
    gpu_name = None
    gpu_memory_gb = None
    torch_version = None
    gpu_detected = False  # True if any method found a GPU
    gpu_warning = None

    # 1) Try torch.cuda first
    try:
        import torch
        torch_version = torch.__version__
        cuda_available = torch.cuda.is_available()
        torch_cuda_enabled = cuda_available
        if cuda_available:
            gpu_name = torch.cuda.get_device_name(0)
            gpu_memory_gb = round(torch.cuda.get_device_properties(0).total_memory / (1024**3), 2)
            gpu_detected = True
    except ImportError:
        pass

    # 2) Fallback: detect GPU via NVML (works even with CPU-only torch)
    if not gpu_detected:
        nvml_found, nvml_name, nvml_mem = _detect_gpu_via_nvml()
        if nvml_found:
            gpu_detected = True
            gpu_name = nvml_name
            gpu_memory_gb = nvml_mem

    # 3) Warn if GPU hardware found but torch cannot use it
    if gpu_detected and not torch_cuda_enabled:
        gpu_warning = (
            f"GPU detected ({gpu_name}) but PyTorch is CPU-only "
            f"(torch {torch_version or 'not installed'}). "
            f"Run install.sh to enable GPU acceleration."
        )

    # Hostname
    hostname = socket.gethostname()

    # Detect platform and OS name
    system = plat.system().lower()
    if system == "darwin":
        platform_name = "mac"
        mac_ver = plat.mac_ver()[0]
        os_name = f"macOS {mac_ver}" if mac_ver else "macOS"
    elif system == "linux":
        platform_name = "linux"
        try:
            import distro
            os_name = f"{distro.name()} {distro.version()}"
        except ImportError:
            os_name = f"Linux {plat.release()}"
    elif system == "windows":
        platform_name = "windows"
        os_name = f"Windows {plat.version()}"
    else:
        platform_name = system
        os_name = plat.platform()

    # Determine device type
    gpu_name_lower = (gpu_name or "").lower()
    is_spark = "gb10" in gpu_name_lower or "dgx" in gpu_name_lower
    if gpu_detected and is_spark:
        device_type = "Spark"
    elif platform_name == "mac":
        device_type = "Mac"
    elif platform_name == "linux" and gpu_detected:
        device_type = "Spark"
    elif platform_name == "windows":
        device_type = "PC"
    else:
        device_type = "PC"

    compute_mode = "GPU" if gpu_detected else "CPU"

    return SystemInfo(
        app_name="HollyWool",
        version="1.0.0",
        hostname=hostname,
        os_name=os_name,
        platform=platform_name,
        device_type=device_type,
        compute_mode=compute_mode,
        cuda_available=cuda_available or gpu_detected,
        torch_cuda_enabled=torch_cuda_enabled,
        gpu_name=gpu_name,
        gpu_memory_gb=gpu_memory_gb,
        gpu_warning=gpu_warning,
        python_version=f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
        torch_version=torch_version
    )
