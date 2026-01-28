# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

HollyWool is a local AI image and video generation studio for the NVIDIA DGX Spark. It combines:

1. **Local generation** — Run diffusion models directly on your GPU (FLUX, SDXL, SD3, CogVideoX, LTX-2, Wan2.2, Mochi)
2. **ComfyUI integration** — Import and run ComfyUI workflows with a simple form interface
3. **Remote providers** — Connect to KREA, fal.ai, Higgsfield for 100+ additional models
4. **Civitai integration** — Browse and download from 130,000+ community models
5. **Bulk generation** — Generate dozens of images with Claude-powered prompt variations

## Development Commands

### Backend (FastAPI + Python)

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8031
```

### Frontend (React + Vite)

```bash
cd frontend
npm install
npm run dev      # Port 8030
npm run build    # Production build
npm run lint     # ESLint
```

### Running Both Services

Start backend on port 8031 and frontend on port 8030. The frontend proxies `/api` and `/outputs` to the backend.

Access the app at `http://spark.local:8030`

## Architecture

```
HollyWool/
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI app, CORS, static files
│   │   ├── routers/
│   │   │   ├── generate.py         # Image generation, jobs, models, LoRAs
│   │   │   ├── video.py            # Text-to-video jobs
│   │   │   ├── i2v.py              # Image-to-video jobs
│   │   │   ├── upscale.py          # Video upscaling
│   │   │   ├── assets.py           # Image/video assets, sessions
│   │   │   ├── settings.py         # App settings, logs, system info
│   │   │   ├── providers.py        # Remote provider configuration
│   │   │   ├── civitai.py          # Civitai browse and download
│   │   │   ├── bulk.py             # Bulk generation with fal.ai
│   │   │   ├── comfyui.py          # ComfyUI workflow import and generation
│   │   │   └── system.py           # Resource checks
│   │   ├── services/
│   │   │   ├── inference.py        # Model loading, T2I, I2I generation
│   │   │   ├── jobs.py             # Image job queue
│   │   │   ├── video_jobs.py       # Video job queue
│   │   │   ├── i2v_jobs.py         # I2V job queue
│   │   │   ├── upscale_jobs.py     # Upscale job queue
│   │   │   ├── bulk_jobs.py        # Bulk job manager
│   │   │   ├── lora_manager.py     # LoRA discovery and loading
│   │   │   ├── resources.py        # GPU/memory monitoring
│   │   │   ├── civitai_client.py   # Civitai API client
│   │   │   ├── civitai_downloads.py # Download manager
│   │   │   ├── llm_client.py       # Claude API for variations
│   │   │   ├── comfyui_client.py   # ComfyUI HTTP API client
│   │   │   ├── comfyui_jobs.py     # ComfyUI job manager
│   │   │   └── comfyui_workflow_parser.py # Workflow parameter extraction
│   │   └── models/
│   │       ├── schemas.py          # Main Pydantic schemas
│   │       └── civitai_schemas.py  # Civitai schemas
│   ├── config.yaml                 # Model definitions, settings
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── api/client.ts           # Typed API client
│   │   ├── components/
│   │   │   ├── Layout.tsx          # App shell
│   │   │   ├── NavSidebar.tsx      # Navigation
│   │   │   └── ui/                 # shadcn/ui components
│   │   ├── pages/
│   │   │   ├── ImagePage.tsx       # T2I + I2I
│   │   │   ├── VideoPage.tsx       # T2V + I2V
│   │   │   ├── BulkOperationPage.tsx # Bulk with Claude variations
│   │   │   ├── ComfyUIPage.tsx     # ComfyUI workflow runner
│   │   │   ├── AssetsPage.tsx      # Gallery
│   │   │   ├── ModelsPage.tsx      # Model browser + Civitai
│   │   │   ├── CivitaiModelDetailPage.tsx # Civitai model + download
│   │   │   ├── ProviderDetailPage.tsx # Remote provider config
│   │   │   ├── QueuePage.tsx       # Active jobs
│   │   │   └── SettingsPage.tsx    # App settings
│   │   └── main.tsx                # Routes, QueryClient
│   └── vite.config.ts              # Proxy configuration
│
├── data/                           # Persisted state (gitignored)
│   ├── sessions.json
│   ├── video-sessions.json
│   ├── bulk-sessions.json
│   ├── settings.json
│   ├── providers.json              # Remote provider API keys
│   ├── civitai-downloads.json
│   └── comfyui_workflows.json      # Saved ComfyUI workflows
│
└── outputs/                        # Generated media (gitignored)
```

## Key Files

### Backend

| File | Purpose |
|------|---------|
| `config.yaml` | Model definitions, LoRA presets, server settings |
| `services/inference.py` | Model loading, `generate()` (T2I), `generate_from_image()` (I2I) |
| `services/jobs.py` | Image job queue, detects I2I via `reference_images` |
| `services/video_jobs.py` | T2V job queue (CogVideoX, LTX-2, Wan, Mochi) |
| `services/i2v_jobs.py` | I2V job queue with multi-reference support |
| `services/bulk_jobs.py` | Bulk job manager using fal.ai backend |
| `services/civitai_downloads.py` | Background downloads from Civitai |
| `services/llm_client.py` | Claude API for prompt variations |
| `routers/providers.py` | KREA, fal.ai, Anthropic provider management |
| `routers/civitai.py` | Civitai search, model details, downloads |
| `routers/bulk.py` | Bulk variations and job creation |
| `routers/comfyui.py` | ComfyUI workflow import and generation endpoints |
| `services/comfyui_client.py` | HTTP client for ComfyUI server API |
| `services/comfyui_workflow_parser.py` | Extracts editable parameters from workflows |
| `models/schemas.py` | Pydantic schemas for all request/response types |

