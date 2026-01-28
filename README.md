# HollyWool

A local AI image and video generation studio designed for the NVIDIA DGX Spark.
Generate high-quality images and videos using state-of-the-art diffusion models running entirely on your GPU — no cloud services required. Optionally connect to remote providers (KREA, fal.ai) for access to 100+ additional models, and browse Civitai's 130,000+ community models.

## Features

### Image Generation
- **12 local models** across FLUX, SDXL, SD3, and Stable Diffusion architectures
- **Image-to-Image (I2I)**: upload up to 5 reference images, adjust denoising strength (0.1–1.0)
- **Session management** with auto-naming from prompts and persistent storage
- **Batch generation** of 1–4 images per prompt with per-image seed control
- **Async job queue** with real-time progress (download, load, generate, save stages)
- **Aspect ratios** with visual selector (1:1, 16:9, 9:16, 4:3, etc.)
- **Advanced controls**: steps, guidance scale, negative prompts, seed
- **LoRA support**: apply Low-Rank Adaptations with per-LoRA weight control (0.0–1.5)

### Video Generation
- **Text-to-video**: CogVideoX-5B/2B, LTX-2 (with synchronized audio), Wan2.2, Mochi 1
- **Image-to-video**: CogVideoX-5B I2V, Wan2.2 I2V, Stable Video Diffusion XT
- **Multi-reference images**: I2V accepts up to 5 reference images
- **Video upscaling**: Real-ESRGAN 2x/4x with anime and video-optimized models
- **Resource checks**: GPU memory verified before accepting video jobs

### Remote Provider Integration
Connect to external AI APIs for access to additional models:

| Provider | Category | Features |
|----------|----------|----------|
| **KREA** | Image/Video | FLUX, Imagen, Ideogram, Kling, enhancement models |
| **fal.ai** | Image/Video | 100+ models including FLUX Pro, Luma, SD3, upscalers |
| **Higgsfield** | Image | Additional image generation models |
| **Anthropic** | LLM | Claude API for bulk prompt variation generation |

- **API key management** with secure storage
- **Connection testing** to verify credentials
- **Model discovery** — auto-detect available models from provider APIs
- **Input type detection** — text-to-image, image-to-video, upscaling, face-swap, lipsync

### Civitai Integration
Browse and download from Civitai's community model library:

- **130,000+ models** — Checkpoints, LoRAs, TextualInversions, ControlNets
- **Search & filter** by type, base model (SD 1.5, SDXL, FLUX, SD3, Pony), tags, NSFW
- **Sort options** — Highest rated, most downloaded, newest
- **Background downloads** with progress tracking and deduplication
- **Automatic storage** — Checkpoints and LoRAs saved to `~/.cache/hollywool/civitai/`

### Bulk Image Generation
Generate dozens of images with AI-assisted prompt variation:

- **Claude-powered variations** — Generate 10+ diverse prompts from a single idea
- **Style guidance** — Direct the variation style (e.g., "cinematic", "anime", "photorealistic")
- **fal.ai backend** — Remote inference for batch processing
- **Supported models** — FLUX.1 Schnell/Dev, FLUX Pro 1.1, SDXL, SD3 Medium
- **Bulk session management** — Track multiple bulk jobs per session

### Model Management
- **Model browser** with categories (fast, quality, specialized, video), tags, descriptions
- **Model detail pages** with cache info, generation defaults, HuggingFace approval status
- **Cache detection** via HuggingFace `scan_cache_dir()` showing actual disk usage
- **Pre-download** models to cache without loading into GPU memory
- **Cache cleanup** to delete individual models and free disk space

### Assets Gallery
- **Unified gallery** with All / Images / Videos tabs
- **Filter by model**, search by prompt
- **Detail views** with full metadata (prompt, model, seed, dimensions, duration, FPS)
- **Hover previews** for videos in grid view
- **Delete** unwanted generations

### System & Settings
- **System info header** — device type (Spark/Mac/PC), compute mode (GPU/CPU)
- **Hover cards** — hostname, OS, Python version, GPU name, VRAM, PyTorch version
- **Active job notifications** — cross-media tracking (images, videos, I2V, upscale, bulk)
- **Light/dark/system theme** with localStorage persistence
- **Request logging** with pagination, type/status filters, per-log deletion
- **App settings** — default models, theme, Civitai API key, max log entries

## Architecture

