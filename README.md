# HollyWool

A local AI image and video generation studio designed for the NVIDIA DGX Spark.
Generate high-quality images and videos using state-of-the-art diffusion models running entirely on your GPU -- no cloud services, no API keys, no external dependencies.

## Features

### Image Generation
- **12 models** across FLUX, SDXL, SD3, and Stable Diffusion architectures
- **Image-to-Image (I2I)**: upload up to 5 reference images, adjust denoising strength (0.1--1.0), generate guided variations using `AutoPipelineForImage2Image` with zero-cost pipeline conversion
- **Session management** with auto-naming from prompts and persistent storage
- **Batch generation** of 1--4 images per prompt with per-image seed control
- **Async job queue** with real-time progress (download, load, generate, save stages)
- **Aspect ratios** with visual selector (1:1, 16:9, 9:16, 4:3, etc.)
- **Advanced controls**: steps, guidance scale, negative prompts, seed
- **LoRA support**: apply Low-Rank Adaptations with per-LoRA weight control (0.0--1.5), from HuggingFace presets or a local directory

### Video Generation
- **Text-to-video**: CogVideoX-5B, CogVideoX-2B, LTX-2 (with synchronized audio), LTX-2 FP8
- **Image-to-video**: CogVideoX-5B I2V, Stable Video Diffusion XT -- animate any generated image
- **Multi-reference images**: I2V accepts a `reference_images` array (up to 5), with backward-compatible support for legacy single-image fields
- **Video upscaling**: Real-ESRGAN 2x/4x with specialized models for anime and video content
- **Session management** separate from image sessions, persisted server-side
- **Resource checks**: system memory and GPU utilization are verified before accepting video jobs

### Model Management
- **Model browser** with categories (fast, quality, specialized, video), tags, and descriptions
- **Model detail pages** with cache info, generation defaults, and HuggingFace approval status
- **Cache detection** via HuggingFace `scan_cache_dir()` showing actual vs estimated disk usage
- **Pre-download** models to cache without loading into GPU memory
- **Cache cleanup** to delete individual models and free disk space

### Assets Gallery
- **Unified gallery** with All / Images / Videos tabs
- **Filter by model**, search by prompt
- **Detail views** for images and videos with full metadata (prompt, model, seed, dimensions, duration, FPS)
- **Delete** unwanted generations
- **Hover previews** for videos in the grid view

