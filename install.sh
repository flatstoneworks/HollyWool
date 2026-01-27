#!/usr/bin/env bash
# HollyWool installer — sets up backend (Python venv + deps) and frontend (npm).
# Automatically detects GPU and installs the correct PyTorch variant.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
VENV_DIR="$BACKEND_DIR/venv"
PYTHON="${PYTHON:-python3}"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
info()  { printf "\033[1;34m==>\033[0m %s\n" "$*"; }
warn()  { printf "\033[1;33m==> WARNING:\033[0m %s\n" "$*"; }
error() { printf "\033[1;31m==> ERROR:\033[0m %s\n" "$*"; exit 1; }

# ---------------------------------------------------------------------------
# Detect GPU / CUDA
# ---------------------------------------------------------------------------
detect_gpu() {
    CUDA_VERSION=""
    GPU_NAME=""
    HAS_GPU=false

    if command -v nvidia-smi &>/dev/null; then
        GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1 || true)
        # Extract CUDA version from nvidia-smi header (e.g. "CUDA Version: 13.0")
        CUDA_VERSION=$(nvidia-smi 2>/dev/null | grep -oP 'CUDA Version:\s*\K[\d.]+' || true)
        if [ -n "$GPU_NAME" ]; then
            HAS_GPU=true
        fi
    fi
}

# Map detected CUDA driver version to the best PyTorch CUDA index.
# PyTorch publishes wheels for specific CUDA toolkit versions; the driver
# is backward-compatible so we pick the highest supported toolkit.
get_torch_cuda_index() {
    local major minor
    if [ -z "$CUDA_VERSION" ]; then
        echo ""
        return
    fi

    major=$(echo "$CUDA_VERSION" | cut -d. -f1)
    minor=$(echo "$CUDA_VERSION" | cut -d. -f2)

    # PyTorch 2.10 ships cu118, cu124, cu126, cu128 wheels.
    # Pick the highest one that fits the driver.
    if [ "$major" -ge 13 ] || { [ "$major" -eq 12 ] && [ "$minor" -ge 8 ]; }; then
        echo "cu128"
    elif [ "$major" -eq 12 ] && [ "$minor" -ge 6 ]; then
        echo "cu126"
    elif [ "$major" -eq 12 ] && [ "$minor" -ge 4 ]; then
        echo "cu124"
    elif [ "$major" -eq 12 ] || { [ "$major" -eq 11 ] && [ "$minor" -ge 8 ]; }; then
        echo "cu118"
    else
        echo ""
    fi
}

# ---------------------------------------------------------------------------
# Backend setup
# ---------------------------------------------------------------------------
setup_backend() {
    info "Setting up backend"

    # Create virtual environment if needed
    if [ ! -d "$VENV_DIR" ]; then
        info "Creating virtual environment"
        "$PYTHON" -m venv "$VENV_DIR"
    fi

    local PIP="$VENV_DIR/bin/pip"
    "$PIP" install --upgrade pip --quiet

    # Detect GPU and choose the right torch
    detect_gpu

    if $HAS_GPU; then
        local cuda_tag
        cuda_tag=$(get_torch_cuda_index)
        if [ -n "$cuda_tag" ]; then
            info "GPU detected: $GPU_NAME (CUDA $CUDA_VERSION) — installing PyTorch with $cuda_tag"
            "$PIP" install torch torchvision \
                --index-url "https://download.pytorch.org/whl/$cuda_tag" \
                --quiet
        else
            warn "GPU detected ($GPU_NAME) but CUDA $CUDA_VERSION is too old for prebuilt PyTorch wheels"
            warn "Installing CPU-only PyTorch — GPU acceleration will NOT be available"
            "$PIP" install torch torchvision --quiet
        fi
    else
        info "No NVIDIA GPU detected — installing CPU-only PyTorch"
        "$PIP" install torch torchvision --quiet
    fi

    # Install remaining requirements (torch is already handled above)
    info "Installing Python dependencies"
    "$PIP" install -r "$BACKEND_DIR/requirements.txt" --quiet

    # Verify
    info "Verifying PyTorch installation"
    local torch_info
    torch_info=$("$VENV_DIR/bin/python3" -c "
import torch, warnings; warnings.filterwarnings('ignore')
cuda = torch.cuda.is_available()
ver = torch.__version__
if cuda:
    name = torch.cuda.get_device_name(0)
    print(f'PyTorch {ver} — CUDA enabled ({name})')
else:
    # Check if GPU exists but torch is CPU-only
    try:
        import pynvml
        pynvml.nvmlInit()
        count = pynvml.nvmlDeviceGetCount()
        pynvml.nvmlShutdown()
        if count > 0:
            print(f'PyTorch {ver} — WARNING: GPU present but torch is CPU-only')
        else:
            print(f'PyTorch {ver} — CPU mode')
    except Exception:
        print(f'PyTorch {ver} — CPU mode')
" 2>&1)
    info "$torch_info"
}

# ---------------------------------------------------------------------------
# Frontend setup
# ---------------------------------------------------------------------------
setup_frontend() {
    info "Setting up frontend"

    if ! command -v node &>/dev/null; then
        warn "Node.js not found — skipping frontend setup"
        warn "Install Node.js 18+ and re-run this script"
        return
    fi

    cd "$FRONTEND_DIR"
    info "Installing npm dependencies"
    npm install --silent 2>/dev/null

    info "Building frontend"
    npm run build --silent 2>/dev/null
    cd "$ROOT_DIR"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
    printf "\n"
    info "HollyWool Installer"
    printf "    Root:     %s\n" "$ROOT_DIR"
    printf "    Python:   %s\n" "$($PYTHON --version 2>&1)"
    printf "\n"

    setup_backend
    printf "\n"
    setup_frontend

    printf "\n"
    info "Installation complete!"
    printf "\n"
    printf "    Start the backend:   cd backend && source venv/bin/activate && uvicorn app.main:app --host 0.0.0.0 --port 8031\n"
    printf "    Start the frontend:  cd frontend && npm run dev\n"
    printf "    Open the app:        http://localhost:8030\n"
    printf "\n"
}

main "$@"