```
Frontend (Port 8030) <--- proxy ---> Backend (Port 8031)
   React + Vite                       FastAPI + Diffusers
   Tailwind CSS                       PyTorch + CUDA
   TanStack Query                     HuggingFace Hub
```

### Project Structure

```
HollyWool/
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI app, CORS, static file mount
│   │   ├── models/
│   │   │   ├── schemas.py          # Pydantic models (image, video, I2V, bulk, system)
│   │   │   └── civitai_schemas.py  # Civitai-specific schemas
│   │   ├── routers/
│   │   │   ├── generate.py         # Image generation, jobs, models, LoRA endpoints
│   │   │   ├── video.py            # Text-to-video job queue
│   │   │   ├── i2v.py              # Image-to-video job queue
│   │   │   ├── upscale.py          # Video upscaling endpoints
│   │   │   ├── assets.py           # Image/video assets, sessions
│   │   │   ├── settings.py         # App settings, request logs, system info
│   │   │   ├── providers.py        # Remote provider configuration
│   │   │   ├── civitai.py          # Civitai browse and download
│   │   │   ├── bulk.py             # Bulk generation with fal.ai
│   │   │   └── system.py           # System status and resource checks
│   │   └── services/
│   │       ├── inference.py         # Model loading, switching, generation
│   │       ├── jobs.py              # Image generation job queue
│   │       ├── video_jobs.py        # Text-to-video job queue
│   │       ├── i2v_jobs.py          # Image-to-video job queue
│   │       ├── upscale_jobs.py      # Video upscaling job queue
│   │       ├── upscaler.py          # Real-ESRGAN service
│   │       ├── lora_manager.py      # LoRA discovery and loading
│   │       ├── resources.py         # GPU/CPU/memory monitoring
│   │       ├── civitai_client.py    # Civitai API client
│   │       ├── civitai_downloads.py # Civitai download manager
│   │       ├── llm_client.py        # Claude API for prompt variations
│   │       └── bulk_jobs.py         # Bulk generation job manager
│   ├── config.yaml                  # Model definitions, LoRA presets, settings
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   └── client.ts           # Typed API client (all endpoints)
│   │   ├── components/
│   │   │   ├── Layout.tsx           # App shell (NavSidebar + Header + Outlet)
│   │   │   ├── NavSidebar.tsx       # Icon navigation
│   │   │   ├── ContentHeader.tsx    # Header with system info, notifications
│   │   │   ├── NotificationsButton.tsx  # Active job tracker
│   │   │   └── ui/                  # shadcn/ui primitives
│   │   ├── contexts/
│   │   │   └── ThemeContext.tsx      # Theme provider
│   │   ├── pages/
│   │   │   ├── ImagePage.tsx        # Image generation (T2I + I2I)
│   │   │   ├── VideoPage.tsx        # Video generation (T2V + I2V)
│   │   │   ├── BulkOperationPage.tsx # Bulk generation with Claude variations
│   │   │   ├── AssetsPage.tsx       # Unified gallery
│   │   │   ├── ModelsPage.tsx       # Model browser + Civitai integration
│   │   │   ├── ModelDetailPage.tsx  # Local model details
│   │   │   ├── CivitaiModelDetailPage.tsx # Civitai model details + download
│   │   │   ├── ProviderDetailPage.tsx # Remote provider configuration
│   │   │   ├── QueuePage.tsx        # Active job queue
│   │   │   ├── JobDetailPage.tsx    # Job progress details
│   │   │   ├── AssetDetailPage.tsx  # Full-screen image view
│   │   │   ├── VideoAssetDetailPage.tsx # Full-screen video view
│   │   │   ├── SettingsPage.tsx     # App configuration
│   │   │   └── RequestLogsPage.tsx  # Request log viewer
│   │   ├── main.tsx                 # React entry, routing
│   │   └── index.css                # Global styles + Tailwind
│   ├── vite.config.ts               # Dev server proxy configuration
│   ├── tailwind.config.js
│   └── package.json
│
├── data/                            # Persisted state (gitignored)
│   ├── sessions.json                # Image sessions
│   ├── video-sessions.json          # Video sessions
│   ├── bulk-sessions.json           # Bulk operation sessions
│   ├── request-logs.json            # API request history
│   ├── settings.json                # App settings
│   ├── providers.json               # Remote provider API keys
│   └── civitai-downloads.json       # Civitai download history
│
├── outputs/                         # Generated media (gitignored)
│   ├── {uuid}.png                   # Generated images
│   ├── {uuid}.mp4                   # Generated videos
│   ├── {uuid}.json                  # Per-asset metadata
│   └── {job_id}_source_{N}.png      # I2I/I2V source images
│
└── docs/
    ├── HOLLYWOOL_VS_HOLLYWAOW.md
    ├── CIVITAI_INTEGRATION.md
    └── CIVITAI_ANALYSIS.md
```

