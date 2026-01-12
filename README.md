# HollyWool

A local AI image and video generation tool inspired by KREA. Generate high-quality images using state-of-the-art diffusion models running locally on your GPU.

## Features

### Image Generation
- **Multiple Models**: Support for FLUX, SDXL, SD3, and Stable Diffusion models
- **Session Management**: Organize generations into sessions with auto-naming based on prompts
- **Batch Generation**: Generate 1-4 images per prompt with different seeds
- **Job Queue**: Background job processing with real-time progress updates
- **Style Presets**: Quick style application (Cinematic, Anime, Photography, etc.)
- **Aspect Ratios**: Common ratios with visual selector (1:1, 16:9, 9:16, 4:3, etc.)
- **Advanced Controls**: Steps, guidance scale, negative prompts, seed control

### Video Generation (Coming Soon)
- **Dedicated Video Page**: Separate from image generation
- **Video Models**: CogVideoX, Wan2.1, LTX-Video, Mochi support planned
- **Start/End Frames**: Upload reference frames for video generation
- **Separate Sessions**: Video sessions are independent from image sessions

### Model Management
- **Models Page**: View all available models with detailed information
- **Cache Detection**: Uses HuggingFace's `scan_cache_dir()` for accurate cache info
- **Actual vs Estimated Size**: Shows real disk usage, not just estimates
- **Last Accessed**: Track when models were last used
- **Cache Cleanup**: Delete individual model caches to free disk space
- **Approval Badges**: Indicates models requiring HuggingFace approval

### Gallery
- **Asset Browser**: View all generated images
- **Batch Grouping**: Images grouped by generation batch
- **Metadata Display**: See prompts, settings, and seeds for each image
- **Delete Support**: Remove unwanted generations

## Architecture

```
HollyWool/
├── backend/                 # FastAPI backend
│   ├── app/
│   │   ├── main.py         # FastAPI app entry point
│   │   ├── models/
│   │   │   └── schemas.py  # Pydantic models
│   │   ├── routers/
│   │   │   ├── generate.py # Generation & model endpoints
│   │   │   └── assets.py   # Asset management endpoints
│   │   └── services/
│   │       ├── inference.py # Model loading & generation
│   │       └── jobs.py     # Background job management
│   ├── config.yaml         # Model configurations
│   └── outputs/            # Generated images
│
├── frontend/               # React + Vite frontend
│   ├── src/
│   │   ├── api/
│   │   │   └── client.ts   # API client & types
│   │   ├── components/
│   │   │   └── Layout.tsx  # Main layout with navigation
│   │   ├── lib/
│   │   │   ├── sessions.ts       # Image session management
│   │   │   ├── video-sessions.ts # Video session management
│   │   │   └── utils.ts
│   │   └── pages/
│   │       ├── ImagePage.tsx   # Image generation
│   │       ├── VideoPage.tsx   # Video generation
│   │       ├── GalleryPage.tsx # Asset gallery
│   │       └── ModelsPage.tsx  # Model management
│   └── index.html
│
└── README.md
```

## API Endpoints

### Health & Models
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check, GPU status |
| `/api/models` | GET | List available models (basic) |
| `/api/models/detailed` | GET | Models with cache info, sizes, timestamps |
| `/api/models/cache-status` | GET | Overall cache statistics |
| `/api/models/{id}/cache` | DELETE | Delete model from cache |

### Generation
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/generate` | POST | Synchronous generation |
| `/api/jobs` | POST | Create async generation job |
| `/api/jobs` | GET | List jobs (filter by session, active) |
| `/api/jobs/{id}` | GET | Get job status and progress |
| `/api/generate-title` | POST | Generate session title from prompt |

### Assets & Sessions
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/assets` | GET | List all assets |
| `/api/assets/{id}` | GET | Get asset metadata |
| `/api/assets/{id}` | DELETE | Delete asset |
| `/api/sessions` | GET | Get all sessions |
| `/api/sessions` | POST | Save sessions |

## Models

### Image Models (Configured)

#### Fast Models (1-4 steps)
| Model | Type | Size | Steps | Description |
|-------|------|------|-------|-------------|
| SD Turbo | SD | 3.5GB | 1 | Ultra-fast 1-step generation |
| SDXL Turbo | SD | 6.9GB | 1 | Fast 1-step SDXL |
| SDXL Lightning | SDXL | 6.5GB | 4 | ByteDance's 4-step distilled SDXL |
| FLUX.1 Schnell | FLUX | 23GB | 4 | Fast FLUX, excellent text generation |

