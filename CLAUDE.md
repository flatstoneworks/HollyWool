# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

HollyWool is a local AI image and video generation tool designed for the NVIDIA DGX Spark. It provides a simplified KREA-like experience for generating images and videos using diffusion models, without requiring authentication or cloud services.

## Development Commands

### Backend (FastAPI + Python)

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run development server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8031
```

### Frontend (React + Vite)

```bash
cd frontend

# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Lint
npm run lint
```

### Running Both Services

Start the backend on port 8031 and frontend on port 8030. The frontend proxies `/api` and `/outputs` to the backend automatically.

Access the app at `http://spark.local:8030`

## Architecture

```
HollyWool/
├── backend/                    # FastAPI Python backend
│   ├── app/
│   │   ├── main.py            # FastAPI app, CORS, static files
│   │   ├── routers/
│   │   │   ├── generate.py    # POST /api/generate, GET /api/models, /api/health
│   │   │   └── assets.py      # GET/DELETE /api/assets
│   │   ├── services/
│   │   │   ├── inference.py   # Model loading & generation (diffusers)
│   │   │   ├── video_jobs.py  # Video generation job queue
│   │   │   ├── i2v_jobs.py    # Image-to-video job queue
│   │   │   └── lora_manager.py # LoRA loading and application
│   │   └── models/
│   │       └── schemas.py     # Pydantic request/response models
│   ├── config.yaml            # Model definitions and server settings
│   └── requirements.txt
│
├── frontend/                   # React + Vite + Tailwind
│   ├── src/
│   │   ├── api/client.ts      # API client with typed methods
│   │   ├── components/
│   │   │   ├── Layout.tsx     # App shell with navigation
│   │   │   └── ui/            # shadcn/ui components
│   │   ├── pages/
│   │   │   ├── ImagePage.tsx     # Image generation (T2I + I2I) with model/LoRA/ref-image selection
│   │   │   ├── VideoPage.tsx     # Video generation (T2V and I2V)
│   │   │   ├── AssetsPage.tsx    # Combined gallery with All/Images/Videos tabs
│   │   │   ├── ModelsPage.tsx    # Model browser and management
│   │   │   └── ModelDetailPage.tsx # Individual model details and download
│   │   └── main.tsx           # React entry, routes, QueryClient
│   └── vite.config.ts         # Dev server proxy configuration
│
└── outputs/                    # Generated images + JSON metadata
```

## Key Files

- **backend/config.yaml** - Define available models with paths, types, and default parameters
- **backend/app/services/inference.py** - Model loading/switching logic, supports FLUX, SDXL, SD pipelines. Includes `generate()` (T2I) and `generate_from_image()` (I2I via `AutoPipelineForImage2Image.from_pipe()`)
- **backend/app/services/jobs.py** - Image generation job queue. Detects I2I mode via `reference_images`, routes to `generate_from_image()`, persists source images to disk
- **backend/app/services/i2v_jobs.py** - Image-to-video job queue. Supports `reference_images` array with backward-compatible legacy fields
- **backend/app/models/schemas.py** - Pydantic schemas including `ReferenceImage`, `GenerateRequest` (with I2I fields), `I2VGenerateRequest` (with multi-reference)
- **frontend/src/api/client.ts** - Typed API client matching backend schemas

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/health | GPU status and loaded model |
| GET | /api/models | List available models |
| POST | /api/generate | Generate image from prompt (T2I or I2I with `reference_images`) |
| GET | /api/assets | List generated images |
| GET | /api/assets/{id} | Get asset metadata |
| DELETE | /api/assets/{id} | Delete asset |
| GET | /api/video/assets | List generated videos |
| POST | /api/video/jobs | Create video generation job |
| GET | /api/video/jobs/{id} | Get video job status |
| POST | /api/models/{id}/download | Pre-download model to cache |
| GET | /api/loras | List available LoRAs |
| GET | /api/upscale/models | List available upscale models |
| POST | /api/upscale/jobs | Create video upscale job |
| GET | /api/upscale/jobs/{id} | Get upscale job status |
| GET | /api/upscale/jobs | List upscale jobs |

## Adding Models

Edit `backend/config.yaml` to add new models:

```yaml
models:
  my-model:
    name: "Display Name"
    path: "huggingface/model-id"  # or local path
    type: "flux" | "sdxl" | "sd"
    default_steps: 20
    default_guidance: 7.5
```

## Tech Stack

- **Backend:** Python 3.11+, FastAPI, diffusers, torch, Pillow
- **Frontend:** React 18, Vite, TanStack Query, Tailwind CSS, shadcn/ui components

## Supported Model Types

- **flux** - FLUX.1 models (schnell, dev)
- **sdxl** - Stable Diffusion XL
- **sd** - Stable Diffusion 1.x/2.x
- **sd3** - Stable Diffusion 3
- **ltx2** - LTX-Video for text-to-video
- **video-i2v** - CogVideoX Image-to-Video
- **svd** - Stable Video Diffusion

## Access URL

Always provide the full app URL at the end of responses when the dev server is running:

- **Mac (local development):** http://localhost:8030
- **NVIDIA DGX Spark:** http://spark.local:8030
