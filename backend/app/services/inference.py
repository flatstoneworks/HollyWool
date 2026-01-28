import torch
import yaml
import random
import time
from pathlib import Path
from typing import Optional, Callable
from diffusers import (
    FluxPipeline,
    StableDiffusionXLPipeline,
    StableDiffusionPipeline,
    StableDiffusion3Pipeline,
    AutoPipelineForText2Image,
    AutoPipelineForImage2Image,
    CogVideoXPipeline,
    CogVideoXImageToVideoPipeline,
    StableVideoDiffusionPipeline,
)
from diffusers.utils import export_to_video

# Try to import LTX-2 pipeline (requires newer diffusers)
try:
    from diffusers import LTX2Pipeline
    from diffusers.pipelines.ltx2.export_utils import encode_video as ltx2_encode_video
    LTX2_AVAILABLE = True
except ImportError:
    LTX2_AVAILABLE = False
    LTX2Pipeline = None
    ltx2_encode_video = None
# Try to import Wan2.2 pipelines
try:
    from diffusers import WanPipeline, WanImageToVideoPipeline, AutoencoderKLWan
    WAN_AVAILABLE = True
except ImportError:
    WAN_AVAILABLE = False
    WanPipeline = None
    WanImageToVideoPipeline = None
    AutoencoderKLWan = None

# Try to import Mochi pipeline
try:
    from diffusers import MochiPipeline
    MOCHI_AVAILABLE = True
except ImportError:
    MOCHI_AVAILABLE = False
    MochiPipeline = None

from huggingface_hub import snapshot_download, HfFileSystem
from PIL import Image


from ..utils.paths import get_data_dir

# Download progress callback type
DownloadCallback = Callable[[float, float, float], None]  # (progress_pct, total_mb, speed_mbps)
# Load progress callback type
LoadProgressCallback = Callable[[float], None]  # (progress_pct)


