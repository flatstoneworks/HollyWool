"""
System resource monitoring for video generation.
Checks memory availability and GPU utilization before accepting jobs.
"""
import platform
import psutil
from typing import Optional
from dataclasses import dataclass


def get_cpu_name() -> Optional[str]:
    """Get CPU model name."""
    try:
        # Try /proc/cpuinfo on Linux (x86)
        with open("/proc/cpuinfo", "r") as f:
            for line in f:
                if line.startswith("model name"):
                    return line.split(":")[1].strip()
    except Exception:
        pass

    try:
        # Try lscpu for ARM/other architectures
        import subprocess
        result = subprocess.run(
            ["lscpu"],
            capture_output=True,
            text=True,
            timeout=2
        )
        for line in result.stdout.split("\n"):
            if line.startswith("Model name:"):
                return line.split(":")[1].strip()
    except Exception:
        pass

    # Fallback to platform
    proc = platform.processor()
    if proc and proc != "aarch64":
        return proc

    # Final fallback: architecture + machine
    return f"{platform.machine()} ({platform.system()})"


# Try to import pynvml for GPU utilization (memory queries won't work on DGX Spark unified arch)
try:
    import pynvml
    pynvml.nvmlInit()
    PYNVML_AVAILABLE = True
except Exception:
    PYNVML_AVAILABLE = False


# Memory overhead for generation process (buffers, intermediate tensors)
GENERATION_OVERHEAD_GB = 5.0

# Minimum free memory as percentage of total RAM (proportional buffer)
MIN_FREE_MEMORY_PERCENT = 5.0  # 5% of total RAM

# GPU utilization threshold - above this, system is considered busy
GPU_BUSY_THRESHOLD = 80.0  # percent

# CPU utilization threshold - secondary indicator
CPU_BUSY_THRESHOLD = 90.0  # percent


@dataclass
class ResourceStatus:
    """Current system resource status."""
    memory_total_gb: float
    memory_available_gb: float
    memory_used_gb: float
    memory_percent: float
    gpu_utilization: Optional[float]  # 0-100 percent, None if unavailable
    cpu_percent: float
    cpu_name: Optional[str]
    cpu_cores: int
    cpu_threads: int
    is_available: bool
    rejection_reason: Optional[str]


def get_gpu_utilization() -> Optional[float]:
    """
    Get GPU utilization percentage.
    Note: On DGX Spark with unified memory, memory queries return N/A,
    but utilization percentage still works.
    """
    if not PYNVML_AVAILABLE:
        return None

    try:
        handle = pynvml.nvmlDeviceGetHandleByIndex(0)
        utilization = pynvml.nvmlDeviceGetUtilizationRates(handle)
        return float(utilization.gpu)
    except Exception:
        return None


def get_system_resources() -> ResourceStatus:
    """Get current system resource status."""
    memory = psutil.virtual_memory()
    cpu_percent = psutil.cpu_percent(interval=0.1)
    gpu_util = get_gpu_utilization()

    return ResourceStatus(
        memory_total_gb=memory.total / (1024**3),
        memory_available_gb=memory.available / (1024**3),
        memory_used_gb=memory.used / (1024**3),
        memory_percent=memory.percent,
        gpu_utilization=gpu_util,
        cpu_percent=cpu_percent,
        cpu_name=get_cpu_name(),
        cpu_cores=psutil.cpu_count(logical=False) or 1,
        cpu_threads=psutil.cpu_count(logical=True) or 1,
        is_available=True,  # Will be set by check function
        rejection_reason=None,
    )


def check_resources_for_video(model_size_gb: float, model_name: str) -> ResourceStatus:
    """
    Check if system has enough resources to run video generation.

    Args:
        model_size_gb: Size of the model in GB (from config.yaml)
        model_name: Display name for error messages

    Returns:
        ResourceStatus with is_available=True if OK, or rejection_reason if not
    """
    status = get_system_resources()

    # Calculate proportional buffer based on total system RAM
    buffer_gb = status.memory_total_gb * (MIN_FREE_MEMORY_PERCENT / 100.0)

    # Calculate required memory
    required_gb = model_size_gb + GENERATION_OVERHEAD_GB
    needed_with_buffer = required_gb + buffer_gb

    # Check 1: Available memory
    if status.memory_available_gb < needed_with_buffer:
        status.is_available = False
        status.rejection_reason = (
            f"Insufficient memory: {status.memory_available_gb:.1f}GB available, "
            f"need {needed_with_buffer:.1f}GB for {model_name} "
            f"(model: {model_size_gb}GB + {GENERATION_OVERHEAD_GB:.0f}GB overhead + "
            f"{buffer_gb:.1f}GB buffer [{MIN_FREE_MEMORY_PERCENT:.0f}% of RAM])"
        )
        return status

    # Check 2: GPU utilization (if another generation is running)
    if status.gpu_utilization is not None and status.gpu_utilization > GPU_BUSY_THRESHOLD:
        status.is_available = False
        status.rejection_reason = (
            f"GPU is busy ({status.gpu_utilization:.0f}% utilization). "
            f"Please wait for the current task to complete."
        )
        return status

    # Check 3: CPU utilization (secondary indicator)
    if status.cpu_percent > CPU_BUSY_THRESHOLD:
        status.is_available = False
        status.rejection_reason = (
            f"System is under heavy load ({status.cpu_percent:.0f}% CPU). "
            f"Please wait or close other applications."
        )
        return status

    status.is_available = True
    return status