### System & Settings
- **System info header** showing device type (Spark/Mac/PC), compute mode (GPU/CPU), with hover cards for hostname, OS, Python version, GPU name, VRAM, PyTorch version
- **Active job notifications** with cross-media tracking (images, videos, I2V, upscale)
- **Light/dark/system theme** with localStorage persistence
- **Request logging** with pagination, type and status filters, and per-log deletion
- **App settings**: default models, theme preference, history auto-save, max log entries

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
│   │   │   └── schemas.py          # Pydantic models (image, video, I2V, upscale, LoRA, system)
│   │   ├── routers/
│   │   │   ├── generate.py         # Generation, jobs, models, LoRA, I2V, upscale, system endpoints
│   │   │   ├── assets.py           # Image/video assets, sessions (image + video)
│   │   │   ├── providers.py        # Provider router (stub)
│   │   │   └── settings.py         # App settings, request logs, system info
│   │   └── services/
│   │       ├── inference.py         # Model loading, switching, and generation (diffusers)
│   │       ├── jobs.py              # Image generation job queue
│   │       ├── video_jobs.py        # Text-to-video job queue
│   │       ├── i2v_jobs.py          # Image-to-video job queue
│   │       ├── upscale_jobs.py      # Video upscaling job queue
│   │       ├── upscaler.py          # Real-ESRGAN upscaling service
│   │       ├── lora_manager.py      # LoRA discovery, loading, and application
│   │       └── resources.py         # GPU/CPU/memory monitoring
│   ├── config.yaml                  # Model definitions, LoRA presets, server settings
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   └── client.ts           # Typed API client (all endpoints)
│   │   ├── components/
│   │   │   ├── Layout.tsx           # App shell (NavSidebar + ContentHeader + Outlet)
│   │   │   ├── NavSidebar.tsx       # Icon navigation (Image, Video, Gallery, Models, Logs, Settings)
│   │   │   ├── ContentHeader.tsx    # Header with app name, system info hover cards, notifications
│   │   │   ├── NotificationsButton.tsx  # Active job tracker across all media types
│   │   │   ├── UserSettingsButton.tsx   # Settings dropdown
│   │   │   └── ui/                  # shadcn/ui primitives (button, card, input, select, slider, etc.)
│   │   ├── contexts/
│   │   │   └── ThemeContext.tsx      # Light/dark/system theme provider
│   │   ├── lib/
│   │   │   ├── sessions.ts          # Image session helpers
│   │   │   ├── video-sessions.ts    # Video session helpers
│   │   │   └── utils.ts             # clsx + tailwind-merge utility
│   │   ├── pages/
│   │   │   ├── ImagePage.tsx        # Image generation (model/LoRA selection, controls, results)
│   │   │   ├── VideoPage.tsx        # Video generation (T2V + I2V tabs)
│   │   │   ├── AssetsPage.tsx       # Unified gallery (All / Images / Videos)
│   │   │   ├── ModelsPage.tsx       # Model browser with cache management
│   │   │   ├── ModelDetailPage.tsx  # Individual model detail and download
│   │   │   ├── AssetDetailPage.tsx  # Full-screen image detail with metadata
│   │   │   ├── VideoAssetDetailPage.tsx # Full-screen video detail with metadata
│   │   │   ├── JobDetailPage.tsx    # Job status and progress detail
│   │   │   ├── SettingsPage.tsx     # App settings (theme, defaults, history)
│   │   │   └── RequestLogsPage.tsx  # Request log viewer with filters
│   │   ├── types/
│   │   │   └── providers.ts         # Provider type definitions
│   │   ├── main.tsx                 # React entry, routing, QueryClient
│   │   └── index.css                # Global styles + Tailwind
│   ├── vite.config.ts               # Dev server (port 8030), proxy to backend (8031)
│   ├── tailwind.config.js
│   └── package.json
│
├── data/                            # Persisted state (gitignored)
│   ├── sessions.json                # Image sessions
│   ├── video-sessions.json          # Video sessions
│   ├── request-logs.json            # API request history
│   └── settings.json                # App settings
│
├── outputs/                         # Generated media (gitignored)
│   ├── {uuid}.png                   # Generated images
│   ├── {uuid}.mp4                   # Generated videos
│   ├── {uuid}.json                  # Per-asset metadata
│   └── {job_id}_source_{N}.png      # I2I/I2V source images (persisted for restart recovery)
│
├── docs/
│   ├── HOLLYWOOL_VS_HOLLYWAOW.md    # Architecture comparison with HollyWaow
│   ├── CIVITAI_INTEGRATION.md       # Civitai integration plan
│   └── CIVITAI_ANALYSIS.md          # Deep dive into Civitai as a model source
│
├── CLAUDE.md                        # Claude Code development guidelines
├── .gitignore
└── README.md
```

## Frontend Routes

| Path | Component | Description |
|------|-----------|-------------|
| `/image` | `ImagePage` | Image generation with model/LoRA selection |
| `/video` | `VideoPage` | Video generation (T2V + I2V) |
| `/assets` | `AssetsPage` | Unified media gallery |
| `/models` | `ModelsPage` | Model browser and cache management |
| `/model/:id` | `ModelDetailPage` | Individual model details |
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
| GET | `/api/system/status` | Real-time CPU, memory, and GPU utilization |
| GET | `/api/system/can-generate/{model_id}` | Check if resources are sufficient for a model |

### Image Generation (T2I + I2I)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/generate` | Synchronous image generation |
| POST | `/api/jobs` | Create async image generation job (supports `reference_images` for I2I) |
| GET | `/api/jobs` | List image jobs (`?session_id=`, `?active_only=true`) |
| GET | `/api/jobs/{id}` | Get image job status and progress |
| POST | `/api/generate-title` | Generate a session title from a prompt |

### Video Generation (Text-to-Video)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/video/jobs` | Create T2V job (resource-checked) |
| GET | `/api/video/jobs` | List video jobs (`?session_id=`, `?active_only=true`) |
| GET | `/api/video/jobs/{id}` | Get video job status and progress |

### Image-to-Video (I2V)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/i2v/jobs` | Create I2V job from `reference_images` array, base64, or asset ID |
| GET | `/api/i2v/jobs` | List I2V jobs |
| GET | `/api/i2v/jobs/{id}` | Get I2V job status |

