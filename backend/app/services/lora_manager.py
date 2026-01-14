"""LoRA management service for HollyWool.

Handles discovery, loading, and application of LoRA adapters to diffusion pipelines.
Supports both HuggingFace presets and local .safetensors files.
"""

import os
import yaml
from pathlib import Path
from typing import Optional

from ..models.schemas import LoRAInfo, LoRAApply


class LoRAManager:
    def __init__(self, config_path: str = "config.yaml"):
        self.config = self._load_config(config_path)
        lora_config = self.config.get("loras", {})
        self.local_dir = Path(os.path.expanduser(
            lora_config.get("local_dir", "~/.hollywool/loras")
        ))
        self.local_dir.mkdir(parents=True, exist_ok=True)
        self.presets = lora_config.get("presets", {})
        self._current_loras: list[str] = []  # Track currently loaded LoRA adapter names

    def _load_config(self, config_path: str) -> dict:
        config_file = Path(__file__).parent.parent.parent / config_path
        with open(config_file, "r") as f:
            return yaml.safe_load(f)

    def get_available_loras(self, model_type: Optional[str] = None) -> list[LoRAInfo]:
        """Get all available LoRAs, optionally filtered by compatible model type.

        Args:
            model_type: Filter by model type (e.g., "flux", "sdxl"). If None, returns all.

        Returns:
            List of LoRAInfo objects.
        """
        loras = []

        # Add preset LoRAs from config
        for lora_id, lora_config in self.presets.items():
            compatible_types = lora_config.get("compatible_types", [])

            # Filter by model type if specified
            if model_type and model_type not in compatible_types:
                continue

            loras.append(LoRAInfo(
                id=lora_id,
                name=lora_config.get("name", lora_id),
                path=lora_config.get("path", ""),
                source="preset",
                compatible_types=compatible_types,
                default_weight=lora_config.get("default_weight", 0.8),
                description=lora_config.get("description", ""),
                is_downloaded=self._is_lora_cached(lora_config.get("path", "")),
            ))

        # Scan local directory for .safetensors files
        if self.local_dir.exists():
            for lora_file in self.local_dir.glob("**/*.safetensors"):
                lora_id = f"local_{lora_file.stem}"

                # Try to infer compatible types from filename
                compatible_types = self._infer_compatible_types(lora_file.stem)

                # Filter by model type if specified
                if model_type and model_type not in compatible_types:
                    continue

                loras.append(LoRAInfo(
                    id=lora_id,
                    name=lora_file.stem.replace("_", " ").replace("-", " ").title(),
                    path=str(lora_file),
                    source="local",
                    compatible_types=compatible_types,
                    default_weight=0.8,
                    description=f"Local LoRA: {lora_file.name}",
                    is_downloaded=True,
                ))

        return loras

    def _infer_compatible_types(self, filename: str) -> list[str]:
        """Infer compatible model types from LoRA filename."""
        filename_lower = filename.lower()
        types = []

        if "flux" in filename_lower:
            types.append("flux")
        if "sdxl" in filename_lower or "xl" in filename_lower:
            types.append("sdxl")
        if "sd3" in filename_lower:
            types.append("sd3")
        if "sd15" in filename_lower or "sd1.5" in filename_lower or "sd_1" in filename_lower:
            types.append("sd")

        # If no type detected, assume compatibility with common types
        if not types:
            types = ["flux", "sdxl", "sd", "sd3"]

        return types

    def _is_lora_cached(self, hf_path: str) -> bool:
        """Check if a HuggingFace LoRA is already downloaded."""
        if not hf_path:
            return False
        try:
            from huggingface_hub import try_to_load_from_cache
            # Try to find any safetensors file in the repo
            result = try_to_load_from_cache(hf_path, "pytorch_lora_weights.safetensors")
            if result is not None:
                return True
            # Also try alternative naming
            result = try_to_load_from_cache(hf_path, "lora.safetensors")
            return result is not None
        except Exception:
            return False

    def get_lora_info(self, lora_id: str) -> Optional[LoRAInfo]:
        """Get information about a specific LoRA by ID."""
        for lora in self.get_available_loras():
            if lora.id == lora_id:
                return lora
        return None

    def get_lora_path(self, lora_id: str) -> Optional[str]:
        """Get the path/repo for a LoRA by ID."""
        lora_info = self.get_lora_info(lora_id)
        if lora_info:
            return lora_info.path
        return None

    def apply_loras(self, pipeline, loras: list[LoRAApply], model_type: str) -> None:
        """Apply multiple LoRAs to a diffusion pipeline.

        Args:
            pipeline: The diffusers pipeline to apply LoRAs to.
            loras: List of LoRAApply objects with lora_id and weight.
            model_type: The type of the pipeline (for compatibility checking).
        """
        if not loras:
            # Clear any existing LoRAs
            self._unload_loras(pipeline)
            return

        # Unload any previously loaded LoRAs
        self._unload_loras(pipeline)

        adapter_names = []
        adapter_weights = []

        for i, lora_req in enumerate(loras):
            lora_info = self.get_lora_info(lora_req.lora_id)
            if not lora_info:
                print(f"Warning: Unknown LoRA {lora_req.lora_id}, skipping")
                continue

            # Check compatibility
            if model_type not in lora_info.compatible_types and lora_info.compatible_types:
                print(f"Warning: LoRA {lora_req.lora_id} not compatible with {model_type}, skipping")
                continue

            adapter_name = f"lora_{i}"

            try:
                if lora_info.source == "local":
                    # Local file - load directly
                    pipeline.load_lora_weights(
                        lora_info.path,
                        adapter_name=adapter_name,
                    )
                else:
                    # HuggingFace - download if needed
                    pipeline.load_lora_weights(
                        lora_info.path,
                        adapter_name=adapter_name,
                    )

                adapter_names.append(adapter_name)
                adapter_weights.append(lora_req.weight)
                print(f"Loaded LoRA: {lora_info.name} (weight: {lora_req.weight})")

            except Exception as e:
                print(f"Failed to load LoRA {lora_req.lora_id}: {e}")
                continue

        # Set all adapters with their weights
        if adapter_names:
            try:
                pipeline.set_adapters(adapter_names, adapter_weights=adapter_weights)
                self._current_loras = adapter_names
                print(f"Applied {len(adapter_names)} LoRA(s)")
            except Exception as e:
                print(f"Failed to set adapters: {e}")

    def _unload_loras(self, pipeline) -> None:
        """Unload any currently loaded LoRAs from the pipeline."""
        if not self._current_loras:
            return

        try:
            # Try to unload LoRA weights
            if hasattr(pipeline, 'unload_lora_weights'):
                pipeline.unload_lora_weights()
            self._current_loras = []
        except Exception as e:
            print(f"Warning: Failed to unload LoRAs: {e}")
            self._current_loras = []

    def scan_local_loras(self) -> list[LoRAInfo]:
        """Rescan local directory and return found LoRAs."""
        loras = []
        if self.local_dir.exists():
            for lora_file in self.local_dir.glob("**/*.safetensors"):
                lora_id = f"local_{lora_file.stem}"
                compatible_types = self._infer_compatible_types(lora_file.stem)

                loras.append(LoRAInfo(
                    id=lora_id,
                    name=lora_file.stem.replace("_", " ").replace("-", " ").title(),
                    path=str(lora_file),
                    source="local",
                    compatible_types=compatible_types,
                    default_weight=0.8,
                    description=f"Local LoRA: {lora_file.name}",
                    is_downloaded=True,
                ))
        return loras


# Global singleton
_lora_manager: Optional[LoRAManager] = None


def get_lora_manager() -> LoRAManager:
    """Get the global LoRA manager instance."""
    global _lora_manager
    if _lora_manager is None:
        _lora_manager = LoRAManager()
    return _lora_manager
