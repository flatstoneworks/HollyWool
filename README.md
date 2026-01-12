# HollyWool

A local AI image and video generation tool inspired by the best online services.
Generate high-quality images and videos using state-of-the-art diffusion models running locally on your GPU.
This is meant to work optimally on the NVIDIA DGX Spark.

## Current Status

### Implemented
- **Image Generation** - Full workflow with multiple models, sessions, batch generation
- **Video Generation** - Text-to-video with CogVideoX models
- **Gallery** - Browse images and videos with filtering and lightbox view
- **Model Management** - View, download, and manage model cache
- **Notifications** - Real-time tracking of all active generations across media types
- **Session Management** - Separate sessions for images and videos

### Not Yet Implemented
- Audio generation (considering separate app)
- LoRA support
- ControlNet integration
- Image upscaling
- Inpainting/outpainting

## Features

### Image Generation
- **Multiple Models**: Support for FLUX, SDXL, SD3, and Stable Diffusion models
- **Session Management**: Organize generations into sessions with auto-naming based on prompts
- **Batch Generation**: Generate 1-4 images per prompt with different seeds
- **Job Queue**: Background job processing with real-time progress updates
- **Style Presets**: Quick style application (Cinematic, Anime, Photography, etc.)
- **Aspect Ratios**: Common ratios with visual selector (1:1, 16:9, 9:16, 4:3, etc.)
- **Advanced Controls**: Steps, guidance scale, negative prompts, seed control

### Video Generation
- **CogVideoX Models**: CogVideoX-5B and CogVideoX-2B for high-quality video generation
- **Text-to-Video**: Generate 6-second video clips from text prompts
- **Session Management**: Separate video sessions from image sessions
- **Job Queue**: Background processing with progress tracking
- **Style Presets**: Cinematic, Anime, Realistic styles
- **Aspect Ratios**: 16:9, 9:16, 1:1 support
- **Resolution**: 720p (1080p for some models)

### Model Management
- **Models Page**: View all available models with detailed information
- **Cache Detection**: Uses HuggingFace's `scan_cache_dir()` for accurate cache info
- **Actual vs Estimated Size**: Shows real disk usage, not just estimates
- **Last Accessed**: Track when models were last used
- **Cache Cleanup**: Delete individual model caches to free disk space
- **Approval Badges**: Indicates models requiring HuggingFace approval

### Gallery
- **Media Toggle**: Switch between Images and Videos tabs
- **Asset Browser**: View all generated content with hover previews
- **Model Filtering**: Filter by model in sidebar
- **Search**: Search by prompt or model name
- **Lightbox View**: Full-size viewing with metadata panel
- **Video Playback**: Hover-to-preview in grid, full controls in lightbox
- **Metadata Display**: See prompts, settings, seeds, duration, FPS for each asset
- **Delete Support**: Remove unwanted generations

### UI Features
- **Notifications Button**: Shows count of active generations across all media types
- **Click-to-Navigate**: Click notification items to jump to the relevant session
- **User Settings Button**: Placeholder for future settings (dark mode, storage, about)
- **Resizable Sidebars**: Drag to resize session sidebars
- **Failed Job Display**: Shows failed generations with error messages and dismiss option

## Architecture

```
HollyWool/
├── backend/                 # FastAPI backend
│   ├── app/
│   │   ├── main.py         # FastAPI app entry point
│   │   ├── models/
│   │   │   └── schemas.py  # Pydantic models (image, video, assets)
│   │   ├── routers/
│   │   │   ├── generate.py # Generation & model endpoints
│   │   │   └── assets.py   # Asset management endpoints
│   │   └── services/
│   │       ├── inference.py    # Model loading & generation
│   │       ├── jobs.py         # Image job management
│   │       └── video_jobs.py   # Video job management
│   ├── config.yaml         # Model configurations
│   ├── requirements.txt    # Python dependencies
│   └── venv/               # Virtual environment
│
├── frontend/               # React + Vite frontend
│   ├── src/
│   │   ├── api/
│   │   │   └── client.ts   # API client & types
│   │   ├── components/
│   │   │   ├── Layout.tsx           # Main layout with navigation
│   │   │   ├── NotificationsButton.tsx  # Active generations tracker
│   │   │   └── UserSettingsButton.tsx   # Settings dropdown
│   │   ├── lib/
│   │   │   ├── sessions.ts       # Image session management
│   │   │   ├── video-sessions.ts # Video session management
│   │   │   └── utils.ts
│   │   └── pages/
│   │       ├── ImagePage.tsx   # Image generation
│   │       ├── VideoPage.tsx   # Video generation
│   │       ├── GalleryPage.tsx # Asset gallery (images + videos)
│   │       └── ModelsPage.tsx  # Model management
│   └── index.html
│
├── data/                   # Persistent data
│   ├── jobs.json          # Image job history
│   ├── video_jobs.json    # Video job history
│   └── sessions.json      # Image sessions
│
├── outputs/               # Generated media
│   ├── {uuid}.png        # Generated images
│   ├── {uuid}.mp4        # Generated videos
│   └── {uuid}.json       # Metadata files
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

### Image Generation
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/generate` | POST | Synchronous generation |
| `/api/jobs` | POST | Create async generation job |
| `/api/jobs` | GET | List jobs (filter by session, active) |
| `/api/jobs/{id}` | GET | Get job status and progress |
| `/api/generate-title` | POST | Generate session title from prompt |

