const API_BASE = '/api'

export interface ModelInfo {
  id: string
  name: string
  type: string
  default_steps: number
  default_guidance: number
  category: string
  description: string
  tags: string[]
  size_gb: number
  requires_approval: boolean
  approval_url?: string
  is_cached: boolean
  hf_path: string
}

// ============== LoRA Types ==============

export interface LoRAApply {
  lora_id: string
  weight: number
}

export interface LoRAInfo {
  id: string
  name: string
  path: string
  source: 'preset' | 'local' | 'huggingface'
  compatible_types: string[]
  default_weight: number
  description: string
  is_downloaded: boolean
}

export interface LoRAListResponse {
  loras: LoRAInfo[]
  local_lora_dir: string
}

export interface LoRAScanResponse {
  count: number
  loras: LoRAInfo[]
}

export interface ReferenceImage {
  image_base64?: string
  image_asset_id?: string
}

export interface GenerateRequest {
  prompt: string
  model: string
  negative_prompt?: string
  width?: number
  height?: number
  steps?: number
  guidance_scale?: number
  seed?: number
  num_images?: number
  batch_id?: string
  loras?: LoRAApply[]
  reference_images?: ReferenceImage[]
  strength?: number
}

export interface ImageResult {
  id: string
  filename: string
  url: string
  seed: number
}

export interface GenerateResponse {
  batch_id: string
  prompt: string
  model: string
  width: number
  height: number
  steps: number
  guidance_scale: number
  images: ImageResult[]
  created_at: string
}

export interface Asset {
  id: string
  filename: string
  url: string
  prompt: string
  negative_prompt?: string
  model: string
  width: number
  height: number
  steps: number
  guidance_scale: number
  seed: number
  batch_id?: string
  created_at: string
  // File info
  file_size?: number  // Size in bytes
  file_path?: string  // Full path on disk
}

export interface AssetsResponse {
  assets: Asset[]
  total: number
}

export interface ModelsResponse {
  models: ModelInfo[]
  current_model: string | null
}

export interface HealthResponse {
  status: string
  gpu_available: boolean
  current_model: string | null
}

// Group assets by batch_id for display
export interface GenerationBatch {
  batch_id: string
  prompt: string
  model: string
  width: number
  height: number
  images: Asset[]
  created_at: string
}

