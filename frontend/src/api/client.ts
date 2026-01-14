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
}

export interface VideoAssetsResponse {
  assets: VideoAsset[]
  total: number
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
}