### Video Generation
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/video/jobs` | POST | Create video generation job |
| `/api/video/jobs` | GET | List video jobs (filter by session, active) |
| `/api/video/jobs/{id}` | GET | Get video job status and progress |

### Assets & Sessions
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/assets` | GET | List image assets |
| `/api/assets/{id}` | GET | Get image asset metadata |
| `/api/assets/{id}` | DELETE | Delete image asset |
| `/api/video-assets` | GET | List video assets |
| `/api/video-assets/{id}` | GET | Get video asset metadata |
| `/api/video-assets/{id}` | DELETE | Delete video asset |
| `/api/sessions` | GET | Get all image sessions |
| `/api/sessions` | POST | Save image sessions |

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

### Video Models (Implemented)

| Model | Description | Max Duration | Size |
|-------|-------------|--------------|------|
| CogVideoX-5B | High-quality video generation | 6s @ 8fps | ~12GB |
| CogVideoX-2B | Faster, lighter | 6s @ 8fps | ~6GB |

### Video Models (Planned)

| Model | Description | Max Duration |
|-------|-------------|--------------|
| Wan2.1 T2V | Text-to-video, cinematic (requires approval) | 5s |
| Wan2.1 I2V | Image-to-video animation (requires approval) | 5s |
| LTX-Video | Fast video generation | 5s |
| Mochi 1 | Genmo's open video model | 5s |

## Session Management

### Image Sessions
- Stored via backend API at `/api/sessions`
- Persisted to `data/sessions.json`
- Auto-named from first prompt using title generation
- Tracks batch IDs and thumbnails
- Draft prompts saved per session in localStorage

### Video Sessions
- Stored locally in `localStorage`
- Keys: `hollywool_video_sessions`, `hollywool_video_current_session`
- Completely separate from image sessions
- Jobs tracked in `data/video_jobs.json`

## Job System

The job system handles async generation with progress tracking:

### Job Statuses
1. `queued` - Waiting in queue
2. `downloading` - Model being downloaded
3. `loading_model` - Model loading to GPU
4. `generating` - Generation in progress
5. `saving` - Saving output to disk
6. `completed` - Generation complete
7. `failed` - Error occurred

### Progress Tracking
- Download progress with size and speed
- Per-image progress for batch generation (images)
- Frame progress for video generation
- ETA estimation
- Visual step indicator in UI

### Failed Job Handling
- Failed jobs displayed with error messages
- Dismissible error cards
- Error details preserved for debugging

## Development

### Backend
```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # or ./venv/bin/activate
pip install -r requirements.txt
./venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Build Frontend for Production
```bash
cd frontend
npm run build
```

### Access
- Frontend: http://spark.local:5173 (dev) or served by backend
- Backend API: http://spark.local:8000
- API Docs: http://spark.local:8000/docs

## Technology Stack

### Backend
- **FastAPI** - Web framework
- **PyTorch** - Deep learning
- **Diffusers** - Diffusion model pipelines (image, video)
- **HuggingFace Hub** - Model downloading and caching
- **Pydantic** - Data validation
- **OpenCV** - Video export
- **imageio** - Video/image I/O

### Frontend
- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **TanStack Query** - Data fetching
- **Tailwind CSS** - Styling
- **Lucide Icons** - Icon library

## Dependencies

### Backend (requirements.txt)
```
fastapi>=0.109.0
uvicorn[standard]>=0.27.0
python-multipart>=0.0.6
diffusers>=0.30.0
transformers>=4.38.0
accelerate>=0.27.0
torch>=2.2.0
safetensors>=0.4.0
pillow>=10.2.0
pydantic>=2.6.0
pydantic-settings>=2.1.0
pyyaml>=6.0.1
aiofiles>=23.2.1
imageio[ffmpeg]>=2.34.0
opencv-python>=4.9.0
```

## Cache Management

HollyWool uses HuggingFace's cache system:
- Default location: `~/.cache/huggingface/hub/`
- Uses `scan_cache_dir()` for accurate cache inspection
- Supports `delete_revisions()` for cache cleanup
- Shows actual disk usage vs config estimates

## Roadmap

### Completed
- [x] Image generation with multiple models
- [x] Session management for images
- [x] Job queue with progress tracking
- [x] Model management page with cache control
- [x] Gallery with image viewing
- [x] Video generation backend (CogVideoX)
- [x] Video session management
- [x] Gallery video support
- [x] Cross-media notifications
- [x] Failed job display

### Planned
- [ ] Additional video models (Wan2.1, LTX-Video, Mochi)
- [ ] Image-to-video generation
- [ ] LoRA support
- [ ] ControlNet integration
- [ ] Image upscaling
- [ ] Inpainting/outpainting
- [ ] Prompt templates
- [ ] Generation history search
- [ ] Export/import sessions

## Git History

```
8be66f5 Add video support to Gallery and fix video session tracking
fd967ab Add video generation backend and UI improvements
d90a782 Initial commit: HollyWool AI image generation tool
```