### Frontend

| File | Purpose |
|------|---------|
| `api/client.ts` | Typed API client for all endpoints |
| `pages/ImagePage.tsx` | Image generation with model/LoRA/ref-image selection |
| `pages/VideoPage.tsx` | Video generation (T2V and I2V tabs) |
| `pages/BulkOperationPage.tsx` | Bulk generation with Claude prompt variations |
| `pages/ComfyUIPage.tsx` | Import and run ComfyUI workflows |
| `components/WorkflowParameterForm.tsx` | Dynamic form for workflow parameters |
| `pages/ModelsPage.tsx` | Model browser with Civitai integration |
| `pages/ProviderDetailPage.tsx` | Configure remote provider API keys |
| `pages/CivitaiModelDetailPage.tsx` | View and download Civitai models |

## API Endpoints Reference

### Generation (Local)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/jobs` | Image generation (T2I/I2I) |
| POST | `/api/video/jobs` | Text-to-video |
| POST | `/api/i2v/jobs` | Image-to-video |
| POST | `/api/upscale/jobs` | Video upscaling |

### Bulk Generation (Remote)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/bulk/variations` | Generate prompt variations (Claude API) |
| POST | `/api/bulk/jobs` | Create bulk job (fal.ai backend) |
| GET | `/api/bulk/jobs/{id}` | Get bulk job status |

### Remote Providers

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/providers` | List all providers |
| PUT | `/api/providers/{id}` | Update API key/URL |
| POST | `/api/providers/{id}/test` | Test connection |
| POST | `/api/providers/{id}/discover` | Discover models (KREA, fal.ai) |

### Civitai

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/civitai/models` | Search models |
| GET | `/api/civitai/models/{id}` | Get model details |
| POST | `/api/civitai/downloads` | Start download |
| GET | `/api/civitai/downloads` | List downloads |

### ComfyUI

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/comfyui/status` | Check ComfyUI server status |
| POST | `/api/comfyui/workflows` | Import workflow JSON |
| GET | `/api/comfyui/workflows` | List saved workflows |
| GET | `/api/comfyui/workflows/{id}` | Get workflow with parameters |
| DELETE | `/api/comfyui/workflows/{id}` | Delete workflow |
| POST | `/api/comfyui/jobs` | Create generation job |
| GET | `/api/comfyui/jobs/{id}` | Get job status |

### Sessions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/sessions` | Image sessions |
| GET/POST | `/api/video-sessions` | Video sessions |
| GET/POST | `/api/bulk-sessions` | Bulk sessions |

## Adding Models

Edit `backend/config.yaml`:

```yaml
models:
  my-model:
    name: "Display Name"
    path: "huggingface/model-id"
    type: "flux" | "sdxl" | "sd" | "sd3" | "video" | "ltx2" | "wan" | "mochi" | "video-i2v" | "wan-i2v" | "svd"
    default_steps: 20
    default_guidance: 7.5
    category: "fast" | "quality" | "specialized" | "video"
    size_gb: 6.9
    memory_gb: 55  # Optional: actual VRAM if different
```

## Supported Model Types

| Type | Description |
|------|-------------|
| `flux` | FLUX.1 models (schnell, dev) |
| `sdxl` | Stable Diffusion XL |
| `sd` | Stable Diffusion 1.x/2.x |
| `sd3` | Stable Diffusion 3 |
| `video` | CogVideoX text-to-video |
| `ltx2` | LTX-2 video (with audio) |
| `wan` | Wan2.2 text-to-video |
| `mochi` | Mochi video |
| `video-i2v` | CogVideoX image-to-video |
| `wan-i2v` | Wan2.2 image-to-video |
| `svd` | Stable Video Diffusion |

## Remote Providers

| Provider | ID | Category | Discovery |
|----------|-----|----------|-----------|
| KREA | `krea` | Image/Video | Yes (OpenAPI spec) |
| fal.ai | `fal` | Image/Video | Yes (paginated API) |
| Higgsfield | `higgsfield` | Image | No |
| Anthropic | `anthropic` | LLM | No |

Provider configs stored in `data/providers.json`.

## Storage Locations

| Path | Contents |
|------|----------|
| `~/.cache/huggingface/hub/` | HuggingFace model cache |
| `~/.cache/hollywool/civitai/checkpoints/` | Downloaded Civitai models |
| `~/.cache/hollywool/civitai/loras/` | Downloaded Civitai LoRAs |
| `~/.hollywool/loras/` | Custom local LoRAs |
| `data/` | App state (sessions, settings, logs) |
| `outputs/` | Generated images and videos |

## Tech Stack

- **Backend:** Python 3.11+, FastAPI, diffusers, torch, Anthropic SDK, httpx
- **Frontend:** React 18, Vite, TanStack Query, Tailwind CSS, shadcn/ui

## Access URL

Always provide the full app URL when the dev server is running:

- **NVIDIA DGX Spark:** http://spark.local:8030
- **Local development:** http://localhost:8030