## Frontend Routes

| Path | Component | Description |
|------|-----------|-------------|
| `/image` | `ImagePage` | Image generation with model/LoRA selection |
| `/video` | `VideoPage` | Video generation (T2V + I2V tabs) |
| `/bulk` | `BulkOperationPage` | Bulk generation with AI prompt variations |
| `/assets` | `AssetsPage` | Unified media gallery |
| `/queue` | `QueuePage` | Active job queue |
| `/models` | `ModelsPage` | Model browser + Civitai integration |
| `/model/:id` | `ModelDetailPage` | Local model details |
| `/models/civitai/:id` | `CivitaiModelDetailPage` | Civitai model details + download |
| `/provider/:id` | `ProviderDetailPage` | Remote provider configuration |
| `/job/:id` | `JobDetailPage` | Job progress details |
| `/asset/:id` | `AssetDetailPage` | Full-screen image view (no header) |
| `/asset/video/:id` | `VideoAssetDetailPage` | Full-screen video view (no header) |
| `/logs` | `RequestLogsPage` | Request history viewer |
| `/settings` | `SettingsPage` | App configuration |

## API Endpoints

### Health & System

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | GPU status and currently loaded model |
| GET | `/api/system/status` | Real-time CPU, memory, GPU utilization |
| GET | `/api/system/can-generate/{model_id}` | Check if resources are sufficient |
| GET | `/api/settings/system` | System info (OS, GPU, Python, PyTorch) |

### Image Generation (T2I + I2I)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/generate` | Synchronous image generation |
| POST | `/api/jobs` | Create async job (supports `reference_images` for I2I) |
| GET | `/api/jobs` | List jobs (`?session_id=`, `?active_only=true`) |
| GET | `/api/jobs/{id}` | Get job status and progress |
| POST | `/api/generate-title` | Generate session title from prompt |
| GET | `/api/models/downloads` | Track model download progress |

### Video Generation (Text-to-Video)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/video/jobs` | Create T2V job (resource-checked) |
| GET | `/api/video/jobs` | List video jobs |
| GET | `/api/video/jobs/{id}` | Get video job status |

### Image-to-Video (I2V)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/i2v/jobs` | Create I2V job from reference images |
| GET | `/api/i2v/jobs` | List I2V jobs |
| GET | `/api/i2v/jobs/{id}` | Get I2V job status |

### Video Upscaling

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/upscale/models` | List available upscale models |
| POST | `/api/upscale/jobs` | Create video upscale job |
| GET | `/api/upscale/jobs` | List upscale jobs |
| GET | `/api/upscale/jobs/{id}` | Get upscale job status |

### Bulk Generation

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/bulk/variations` | Generate prompt variations using Claude |
| POST | `/api/bulk/jobs` | Create bulk image job (fal.ai backend) |
| GET | `/api/bulk/jobs` | List all bulk jobs |
| GET | `/api/bulk/jobs/{id}` | Get bulk job status |
| DELETE | `/api/bulk/jobs/{id}` | Cancel bulk job |

### Remote Providers

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/providers` | List all provider configurations |
| GET | `/api/providers/{id}` | Get single provider config |
| PUT | `/api/providers/{id}` | Update API key/URL/status |
| DELETE | `/api/providers/{id}` | Remove provider config |
| POST | `/api/providers/{id}/test` | Test connection |
| POST | `/api/providers/{id}/discover` | Discover available models |

### Civitai

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/civitai/models` | Search Civitai models |
| GET | `/api/civitai/models/{id}` | Get model details |
| POST | `/api/civitai/downloads` | Start model download |
| GET | `/api/civitai/downloads` | List all downloads |
| GET | `/api/civitai/downloads/{id}` | Get download status |
| DELETE | `/api/civitai/downloads/{id}` | Cancel download |
| GET | `/api/civitai/downloaded-versions` | List downloaded version IDs |

