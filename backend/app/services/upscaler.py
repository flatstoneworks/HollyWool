"""
Real-ESRGAN video upscaling service.

Handles loading upscale models and processing videos frame-by-frame.
Uses the realesrgan package with inference_realesrgan approach.
"""

import cv2
import numpy as np
import torch
from pathlib import Path
from typing import Optional, Callable
import yaml
import subprocess
import tempfile
import shutil


class UpscalerService:
    """Service for upscaling videos using Real-ESRGAN via command line."""

    def __init__(self):
        self.current_model_id: Optional[str] = None
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self._config = None

    def _load_config(self):
        """Load upscale model config from config.yaml."""
        if self._config is None:
            config_path = Path(__file__).parent.parent.parent / "config.yaml"
            with open(config_path, "r") as f:
                self._config = yaml.safe_load(f)
        return self._config.get("upscale_models", {})

    def get_upscale_models(self) -> dict:
        """Get available upscale models from config."""
        return self._load_config()

    def get_model_config(self, model_id: str) -> Optional[dict]:
        """Get config for a specific upscale model."""
        models = self._load_config()
        return models.get(model_id)

    def load_model(self, model_id: str) -> None:
        """Mark model as loaded (actual loading happens during upscale)."""
        model_config = self.get_model_config(model_id)
        if not model_config:
            raise ValueError(f"Unknown upscale model: {model_id}")
        self.current_model_id = model_id
        print(f"Selected upscale model: {model_id}")

    def upscale_video(
        self,
        input_path: str,
        output_path: str,
        progress_callback: Optional[Callable[[int, int, float], None]] = None
    ) -> tuple[int, int, int, float]:
        """
        Upscale a video file frame by frame using OpenCV and Real-ESRGAN.

        Args:
            input_path: Path to input video
            output_path: Path to output video
            progress_callback: Called with (current_frame, total_frames, progress_percent)

        Returns:
            Tuple of (output_width, output_height, total_frames, fps)
        """
        if self.current_model_id is None:
            raise RuntimeError("No upscale model selected")

        model_config = self.get_model_config(self.current_model_id)
        scale = model_config["scale"] if model_config else 4
        model_name = model_config["model_name"] if model_config else "RealESRGAN_x4plus"

        # Lazy import to avoid startup issues
        try:
            from realesrgan import RealESRGANer
            from basicsr.archs.rrdbnet_arch import RRDBNet
        except ImportError as e:
            # Fall back to simple bicubic upscaling if Real-ESRGAN not available
            print(f"Real-ESRGAN not available, using bicubic upscaling: {e}")
            return self._upscale_video_bicubic(input_path, output_path, scale, progress_callback)

        # Open input video
        cap = cv2.VideoCapture(input_path)
        if not cap.isOpened():
            raise ValueError(f"Could not open video: {input_path}")

        # Get video properties
        fps = cap.get(cv2.CAP_PROP_FPS)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        # Calculate output dimensions
        out_width = width * scale
        out_height = height * scale

        # Configure model architecture
        if model_name in ["RealESRGAN_x4plus", "RealESRGAN_x4plus_anime_6B"]:
            num_block = 6 if "anime_6B" in model_name else 23
            model = RRDBNet(
                num_in_ch=3, num_out_ch=3, num_feat=64,
                num_block=num_block, num_grow_ch=32, scale=4
            )
            netscale = 4
        elif model_name == "RealESRGAN_x2plus":
            model = RRDBNet(
                num_in_ch=3, num_out_ch=3, num_feat=64,
                num_block=23, num_grow_ch=32, scale=2
            )
            netscale = 2
        else:
            model = RRDBNet(
                num_in_ch=3, num_out_ch=3, num_feat=64,
                num_block=6, num_grow_ch=32, scale=4
            )
            netscale = 4

        # Create upscaler
        upscaler = RealESRGANer(
            scale=netscale,
            model_path=None,
            model=model,
            tile=512,
            tile_pad=10,
            pre_pad=0,
            half=True if self.device == "cuda" else False,
            device=self.device,
        )

        # Create video writer
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(output_path, fourcc, fps, (out_width, out_height))

        try:
            frame_idx = 0
            while True:
                ret, frame = cap.read()
                if not ret:
                    break

                # Upscale frame
                try:
                    upscaled, _ = upscaler.enhance(frame, outscale=netscale)
                except Exception as e:
                    print(f"Frame {frame_idx} upscale failed, using bicubic: {e}")
                    upscaled = cv2.resize(frame, (out_width, out_height), interpolation=cv2.INTER_CUBIC)

                # Write upscaled frame
                out.write(upscaled)

                frame_idx += 1

                # Report progress
                if progress_callback:
                    progress_pct = (frame_idx / total_frames) * 100
                    progress_callback(frame_idx, total_frames, progress_pct)

        finally:
            cap.release()
            out.release()

        # Re-encode with ffmpeg for better compatibility
        self._reencode_video(output_path, fps)

        # Clean up upscaler
        del upscaler
        torch.cuda.empty_cache()

        return out_width, out_height, total_frames, fps

    def _upscale_video_bicubic(
        self,
        input_path: str,
        output_path: str,
        scale: int,
        progress_callback: Optional[Callable[[int, int, float], None]] = None
    ) -> tuple[int, int, int, float]:
        """Fallback bicubic upscaling when Real-ESRGAN is not available."""
        cap = cv2.VideoCapture(input_path)
        if not cap.isOpened():
            raise ValueError(f"Could not open video: {input_path}")

        fps = cap.get(cv2.CAP_PROP_FPS)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        out_width = width * scale
        out_height = height * scale

        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(output_path, fourcc, fps, (out_width, out_height))

        try:
            frame_idx = 0
            while True:
                ret, frame = cap.read()
                if not ret:
                    break

                upscaled = cv2.resize(frame, (out_width, out_height), interpolation=cv2.INTER_CUBIC)
                out.write(upscaled)

                frame_idx += 1
                if progress_callback:
                    progress_pct = (frame_idx / total_frames) * 100
                    progress_callback(frame_idx, total_frames, progress_pct)
        finally:
            cap.release()
            out.release()

        self._reencode_video(output_path, fps)
        return out_width, out_height, total_frames, fps

    def _reencode_video(self, video_path: str, fps: float) -> None:
        """Re-encode video with ffmpeg for better compression."""
        temp_path = video_path + ".temp.mp4"
        shutil.move(video_path, temp_path)

        try:
            subprocess.run([
                "ffmpeg", "-y",
                "-i", temp_path,
                "-c:v", "libx264",
                "-preset", "medium",
                "-crf", "23",
                "-r", str(fps),
                "-pix_fmt", "yuv420p",
                video_path
            ], check=True, capture_output=True)
            Path(temp_path).unlink()
        except subprocess.CalledProcessError:
            shutil.move(temp_path, video_path)

    def unload_model(self) -> None:
        """Unload the current model to free GPU memory."""
        self.current_model_id = None
        torch.cuda.empty_cache()


# Global singleton
_upscaler_service: Optional[UpscalerService] = None


def get_upscaler_service() -> UpscalerService:
    """Get the global upscaler service instance."""
    global _upscaler_service
    if _upscaler_service is None:
        _upscaler_service = UpscalerService()
    return _upscaler_service
