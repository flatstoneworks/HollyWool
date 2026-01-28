"""Shared path utilities for HollyWool backend."""

from pathlib import Path

# Project root is 4 levels up from this file (utils -> app -> backend -> HollyWool)
_PROJECT_ROOT = Path(__file__).parent.parent.parent.parent


def get_output_dir() -> Path:
    """Get the outputs directory, creating it if it doesn't exist."""
    output_dir = _PROJECT_ROOT / "outputs"
    output_dir.mkdir(parents=True, exist_ok=True)
    return output_dir


def get_data_dir() -> Path:
    """Get the data directory, creating it if it doesn't exist."""
    data_dir = _PROJECT_ROOT / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir
