import json
import logging
from pathlib import Path
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, ValidationError

from ..models.schemas import AssetMetadata, AssetListResponse, VideoAssetMetadata, VideoAssetListResponse
from ..utils.paths import get_output_dir, get_data_dir

router = APIRouter(prefix="/api", tags=["assets"])
logger = logging.getLogger(__name__)


# Session models
class Session(BaseModel):
    id: str
    name: str
    createdAt: str
    batchIds: List[str]
    thumbnail: Optional[str] = None
    isAutoNamed: Optional[bool] = None


class SessionsData(BaseModel):
    sessions: List[Session]
    currentSessionId: Optional[str] = None


# Video session models
class VideoSession(BaseModel):
    id: str
    name: str
    createdAt: str
    thumbnail: Optional[str] = None
    isAutoNamed: Optional[bool] = None


class VideoSessionsData(BaseModel):
    sessions: List[VideoSession]
    currentSessionId: Optional[str] = None


def get_sessions_file() -> Path:
    """Get the path to the sessions JSON file."""
    return get_data_dir() / "sessions.json"


def load_sessions() -> SessionsData:
    """Load sessions from file."""
    sessions_file = get_sessions_file()
    if sessions_file.exists():
        try:
            with open(sessions_file, "r") as f:
                data = json.load(f)
                return SessionsData(**data)
        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse sessions file: {e}")
        except ValidationError as e:
            logger.warning(f"Invalid sessions data structure: {e}")
        except OSError as e:
            logger.error(f"Failed to read sessions file: {e}")
    return SessionsData(sessions=[], currentSessionId=None)


def save_sessions(data: SessionsData) -> None:
    """Save sessions to file."""
    sessions_file = get_sessions_file()
    with open(sessions_file, "w") as f:
        json.dump(data.model_dump(), f, indent=2)


def load_asset_metadata(metadata_path: Path) -> Optional[AssetMetadata]:
    """Load asset metadata from JSON file."""
    try:
        with open(metadata_path, "r") as f:
            data = json.load(f)
            # Skip video assets in image metadata loader
            if data.get("type") == "video":
                return None
            data["url"] = f"/outputs/{data['filename']}"
            data["created_at"] = datetime.fromisoformat(data["created_at"])

            # Get file info from the actual image file
            output_dir = get_output_dir()
            image_path = output_dir / data["filename"]
            if image_path.exists():
                data["file_size"] = image_path.stat().st_size
                data["file_path"] = str(image_path.resolve())

            return AssetMetadata(**data)
    except json.JSONDecodeError as e:
        logger.warning(f"Failed to parse asset metadata {metadata_path}: {e}")
    except KeyError as e:
        logger.warning(f"Missing required field in {metadata_path}: {e}")
    except ValidationError as e:
        logger.warning(f"Invalid asset metadata in {metadata_path}: {e}")
    except OSError as e:
        logger.error(f"Failed to read asset metadata {metadata_path}: {e}")
    return None