### Models & Cache

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/models` | List available models |
| GET | `/api/models/detailed` | Models with cache sizes, timestamps |
| GET | `/api/models/cache-status` | Overall cache statistics |
| POST | `/api/models/{id}/download` | Pre-download model |
| DELETE | `/api/models/{id}/cache` | Delete model from cache |

### LoRAs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/loras` | List LoRAs (`?model_type=` to filter) |
| POST | `/api/loras/scan` | Rescan local LoRA directory |

### Assets

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/assets` | List images (`?limit=`, `?offset=`, `?model=`) |
| GET | `/api/assets/{id}` | Get image metadata |
| DELETE | `/api/assets/{id}` | Delete image |
| GET | `/api/video-assets` | List videos |
| GET | `/api/video-assets/{id}` | Get video metadata |
| DELETE | `/api/video-assets/{id}` | Delete video |

### Sessions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sessions` | Get all image sessions |
| POST | `/api/sessions` | Save image sessions |
| GET | `/api/video-sessions` | Get all video sessions |
| POST | `/api/video-sessions` | Save video sessions |
| GET | `/api/bulk-sessions` | Get all bulk sessions |
| POST | `/api/bulk-sessions` | Save bulk sessions |

### Settings & Logs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/settings` | Get app settings |
| POST | `/api/settings` | Update settings (includes Civitai API key) |
| GET | `/api/settings/logs` | Request logs with pagination/filtering |
| DELETE | `/api/settings/logs` | Clear all logs |
| DELETE | `/api/settings/logs/{id}` | Delete specific log |

## Models

### Image Models

#### Fast (1–4 steps)

| Model | Architecture | Size | Steps | Description |
|-------|-------------|------|-------|-------------|
| SD Turbo | SD | 3.5 GB | 1 | Ultra-fast 1-step generation |
| SDXL Turbo | SD | 6.9 GB | 1 | Fast 1-step SDXL |
| SDXL Lightning | SDXL | 6.5 GB | 4 | ByteDance's distilled SDXL |
| FLUX.1 Schnell | FLUX | 23 GB | 4 | Fast FLUX, excellent text generation |

#### Quality (20–50 steps)

| Model | Architecture | Size | Steps | Description |
|-------|-------------|------|-------|-------------|
| FLUX.1 Dev | FLUX | 23 GB | 28 | Best-in-class prompt following (requires HF approval) |
| SD3 Medium | SD3 | 7 GB | 28 | Excellent text rendering (requires HF approval) |
| SDXL Base | SDXL | 6.9 GB | 30 | Solid all-around performer |
| Playground v2.5 | SDXL | 6.9 GB | 30 | Aesthetic-focused, artistic images |

#### Specialized

| Model | Architecture | Size | Steps | Description |
|-------|-------------|------|-------|-------------|
| RealVisXL | SDXL | 6.9 GB | 25 | Photorealistic, portraits |
| DreamShaper XL | SDXL | 6.5 GB | 6 | Fast artistic, fantasy content |
| Animagine XL 3.1 | SDXL | 7 GB | 28 | Anime/manga style |
| Juggernaut XL | SDXL | 6.9 GB | 30 | Versatile high-quality |

### Video Models

#### Text-to-Video

| Model | Size | Memory | Output | Description |
|-------|------|--------|--------|-------------|
| CogVideoX-5B | 12 GB | — | 6s @ 8 fps, 720p | High-quality T2V |
| CogVideoX-2B | 6 GB | — | 6s @ 8 fps, 720p | Lighter alternative |
| LTX-2 | 40 GB | — | 5s @ 24 fps + audio | Video with synchronized audio |
| LTX-2 (FP8) | 25 GB | — | 5s @ 24 fps + audio | FP8 quantized |
| Wan2.2 T2V | 126 GB | 55 GB | 5s @ 16 fps | MoE architecture |
| Mochi 1 | 22 GB | — | 3s @ 30 fps | 10B parameters, smooth motion |

#### Image-to-Video

| Model | Size | Memory | Output | Description |
|-------|------|--------|--------|-------------|
| CogVideoX-5B I2V | 12 GB | — | 6s @ 8 fps | Animate still images |
| Wan2.2 I2V | 126 GB | 55 GB | 5s @ 16 fps | MoE architecture |
| Stable Video Diffusion XT | 9 GB | — | 3.5s @ 7 fps | Smooth motion |

### Upscale Models

| Model | Scale | Size | Description |
|-------|-------|------|-------------|
| Real-ESRGAN 4x Plus | 4x | 65 MB | General purpose |
| Real-ESRGAN 2x Plus | 2x | 65 MB | Subtle upscaling |
| Real-ESRGAN Anime 4x | 4x | 18 MB | Anime-optimized |
| Real-ESRGAN Video 4x | 4x | 18 MB | Temporal consistency |

