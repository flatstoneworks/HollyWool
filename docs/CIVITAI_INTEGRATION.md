# Civitai Integration Guide for HollyWool

**Last Updated:** January 24, 2026

---

## What is Civitai?

Civitai is the **world's largest community repository** for AI art models, with over 100,000+ custom-trained Stable Diffusion models, LORAs, embeddings, and workflows. It's like GitHub for AI art - a place where creators share and discover custom models.

**Official Website:** https://civitai.com
**API Documentation:** https://github.com/civitai/civitai/wiki/REST-API-Reference

---

## Why Civitai is Perfect for HollyWool

HollyWool is a **local inference tool** that runs AI models directly on your GPU. Civitai is a **model repository** that provides downloadable models. This is a perfect match!

### Key Advantages

✅ **100,000+ Models** - Massive selection of specialized models
✅ **Community-Driven** - High-quality custom-trained models
✅ **Free Downloads** - No API costs, download once and use forever
✅ **Specialized Content** - Anime, photorealistic, artistic styles, characters
✅ **LORA Library** - 30,000+ style/character LORAs
✅ **Public API** - No authentication required to browse models
✅ **Local Ownership** - Download models and they're yours

### Use Cases

1. **Custom Checkpoints** - Download specialized SD models (anime, photorealistic, artistic)
2. **LoRA Collection** - Build a library of style and character LORAs
3. **Embeddings** - TextualInversion files for specific concepts
4. **Workflows** - ComfyUI workflows for advanced generation
5. **ControlNets** - Pose and composition control models

---

## Civitai vs HollyWaow

| Feature | HollyWool | HollyWaow |
|---------|-----------|-----------|
| **Architecture** | Local inference (runs on your GPU) | Cloud API (sends prompts to providers) |
| **Best Source** | **Civitai** ✅ | fal.ai, KREA ✅ |
| **Model Format** | Downloaded files (.safetensors) | API endpoints |
| **Cost Model** | Free after download (+ electricity) | Pay per generation |
| **Customization** | Full control, unlimited LORAs | Limited to provider's models |
| **Speed** | Depends on GPU | Depends on API queue |
| **Privacy** | 100% local, no data leaves machine | Data sent to cloud |

**Bottom Line:** HollyWool should absolutely integrate with Civitai. HollyWaow should stick with API providers.

---

## Model Categories on Civitai

### 1. Checkpoints (~50,000 models)

Full Stable Diffusion models trained on specific domains.

**Top Downloads:**
- **Realistic Vision V6.0 B1** - 2M+ downloads (photorealistic)
- **DreamShaper** - 1.5M+ downloads (versatile, artistic)
- **Juggernaut XL** - 1.3M+ downloads (SDXL, high-quality)
- **majicMIX realistic** - 1.2M+ downloads (Asian, photorealistic)
- **Pony Diffusion V6 XL** - 833K+ downloads (pony art, western style)

**Base Models Distribution:**
- SD 1.5: ~55%
- SDXL 1.0: ~25%
- Pony: ~15%
- Flux/SD3: ~5%

**File Sizes:**
- SD 1.5: 2-4 GB
- SDXL: 6-7 GB
- Pony: 6-7 GB

### 2. LoRA (~30,000 models)

Low-Rank Adaptation models that modify existing checkpoints.

**Types:**
- **Style LORAs** - Artistic styles, photography styles
- **Character LORAs** - Specific characters, celebrities
- **Concept LORAs** - Objects, scenes, compositions
- **Training LORAs** - Quality improvements, detail enhancers

**File Sizes:** 10-200 MB

**Usage:**
```python
# Apply LoRA to pipeline
pipe.load_lora_weights("path/to/lora.safetensors")
pipe.fuse_lora(lora_scale=0.7)  # 0.0 to 1.0
```

### 3. TextualInversion (~5,000 models)

Embeddings for specific concepts/styles.

**Popular:**
- **EasyNegative** - 720K+ downloads (negative prompt helper)
- **BadDream** - Quality improvements
- **UnrealisticDream** - Negative prompt enhancer