export function groupAssetsByBatch(assets: Asset[]): GenerationBatch[] {
  const batches = new Map<string, GenerationBatch>()

  for (const asset of assets) {
    const batchId = asset.batch_id || asset.id // Fallback for old assets without batch_id

    if (!batches.has(batchId)) {
      batches.set(batchId, {
        batch_id: batchId,
        prompt: asset.prompt,
        model: asset.model,
        width: asset.width,
        height: asset.height,
        images: [],
        created_at: asset.created_at,
      })
    }

    batches.get(batchId)!.images.push(asset)
  }

  // Sort batches by created_at (newest first)
  return Array.from(batches.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
}

export interface TitleResponse {
  title: string
}

export interface Session {
  id: string
  name: string
  createdAt: string
  batchIds: string[]
  thumbnail?: string
  isAutoNamed?: boolean
}

export interface SessionsData {
  sessions: Session[]
  currentSessionId: string | null
}

// Video session types
export interface VideoSession {
  id: string
  name: string
  createdAt: string
  thumbnail?: string
  isAutoNamed?: boolean
}

export interface VideoSessionsData {
  sessions: VideoSession[]
  currentSessionId: string | null
}

// Settings types
export type ThemeOption = 'light' | 'dark' | 'system'

export interface AppSettings {
  theme: ThemeOption
  default_model: string | null
  default_video_model: string | null
  auto_save_history: boolean
  max_log_entries: number
}

export interface RequestLog {
  id: string
  timestamp: string
  type: 'image' | 'video' | 'i2v'
  prompt: string
  negative_prompt: string | null
  model: string
  parameters: Record<string, unknown>
  status: 'pending' | 'generating' | 'completed' | 'failed'
  duration_ms: number | null
  error: string | null
  result_id: string | null
}

export interface RequestLogsResponse {
  logs: RequestLog[]
  total: number
  page: number
  page_size: number
}

export interface SystemInfo {
  app_name: string
  version: string
  hostname: string
  os_name: string
  platform: string
  device_type: string
  compute_mode: string
  cuda_available: boolean
  gpu_name: string | null
  gpu_memory_gb: number | null
  python_version: string
  torch_version: string | null
}

// Job types
export type JobStatus = 'queued' | 'downloading' | 'loading_model' | 'generating' | 'saving' | 'completed' | 'failed'

export interface Job {
  id: string
  session_id: string | null
  status: JobStatus
  progress: number
  current_image: number
  total_images: number
  eta_seconds: number | null
  error: string | null
  // Download progress
  download_progress: number
  download_total_mb: number | null
  download_speed_mbps: number | null
  // Request details
  prompt: string
  model: string
  width: number
  height: number
  steps: number
  num_images: number
  // I2I fields
  source_image_urls: string[]
  strength: number | null
  batch_id: string | null
  images: ImageResult[]
  created_at: string
  started_at: string | null
  completed_at: string | null
}

export interface JobResponse {
  job_id: string
  status: string
  message: string
}

export interface JobListResponse {
  jobs: Job[]
}

// Detailed model info for Models page
export interface ModelDetailedInfo {
  id: string
  name: string
  path: string
  type: string
  category: string
  description: string
  tags: string[]
  // Status info
  is_cached: boolean
  cached_size_mb: number | null
  estimated_size_gb: number
  actual_size_gb: number | null
  // Cache info
  last_accessed: number | null  // Unix timestamp
  last_modified: number | null  // Unix timestamp
  num_cached_revisions: number
  // Approval/metadata
  requires_approval: boolean
  approval_url?: string
  // Defaults
  default_steps: number
  default_guidance: number
}

export interface ModelsDetailedResponse {
  models: ModelDetailedInfo[]
  current_model: string | null
  total_cache_size_gb: number
  cache_items_count: number
}

export interface CacheStatusResponse {
  total_size_gb: number
  num_models: number
  num_datasets: number
  cache_dir: string | null
}

export interface CacheDeleteResponse {
  success: boolean
  freed_mb: number | null
  model_id: string
  error?: string
}

// ============== Video Generation Types ==============

export interface VideoGenerateRequest {
  prompt: string
  model: string
  negative_prompt?: string
  num_frames?: number
  fps?: number
  width?: number
  height?: number
  steps?: number
  guidance_scale?: number
  seed?: number
  session_id?: string
}

export interface VideoResult {
  id: string
  filename: string
  url: string
  seed: number
  duration: number
  fps: number
  num_frames: number
  width: number
  height: number
  has_audio?: boolean  // LTX-2 generates synchronized audio
}

export interface VideoJob {
  id: string
  session_id: string | null
  status: JobStatus
  progress: number
  current_frame: number
  total_frames: number
  eta_seconds: number | null
  error: string | null
  // Download progress
  download_progress: number
  download_total_mb: number | null
  download_speed_mbps: number | null
  // Request details
  prompt: string
  model: string
  width: number
  height: number
  steps: number
  num_frames: number
  fps: number
  // Result
  video: VideoResult | null
  created_at: string
  started_at: string | null
  completed_at: string | null
}

export interface VideoJobResponse {
  job_id: string
  status: string
  message: string
}

export interface VideoJobListResponse {
  jobs: VideoJob[]
}

// Video asset for gallery
export interface VideoAsset {
  id: string
  filename: string
  url: string
  type: 'video'
  prompt: string
  model: string
  width: number
  height: number
  steps: number
  guidance_scale: number
  seed: number
  num_frames: number
  fps: number
  duration: number
  created_at: string
  // File info
  file_size?: number  // Size in bytes
  file_path?: string  // Full path on disk
}

export interface VideoAssetsResponse {
  assets: VideoAsset[]
  total: number
}

// ============== Image-to-Video (I2V) Types ==============

export interface I2VGenerateRequest {
  prompt: string
  model: string
  image_base64?: string
  image_asset_id?: string
  reference_images?: ReferenceImage[]
  negative_prompt?: string
  num_frames?: number
  fps?: number
  width?: number
  height?: number
  steps?: number
  guidance_scale?: number
  seed?: number
  session_id?: string
  motion_bucket_id?: number
  noise_aug_strength?: number
}

export interface I2VJob {
  id: string
  session_id: string | null
  status: JobStatus
  progress: number
  current_frame: number
  total_frames: number
  eta_seconds: number | null
  error: string | null
  download_progress: number
  download_total_mb: number | null
  download_speed_mbps: number | null
  prompt: string
  model: string
  source_image_urls: string[]
  width: number
  height: number
  steps: number
  num_frames: number
  fps: number
  video: VideoResult | null
  created_at: string
  started_at: string | null
  completed_at: string | null
}

export interface I2VJobResponse {
  job_id: string
  status: string
  message: string
}

export interface I2VJobListResponse {
  jobs: I2VJob[]
}

// ============== System Resource Types ==============

export interface SystemResourceStatus {
  memory_total_gb: number
  memory_available_gb: number
  memory_used_gb: number
  memory_percent: number
  gpu_utilization: number | null
  cpu_percent: number
  is_available: boolean
  rejection_reason: string | null
}

export interface ResourceCheckResponse {
  can_generate: boolean
  status: SystemResourceStatus
  recommended_models: string[]
}

export interface ResourceError {
  error: 'insufficient_resources'
  message: string
  resources: {
    memory_available_gb: number
    memory_required_gb: number
    gpu_utilization: number | null
    cpu_percent: number
  }
}

// ============== Video Upscale Types ==============

export interface VideoUpscaleRequest {
  video_asset_id: string
  model?: string
  session_id?: string
}

export interface UpscaleModelInfo {
  id: string
  name: string
  scale: number
  description: string
}

export interface UpscaleModelsResponse {
  models: UpscaleModelInfo[]
}

export interface UpscaleJob {
  id: string
  session_id: string | null
  status: JobStatus
  progress: number
  current_frame: number
  total_frames: number
  eta_seconds: number | null
  error: string | null
  // Source info
  source_video_id: string
  source_width: number
  source_height: number
  source_fps: number
  source_duration: number
  // Upscale config
  model: string
  scale_factor: number
  target_width: number
  target_height: number
  // Result
  video: VideoResult | null
  created_at: string
  started_at: string | null
  completed_at: string | null
}

export interface UpscaleJobResponse {
  job_id: string
  status: string
  message: string
  eta_seconds?: number
}

export interface UpscaleJobListResponse {
  jobs: UpscaleJob[]
}

// ============== Provider Types ==============

export interface ProviderConfig {
  provider: string
  is_configured: boolean
  is_enabled: boolean
  api_url: string | null
  has_api_key: boolean
}

export interface AllProvidersResponse {
  providers: ProviderConfig[]
}

export interface ProviderConfigRequest {
  api_key?: string
  api_url?: string
  is_enabled?: boolean
}

export interface TestConnectionResponse {
  success: boolean
  message: string
  error?: string
}

export interface DiscoveredModel {
  id: string
  name: string
  description: string
  type: string
  input_type: string | null
  model_id: string
  tags: string[]
  provider: string
}

export interface DiscoverResponse {
  success: boolean
  discovered: number
  models: DiscoveredModel[]
  error?: string
}

// ============== Civitai Types ==============

export interface CivitaiModelImage {
  url?: string
  nsfw?: string
  width?: number
  height?: number
  type?: string // "image" or "video"
}

export interface CivitaiModelFile {
  id?: number
  name?: string
  sizeKB?: number
  type?: string
}

export interface CivitaiModelVersion {
  id: number
  name: string
  baseModel?: string
  downloadUrl?: string
  files: CivitaiModelFile[]
  images: CivitaiModelImage[]
}

export interface CivitaiModelStats {
  downloadCount?: number
  favoriteCount?: number
  thumbsUpCount?: number
  thumbsDownCount?: number
  commentCount?: number
  ratingCount?: number
  rating?: number
}

export interface CivitaiCreator {
  username?: string
  image?: string
}

export interface CivitaiModelSummary {
  id: number
  name: string
  type?: string
  tags: string[]
  stats?: CivitaiModelStats
  creator?: CivitaiCreator
  modelVersions: CivitaiModelVersion[]
  nsfw?: boolean
  description?: string
}

export interface CivitaiSearchResponse {
  items: CivitaiModelSummary[]
  metadata?: {
    nextCursor?: string
    nextPage?: string
    currentPage?: number
    pageSize?: number
    totalItems?: number
    totalPages?: number
  }
}

export interface CivitaiDownloadRequest {
  civitai_model_id: number
  version_id: number
  model_name: string
  type: string
  filename: string
  download_url: string
  base_model?: string
  file_size_kb?: number
}

export type CivitaiDownloadStatus = 'queued' | 'downloading' | 'completed' | 'failed' | 'cancelled'

export interface CivitaiDownloadJob {
  id: string
  civitai_model_id: number
  version_id: number
  model_name: string
  type: string
  filename: string
  download_url: string
  base_model?: string
  file_size_kb?: number
  status: CivitaiDownloadStatus
  progress: number
  downloaded_bytes: number
  total_bytes: number
  speed_bytes_per_sec: number
  error?: string
  local_path?: string
  created_at: string
  started_at?: string
  completed_at?: string
}

export const api = {
  async health(): Promise<HealthResponse> {
    const res = await fetch(`${API_BASE}/health`)
    if (!res.ok) throw new Error('Health check failed')
    return res.json()
  },

  async generateTitle(prompt: string): Promise<TitleResponse> {
    const res = await fetch(`${API_BASE}/generate-title`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    })
    if (!res.ok) throw new Error('Failed to generate title')
    return res.json()
  },

  async getModels(): Promise<ModelsResponse> {
    const res = await fetch(`${API_BASE}/models`)
    if (!res.ok) throw new Error('Failed to fetch models')
    return res.json()
  },

  async getModelsDetailed(): Promise<ModelsDetailedResponse> {
    const res = await fetch(`${API_BASE}/models/detailed`)
    if (!res.ok) throw new Error('Failed to fetch detailed models')
    return res.json()
  },

  async getCacheStatus(): Promise<CacheStatusResponse> {
    const res = await fetch(`${API_BASE}/models/cache-status`)
    if (!res.ok) throw new Error('Failed to fetch cache status')
    return res.json()
  },

  async deleteModelCache(modelId: string): Promise<CacheDeleteResponse> {
    const res = await fetch(`${API_BASE}/models/${modelId}/cache`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: 'Failed to delete cache' }))
      throw new Error(error.detail || 'Failed to delete cache')
    }
    return res.json()
  },

  async downloadModel(modelId: string): Promise<{ status: string; model_id: string }> {
    const res = await fetch(`${API_BASE}/models/${modelId}/download`, {
      method: 'POST',
    })
    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: 'Failed to start download' }))
      throw new Error(error.detail || 'Failed to start download')
    }
    return res.json()
  },

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    const res = await fetch(`${API_BASE}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })
    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: 'Generation failed' }))
      throw new Error(error.detail || 'Generation failed')
    }
    return res.json()
  },

  async getAssets(params?: { limit?: number; offset?: number; model?: string }): Promise<AssetsResponse> {
    const searchParams = new URLSearchParams()
    if (params?.limit) searchParams.set('limit', params.limit.toString())
    if (params?.offset) searchParams.set('offset', params.offset.toString())
    if (params?.model) searchParams.set('model', params.model)

    const url = `${API_BASE}/assets${searchParams.toString() ? `?${searchParams}` : ''}`
    const res = await fetch(url)
    if (!res.ok) throw new Error('Failed to fetch assets')
    return res.json()
  },

  async getAsset(id: string): Promise<Asset> {
    const res = await fetch(`${API_BASE}/assets/${id}`)
    if (!res.ok) throw new Error('Asset not found')
    return res.json()
  },

  async deleteAsset(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/assets/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error('Failed to delete asset')
  },

  async getSessions(): Promise<SessionsData> {
    const res = await fetch(`${API_BASE}/sessions`)
    if (!res.ok) throw new Error('Failed to fetch sessions')
    return res.json()
  },

  async saveSessions(data: SessionsData): Promise<SessionsData> {
    const res = await fetch(`${API_BASE}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error('Failed to save sessions')
    return res.json()
  },

  // Video session endpoints
  async getVideoSessions(): Promise<VideoSessionsData> {
    const res = await fetch(`${API_BASE}/video-sessions`)
    if (!res.ok) throw new Error('Failed to fetch video sessions')
    return res.json()
  },

  async saveVideoSessions(data: VideoSessionsData): Promise<VideoSessionsData> {
    const res = await fetch(`${API_BASE}/video-sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error('Failed to save video sessions')
    return res.json()
  },

  // Job endpoints
  async createJob(request: GenerateRequest & { session_id?: string }): Promise<JobResponse> {
    const res = await fetch(`${API_BASE}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })
    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: 'Failed to create job' }))
      throw new Error(error.detail || 'Failed to create job')
    }
    return res.json()
  },

  async getJob(jobId: string): Promise<Job> {
    const res = await fetch(`${API_BASE}/jobs/${jobId}`)
    if (!res.ok) throw new Error('Job not found')
    return res.json()
  },

  async getJobs(params?: { session_id?: string; active_only?: boolean }): Promise<JobListResponse> {
    const searchParams = new URLSearchParams()
    if (params?.session_id) searchParams.set('session_id', params.session_id)
    if (params?.active_only) searchParams.set('active_only', 'true')
    const url = `${API_BASE}/jobs${searchParams.toString() ? `?${searchParams}` : ''}`
    const res = await fetch(url)
    if (!res.ok) throw new Error('Failed to fetch jobs')
    return res.json()
  },

  // Video generation endpoints
  async createVideoJob(request: VideoGenerateRequest): Promise<VideoJobResponse> {
    const res = await fetch(`${API_BASE}/video/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })
    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: 'Failed to create video job' }))
      // Check for resource error (507 Insufficient Storage)
      if (res.status === 507 && error.detail?.error === 'insufficient_resources') {
        const resourceError = error.detail as ResourceError
        throw new Error(resourceError.message)
      }
      throw new Error(error.detail?.message || error.detail || 'Failed to create video job')
    }
    return res.json()
  },

  async getVideoJob(jobId: string): Promise<VideoJob> {
    const res = await fetch(`${API_BASE}/video/jobs/${jobId}`)
    if (!res.ok) throw new Error('Video job not found')
    return res.json()
  },

  async getVideoJobs(params?: { session_id?: string; active_only?: boolean }): Promise<VideoJobListResponse> {
    const searchParams = new URLSearchParams()
    if (params?.session_id) searchParams.set('session_id', params.session_id)
    if (params?.active_only) searchParams.set('active_only', 'true')
    const url = `${API_BASE}/video/jobs${searchParams.toString() ? `?${searchParams}` : ''}`
    const res = await fetch(url)
    if (!res.ok) throw new Error('Failed to fetch video jobs')
    return res.json()
  },

  // Video assets for gallery
  async getVideoAssets(params?: { limit?: number; offset?: number; model?: string }): Promise<VideoAssetsResponse> {
    const searchParams = new URLSearchParams()
    if (params?.limit) searchParams.set('limit', params.limit.toString())
    if (params?.offset) searchParams.set('offset', params.offset.toString())
    if (params?.model) searchParams.set('model', params.model)

    const url = `${API_BASE}/video-assets${searchParams.toString() ? `?${searchParams}` : ''}`
    const res = await fetch(url)
    if (!res.ok) throw new Error('Failed to fetch video assets')
    return res.json()
  },

  async getVideoAsset(id: string): Promise<VideoAsset> {
    const res = await fetch(`${API_BASE}/video-assets/${id}`)
    if (!res.ok) throw new Error('Video asset not found')
    return res.json()
  },

  async deleteVideoAsset(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/video-assets/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error('Failed to delete video asset')
  },

  // System resource endpoints
  async getSystemStatus(): Promise<SystemResourceStatus> {
    const res = await fetch(`${API_BASE}/system/status`)
    if (!res.ok) throw new Error('Failed to fetch system status')
    return res.json()
  },

  async checkCanGenerate(modelId: string): Promise<ResourceCheckResponse> {
    const res = await fetch(`${API_BASE}/system/can-generate/${modelId}`)
    if (!res.ok) throw new Error('Failed to check resource availability')
    return res.json()
  },

  // ============== LoRA Endpoints ==============

  async getLoras(modelType?: string): Promise<LoRAListResponse> {
    const url = modelType
      ? `${API_BASE}/loras?model_type=${modelType}`
      : `${API_BASE}/loras`
    const res = await fetch(url)
    if (!res.ok) throw new Error('Failed to fetch LoRAs')
    return res.json()
  },

  async scanLocalLoras(): Promise<LoRAScanResponse> {
    const res = await fetch(`${API_BASE}/loras/scan`, { method: 'POST' })
    if (!res.ok) throw new Error('Failed to scan local LoRAs')
    return res.json()
  },

  // ============== Image-to-Video (I2V) Endpoints ==============

  async createI2VJob(request: I2VGenerateRequest): Promise<I2VJobResponse> {
    const res = await fetch(`${API_BASE}/i2v/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })
    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: 'Failed to create I2V job' }))
      if (res.status === 507 && error.detail?.error === 'insufficient_resources') {
        const resourceError = error.detail as ResourceError
        throw new Error(resourceError.message)
      }
      throw new Error(error.detail?.message || error.detail || 'Failed to create I2V job')
    }
    return res.json()
  },

  async getI2VJob(jobId: string): Promise<I2VJob> {
    const res = await fetch(`${API_BASE}/i2v/jobs/${jobId}`)
    if (!res.ok) throw new Error('I2V job not found')
    return res.json()
  },

  async getI2VJobs(params?: { session_id?: string; active_only?: boolean }): Promise<I2VJobListResponse> {
    const searchParams = new URLSearchParams()
    if (params?.session_id) searchParams.set('session_id', params.session_id)
    if (params?.active_only) searchParams.set('active_only', 'true')
    const url = `${API_BASE}/i2v/jobs${searchParams.toString() ? `?${searchParams}` : ''}`
    const res = await fetch(url)
    if (!res.ok) throw new Error('Failed to fetch I2V jobs')
    return res.json()
  },

  // ============== Video Upscale Endpoints ==============

  async getUpscaleModels(): Promise<UpscaleModelsResponse> {
    const res = await fetch(`${API_BASE}/upscale/models`)
    if (!res.ok) throw new Error('Failed to fetch upscale models')
    return res.json()
  },

  async createUpscaleJob(request: VideoUpscaleRequest): Promise<UpscaleJobResponse> {
    const res = await fetch(`${API_BASE}/upscale/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })
    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: 'Failed to create upscale job' }))
      throw new Error(error.detail?.message || error.detail || 'Failed to create upscale job')
    }
    return res.json()
  },

  async getUpscaleJob(jobId: string): Promise<UpscaleJob> {
    const res = await fetch(`${API_BASE}/upscale/jobs/${jobId}`)
    if (!res.ok) throw new Error('Upscale job not found')
    return res.json()
  },

  async getUpscaleJobs(params?: { session_id?: string; active_only?: boolean }): Promise<UpscaleJobListResponse> {
    const searchParams = new URLSearchParams()
    if (params?.session_id) searchParams.set('session_id', params.session_id)
    if (params?.active_only) searchParams.set('active_only', 'true')
    const url = `${API_BASE}/upscale/jobs${searchParams.toString() ? `?${searchParams}` : ''}`
    const res = await fetch(url)
    if (!res.ok) throw new Error('Failed to fetch upscale jobs')
    return res.json()
  },

  // ============== Provider Endpoints ==============

  async getProviders(): Promise<AllProvidersResponse> {
    const res = await fetch(`${API_BASE}/providers`)
    if (!res.ok) throw new Error('Failed to fetch providers')
    return res.json()
  },

  async getProvider(providerId: string): Promise<ProviderConfig> {
    const res = await fetch(`${API_BASE}/providers/${providerId}`)
    if (!res.ok) throw new Error('Failed to fetch provider')
    return res.json()
  },

  async updateProvider(providerId: string, config: ProviderConfigRequest): Promise<ProviderConfig> {
    const res = await fetch(`${API_BASE}/providers/${providerId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })
    if (!res.ok) throw new Error('Failed to update provider')
    return res.json()
  },

  async deleteProvider(providerId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/providers/${providerId}`, {
      method: 'DELETE',
    })
    if (!res.ok) throw new Error('Failed to delete provider config')
  },

  async testProviderConnection(providerId: string): Promise<TestConnectionResponse> {
    const res = await fetch(`${API_BASE}/providers/${providerId}/test`, {
      method: 'POST',
    })
    if (!res.ok) throw new Error('Failed to test provider connection')
    return res.json()
  },

  async discoverProviderModels(providerId: string): Promise<DiscoverResponse> {
    const res = await fetch(`${API_BASE}/providers/${providerId}/discover`, {
      method: 'POST',
    })
    if (!res.ok) throw new Error('Failed to discover provider models')
    return res.json()
  },

  // ============== Settings Endpoints ==============

  async getSettings(): Promise<AppSettings> {
    const res = await fetch(`${API_BASE}/settings`)
    if (!res.ok) throw new Error('Failed to fetch settings')
    return res.json()
  },

  async updateSettings(settings: AppSettings): Promise<AppSettings> {
    const res = await fetch(`${API_BASE}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
    if (!res.ok) throw new Error('Failed to update settings')
    return res.json()
  },

  async getRequestLogs(params?: { page?: number; page_size?: number; type?: string; status?: string }): Promise<RequestLogsResponse> {
    const searchParams = new URLSearchParams()
    if (params?.page) searchParams.set('page', params.page.toString())
    if (params?.page_size) searchParams.set('page_size', params.page_size.toString())
    if (params?.type) searchParams.set('type', params.type)
    if (params?.status) searchParams.set('status', params.status)
    const url = `${API_BASE}/settings/logs${searchParams.toString() ? `?${searchParams}` : ''}`
    const res = await fetch(url)
    if (!res.ok) throw new Error('Failed to fetch request logs')
    return res.json()
  },

  async getRequestLog(logId: string): Promise<RequestLog> {
    const res = await fetch(`${API_BASE}/settings/logs/${logId}`)
    if (!res.ok) throw new Error('Request log not found')
    return res.json()
  },

  async clearRequestLogs(): Promise<void> {
    const res = await fetch(`${API_BASE}/settings/logs`, { method: 'DELETE' })
    if (!res.ok) throw new Error('Failed to clear request logs')
  },

  async deleteRequestLog(logId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/settings/logs/${logId}`, { method: 'DELETE' })
    if (!res.ok) throw new Error('Failed to delete request log')
  },

  async getSystemInfo(): Promise<SystemInfo> {
    const res = await fetch(`${API_BASE}/settings/system`)
    if (!res.ok) throw new Error('Failed to fetch system info')
    return res.json()
  },

  // ============== Civitai Endpoints ==============

  async searchCivitaiModels(params?: {
    query?: string
    types?: string
    sort?: string
    nsfw?: boolean
    base_models?: string
    limit?: number
    cursor?: string
    tag?: string
  }): Promise<CivitaiSearchResponse> {
    const searchParams = new URLSearchParams()
    if (params?.query) searchParams.set('query', params.query)
    if (params?.types) searchParams.set('types', params.types)
    if (params?.sort) searchParams.set('sort', params.sort)
    if (params?.nsfw !== undefined) searchParams.set('nsfw', params.nsfw.toString())
    if (params?.base_models) searchParams.set('base_models', params.base_models)
    if (params?.limit) searchParams.set('limit', params.limit.toString())
    if (params?.cursor) searchParams.set('cursor', params.cursor)
    if (params?.tag) searchParams.set('tag', params.tag)
    const url = `${API_BASE}/civitai/models${searchParams.toString() ? `?${searchParams}` : ''}`
    const res = await fetch(url)
    if (!res.ok) throw new Error('Failed to search Civitai models')
    return res.json()
  },

  async getCivitaiModel(modelId: number): Promise<CivitaiModelSummary> {
    const res = await fetch(`${API_BASE}/civitai/models/${modelId}`)
    if (!res.ok) throw new Error('Failed to fetch Civitai model')
    return res.json()
  },

  async startCivitaiDownload(request: CivitaiDownloadRequest): Promise<CivitaiDownloadJob> {
    const res = await fetch(`${API_BASE}/civitai/downloads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })
    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: 'Failed to start download' }))
      throw new Error(error.detail || 'Failed to start download')
    }
    return res.json()
  },

  async getCivitaiDownloads(): Promise<CivitaiDownloadJob[]> {
    const res = await fetch(`${API_BASE}/civitai/downloads`)
    if (!res.ok) throw new Error('Failed to fetch downloads')
    return res.json()
  },

  async getCivitaiDownloadedVersions(): Promise<number[]> {
    const res = await fetch(`${API_BASE}/civitai/downloaded-versions`)
    if (!res.ok) throw new Error('Failed to fetch downloaded versions')
    return res.json()
  },

  async cancelCivitaiDownload(jobId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/civitai/downloads/${jobId}`, {
      method: 'DELETE',
    })
    if (!res.ok) throw new Error('Failed to cancel download')
  },
}