### Video Upscaling

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/upscale/models` | List available upscale models |
| POST | `/api/upscale/jobs` | Create video upscale job |
| GET | `/api/upscale/jobs` | List upscale jobs |
| GET | `/api/upscale/jobs/{id}` | Get upscale job status |

### Models & Cache

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/models` | List available models (basic info) |
| GET | `/api/models/detailed` | Models with cache sizes, timestamps, approval status |
| GET | `/api/models/cache-status` | Overall cache statistics |
| POST | `/api/models/{id}/download` | Pre-download model to HuggingFace cache |
| DELETE | `/api/models/{id}/cache` | Delete model from cache |

### LoRAs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/loras` | List LoRAs (`?model_type=` to filter by compatibility) |
| POST | `/api/loras/scan` | Rescan local LoRA directory |

### Assets

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/assets` | List image assets (`?limit=`, `?offset=`, `?model=`) |
| GET | `/api/assets/{id}` | Get image asset metadata |
| DELETE | `/api/assets/{id}` | Delete image asset |
| GET | `/api/video-assets` | List video assets |
| GET | `/api/video-assets/{id}` | Get video asset metadata |
| DELETE | `/api/video-assets/{id}` | Delete video asset |

### Sessions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sessions` | Get all image sessions |
| POST | `/api/sessions` | Save image sessions |
| GET | `/api/video-sessions` | Get all video sessions |
| POST | `/api/video-sessions` | Save video sessions |

### Settings & Logs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/settings` | Get app settings |
| POST | `/api/settings` | Update app settings |
| GET | `/api/settings/logs` | Request logs (`?page=`, `?page_size=`, `?type=`, `?status=`) |
| GET | `/api/settings/logs/{id}` | Get specific log entry |
| DELETE | `/api/settings/logs` | Clear all logs |
| DELETE | `/api/settings/logs/{id}` | Delete specific log |
| GET | `/api/settings/system` | System info (OS, GPU, Python, PyTorch) |

## Models

### Image Models

#### Fast (1--4 steps)

| Model | Architecture | Size | Steps | Description |
|-------|-------------|------|-------|-------------|
| SD Turbo | SD | 3.5 GB | 1 | Ultra-fast 1-step generation |
| SDXL Turbo | SD | 6.9 GB | 1 | Fast 1-step SDXL |
| SDXL Lightning | SDXL | 6.5 GB | 4 | ByteDance's distilled SDXL |
| FLUX.1 Schnell | FLUX | 23 GB | 4 | Fast FLUX, excellent text generation |

#### Quality (20--50 steps)

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

| Model | Size | Output | Description |
|-------|------|--------|-------------|
| CogVideoX-5B | 12 GB | 6s @ 8 fps, 720p | High-quality T2V |
| CogVideoX-2B | 6 GB | 6s @ 8 fps, 720p | Lighter/faster alternative |
| LTX-2 | 40 GB | 5s @ 24 fps + audio | Video with synchronized audio |
| LTX-2 (FP8) | 25 GB | 5s @ 24 fps + audio | FP8 quantized for lower memory |

#### Image-to-Video

| Model | Size | Output | Description |
|-------|------|--------|-------------|
| CogVideoX-5B I2V | 12 GB | 6s @ 8 fps | Animate still images into video |
| Stable Video Diffusion XT | 9 GB | 3.5s @ 7 fps | Smooth motion from images |

### Upscale Models

| Model | Scale | Description |
|-------|-------|-------------|
| Real-ESRGAN 4x Plus | 4x | General purpose upscaling |
| Real-ESRGAN 2x Plus | 2x | Subtle upscaling |
| Real-ESRGAN Anime 4x | 4x | Optimized for anime content |
| Real-ESRGAN Video 4x | 4x | Temporal consistency for video |

### LoRA Presets

| LoRA | Compatible | Default Weight | Description |
|------|-----------|----------------|-------------|
| FLUX Realism | FLUX | 0.8 | Enhances photorealism |
| Detail Tweaker XL | SDXL | 0.7 | Adds fine detail |

Custom LoRAs can be placed in `~/.hollywool/loras/` and discovered via the scan endpoint.

## Job System

All generation is processed through an async job queue with the following status flow:

```
queued -> downloading -> loading_model -> generating -> saving -> completed
                                                          |
                                                        failed
```