@router.get("/assets", response_model=AssetListResponse)
async def list_assets(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    model: Optional[str] = Query(default=None),
):
    output_dir = get_output_dir()

    # Get all metadata files sorted by modification time (newest first)
    metadata_files = sorted(
        output_dir.glob("*.json"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )

    assets = []
    for metadata_path in metadata_files:
        asset = load_asset_metadata(metadata_path)
        if asset:
            # Filter by model if specified
            if model and asset.model != model:
                continue
            assets.append(asset)

    total = len(assets)
    assets = assets[offset : offset + limit]

    return AssetListResponse(assets=assets, total=total)


@router.get("/assets/{asset_id}")
async def get_asset(asset_id: str):
    output_dir = get_output_dir()
    metadata_path = output_dir / f"{asset_id}.json"

    if not metadata_path.exists():
        raise HTTPException(status_code=404, detail="Asset not found")

    asset = load_asset_metadata(metadata_path)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset metadata corrupted")

    return asset


@router.delete("/assets/{asset_id}")
async def delete_asset(asset_id: str):
    output_dir = get_output_dir()
    metadata_path = output_dir / f"{asset_id}.json"

    if not metadata_path.exists():
        raise HTTPException(status_code=404, detail="Asset not found")

    # Read metadata to get actual filename (may be .png, .jpg, .webp, etc.)
    image_path = None
    try:
        with open(metadata_path, "r") as f:
            data = json.load(f)
            if "filename" in data:
                image_path = output_dir / data["filename"]
    except (json.JSONDecodeError, OSError) as e:
        logger.warning(f"Failed to read metadata for deletion {metadata_path}: {e}")

    # Fallback: try common extensions if metadata didn't resolve the file
    if image_path is None or not image_path.exists():
        for ext in (".png", ".jpg", ".webp"):
            candidate = output_dir / f"{asset_id}{ext}"
            if candidate.exists():
                image_path = candidate
                break

    # Delete both files
    if image_path and image_path.exists():
        image_path.unlink()
    if metadata_path.exists():
        metadata_path.unlink()

    return {"status": "deleted", "id": asset_id}


# Session endpoints
@router.get("/sessions", response_model=SessionsData)
async def get_sessions():
    """Get all sessions."""
    return load_sessions()


@router.post("/sessions", response_model=SessionsData)
async def save_sessions_endpoint(data: SessionsData):
    """Save all sessions."""
    save_sessions(data)
    return data


# Bulk session models
class BulkSession(BaseModel):
    id: str
    name: str
    createdAt: str
    bulkJobIds: List[str] = []
    thumbnail: Optional[str] = None
    isAutoNamed: Optional[bool] = None


class BulkSessionsData(BaseModel):
    sessions: List[BulkSession]
    currentSessionId: Optional[str] = None


# Video session functions
def get_video_sessions_file() -> Path:
    """Get the path to the video sessions JSON file."""
    return get_data_dir() / "video-sessions.json"


def load_video_sessions() -> VideoSessionsData:
    """Load video sessions from file."""
    sessions_file = get_video_sessions_file()
    if sessions_file.exists():
        try:
            with open(sessions_file, "r") as f:
                data = json.load(f)
                return VideoSessionsData(**data)
        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse video sessions file: {e}")
        except ValidationError as e:
            logger.warning(f"Invalid video sessions data structure: {e}")
        except OSError as e:
            logger.error(f"Failed to read video sessions file: {e}")
    return VideoSessionsData(sessions=[], currentSessionId=None)


def save_video_sessions(data: VideoSessionsData) -> None:
    """Save video sessions to file."""
    sessions_file = get_video_sessions_file()
    with open(sessions_file, "w") as f:
        json.dump(data.model_dump(), f, indent=2)


# Video session endpoints
@router.get("/video-sessions", response_model=VideoSessionsData)
async def get_video_sessions():
    """Get all video sessions."""
    return load_video_sessions()


@router.post("/video-sessions", response_model=VideoSessionsData)
async def save_video_sessions_endpoint(data: VideoSessionsData):
    """Save all video sessions."""
    save_video_sessions(data)
    return data


# Video assets endpoints
def load_video_asset_metadata(metadata_path: Path) -> Optional[VideoAssetMetadata]:
    """Load video asset metadata from JSON file."""
    try:
        with open(metadata_path, "r") as f:
            data = json.load(f)
            # Only load video assets
            if data.get("type") != "video":
                return None
            data["url"] = f"/outputs/{data['filename']}"
            data["created_at"] = datetime.fromisoformat(data["created_at"])

            # Get file info from the actual video file
            output_dir = get_output_dir()
            video_path = output_dir / data["filename"]
            if video_path.exists():
                data["file_size"] = video_path.stat().st_size
                data["file_path"] = str(video_path.resolve())

            return VideoAssetMetadata(**data)
    except json.JSONDecodeError as e:
        logger.warning(f"Failed to parse video metadata {metadata_path}: {e}")
    except KeyError as e:
        logger.warning(f"Missing required field in {metadata_path}: {e}")
    except ValidationError as e:
        logger.warning(f"Invalid video metadata in {metadata_path}: {e}")
    except OSError as e:
        logger.error(f"Failed to read video metadata {metadata_path}: {e}")
    return None


@router.get("/video-assets", response_model=VideoAssetListResponse)
async def list_video_assets(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    model: Optional[str] = Query(default=None),
):
    """List all video assets in the gallery."""
    output_dir = get_output_dir()

    # Get all metadata files sorted by modification time (newest first)
    metadata_files = sorted(
        output_dir.glob("*.json"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )

    assets = []
    for metadata_path in metadata_files:
        asset = load_video_asset_metadata(metadata_path)
        if asset:
            # Filter by model if specified
            if model and asset.model != model:
                continue
            assets.append(asset)

    total = len(assets)
    assets = assets[offset : offset + limit]

    return VideoAssetListResponse(assets=assets, total=total)


@router.get("/video-assets/{asset_id}")
async def get_video_asset(asset_id: str):
    """Get a specific video asset."""
    output_dir = get_output_dir()
    metadata_path = output_dir / f"{asset_id}.json"

    if not metadata_path.exists():
        raise HTTPException(status_code=404, detail="Video asset not found")

    asset = load_video_asset_metadata(metadata_path)
    if not asset:
        raise HTTPException(status_code=404, detail="Video asset metadata corrupted or not a video")

    return asset


@router.delete("/video-assets/{asset_id}")
async def delete_video_asset(asset_id: str):
    """Delete a video asset."""
    output_dir = get_output_dir()
    video_path = output_dir / f"{asset_id}.mp4"
    metadata_path = output_dir / f"{asset_id}.json"

    if not metadata_path.exists():
        raise HTTPException(status_code=404, detail="Video asset not found")

    # Delete both files
    if video_path.exists():
        video_path.unlink()
    if metadata_path.exists():
        metadata_path.unlink()

    return {"status": "deleted", "id": asset_id}


# Bulk session functions
def get_bulk_sessions_file() -> Path:
    """Get the path to the bulk sessions JSON file."""
    return get_data_dir() / "bulk-sessions.json"


def load_bulk_sessions() -> BulkSessionsData:
    """Load bulk sessions from file."""
    sessions_file = get_bulk_sessions_file()
    if sessions_file.exists():
        try:
            with open(sessions_file, "r") as f:
                data = json.load(f)
                return BulkSessionsData(**data)
        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse bulk sessions file: {e}")
        except ValidationError as e:
            logger.warning(f"Invalid bulk sessions data structure: {e}")
        except OSError as e:
            logger.error(f"Failed to read bulk sessions file: {e}")
    return BulkSessionsData(sessions=[], currentSessionId=None)


def save_bulk_sessions(data: BulkSessionsData) -> None:
    """Save bulk sessions to file."""
    sessions_file = get_bulk_sessions_file()
    with open(sessions_file, "w") as f:
        json.dump(data.model_dump(), f, indent=2)


# Bulk session endpoints
@router.get("/bulk-sessions", response_model=BulkSessionsData)
async def get_bulk_sessions():
    """Get all bulk sessions."""
    return load_bulk_sessions()


@router.post("/bulk-sessions", response_model=BulkSessionsData)
async def save_bulk_sessions_endpoint(data: BulkSessionsData):
    """Save all bulk sessions."""
    save_bulk_sessions(data)
    return data