**File Sizes:** 5-50 KB

**Usage:**
```python
# Load embedding
pipe.load_textual_inversion("embedding.pt", token="<embedding>")
# Use in prompt: "photo of a cat <embedding>"
```

### 4. Other Types

- **Hypernetwork** - Style modification networks (~2,000)
- **ControlNet** - Pose/depth/edge control (~1,000)
- **Workflows** - ComfyUI/A1111 workflows (~500)
- **AestheticGradient** - Quality modifiers (~200)
- **Poses** - Pose references (~100)

---

## Civitai API Reference

### Base URL
```
https://civitai.com/api/v1
```

### Authentication
**None required** - All endpoints are public

### Key Endpoints

#### 1. List Models
```bash
GET /models?types={type}&sort={sort}&limit={limit}&nsfw={bool}&query={search}
```

**Parameters:**
- `types` - Checkpoint,LORA,TextualInversion,Hypernetwork,ControlNet,etc.
- `sort` - Highest Rated, Most Downloaded, Newest, Most Liked
- `limit` - 1-100 (default: 20)
- `nsfw` - true/false (filter NSFW content)
- `query` - Search term (e.g., "flux", "anime", "photorealistic")
- `cursor` - Pagination cursor (from metadata.nextCursor)

**Example:**
```bash
curl 'https://civitai.com/api/v1/models?types=Checkpoint&sort=Most%20Downloaded&nsfw=false&limit=10'
```

**Response:**
```json
{
  "items": [
    {
      "id": 4201,
      "name": "Realistic Vision V6.0 B1",
      "description": "...",
      "type": "Checkpoint",
      "nsfw": false,
      "tags": ["photorealistic", "realistic", "base model"],
      "creator": {
        "username": "SG_161222",
        "image": "..."
      },
      "stats": {
        "downloadCount": 2051759,
        "favoriteCount": 12543,
        "commentCount": 856,
        "rating": null
      },
      "modelVersions": [
        {
          "id": 245598,
          "name": "v6.0 B1",
          "baseModel": "SD 1.5",
          "downloadUrl": "https://civitai.com/api/download/models/245598",
          "files": [
            {
              "name": "realisticVisionV60B1_v60B1.safetensors",
              "sizeKB": 6775430.71,
              "type": "Model",
              "downloadUrl": "..."
            }
          ]
        }
      ]
    }
  ],
  "metadata": {
    "nextCursor": "...",
    "nextPage": "https://civitai.com/api/v1/models?cursor=..."
  }
}
```

#### 2. Get Model by ID
```bash
GET /models/{modelId}
```

Returns detailed information about a specific model.

#### 3. Get Popular Tags
```bash
GET /tags?limit={limit}
```

Returns trending tags (character, anime, photorealistic, etc.)

#### 4. Browse Generated Images
```bash
GET /images?limit={limit}&nsfw={bool}
```

Browse community-generated images with prompts and metadata.

---

## Licensing on Civitai

⚠️ **IMPORTANT:** Each model has unique licensing terms.

### License Fields

```json
{
  "allowNoCredit": true/false,           // Can use without attribution
  "allowCommercialUse": "...",           // Commercial use terms
  "allowDerivatives": true/false,        // Can create derivatives
  "allowDifferentLicense": true/false    // Can change license
}
```

### Commercial Use Options

- `{None}` - Non-commercial only
- `{Image}` - Can sell generated images
- `{RentCivit}` - Can rent on Civitai platform
- `{Rent}` - Can rent on any platform
- `{Sell}` - Can sell the model itself

### Examples

**Most Permissive (e.g., EasyNegative):**
```json
{
  "allowNoCredit": true,
  "allowCommercialUse": "{Image,RentCivit,Rent,Sell}",
  "allowDerivatives": true,
  "allowDifferentLicense": true
}
```

**Moderate (e.g., DreamShaper):**
```json
{
  "allowNoCredit": true,
  "allowCommercialUse": "{Image,RentCivit,Rent}",
  "allowDerivatives": true,
  "allowDifferentLicense": true
}
```