#### Quality Models (20-50 steps)
| Model | Type | Size | Steps | Description |
|-------|------|------|-------|-------------|
| FLUX.1 Dev | FLUX | 23GB | 28 | Best-in-class prompt following (requires approval) |
| SD3 Medium | SD3 | 7GB | 28 | Excellent text rendering (requires approval) |
| SDXL Base | SDXL | 6.9GB | 30 | Solid all-around performer |
| Playground v2.5 | SDXL | 6.9GB | 30 | Aesthetic-focused, artistic images |

#### Specialized Models
| Model | Type | Size | Steps | Description |
|-------|------|------|-------|-------------|
| RealVisXL | SDXL | 6.9GB | 25 | Photorealistic, portraits |
| DreamShaper XL | SDXL | 6.5GB | 6 | Fast artistic, fantasy content |
| Animagine XL 3.1 | SDXL | 7GB | 28 | Anime/manga style |
| Juggernaut XL | SDXL | 6.9GB | 30 | Versatile high-quality model |

### Video Models (Planned)

| Model | Description | Max Duration |
|-------|-------------|--------------|
| CogVideoX-5B | High-quality video generation | 6s |
| CogVideoX-2B | Faster, lighter | 6s |
| Wan2.1 T2V | Text-to-video, cinematic | 5s |
| Wan2.1 I2V | Image-to-video animation | 5s |
| LTX-Video | Fast video generation | 5s |
| Mochi 1 | Genmo's open video model | 5s |

## Session Management

### Image Sessions
- Stored via backend API at `/api/sessions`
- Auto-named from first prompt using title generation
- Tracks batch IDs and thumbnails
- Draft prompts saved per session in localStorage

### Video Sessions
- Stored locally in `localStorage`
- Keys: `hollywool_video_sessions`, `hollywool_video_current_session`
- Completely separate from image sessions

## Job System

The job system handles async generation with progress tracking:

### Job Statuses
1. `queued` - Waiting in queue
2. `downloading` - Model being downloaded
3. `loading_model` - Model loading to GPU
4. `generating` - Image generation in progress
5. `saving` - Saving output to disk
6. `completed` - Generation complete
7. `failed` - Error occurred

### Progress Tracking
- Download progress with size and speed
- Per-image progress for batch generation
- ETA estimation
- Visual step indicator in UI

## Frontend Features

### Image Page
- Resizable session sidebar
- Session list with thumbnails
- Prompt drafts linked to sessions (persisted in localStorage)
- Model selector with category badges
- Style presets with visual selector
- Aspect ratio visual picker
- Generation progress cards with step indicators
- Generated images displayed in batches

### Models Page
- Category filters (Fast, Quality, Specialized)
- Status filters (All, Downloaded, Not Downloaded)
- Total cache size display
- Model cards with:
  - Actual vs estimated size
  - Last accessed timestamp
  - Delete cache button
  - Approval status badges
  - Expandable details

### Video Page
- Separate session management
- Start/end frame upload
- Video model selector
- Style presets
- Resolution selector (filters by model support)
- Aspect ratio selector
- "Coming Soon" toast on generate

## Development

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Access
- Frontend: http://spark.local:5173
- Backend API: http://spark.local:8000
- API Docs: http://spark.local:8000/docs

## Technology Stack

### Backend
- **FastAPI** - Web framework
- **PyTorch** - Deep learning
- **Diffusers** - Diffusion model pipelines
- **HuggingFace Hub** - Model downloading and caching
- **Pydantic** - Data validation

### Frontend
- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **TanStack Query** - Data fetching
- **Tailwind CSS** - Styling
- **Lucide Icons** - Icon library

## Cache Management

HollyWool uses HuggingFace's cache system:
- Default location: `~/.cache/huggingface/hub/`
- Uses `scan_cache_dir()` for accurate cache inspection
- Supports `delete_revisions()` for cache cleanup
- Shows actual disk usage vs config estimates

## Roadmap

- [ ] Video generation backend integration
- [ ] LoRA support
- [ ] ControlNet integration
- [ ] Image upscaling
- [ ] Inpainting/outpainting
- [ ] Prompt templates
- [ ] Generation history search
- [ ] Export/import sessions