### LoRA Presets

| LoRA | Compatible | Default Weight | Description |
|------|-----------|----------------|-------------|
| FLUX Realism | FLUX | 0.8 | Enhances photorealism |
| Detail Tweaker XL | SDXL | 0.7 | Adds fine detail |

Custom LoRAs can be placed in `~/.hollywool/loras/` and discovered via the scan endpoint.

## Job System

All generation is processed through an async job queue:

```
queued → downloading → loading_model → generating → saving → completed
                                                       |
                                                     failed
```

Each stage reports progress:
- **downloading**: total size (MB), speed (MB/s), percentage
- **generating**: per-image progress for batches, per-frame for video
- **ETA estimation** across all stages

Failed jobs retain error messages and can be dismissed in the UI.

### Resource Checking

Before accepting video jobs, the system verifies available GPU memory:
- Model size + 5 GB overhead + 10 GB buffer must fit in VRAM
- Returns HTTP 507 with resource details if insufficient
- Recommends compatible models based on available memory

## Development

### Prerequisites
- Python 3.11+
- Node.js 18+
- NVIDIA GPU with CUDA support (CPU mode available but slow)

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8031 --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev      # Development server on port 8030
npm run build    # Production build
npm run lint     # ESLint
```

### Access

- **App**: http://spark.local:8030
- **API**: http://spark.local:8031
- **API Docs**: http://spark.local:8031/docs (Swagger UI)

The Vite dev server proxies `/api` and `/outputs` requests to the backend.

## Tech Stack

### Backend
- **FastAPI** — async web framework with OpenAPI docs
- **PyTorch 2.2+** — deep learning runtime
- **Diffusers 0.32+** — Hugging Face diffusion pipelines
- **Transformers 4.38+** — model architectures
- **Accelerate 0.27+** — distributed/optimized inference
- **Real-ESRGAN** — video upscaling
- **httpx** — async HTTP client for remote providers
- **Anthropic SDK** — Claude API for prompt variations
- **psutil + pynvml** — system resource monitoring
- **Pydantic 2.6+** — request/response validation

### Frontend
- **React 18** — UI framework
- **TypeScript 5.6** — type safety
- **Vite 6** — build tool and dev server
- **TanStack Query 5** — data fetching and cache
- **Tailwind CSS 3.4** — utility-first styling
- **shadcn/ui** (Radix UI) — accessible component primitives
- **Lucide React** — icon library
- **React Router 7** — client-side routing

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
    description: "Short description"
    tags: ["tag1", "tag2"]
    size_gb: 6.9
    requires_approval: false
```

For video models, also specify:

```yaml
    default_num_frames: 49
    default_fps: 8
    memory_gb: 55  # Optional: actual VRAM usage if different from size_gb
```

## Storage

```
~/.cache/huggingface/hub/          # HuggingFace model cache
~/.cache/hollywool/civitai/
├── checkpoints/                   # Downloaded Civitai checkpoints
└── loras/                         # Downloaded Civitai LoRAs
~/.hollywool/loras/                # Custom local LoRAs
```

## Roadmap

### Completed
- [x] Image generation with 12 models (FLUX, SDXL, SD, SD3)
- [x] Image-to-Image with multi-reference images
- [x] Text-to-video (CogVideoX, LTX-2, Wan2.2, Mochi)
- [x] Image-to-video (CogVideoX I2V, Wan2.2 I2V, SVD XT)
- [x] Video upscaling with Real-ESRGAN
- [x] LoRA support with weight control
- [x] Session management (image, video, bulk)
- [x] Async job queue with progress tracking
- [x] Model management with cache control
- [x] Unified assets gallery
- [x] System resource monitoring
- [x] Light/dark theme support
- [x] Request logging
- [x] Remote provider integration (KREA, fal.ai, Anthropic)
- [x] Civitai model browser and downloads
- [x] Bulk generation with Claude prompt variations
- [x] Cross-media job notifications

### Planned
- [ ] ControlNet integration
- [ ] IP-Adapter / multi-conditioning
- [ ] Image upscaling (currently video-only)
- [ ] Inpainting/outpainting
- [ ] TextualInversion/Embedding support
- [ ] Prompt templates
- [ ] Generation history search
- [ ] Export/import sessions
