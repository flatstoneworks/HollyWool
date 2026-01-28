"""GPU memory monitoring for model load progress tracking."""

import threading
import time
from typing import Callable, Optional

# Try to import pynvml for GPU memory monitoring
try:
    import pynvml
    PYNVML_AVAILABLE = True
except ImportError:
    PYNVML_AVAILABLE = False

# Estimated GPU memory usage per model type (in GB)
# These are approximate values for when model is fully loaded
MODEL_MEMORY_ESTIMATES = {
    # Image models
    "flux": 24.0,
    "sdxl": 7.0,
    "sd": 4.0,
    "sd3": 16.0,
    # Video models
    "video": 20.0,      # CogVideoX
    "video-i2v": 20.0,  # CogVideoX I2V
    "ltx2": 12.0,
    "wan": 14.0,
    "wan-i2v": 14.0,
    "mochi": 25.0,
    "svd": 8.0,
}

# Progress callback type: (progress_pct: float) -> None
LoadProgressCallback = Callable[[float], None]


class GPULoadMonitor:
    """Monitor GPU memory to track model loading progress."""

    def __init__(
        self,
        model_type: str,
        progress_callback: LoadProgressCallback,
        poll_interval: float = 0.3,
        device_index: int = 0,
    ):
        self.model_type = model_type
        self.progress_callback = progress_callback
        self.poll_interval = poll_interval
        self.device_index = device_index

        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._start_memory: float = 0.0
        self._expected_memory: float = MODEL_MEMORY_ESTIMATES.get(model_type, 10.0)

    def _get_gpu_memory_gb(self) -> float:
        """Get current GPU memory usage in GB."""
        if not PYNVML_AVAILABLE:
            return 0.0
        try:
            pynvml.nvmlInit()
            handle = pynvml.nvmlDeviceGetHandleByIndex(self.device_index)
            info = pynvml.nvmlDeviceGetMemoryInfo(handle)
            used_gb = info.used / (1024 ** 3)
            pynvml.nvmlShutdown()
            return used_gb
        except Exception:
            return 0.0

    def _monitor_loop(self):
        """Background thread that monitors GPU memory and reports progress."""
        while not self._stop_event.is_set():
            current_memory = self._get_gpu_memory_gb()
            memory_increase = current_memory - self._start_memory

            # Calculate progress based on memory increase
            if self._expected_memory > 0:
                progress = min(95.0, (memory_increase / self._expected_memory) * 100)
                # Don't report 0% or negative progress
                progress = max(5.0, progress)
            else:
                progress = 50.0  # Fallback if we don't know expected size

            try:
                self.progress_callback(progress)
            except Exception:
                pass

            self._stop_event.wait(self.poll_interval)

    def start(self):
        """Start monitoring GPU memory."""
        self._start_memory = self._get_gpu_memory_gb()
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._monitor_loop, daemon=True)
        self._thread.start()
        # Report initial progress
        try:
            self.progress_callback(5.0)
        except Exception:
            pass

    def stop(self):
        """Stop monitoring and report 100% completion."""
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=1.0)
        # Report completion
        try:
            self.progress_callback(100.0)
        except Exception:
            pass


def load_with_progress(
    load_func: Callable,
    model_type: str,
    progress_callback: LoadProgressCallback,
) -> any:
    """
    Execute a model loading function while monitoring GPU memory for progress.

    Args:
        load_func: Function that loads the model (blocking call)
        model_type: Type of model being loaded (for memory estimation)
        progress_callback: Callback to report progress (0-100)

    Returns:
        Whatever load_func returns
    """
    monitor = GPULoadMonitor(model_type, progress_callback)
    monitor.start()
    try:
        result = load_func()
        return result
    finally:
        monitor.stop()