class InferenceService:
    def __init__(self, config_path: str = "config.yaml"):
        self.config = self._load_config(config_path)
        self.civitai_models: dict = self._load_civitai_models()
        self.current_model_id: Optional[str] = None
        self.pipeline = None
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.dtype = torch.bfloat16 if self.device == "cuda" else torch.float32

        # Warn if GPU hardware is present but torch lacks CUDA support
        if self.device == "cpu":
            try:
                import pynvml
                pynvml.nvmlInit()
                count = pynvml.nvmlDeviceGetCount()
                if count > 0:
                    name = pynvml.nvmlDeviceGetName(pynvml.nvmlDeviceGetHandleByIndex(0))
                    print(f"\n⚠️  GPU detected ({name}) but PyTorch is CPU-only (torch {torch.__version__}).")
                    print(f"   Inference will run on CPU. To enable GPU acceleration, install CUDA-enabled PyTorch:")
                    print(f"   pip install torch --index-url https://download.pytorch.org/whl/cu128\n")
                pynvml.nvmlShutdown()
            except Exception:
                pass

    def _load_config(self, config_path: str) -> dict:
        config_file = Path(__file__).parent.parent.parent / config_path
        with open(config_file, "r") as f:
            return yaml.safe_load(f)

    def _load_civitai_models(self) -> dict:
        registry_file = get_data_dir() / "civitai-models.json"
        if registry_file.exists():
            try:
                import json
                with open(registry_file, "r") as f:
                    return json.load(f)
            except Exception:
                pass
        return {}

    def reload_civitai_models(self) -> None:
        self.civitai_models = self._load_civitai_models()

    def get_available_models(self) -> list[dict]:
        models = []
        for model_id, model_config in self.config["models"].items():
            models.append({
                "id": model_id,
                "name": model_config["name"],
                "type": model_config["type"],
                "default_steps": model_config["default_steps"],
                "default_guidance": model_config["default_guidance"],
                "category": model_config.get("category", "general"),
                "description": model_config.get("description", ""),
                "tags": model_config.get("tags", []),
                "size_gb": model_config.get("size_gb", 0),
                "requires_approval": model_config.get("requires_approval", False),
                "approval_url": model_config.get("approval_url"),
                "is_cached": self.is_model_cached(model_id),
                "hf_path": model_config["path"],
            })
        # Include Civitai models
        self.reload_civitai_models()
        for model_id, mc in self.civitai_models.items():
            models.append({
                "id": model_id,
                "name": mc.get("name", model_id),
                "type": mc.get("type", "sdxl"),
                "default_steps": mc.get("default_steps", 20),
                "default_guidance": mc.get("default_guidance", 7.0),
                "category": "civitai",
                "description": f"Civitai model ({mc.get('base_model', '')})",
                "tags": ["civitai"],
                "size_gb": 0,
                "requires_approval": False,
                "is_cached": self.is_model_cached(model_id),
                "hf_path": mc.get("path", ""),
            })
        return models

    def get_model_config(self, model_id: str) -> Optional[dict]:
        config = self.config["models"].get(model_id)
        if config:
            return config
        # Check civitai registry
        self.reload_civitai_models()
        return self.civitai_models.get(model_id)

    def is_model_cached(self, model_id: str) -> bool:
        """Check if a model is already downloaded/cached.

        Verifies both that key metadata exists AND that no blob files are
        still mid-download (.incomplete), which would cause from_pretrained()
        to silently attempt a network download during what should be a
        local-only model load.
        """
        model_config = self.get_model_config(model_id)
        if not model_config:
            return False

        # Civitai single-file models: check if local path exists
        if model_config.get("single_file"):
            return Path(model_config["path"]).exists()

        model_path = model_config["path"]

        try:
            from huggingface_hub import try_to_load_from_cache
            from huggingface_hub.constants import HF_HUB_CACHE

            # Check for a key file that indicates the model is downloaded
            result = try_to_load_from_cache(model_path, "model_index.json")
            if result is None:
                return False

            # Check that no blob files are still being downloaded.
            # HF cache layout: {HF_HUB_CACHE}/models--{org}--{name}/blobs/
            # Incomplete downloads have a .incomplete suffix.
            repo_folder = f"models--{model_path.replace('/', '--')}"
            blobs_dir = Path(HF_HUB_CACHE) / repo_folder / "blobs"
            if blobs_dir.exists() and any(blobs_dir.glob("*.incomplete")):
                return False

            return True
        except Exception:
            return False

    def download_model(self, model_id: str, progress_callback: Optional[DownloadCallback] = None) -> str:
        """Download model files with progress tracking. Returns the cache path."""
        model_config = self.get_model_config(model_id)
        if not model_config:
            raise ValueError(f"Unknown model: {model_id}")

        model_path = model_config["path"]
        print(f"Downloading model: {model_config['name']} ({model_path})")

        # Track download progress
        downloaded_bytes = 0
        total_bytes = 0
        start_time = time.time()
        last_callback_time = 0

        def tqdm_progress_callback(progress_info):
            nonlocal downloaded_bytes, total_bytes, last_callback_time

            if hasattr(progress_info, 'n') and hasattr(progress_info, 'total'):
                downloaded_bytes = progress_info.n
                total_bytes = progress_info.total or 0

            if progress_callback and total_bytes > 0:
                current_time = time.time()
                # Only callback every 0.5 seconds to avoid overwhelming
                if current_time - last_callback_time >= 0.5:
                    last_callback_time = current_time
                    elapsed = current_time - start_time
                    progress_pct = (downloaded_bytes / total_bytes) * 100 if total_bytes > 0 else 0
                    total_mb = total_bytes / (1024 * 1024)
                    speed_mbps = (downloaded_bytes / (1024 * 1024)) / elapsed if elapsed > 0 else 0
                    progress_callback(progress_pct, total_mb, speed_mbps)

        # Use snapshot_download with progress tracking
        try:
            from huggingface_hub import HfApi
            from huggingface_hub.utils import tqdm as hf_tqdm

            # Get total size first
            api = HfApi()
            try:
                repo_info = api.repo_info(model_path)
                total_size = sum(
                    sibling.size for sibling in repo_info.siblings
                    if sibling.size is not None
                ) if repo_info.siblings else 0

                if total_size > 0 and progress_callback:
                    total_mb = total_size / (1024 * 1024)
                    progress_callback(0, total_mb, 0)
            except Exception:
                total_size = 0

            # Download with tracking
            cache_path = snapshot_download(
                model_path,
                local_files_only=False,
            )

            # Final callback at 100%
            if progress_callback and total_size > 0:
                total_mb = total_size / (1024 * 1024)
                elapsed = time.time() - start_time
                speed = total_mb / elapsed if elapsed > 0 else 0
                progress_callback(100, total_mb, speed)

            return cache_path

        except Exception as e:
            print(f"Failed to download model {model_id}: {e}")
            raise

    def load_model(
        self,
        model_id: str,
        download_callback: Optional[DownloadCallback] = None,
        load_progress_callback: Optional[LoadProgressCallback] = None,
    ) -> None:
        if self.current_model_id == model_id and self.pipeline is not None:
            # Already loaded - report 100%
            if load_progress_callback:
                load_progress_callback(100.0)
            return

        model_config = self.get_model_config(model_id)
        if not model_config:
            raise ValueError(f"Unknown model: {model_id}")

        model_path = model_config["path"]
        model_type = model_config["type"]

        # Check if model needs downloading
        if not self.is_model_cached(model_id):
            print(f"Model not cached, downloading: {model_config['name']}")
            self.download_model(model_id, download_callback)

        # Verify cache is complete — fail fast if download left incomplete files
        if not model_config.get("single_file") and not self.is_model_cached(model_id):
            raise RuntimeError(
                f"Model '{model_config['name']}' has incomplete files in the HuggingFace cache. "
                f"Delete the cache directory and re-download, or download from the Models page."
            )

        print(f"Loading model: {model_config['name']} ({model_path})")

        # Start GPU memory monitoring for load progress
        from ..utils.gpu_monitor import GPULoadMonitor
        monitor = None
        if load_progress_callback:
            monitor = GPULoadMonitor(model_type, load_progress_callback)
            monitor.start()

        # Load the new pipeline first before clearing the old one
        is_single_file = model_config.get("single_file", False)

        try:
            if is_single_file:
                # Civitai single .safetensors file loading
                if model_type == "sdxl":
                    new_pipeline = StableDiffusionXLPipeline.from_single_file(
                        model_path,
                        torch_dtype=self.dtype,
                        use_safetensors=True,
                    )
                elif model_type == "sd":
                    new_pipeline = StableDiffusionPipeline.from_single_file(
                        model_path,
                        torch_dtype=self.dtype,
                        use_safetensors=True,
                    )
                elif model_type == "sd3":
                    new_pipeline = StableDiffusion3Pipeline.from_single_file(
                        model_path,
                        torch_dtype=self.dtype,
                        use_safetensors=True,
                    )
                elif model_type == "flux":
                    new_pipeline = FluxPipeline.from_single_file(
                        model_path,
                        torch_dtype=self.dtype,
                    )
                else:
                    raise ValueError(f"Single-file loading not supported for type: {model_type}")
            elif model_type == "flux":
                new_pipeline = FluxPipeline.from_pretrained(
                    model_path,
                    torch_dtype=self.dtype,
                    local_files_only=True,
                )
            elif model_type == "sdxl":
                new_pipeline = StableDiffusionXLPipeline.from_pretrained(
                    model_path,
                    torch_dtype=self.dtype,
                    use_safetensors=True,
                    variant="fp16" if self.device == "cuda" else None,
                    local_files_only=True,
                )
            elif model_type == "sd3":
                new_pipeline = StableDiffusion3Pipeline.from_pretrained(
                    model_path,
                    torch_dtype=self.dtype,
                    use_safetensors=True,
                    local_files_only=True,
                )
            elif model_type == "sd":
                new_pipeline = AutoPipelineForText2Image.from_pretrained(
                    model_path,
                    torch_dtype=self.dtype,
                    use_safetensors=True,
                    local_files_only=True,
                )
            elif model_type == "video":
                new_pipeline = CogVideoXPipeline.from_pretrained(
                    model_path,
                    torch_dtype=self.dtype,
                    local_files_only=True,
                )
            elif model_type == "ltx2":
                if not LTX2_AVAILABLE:
                    raise ImportError(
                        "LTX-2 requires a newer version of diffusers. "
                        "Install with: pip install git+https://github.com/huggingface/diffusers"
                    )
                new_pipeline = LTX2Pipeline.from_pretrained(
                    model_path,
                    torch_dtype=torch.bfloat16,
                    local_files_only=True,
                )
            elif model_type == "video-i2v":
                new_pipeline = CogVideoXImageToVideoPipeline.from_pretrained(
                    model_path,
                    torch_dtype=self.dtype,
                    local_files_only=True,
                )
            elif model_type == "svd":
                # SVD requires float16, not bfloat16 (numpy doesn't support bfloat16)
                svd_dtype = torch.float16 if self.device == "cuda" else torch.float32
                new_pipeline = StableVideoDiffusionPipeline.from_pretrained(
                    model_path,
                    torch_dtype=svd_dtype,
                    variant="fp16" if self.device == "cuda" else None,
                    local_files_only=True,
                )
            elif model_type == "wan":
                if not WAN_AVAILABLE:
                    raise ImportError(
                        "Wan2.2 requires a newer version of diffusers. "
                        "Install with: pip install -U diffusers"
                    )
                # Float32 VAE is critical — bfloat16 causes visible color banding
                vae = AutoencoderKLWan.from_pretrained(
                    model_path, subfolder="vae", torch_dtype=torch.float32,
                    local_files_only=True,
                )
                new_pipeline = WanPipeline.from_pretrained(
                    model_path, vae=vae, torch_dtype=torch.bfloat16,
                    local_files_only=True,
                )
            elif model_type == "wan-i2v":
                if not WAN_AVAILABLE:
                    raise ImportError(
                        "Wan2.2 I2V requires a newer version of diffusers. "
                        "Install with: pip install -U diffusers"
                    )
                # Float32 VAE is critical — bfloat16 causes visible color banding
                vae = AutoencoderKLWan.from_pretrained(
                    model_path, subfolder="vae", torch_dtype=torch.float32,
                    local_files_only=True,
                )
                new_pipeline = WanImageToVideoPipeline.from_pretrained(
                    model_path, vae=vae, torch_dtype=torch.bfloat16,
                    local_files_only=True,
                )
            elif model_type == "mochi":
                if not MOCHI_AVAILABLE:
                    raise ImportError(
                        "Mochi requires a newer version of diffusers. "
                        "Install with: pip install -U diffusers"
                    )
                new_pipeline = MochiPipeline.from_pretrained(
                    model_path, variant="bf16", torch_dtype=torch.bfloat16,
                    local_files_only=True,
                )
            else:
                raise ValueError(f"Unknown model type: {model_type}")
        except Exception as e:
            # Stop monitor on error
            if monitor:
                monitor.stop()
            print(f"Failed to load model {model_id}: {e}")
            raise

        # Only clear old pipeline after new one loaded successfully
        if self.pipeline is not None:
            del self.pipeline
            self.pipeline = None
            torch.cuda.empty_cache()

        self.pipeline = new_pipeline

        # Memory optimization: Wan/Mochi use cpu_offload (mutually exclusive with .to(device))
        if model_type in ("wan", "wan-i2v", "mochi"):
            # Use sequential CPU offload for large models - more aggressive memory saving
            self.pipeline.enable_sequential_cpu_offload()
            # Enable VAE tiling for video models to reduce memory during decoding
            if hasattr(self.pipeline, 'enable_vae_tiling'):
                self.pipeline.enable_vae_tiling()
            # Enable VAE slicing if available
            if hasattr(self.pipeline, 'enable_vae_slicing'):
                self.pipeline.enable_vae_slicing()
        else:
            self.pipeline.to(self.device)
            # Enable memory optimizations
            if self.device == "cuda":
                self.pipeline.enable_attention_slicing()

        self.current_model_id = model_id

        # Stop GPU monitoring and report 100% complete
        if monitor:
            monitor.stop()

        print(f"Model loaded successfully: {model_id}")

    def generate(
        self,
        prompt: str,
        model_id: str,
        negative_prompt: Optional[str] = None,
        width: int = 1024,
        height: int = 1024,
        steps: Optional[int] = None,
        guidance_scale: Optional[float] = None,
        seed: Optional[int] = None,
        loras: Optional[list] = None,
    ) -> tuple[Image.Image, int]:
        self.load_model(model_id)

        model_config = self.get_model_config(model_id)
        model_type = model_config["type"]

        if steps is None:
            steps = model_config["default_steps"]
        if guidance_scale is None:
            guidance_scale = model_config["default_guidance"]
        if seed is None:
            seed = random.randint(0, 2**32 - 1)

        # Apply LoRAs if provided and model supports them
        if loras and model_type in ["flux", "sdxl", "sd", "sd3"]:
            from .lora_manager import get_lora_manager
            lora_manager = get_lora_manager()
            lora_manager.apply_loras(self.pipeline, loras, model_type)
        elif hasattr(self, '_loras_applied') and self._loras_applied:
            # Clear LoRAs if none specified but were previously loaded
            from .lora_manager import get_lora_manager
            get_lora_manager()._unload_loras(self.pipeline)
            self._loras_applied = False

        if loras:
            self._loras_applied = True

        generator = torch.Generator(device=self.device).manual_seed(seed)

        # Build generation kwargs based on model type
        gen_kwargs = {
            "prompt": prompt,
            "width": width,
            "height": height,
            "num_inference_steps": steps,
            "generator": generator,
        }

        if model_type != "flux":
            gen_kwargs["guidance_scale"] = guidance_scale
            if negative_prompt:
                gen_kwargs["negative_prompt"] = negative_prompt
        else:
            # FLUX uses guidance differently
            if guidance_scale > 0:
                gen_kwargs["guidance_scale"] = guidance_scale

        image = self.pipeline(**gen_kwargs).images[0]
        return image, seed

    def generate_from_image(
        self,
        source_image: Image.Image,
        prompt: str,
        model_id: str,
        negative_prompt: Optional[str] = None,
        width: int = 1024,
        height: int = 1024,
        steps: Optional[int] = None,
        guidance_scale: Optional[float] = None,
        seed: Optional[int] = None,
        strength: float = 0.75,
        loras: Optional[list] = None,
    ) -> tuple[Image.Image, int]:
        """Generate an image from a source image (Image-to-Image).

        Uses AutoPipelineForImage2Image.from_pipe() to share weights with the
        loaded T2I pipeline -- no model reload needed.
        """
        self.load_model(model_id)

        model_config = self.get_model_config(model_id)
        model_type = model_config["type"]

        if steps is None:
            steps = model_config["default_steps"]
        if guidance_scale is None:
            guidance_scale = model_config["default_guidance"]
        if seed is None:
            seed = random.randint(0, 2**32 - 1)

        # Create I2I pipeline from existing T2I pipeline (shares weights)
        i2i_pipeline = AutoPipelineForImage2Image.from_pipe(self.pipeline)
        i2i_pipeline.to(self.device)

        # Apply LoRAs if provided and model supports them
        if loras and model_type in ["flux", "sdxl", "sd", "sd3"]:
            from .lora_manager import get_lora_manager
            lora_manager = get_lora_manager()
            lora_manager.apply_loras(i2i_pipeline, loras, model_type)

        # Resize source image to target dimensions
        source_image = source_image.convert("RGB").resize((width, height), Image.LANCZOS)

        generator = torch.Generator(device=self.device).manual_seed(seed)

        # Build generation kwargs
        gen_kwargs = {
            "prompt": prompt,
            "image": source_image,
            "strength": strength,
            "num_inference_steps": steps,
            "generator": generator,
        }

        if model_type != "flux":
            gen_kwargs["guidance_scale"] = guidance_scale
            if negative_prompt:
                gen_kwargs["negative_prompt"] = negative_prompt
        else:
            if guidance_scale > 0:
                gen_kwargs["guidance_scale"] = guidance_scale

        image = i2i_pipeline(**gen_kwargs).images[0]
        return image, seed

    def generate_video(
        self,
        prompt: str,
        model_id: str,
        negative_prompt: Optional[str] = None,
        width: int = 720,
        height: int = 480,
        num_frames: Optional[int] = None,
        fps: Optional[int] = None,
        steps: Optional[int] = None,
        guidance_scale: Optional[float] = None,
        seed: Optional[int] = None,
        output_path: Optional[str] = None,
    ) -> tuple[str, int, int, int, Optional[str]]:
        """Generate a video and save it to output_path.

        Returns: (output_path, seed, num_frames, fps, audio_path)
        """
        self.load_model(model_id)

        model_config = self.get_model_config(model_id)
        model_type = model_config["type"]

        if steps is None:
            steps = model_config["default_steps"]
        if guidance_scale is None:
            guidance_scale = model_config["default_guidance"]
        if num_frames is None:
            num_frames = model_config.get("default_num_frames", 49)
        if fps is None:
            fps = model_config.get("default_fps", 8)
        if seed is None:
            seed = random.randint(0, 2**32 - 1)

        generator = torch.Generator(device=self.device).manual_seed(seed)
        audio_path = None

        print(f"Generating video: {num_frames} frames at {fps} fps (model type: {model_type})")

        if model_type == "ltx2":
            # LTX-2 specific generation
            # Ensure dimensions are divisible by 32
            width = (width // 32) * 32
            height = (height // 32) * 32
            # Ensure num_frames is valid (divisible by 8 + 1)
            valid_frames = [9, 17, 25, 33, 41, 49, 57, 65, 73, 81, 89, 97, 105, 113, 121]
            if num_frames not in valid_frames:
                # Find closest valid frame count
                num_frames = min(valid_frames, key=lambda x: abs(x - num_frames))

            gen_kwargs = {
                "prompt": prompt,
                "width": width,
                "height": height,
                "num_frames": num_frames,
                "frame_rate": float(fps),
                "num_inference_steps": steps,
                "guidance_scale": guidance_scale,
                "generator": generator,
                "output_type": "np",
                "return_dict": False,
            }

            if negative_prompt:
                gen_kwargs["negative_prompt"] = negative_prompt

            # Generate video and audio
            video, audio = self.pipeline(**gen_kwargs)

            # Save video with audio using LTX-2's encode_video utility
            if output_path and ltx2_encode_video:
                import numpy as np
                video_uint8 = (video * 255).round().astype("uint8")
                video_tensor = torch.from_numpy(video_uint8)

                # Get audio sample rate from vocoder if available
                audio_sr = 24000  # Default LTX-2 audio sample rate
                if hasattr(self.pipeline, 'vocoder') and hasattr(self.pipeline.vocoder, 'config'):
                    audio_sr = getattr(self.pipeline.vocoder.config, 'output_sampling_rate', 24000)

                ltx2_encode_video(
                    video_tensor[0],
                    fps=fps,
                    audio=audio[0].float().cpu() if audio is not None else None,
                    audio_sample_rate=audio_sr,
                    output_path=output_path,
                )
                print(f"Video saved to: {output_path}")

            return output_path, seed, num_frames, fps, audio_path
        elif model_type == "wan":
            # Wan2.2 T2V — resolution-dependent flow_shift
            height_val = height if height else 480
            flow_shift = 5.0 if height_val >= 720 else 3.0
            self.pipeline.scheduler.config.flow_shift = flow_shift

            gen_kwargs = {
                "prompt": prompt,
                "width": width,
                "height": height,
                "num_frames": num_frames,
                "num_inference_steps": steps,
                "guidance_scale": guidance_scale,
                "generator": generator,
            }

            if negative_prompt:
                gen_kwargs["negative_prompt"] = negative_prompt

            video_frames = self.pipeline(**gen_kwargs).frames[0]

            if output_path:
                export_to_video(video_frames, output_path, fps=fps)
                print(f"Video saved to: {output_path}")

            return output_path, seed, len(video_frames), fps, None

        elif model_type == "mochi":
            # Mochi — does NOT support negative_prompt (T5-XXL single text input)
            gen_kwargs = {
                "prompt": prompt,
                "width": width,
                "height": height,
                "num_frames": num_frames,
                "num_inference_steps": steps,
                "guidance_scale": guidance_scale,
                "generator": generator,
            }

            video_frames = self.pipeline(**gen_kwargs).frames[0]

            if output_path:
                export_to_video(video_frames, output_path, fps=fps)
                print(f"Video saved to: {output_path}")

            return output_path, seed, len(video_frames), fps, None

        else:
            # CogVideoX and other video models
            gen_kwargs = {
                "prompt": prompt,
                "num_frames": num_frames,
                "num_inference_steps": steps,
                "guidance_scale": guidance_scale,
                "generator": generator,
            }

            if negative_prompt:
                gen_kwargs["negative_prompt"] = negative_prompt

            # Generate video frames
            video_frames = self.pipeline(**gen_kwargs).frames[0]

            # Save video to file
            if output_path:
                export_to_video(video_frames, output_path, fps=fps)
                print(f"Video saved to: {output_path}")

            return output_path, seed, len(video_frames), fps, None

    def generate_video_from_image(
        self,
        image: Image.Image,
        prompt: str,
        model_id: str,
        negative_prompt: Optional[str] = None,
        width: int = 720,
        height: int = 480,
        num_frames: Optional[int] = None,
        fps: Optional[int] = None,
        steps: Optional[int] = None,
        guidance_scale: Optional[float] = None,
        seed: Optional[int] = None,
        output_path: Optional[str] = None,
        motion_bucket_id: int = 127,
        noise_aug_strength: float = 0.02,
    ) -> tuple[str, int, int, int, Optional[str]]:
        """Generate a video from a source image (Image-to-Video).

        Args:
            image: Source PIL Image to animate.
            prompt: Text prompt describing the desired animation.
            model_id: ID of the I2V model to use.
            negative_prompt: Optional negative prompt.
            width: Output video width.
            height: Output video height.
            num_frames: Number of frames to generate.
            fps: Frames per second for output video.
            steps: Number of inference steps.
            guidance_scale: Classifier-free guidance scale.
            seed: Random seed for reproducibility.
            output_path: Path to save the output video.
            motion_bucket_id: SVD motion intensity (1-255).
            noise_aug_strength: SVD noise augmentation strength.

        Returns: (output_path, seed, num_frames, fps, audio_path)
        """
        self.load_model(model_id)

        model_config = self.get_model_config(model_id)
        model_type = model_config["type"]

        if model_type not in ["video-i2v", "svd", "wan-i2v"]:
            raise ValueError(f"Model {model_id} (type: {model_type}) does not support I2V")

        # Set defaults from config
        if steps is None:
            steps = model_config["default_steps"]
        if guidance_scale is None:
            guidance_scale = model_config["default_guidance"]
        if num_frames is None:
            num_frames = model_config.get("default_num_frames", 49)
        if fps is None:
            fps = model_config.get("default_fps", 8)
        if seed is None:
            seed = random.randint(0, 2**32 - 1)

        generator = torch.Generator(device=self.device).manual_seed(seed)

        # Resize and prepare source image
        image = image.convert("RGB").resize((width, height), Image.LANCZOS)

        print(f"Generating I2V: {num_frames} frames at {fps} fps (model type: {model_type})")

        if model_type == "video-i2v":
            # CogVideoX Image-to-Video
            gen_kwargs = {
                "image": image,
                "prompt": prompt,
                "num_frames": num_frames,
                "num_inference_steps": steps,
                "guidance_scale": guidance_scale,
                "generator": generator,
            }

            if negative_prompt:
                gen_kwargs["negative_prompt"] = negative_prompt

            video_frames = self.pipeline(**gen_kwargs).frames[0]

        elif model_type == "wan-i2v":
            # Wan2.2 Image-to-Video
            gen_kwargs = {
                "image": image,
                "prompt": prompt,
                "width": width,
                "height": height,
                "num_frames": num_frames,
                "num_inference_steps": steps,
                "guidance_scale": guidance_scale,
                "generator": generator,
            }

            if negative_prompt:
                gen_kwargs["negative_prompt"] = negative_prompt

            video_frames = self.pipeline(**gen_kwargs).frames[0]

        elif model_type == "svd":
            # Stable Video Diffusion - pass PIL image directly
            gen_kwargs = {
                "image": image,
                "num_frames": num_frames,
                "num_inference_steps": steps,
                "motion_bucket_id": motion_bucket_id,
                "noise_aug_strength": noise_aug_strength,
                "generator": generator,
                "decode_chunk_size": 8,
            }

            video_frames = self.pipeline(**gen_kwargs).frames[0]

        # Save video to file
        if output_path:
            export_to_video(video_frames, output_path, fps=fps)
            print(f"I2V video saved to: {output_path}")

        return output_path, seed, len(video_frames), fps, None

    def is_gpu_available(self) -> bool:
        if torch.cuda.is_available():
            return True
        # Fallback: detect GPU via NVML even when torch is CPU-only
        try:
            import pynvml
            pynvml.nvmlInit()
            count = pynvml.nvmlDeviceGetCount()
            pynvml.nvmlShutdown()
            return count > 0
        except Exception:
            return False

    def get_all_cached_models_info(self) -> dict[str, dict]:
        """Get detailed info about all cached HuggingFace models using scan_cache_dir()."""
        try:
            from huggingface_hub import scan_cache_dir

            cache_info = scan_cache_dir()
            models = {}

            for repo in cache_info.repos:
                if repo.repo_type == "model":
                    models[repo.repo_id] = {
                        "size_mb": repo.size_on_disk / (1024 * 1024),
                        "num_files": repo.nb_files,
                        "last_accessed": repo.last_accessed,
                        "last_modified": repo.last_modified,
                        "revisions": len(repo.revisions),
                        "path": str(repo.repo_path),
                    }

            return models
        except Exception as e:
            print(f"Failed to scan cache: {e}")
            return {}

    def get_cache_status(self) -> dict:
        """Get overall cache usage statistics."""
        try:
            from huggingface_hub import scan_cache_dir

            cache_info = scan_cache_dir()
            repos_list = list(cache_info.repos)

            cache_dir = None
            if repos_list:
                cache_dir = str(repos_list[0].repo_path.parent.parent)

            return {
                "total_size_gb": cache_info.size_on_disk / (1024 * 1024 * 1024),
                "num_models": len([r for r in repos_list if r.repo_type == "model"]),
                "num_datasets": len([r for r in repos_list if r.repo_type == "dataset"]),
                "cache_dir": cache_dir,
            }
        except Exception as e:
            return {"total_size_gb": 0, "num_models": 0, "num_datasets": 0, "cache_dir": None, "error": str(e)}

    def delete_model_cache(self, model_id: str) -> dict:
        """Delete cached files for a specific model to free up space."""
        model_config = self.get_model_config(model_id)
        if not model_config:
            return {"success": False, "error": "Model not found", "model_id": model_id}

        try:
            from huggingface_hub import scan_cache_dir

            model_path = model_config["path"]
            cache_info = scan_cache_dir()

            for repo in cache_info.repos:
                if repo.repo_id == model_path and repo.repo_type == "model":
                    freed_mb = repo.size_on_disk / (1024 * 1024)
                    # Use the delete_revisions method
                    delete_strategy = cache_info.delete_revisions(
                        *[rev.commit_hash for rev in repo.revisions]
                    )
                    delete_strategy.execute()

                    return {
                        "success": True,
                        "freed_mb": freed_mb,
                        "model_id": model_id,
                    }

            return {"success": False, "error": "Model not found in cache", "model_id": model_id}
        except Exception as e:
            return {"success": False, "error": str(e), "model_id": model_id}

    def get_models_detailed(self) -> dict:
        """Get detailed model info including actual cache sizes and statistics."""
        all_cached_info = self.get_all_cached_models_info()

        models = []
        total_cache_mb = 0

        for model_id, model_config in self.config["models"].items():
            model_path = model_config["path"]
            cached_info = all_cached_info.get(model_path, {})
            actual_size_mb = cached_info.get("size_mb", 0)

            if actual_size_mb > 0:
                total_cache_mb += actual_size_mb

            model_info = {
                "id": model_id,
                "name": model_config["name"],
                "path": model_path,
                "type": model_config["type"],
                "category": model_config.get("category", "general"),
                "description": model_config.get("description", ""),
                "tags": model_config.get("tags", []),
                "is_cached": self.is_model_cached(model_id),
                "cached_size_mb": actual_size_mb if actual_size_mb > 0 else None,
                "estimated_size_gb": model_config.get("size_gb", 0),
                "actual_size_gb": actual_size_mb / 1024 if actual_size_mb > 0 else None,
                "last_accessed": cached_info.get("last_accessed"),
                "last_modified": cached_info.get("last_modified"),
                "num_cached_revisions": cached_info.get("revisions", 0),
                "requires_approval": model_config.get("requires_approval", False),
                "approval_url": model_config.get("approval_url"),
                "default_steps": model_config["default_steps"],
                "default_guidance": model_config["default_guidance"],
            }
            models.append(model_info)

        return {
            "models": models,
            "current_model": self.current_model_id,
            "total_cache_size_gb": total_cache_mb / 1024,
            "cache_items_count": len(all_cached_info),
        }


# Global singleton
_inference_service: Optional[InferenceService] = None


def get_inference_service() -> InferenceService:
    global _inference_service
    if _inference_service is None:
        _inference_service = InferenceService()
    return _inference_service