**Restricted (e.g., Pony Diffusion):**
```json
{
  "allowNoCredit": false,
  "allowCommercialUse": "{Image,RentCivit}",
  "allowDerivatives": true,
  "allowDifferentLicense": false
}
```

### Best Practice

**Always check license before use:**
1. Read license in model's `modelVersions[0].license` or on website
2. Display license in HollyWool's UI
3. Require user acknowledgment for commercial use
4. Store license info in `config.yaml` for each model

---

## Integration Plan for HollyWool

### Phase 1: Model Discovery (Recommended)

Add a "Browse Civitai" page to HollyWool:

```typescript
// frontend/src/pages/CivitaiBrowsePage.tsx
export function CivitaiBrowsePage() {
  const [models, setModels] = useState([])
  const [filter, setFilter] = useState({
    type: 'Checkpoint',
    sort: 'Most Downloaded',
    nsfw: false
  })

  useEffect(() => {
    fetch(`https://civitai.com/api/v1/models?types=${filter.type}&sort=${filter.sort}&nsfw=${filter.nsfw}&limit=50`)
      .then(res => res.json())
      .then(data => setModels(data.items))
  }, [filter])

  return (
    <div>
      {/* Model grid with download buttons */}
    </div>
  )
}
```

**Features:**
- Browse popular models by category
- Search by tag/name
- Filter by type, NSFW, base model
- Display stats (downloads, ratings)
- Show license information
- Download directly to HollyWool cache

### Phase 2: Download & Install

Add download capability:

```python
# backend/app/services/civitai.py
import requests
from pathlib import Path

def download_civitai_model(model_id: int, version_id: int, save_path: Path):
    """Download model from Civitai"""
    url = f"https://civitai.com/api/download/models/{version_id}"

    response = requests.get(url, stream=True)
    total_size = int(response.headers.get('content-length', 0))

    with open(save_path, 'wb') as f:
        downloaded = 0
        for chunk in response.iter_content(chunk_size=8192):
            f.write(chunk)
            downloaded += len(chunk)
            # Yield progress for UI updates
            yield {"downloaded": downloaded, "total": total_size}
```

**Storage Structure:**
```
~/.cache/hollywool/civitai/
├── checkpoints/
│   ├── realistic-vision-v60.safetensors
│   └── dreamshaper-xl.safetensors
├── loras/
│   └── anime-style.safetensors
└── embeddings/
    └── easynegative.pt
```

### Phase 3: LoRA Support

Extend HollyWool to support LORAs:

```python
# backend/app/services/inference.py
class InferenceService:
    def load_lora(self, lora_path: str, scale: float = 0.7):
        """Load LoRA into current pipeline"""
        self.pipe.load_lora_weights(lora_path)
        self.pipe.fuse_lora(lora_scale=scale)

    def unload_lora(self):
        """Remove LoRA from pipeline"""
        self.pipe.unfuse_lora()
        self.pipe.unload_lora_weights()
```

**UI for LoRA:**
```typescript
// frontend/src/components/LoRASelector.tsx
export function LoRASelector() {
  const [loras, setLoras] = useState([])
  const [selectedLoras, setSelectedLoras] = useState([])

  return (
    <div>
      <h3>LoRAs (0-3)</h3>
      {loras.map(lora => (
        <LoRACard
          key={lora.id}
          lora={lora}
          selected={selectedLoras.includes(lora.id)}
          onSelect={() => toggleLora(lora.id)}
          scale={lora.scale}
          onScaleChange={(val) => updateScale(lora.id, val)}
        />
      ))}
    </div>
  )
}
```

### Phase 4: Checkpoint Management

Add Civitai checkpoints to `config.yaml`:

```yaml
models:
  realistic-vision-v60:
    name: "Realistic Vision V6.0 B1"
    path: "~/.cache/hollywool/civitai/checkpoints/realistic-vision-v60.safetensors"
    type: "sd"
    source: "civitai"
    civitai_id: 4201
    civitai_version: 245598
    license:
      allowNoCredit: false
      allowCommercialUse: "{Image,RentCivit,Rent}"
      allowDerivatives: true
    default_steps: 25
    default_guidance: 7.0
