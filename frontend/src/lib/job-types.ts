import type { LucideIcon } from 'lucide-react'
import { Image as ImageIcon, Film, Wand2, ArrowUpCircle, Download } from 'lucide-react'
import {
  api,
  type Job,
  type VideoJob,
  type I2VJob,
  type UpscaleJob,
  type CivitaiDownloadJob,
} from '@/api/client'

// Unified queue item shape
export interface QueueItem {
  id: string
  type: JobType
  status: string
  progress: number
  model: string
  prompt: string
  eta_seconds: number | null
  created_at: string
  width?: number
  height?: number
  steps?: number
  num_frames?: number
  fps?: number
  source_image_urls?: string[]
  download_progress?: number
  download_total_mb?: number | null
  download_speed_mbps?: number | null
}

export type JobType = 'image' | 'video' | 'i2v' | 'upscale' | 'download'

export interface JobTypeConfig {
  type: JobType
  label: string
  icon: LucideIcon
  badgeColor: string
  iconColor: string
  bgColor: string
  fetchOne?: (id: string) => Promise<any>
  fetchActive: () => Promise<any>
  normalize: (job: any) => QueueItem
  isActive: (job: any) => boolean
  navigateTo: string
  isClickable: boolean
  completedLabel?: string
}

// --- Normalize functions ---

function normalizeImageJob(job: Job): QueueItem {
  return {
    id: job.id,
    type: 'image',
    status: job.status,
    progress: job.status === 'downloading' ? job.download_progress : job.progress,
    model: job.model,
    prompt: job.prompt,
    eta_seconds: job.eta_seconds,
    created_at: job.created_at,
    width: job.width,
    height: job.height,
    steps: job.steps,
    source_image_urls: job.source_image_urls,
    download_progress: job.download_progress,
    download_total_mb: job.download_total_mb,
    download_speed_mbps: job.download_speed_mbps,
  }
}

function normalizeVideoJob(job: VideoJob): QueueItem {
  return {
    id: job.id,
    type: 'video',
    status: job.status,
    progress: job.status === 'downloading' ? job.download_progress : job.progress,
    model: job.model,
    prompt: job.prompt,
    eta_seconds: job.eta_seconds,
    created_at: job.created_at,
    width: job.width,
    height: job.height,
    steps: job.steps,
    num_frames: job.num_frames,
    fps: job.fps,
    download_progress: job.download_progress,
    download_total_mb: job.download_total_mb,
    download_speed_mbps: job.download_speed_mbps,
  }
}

function normalizeI2VJob(job: I2VJob): QueueItem {
  return {
    id: job.id,
    type: 'i2v',
    status: job.status,
    progress: job.status === 'downloading' ? job.download_progress : job.progress,
    model: job.model,
    prompt: job.prompt,
    eta_seconds: job.eta_seconds,
    created_at: job.created_at,
    width: job.width,
    height: job.height,
    steps: job.steps,
    num_frames: job.num_frames,
    fps: job.fps,
    source_image_urls: job.source_image_urls,
    download_progress: job.download_progress,
    download_total_mb: job.download_total_mb,
    download_speed_mbps: job.download_speed_mbps,
  }
}

function normalizeUpscaleJob(job: UpscaleJob): QueueItem {
  return {
    id: job.id,
    type: 'upscale',
    status: job.status,
    progress: job.progress,
    model: job.model,
    prompt: `${job.source_width}x${job.source_height} \u2192 ${job.target_width}x${job.target_height} (${job.scale_factor}x)`,
    eta_seconds: job.eta_seconds,
    created_at: job.created_at,
    width: job.target_width,
    height: job.target_height,
  }
}

function normalizeDownloadJob(job: CivitaiDownloadJob): QueueItem {
  const totalMb = job.total_bytes > 0 ? job.total_bytes / (1024 * 1024) : (job.file_size_kb ? job.file_size_kb / 1024 : null)
  const speedMbps = job.speed_bytes_per_sec > 0 ? job.speed_bytes_per_sec / (1024 * 1024) : null
  return {
    id: job.id,
    type: 'download',
    status: job.status,
    progress: job.progress,
    model: job.model_name,
    prompt: job.filename,
    eta_seconds: null,
    created_at: job.created_at,
    download_progress: job.progress,
    download_total_mb: totalMb,
    download_speed_mbps: speedMbps,
  }
}

