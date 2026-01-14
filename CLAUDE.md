# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

HollyWool is a local AI image generation tool designed for the NVIDIA DGX Spark. It provides a simplified KREA-like experience for generating images using diffusion models, without requiring authentication or cloud services.

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
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
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
│   │   │   └── inference.py   # Model loading & generation (diffusers)
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
│   │   │   ├── GeneratePage.tsx  # Model selection, prompt input, preview
│   │   │   └── GalleryPage.tsx   # Image grid with lightbox viewer
│   │   └── main.tsx           # React entry, routes, QueryClient
│   └── vite.config.ts         # Dev server proxy configuration
│
└── outputs/                    # Generated images + JSON metadata
```

## Key Files

- **backend/config.yaml** - Define available models with paths, types, and default parameters
- **backend/app/services/inference.py** - Model loading/switching logic, supports FLUX, SDXL, SD pipelines
- **frontend/src/api/client.ts** - Typed API client matching backend schemas

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/health | GPU status and loaded model |
| GET | /api/models | List available models |
| POST | /api/generate | Generate image from prompt |
| GET | /api/assets | List generated images |
| GET | /api/assets/{id} | Get asset metadata |
| DELETE | /api/assets/{id} | Delete asset |

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