```

### Phase 5: Metadata & Licensing

Display license info in UI:

```typescript
// frontend/src/components/ModelLicenseCard.tsx
export function ModelLicenseCard({ model }) {
  const license = model.license

  return (
    <div className="border rounded-lg p-4">
      <h4>License Information</h4>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>Attribution Required:</div>
        <div>{license.allowNoCredit ? '❌ No' : '✅ Yes'}</div>

        <div>Commercial Use:</div>
        <div>{license.allowCommercialUse}</div>

        <div>Derivatives Allowed:</div>
        <div>{license.allowDerivatives ? '✅ Yes' : '❌ No'}</div>
      </div>

      {!license.allowNoCredit && (
        <div className="mt-2 text-xs text-muted-foreground">
          Credit: Model by {model.creator.username} (Civitai)
        </div>
      )}
    </div>
  )
}
```

---

## API Integration Example

### Complete Model Browser Implementation

```typescript
// frontend/src/api/civitai.ts
export interface CivitaiModel {
  id: number
  name: string
  description: string
  type: string
  nsfw: boolean
  tags: string[]
  stats: {
    downloadCount: number
    favoriteCount: number
  }
  creator: {
    username: string
  }
  modelVersions: Array<{
    id: number
    name: string
    baseModel: string
    downloadUrl: string
    files: Array<{
      name: string
      sizeKB: number
      downloadUrl: string
    }>
  }>
}

export async function fetchCivitaiModels(
  type: string = 'Checkpoint',
  sort: string = 'Most Downloaded',
  nsfw: boolean = false,
  limit: number = 20
): Promise<CivitaiModel[]> {
  const url = new URL('https://civitai.com/api/v1/models')
  url.searchParams.set('types', type)
  url.searchParams.set('sort', sort)
  url.searchParams.set('nsfw', nsfw.toString())
  url.searchParams.set('limit', limit.toString())

  const response = await fetch(url)
  const data = await response.json()
  return data.items
}

export async function searchCivitaiModels(query: string): Promise<CivitaiModel[]> {
  const url = new URL('https://civitai.com/api/v1/models')
  url.searchParams.set('query', query)
  url.searchParams.set('limit', '50')

  const response = await fetch(url)
  const data = await response.json()
  return data.items
}
```

### Backend Download Endpoint

```python
# backend/app/routers/civitai.py
from fastapi import APIRouter, BackgroundTasks
from pathlib import Path
import requests

router = APIRouter(prefix="/api/civitai", tags=["civitai"])

@router.post("/download")
async def download_model(
    model_id: int,
    version_id: int,
    background_tasks: BackgroundTasks
):
    """Download model from Civitai in background"""
    cache_dir = Path.home() / ".cache" / "hollywool" / "civitai" / "checkpoints"
    cache_dir.mkdir(parents=True, exist_ok=True)

    # Start background download
    background_tasks.add_task(
        download_civitai_file,
        version_id,
        cache_dir
    )

    return {"status": "downloading", "model_id": model_id}

def download_civitai_file(version_id: int, save_dir: Path):
    """Background task to download file"""
    url = f"https://civitai.com/api/download/models/{version_id}"
    response = requests.get(url, stream=True)

    # Extract filename from Content-Disposition header
    filename = response.headers.get('content-disposition', '').split('filename=')[-1].strip('"')
    save_path = save_dir / filename

    with open(save_path, 'wb') as f:
        for chunk in response.iter_content(chunk_size=8192):
            f.write(chunk)