// --- Active predicates ---

function standardIsActive(job: any): boolean {
  return !['completed', 'failed'].includes(job.status)
}

function downloadIsActive(job: any): boolean {
  return ['queued', 'downloading'].includes(job.status)
}

// --- Registry ---

export const JOB_TYPES: JobTypeConfig[] = [
  {
    type: 'image',
    label: 'Image',
    icon: ImageIcon,
    badgeColor: 'bg-blue-500/20 text-blue-400',
    iconColor: 'text-blue-400',
    bgColor: 'bg-blue-500/20',
    fetchOne: (id) => api.getJob(id),
    fetchActive: () => api.getJobs({ active_only: true }),
    normalize: normalizeImageJob,
    isActive: standardIsActive,
    navigateTo: '/image',
    isClickable: true,
  },
  {
    type: 'video',
    label: 'Video',
    icon: Film,
    badgeColor: 'bg-purple-500/20 text-purple-400',
    iconColor: 'text-purple-400',
    bgColor: 'bg-purple-500/20',
    fetchOne: (id) => api.getVideoJob(id),
    fetchActive: () => api.getVideoJobs({ active_only: true }),
    normalize: normalizeVideoJob,
    isActive: standardIsActive,
    navigateTo: '/video',
    isClickable: true,
  },
  {
    type: 'i2v',
    label: 'I2V',
    icon: Wand2,
    badgeColor: 'bg-green-500/20 text-green-400',
    iconColor: 'text-green-400',
    bgColor: 'bg-green-500/20',
    fetchOne: (id) => api.getI2VJob(id),
    fetchActive: () => api.getI2VJobs({ active_only: true }),
    normalize: normalizeI2VJob,
    isActive: standardIsActive,
    navigateTo: '/video',
    isClickable: true,
  },
  {
    type: 'upscale',
    label: 'Upscale',
    icon: ArrowUpCircle,
    badgeColor: 'bg-orange-500/20 text-orange-400',
    iconColor: 'text-orange-400',
    bgColor: 'bg-orange-500/20',
    fetchOne: (id) => api.getUpscaleJob(id),
    fetchActive: () => api.getUpscaleJobs({ active_only: true }),
    normalize: normalizeUpscaleJob,
    isActive: standardIsActive,
    navigateTo: '/assets',
    isClickable: true,
    completedLabel: 'Back to Gallery',
  },
  {
    type: 'download',
    label: 'Download',
    icon: Download,
    badgeColor: 'bg-cyan-500/20 text-cyan-400',
    iconColor: 'text-cyan-400',
    bgColor: 'bg-cyan-500/20',
    fetchActive: () => api.getCivitaiDownloads(),
    normalize: normalizeDownloadJob,
    isActive: downloadIsActive,
    navigateTo: '/models',
    isClickable: false,
  },
]

// --- Helpers ---

const jobTypeMap = new Map(JOB_TYPES.map(c => [c.type, c]))

export function getJobTypeConfig(type: JobType): JobTypeConfig {
  const config = jobTypeMap.get(type)
  if (!config) throw new Error(`Unknown job type: ${type}`)
  return config
}

export async function resolveJobById(jobId: string): Promise<{ job: any; config: JobTypeConfig }> {
  for (const config of JOB_TYPES) {
    if (!config.fetchOne) continue
    try {
      const job = await config.fetchOne(jobId)
      return { job, config }
    } catch {
      // Not this type, try next
    }
  }
  throw new Error('Job not found')
}

export function getStatusLabel(status: string): string {
  switch (status) {
    case 'queued': return 'Queued \u2014 waiting to start'
    case 'downloading': return 'Downloading model'
    case 'loading_model': return 'Loading model into GPU'
    case 'generating': return 'Generating'
    case 'saving': return 'Encoding & saving'
    default: return status
  }
}