Each stage reports progress:
- **downloading**: total size (MB), speed (MB/s), percentage
- **generating**: per-image progress for batch generation, per-frame progress for video
- **ETA estimation** across all stages

Failed jobs retain error messages and can be dismissed in the UI.

### Image-to-Image Jobs

When `reference_images` is provided in the generate request:
- Source images are saved to `outputs/{job_id}_source_{N}.png` for persistence across server restarts
- The first reference image is used as the I2I source (future-proofed for multi-conditioning)
- The `strength` parameter (0.0--1.0) controls how much the output deviates from the source: lower values stay closer to the reference, higher values allow more creative freedom
- I2I jobs use `AutoPipelineForImage2Image.from_pipe()` to convert the loaded T2I pipeline without reloading model weights
- Per-image metadata JSON includes `source_image_urls` and `strength` fields

## Session Management

### Image Sessions
- Stored server-side via `/api/sessions`, persisted to `data/sessions.json`
- Auto-named from the first prompt using a title extraction algorithm
- Track batch IDs and thumbnails
- Draft prompts saved per session in browser localStorage

### Video Sessions
- Stored server-side via `/api/video-sessions`, persisted to `data/video-sessions.json`
- Separate from image sessions

## Development

### Prerequisites
- Python 3.11+
- Node.js 18+
- NVIDIA GPU with CUDA support (for inference; CPU mode available but slow)

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

- **App**: http://spark.local:8030 (or http://localhost:8030)
- **API**: http://spark.local:8031
- **API Docs**: http://spark.local:8031/docs (Swagger UI)

The Vite dev server proxies `/api` and `/outputs` requests to the backend on port 8031.

## Tech Stack

### Backend
- **FastAPI** -- async web framework with auto-generated OpenAPI docs
- **PyTorch 2.2+** -- deep learning runtime
- **Diffusers 0.32+** -- Hugging Face diffusion pipelines (image, video, I2V)
- **Transformers 4.38+** -- model architectures
- **Accelerate 0.27+** -- distributed/optimized inference
- **Real-ESRGAN** -- video upscaling
- **psutil + pynvml** -- system resource monitoring
- **Pydantic 2.6+** -- request/response validation
- **OpenCV + imageio[ffmpeg]** -- video encoding
- **PyYAML** -- configuration

### Frontend
- **React 18** -- UI framework
- **TypeScript 5.6** -- type safety
- **Vite 6** -- build tool and dev server
- **TanStack Query 5** -- data fetching and cache
- **Tailwind CSS 3.4** -- utility-first styling
- **shadcn/ui** (Radix UI) -- accessible component primitives
- **Lucide React** -- icon library
- **React Router 7** -- client-side routing

## Adding Models

Edit `backend/config.yaml`:

```yaml
models:
  my-model:
    name: "Display Name"
    path: "huggingface/model-id"
    type: "flux" | "sdxl" | "sd" | "sd3" | "video" | "ltx2" | "video-i2v" | "svd"
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
```

## Cache Management

HollyWool uses HuggingFace's cache system at `~/.cache/huggingface/hub/`. The Models page shows actual disk usage via `scan_cache_dir()` and supports per-model cache deletion via `delete_revisions()`.

## Roadmap

### Completed
- [x] Image generation with 12 models (FLUX, SDXL, SD, SD3)
- [x] Image-to-Image generation with reference images and strength control
- [x] Multi-reference image support (up to 5 images) for I2I and I2V
- [x] Session management for images and videos
- [x] Async job queue with progress tracking
- [x] Model management with cache control and pre-download
- [x] Unified assets gallery (images + videos)
- [x] Text-to-video generation (CogVideoX, LTX-2)
- [x] Image-to-video generation (CogVideoX I2V, SVD XT)
- [x] Video upscaling with Real-ESRGAN
- [x] LoRA support with weight control
- [x] System resource monitoring
- [x] Light/dark theme support
- [x] Request logging
- [x] App settings persistence
- [x] System info header with hover cards
- [x] Cross-media notifications
- [x] Civitai integration -- browse and download community models

### Planned
- [ ] Additional video models (Wan2.1, Mochi)
- [ ] ControlNet integration
- [ ] IP-Adapter / multi-conditioning with reference images
- [ ] Image upscaling (currently video-only)
- [ ] Inpainting/outpainting
- [ ] TextualInversion/Embedding support
- [ ] Prompt templates
- [ ] Generation history search
- [ ] Export/import sessions
