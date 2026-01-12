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
    CogVideoXPipeline,
)
from diffusers.utils import export_to_video
from huggingface_hub import snapshot_download, HfFileSystem
from PIL import Image


# Download progress callback type
DownloadCallback = Callable[[float, float, float], None]  # (progress_pct, total_mb, speed_mbps)


class InferenceService:
    def __init__(self, config_path: str = "config.yaml"):
        self.config = self._load_config(config_path)
        self.current_model_id: Optional[str] = None
        self.pipeline = None
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.dtype = torch.bfloat16 if self.device == "cuda" else torch.float32

    def _load_config(self, config_path: str) -> dict:
        config_file = Path(__file__).parent.parent.parent / config_path
        with open(config_file, "r") as f:
            return yaml.safe_load(f)

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
        return models

    def get_model_config(self, model_id: str) -> Optional[dict]:
        return self.config["models"].get(model_id)

    def is_model_cached(self, model_id: str) -> bool:
        """Check if a model is already downloaded/cached."""
        model_config = self.get_model_config(model_id)
        if not model_config:
            return False

        model_path = model_config["path"]

        # Try loading with local_files_only to check if cached
        try:
            from huggingface_hub import try_to_load_from_cache
            # Check for a key file that indicates the model is downloaded
            result = try_to_load_from_cache(model_path, "model_index.json")
            return result is not None
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

    def load_model(self, model_id: str, download_callback: Optional[DownloadCallback] = None) -> None:
        if self.current_model_id == model_id and self.pipeline is not None:
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

        print(f"Loading model: {model_config['name']} ({model_path})")

        # Load the new pipeline first before clearing the old one
        try:
            if model_type == "flux":
                new_pipeline = FluxPipeline.from_pretrained(
                    model_path,
                    torch_dtype=self.dtype,
                )
            elif model_type == "sdxl":
                new_pipeline = StableDiffusionXLPipeline.from_pretrained(
                    model_path,
                    torch_dtype=self.dtype,
                    use_safetensors=True,
                    variant="fp16" if self.device == "cuda" else None,
                )
            elif model_type == "sd3":
                new_pipeline = StableDiffusion3Pipeline.from_pretrained(
                    model_path,
                    torch_dtype=self.dtype,
                    use_safetensors=True,
                )
            elif model_type == "sd":
                new_pipeline = AutoPipelineForText2Image.from_pretrained(
                    model_path,
                    torch_dtype=self.dtype,
                    use_safetensors=True,
                )
            elif model_type == "video":
                new_pipeline = CogVideoXPipeline.from_pretrained(
                    model_path,
                    torch_dtype=self.dtype,
                )
            else:
                raise ValueError(f"Unknown model type: {model_type}")
        except Exception as e:
            print(f"Failed to load model {model_id}: {e}")
            raise

        # Only clear old pipeline after new one loaded successfully
        if self.pipeline is not None:
            del self.pipeline
            self.pipeline = None
            torch.cuda.empty_cache()

        self.pipeline = new_pipeline
        self.pipeline.to(self.device)

        # Enable memory optimizations
        if self.device == "cuda":
            self.pipeline.enable_attention_slicing()

        self.current_model_id = model_id
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
    ) -> tuple[Image.Image, int]:
        self.load_model(model_id)

        model_config = self.get_model_config(model_id)
        if steps is None:
            steps = model_config["default_steps"]
        if guidance_scale is None:
            guidance_scale = model_config["default_guidance"]
        if seed is None:
            seed = random.randint(0, 2**32 - 1)

        generator = torch.Generator(device=self.device).manual_seed(seed)

        # Build generation kwargs based on model type
        gen_kwargs = {
            "prompt": prompt,
            "width": width,
            "height": height,
            "num_inference_steps": steps,
            "generator": generator,
        }

        model_type = model_config["type"]
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
    ) -> tuple[str, int, int, int]:
        """Generate a video and save it to output_path.

        Returns: (output_path, seed, num_frames, fps)
        """
        self.load_model(model_id)

        model_config = self.get_model_config(model_id)
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

        print(f"Generating video: {num_frames} frames at {fps} fps")

        # Build generation kwargs
        gen_kwargs = {
            "prompt": prompt,
            "num_frames": num_frames,
            "num_inference_steps": steps,
            "guidance_scale": guidance_scale,
            "generator": generator,
        }

        # CogVideoX specific settings
        if negative_prompt:
            gen_kwargs["negative_prompt"] = negative_prompt

        # Generate video frames
        video_frames = self.pipeline(**gen_kwargs).frames[0]

        # Save video to file
        if output_path:
            export_to_video(video_frames, output_path, fps=fps)
            print(f"Video saved to: {output_path}")

        return output_path, seed, len(video_frames), fps

    def is_gpu_available(self) -> bool:
        return torch.cuda.is_available()

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