```

---

## Recommended Implementation Steps

### Step 1: Browse Civitai (Week 1)
- ✅ Add "Browse Civitai" page to frontend
- ✅ Implement model listing with filters
- ✅ Display model cards with stats and preview images
- ✅ Show license information

### Step 2: Download Models (Week 2)
- ✅ Add download endpoint to backend
- ✅ Implement progress tracking
- ✅ Store models in organized cache
- ✅ Update `config.yaml` automatically

### Step 3: LoRA Support (Week 3)
- ✅ Extend inference service to load LORAs
- ✅ Add LoRA selector to Image page
- ✅ Support multiple LORAs with scale control
- ✅ Browse and download LORAs from Civitai

### Step 4: Polish (Week 4)
- ✅ Add embeddings support
- ✅ Improve license display and tracking
- ✅ Add search functionality
- ✅ Implement model favorites/collections

---

## NSFW Content Filtering

Civitai contains NSFW content. Implement filtering:

```python
# backend/app/config.py
class Settings(BaseSettings):
    civitai_nsfw_filter: bool = True  # Default to SFW only
```

```typescript
// frontend/src/pages/CivitaiBrowsePage.tsx
const [nsfwFilter, setNsfwFilter] = useState(
  !import.meta.env.VITE_ALLOW_NSFW  // Set in .env
)
```

**UI Toggle:**
```tsx
<Switch
  checked={!nsfwFilter}
  onCheckedChange={(val) => setNsfwFilter(!val)}
  label="Show NSFW Content (18+)"
/>
```

---

## Storage Estimates

Civitai models require significant disk space:

| Model Type | Typical Size | 10 Models | 100 Models |
|------------|-------------|-----------|------------|
| SD 1.5 Checkpoint | 2-4 GB | 30 GB | 300 GB |
| SDXL Checkpoint | 6-7 GB | 65 GB | 650 GB |
| LoRA | 50-200 MB | 1.5 GB | 15 GB |
| Embedding | 5-50 KB | 500 KB | 5 MB |

**Recommendations:**
- Implement disk usage monitoring
- Add cache cleanup tools
- Warn users before large downloads
- Support external storage paths

---

## Security Considerations

### Model Verification
- ✅ Download from official Civitai API only
- ✅ Verify file hashes if available
- ⚠️ Scan .safetensors files (Civitai uses SafeTensors format)
- ❌ Never execute Python pickles from unknown sources

### License Compliance
- ✅ Display license terms before use
- ✅ Require user acceptance
- ✅ Store license metadata
- ✅ Watermark commercial outputs if required

### Privacy
- ✅ All inference happens locally
- ✅ No data sent to Civitai after download
- ✅ API calls are read-only (browsing)

---

## Comparison: Civitai vs HuggingFace

| Feature | Civitai | HuggingFace |
|---------|---------|-------------|
| **Focus** | SD art models | All ML models |
| **Model Count** | 100,000+ (SD focused) | 500,000+ (all types) |
| **Quality** | Community-curated | Mixed |
| **License** | Per-model, complex | More standardized |
| **NSFW** | Yes (common) | Rare |
| **API** | Simple REST | Advanced (Inference API) |
| **Best For** | Custom SD checkpoints, LORAs | Official models, broad ML |

**Recommendation:** Support both!
- Civitai for community models and LORAs
- HuggingFace for official releases (FLUX, SDXL, etc.)

---

## Resources

### Official Links
- **Website:** https://civitai.com
- **API Docs:** https://github.com/civitai/civitai/wiki/REST-API-Reference
- **Discord:** https://discord.gg/civitai

### Development Tools
- **Python SDK:** `pip install civitai-py` (community)
- **Model Browser:** https://civitai.com/models
- **API Explorer:** Use Postman/Insomnia with base URL

### Example Projects
- **ComfyUI Civitai Integration:** https://github.com/civitai/civitai-comfy-nodes
- **Automatic1111 Extension:** Civitai Helper Extension

---

## Conclusion

Civitai is the **perfect complement to HollyWool**. While HollyWaow focuses on cloud API providers, HollyWool should absolutely integrate with Civitai to give users access to the world's largest library of custom AI art models.

**Next Steps:**
1. Implement basic model browsing (Phase 1)
2. Add download functionality (Phase 2)
3. Support LORAs (Phase 3)
4. Polish and add advanced features (Phase 4)

With Civitai integration, HollyWool becomes a **complete local AI art studio** with unlimited customization possibilities.
