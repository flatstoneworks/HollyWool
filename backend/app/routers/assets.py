import json
from pathlib import Path
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel

from ..models.schemas import AssetMetadata, AssetListResponse

router = APIRouter(prefix="/api", tags=["assets"])


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


def get_sessions_file() -> Path:
    """Get the path to the sessions JSON file."""
    data_dir = Path(__file__).parent.parent.parent.parent / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir / "sessions.json"


def load_sessions() -> SessionsData:
    """Load sessions from file."""
    sessions_file = get_sessions_file()
    if sessions_file.exists():
        try:
            with open(sessions_file, "r") as f:
                data = json.load(f)
                return SessionsData(**data)
        except Exception:
            pass
    return SessionsData(sessions=[], currentSessionId=None)


def save_sessions(data: SessionsData) -> None:
    """Save sessions to file."""
    sessions_file = get_sessions_file()
    with open(sessions_file, "w") as f:
        json.dump(data.model_dump(), f, indent=2)


def get_output_dir() -> Path:
    output_dir = Path(__file__).parent.parent.parent.parent / "outputs"
    output_dir.mkdir(parents=True, exist_ok=True)
    return output_dir


def load_asset_metadata(metadata_path: Path) -> Optional[AssetMetadata]:
    try:
        with open(metadata_path, "r") as f:
            data = json.load(f)
            data["url"] = f"/outputs/{data['filename']}"
            data["created_at"] = datetime.fromisoformat(data["created_at"])
            return AssetMetadata(**data)
    except Exception:
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
    image_path = output_dir / f"{asset_id}.png"
    metadata_path = output_dir / f"{asset_id}.json"

    if not metadata_path.exists():
        raise HTTPException(status_code=404, detail="Asset not found")

    # Delete both files
    if image_path.exists():
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
