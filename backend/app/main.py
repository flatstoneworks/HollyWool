import yaml
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .routers import generate, assets


def load_config() -> dict:
    config_path = Path(__file__).parent.parent / "config.yaml"
    with open(config_path, "r") as f:
        return yaml.safe_load(f)


config = load_config()

app = FastAPI(
    title="HollyWool",
    description="Local AI image generation API",
    version="0.1.0",
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=config["server"]["cors_origins"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount outputs directory for serving generated images
outputs_dir = Path(__file__).parent.parent.parent / "outputs"
outputs_dir.mkdir(parents=True, exist_ok=True)
app.mount("/outputs", StaticFiles(directory=str(outputs_dir)), name="outputs")

# Include routers
app.include_router(generate.router)
app.include_router(assets.router)


@app.get("/")
async def root():
    return {
        "name": "HollyWool",
        "version": "0.1.0",
        "description": "Local AI image generation",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=config["server"]["host"],
        port=config["server"]["port"],
        reload=True,
    )
