import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ListOrdered, Loader2, Image as ImageIcon, Film, Wand2, ArrowUpCircle, Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  api,
  type Job,
  type VideoJob,
  type I2VJob,
  type UpscaleJob,
  type CivitaiDownloadJob,
} from '@/api/client'

// Unified queue item shape
interface QueueItem {
  id: string
  type: 'image' | 'video' | 'i2v' | 'upscale' | 'download'
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

const TYPE_CONFIG: Record<QueueItem['type'], { label: string; color: string; icon: typeof ImageIcon }> = {
  image:    { label: 'Image',    color: 'bg-blue-500/20 text-blue-400',   icon: ImageIcon },
  video:    { label: 'Video',    color: 'bg-purple-500/20 text-purple-400', icon: Film },
  i2v:      { label: 'I2V',      color: 'bg-green-500/20 text-green-400',  icon: Wand2 },
  upscale:  { label: 'Upscale',  color: 'bg-orange-500/20 text-orange-400', icon: ArrowUpCircle },
  download: { label: 'Download', color: 'bg-cyan-500/20 text-cyan-400',   icon: Download },
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'queued': return 'Queued \u2014 waiting to start'
    case 'downloading': return 'Downloading model'
    case 'loading_model': return 'Loading model into GPU'
    case 'generating': return 'Generating'
    case 'saving': return 'Encoding & saving'
    default: return status
  }
}

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

export default function QueuePage() {
  const navigate = useNavigate()

  const { data: imageJobs } = useQuery({
    queryKey: ['queue-image-jobs'],
    queryFn: () => api.getJobs({ active_only: true }),
    refetchInterval: 3000,
  })

  const { data: videoJobs } = useQuery({
    queryKey: ['queue-video-jobs'],
    queryFn: () => api.getVideoJobs({ active_only: true }),
    refetchInterval: 3000,
  })

  const { data: i2vJobs } = useQuery({
    queryKey: ['queue-i2v-jobs'],
    queryFn: () => api.getI2VJobs({ active_only: true }),
    refetchInterval: 3000,
  })

  const { data: upscaleJobs } = useQuery({
    queryKey: ['queue-upscale-jobs'],
    queryFn: () => api.getUpscaleJobs({ active_only: true }),
    refetchInterval: 3000,
  })

  const { data: downloads } = useQuery({
    queryKey: ['queue-downloads'],
    queryFn: () => api.getCivitaiDownloads(),
    refetchInterval: 3000,
  })

  // Normalize all jobs into unified shape
  const items: QueueItem[] = []

  if (imageJobs?.jobs) {
    for (const job of imageJobs.jobs) {
      if (!['completed', 'failed'].includes(job.status)) {
        items.push(normalizeImageJob(job))
      }
    }
  }
  if (videoJobs?.jobs) {
    for (const job of videoJobs.jobs) {
      if (!['completed', 'failed'].includes(job.status)) {
        items.push(normalizeVideoJob(job))
      }
    }
  }
  if (i2vJobs?.jobs) {
    for (const job of i2vJobs.jobs) {
      if (!['completed', 'failed'].includes(job.status)) {
        items.push(normalizeI2VJob(job))
      }
    }
  }
  if (upscaleJobs?.jobs) {
    for (const job of upscaleJobs.jobs) {
      if (!['completed', 'failed'].includes(job.status)) {
        items.push(normalizeUpscaleJob(job))
      }
    }
  }
  if (downloads) {
    for (const job of downloads) {
      if (['queued', 'downloading'].includes(job.status)) {
        items.push(normalizeDownloadJob(job))
      }
    }
  }

  // Sort by created_at ascending (oldest first = next to run)
  items.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  const handleCardClick = (item: QueueItem) => {
    if (['image', 'video', 'i2v'].includes(item.type)) {
      navigate(`/job/${item.id}`)
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border flex-shrink-0">
        <h1 className="text-xl font-semibold">Queue</h1>
        {items.length > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-sm font-medium">
            {items.length}
          </span>
        )}
      </div>

      {/* Queue list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <ListOrdered className="h-12 w-12 mb-3 opacity-40" />
            <p className="font-medium">Queue is empty</p>
            <p className="text-sm mt-1">Active jobs will appear here</p>
          </div>
        ) : (
          <div className="p-4 space-y-3 max-w-3xl mx-auto">
            {items.map((item) => {
              const config = TYPE_CONFIG[item.type]
              const TypeIcon = config.icon
              const isClickable = ['image', 'video', 'i2v'].includes(item.type)

              const steps = item.type !== 'download' ? [
                {
                  id: 'download',
                  label: 'Download',
                  active: item.status === 'downloading',
                  completed: ['loading_model', 'generating', 'saving'].includes(item.status),
                  skipped: item.status === 'queued' ? undefined : !item.download_total_mb && item.status !== 'downloading',
                },
                { id: 'load', label: 'Load Model', active: item.status === 'loading_model', completed: ['generating', 'saving'].includes(item.status) },
                { id: 'generate', label: 'Generate', active: item.status === 'generating', completed: item.status === 'saving' },
                { id: 'save', label: 'Save', active: item.status === 'saving', completed: false },
              ] : null

              return (
                <div
                  key={`${item.type}-${item.id}`}
                  onClick={() => handleCardClick(item)}
                  className={cn(
                    'rounded-xl border border-border bg-card overflow-hidden transition-colors',
                    isClickable && 'cursor-pointer hover:border-primary/30'
                  )}
                >
                  <div className="px-5 py-4">
                    {/* Top row: type badge, status, model pill */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                          <Loader2 className="h-3 w-3 animate-spin text-primary" />
                        </div>
                        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', config.color)}>
                          <TypeIcon className="h-3 w-3 inline mr-1" />
                          {config.label}
                        </span>
                        <span className="text-sm font-medium text-foreground">
                          {getStatusLabel(item.status)}
                        </span>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground/70 truncate max-w-[200px]">
                        {item.model}
                      </span>
                    </div>

                    {/* Step indicator bar (not for downloads) */}
                    {steps && (
                      <>
                        <div className="flex items-center gap-1 mb-3">
                          {steps.map((step, idx) => (
                            <div key={step.id} className="flex items-center flex-1">
                              <div className={cn(
                                'flex-1 h-1.5 rounded-full transition-all duration-300',
                                step.active ? 'bg-primary animate-pulse' :
                                step.completed ? 'bg-primary' :
                                step.skipped ? 'bg-muted' :
                                'bg-accent'
                              )} />
                              {idx < steps.length - 1 && <div className="w-1" />}
                            </div>
                          ))}
                        </div>
                        <div className="flex justify-between text-[10px] text-muted-foreground/70 px-1">
                          {steps.map(step => (
                            <span key={step.id} className={cn(
                              'transition-colors',
                              step.active && 'text-primary font-medium',
                              step.completed && 'text-muted-foreground',
                              step.skipped && 'text-primary-foreground/20'
                            )}>
                              {step.label}
                            </span>
                          ))}
                        </div>
                      </>
                    )}

                    {/* Progress bar */}
                    <div className="mt-3 flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-accent rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all duration-300"
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground min-w-[3ch]">
                        {Math.round(item.progress)}%
                      </span>
                    </div>

                    {/* Download speed/size */}
                    {item.status === 'downloading' && item.download_total_mb && (
                      <div className="mt-1 text-xs text-muted-foreground/70">
                        {item.download_total_mb > 1024
                          ? `${(item.download_total_mb / 1024).toFixed(1)} GB`
                          : `${Math.round(item.download_total_mb)} MB`}
                        {item.download_speed_mbps != null && item.download_speed_mbps > 0 && (
                          <> @ {item.download_speed_mbps.toFixed(1)} MB/s</>
                        )}
                      </div>
                    )}

                    {/* ETA */}
                    {item.eta_seconds != null && item.eta_seconds > 0 && item.status !== 'downloading' && (
                      <div className="mt-1 text-xs text-muted-foreground/70">
                        ~{item.eta_seconds >= 60 ? `${Math.ceil(item.eta_seconds / 60)} min` : `${Math.round(item.eta_seconds)}s`} remaining
                      </div>
                    )}
                  </div>

                  {/* Footer: details + prompt */}
                  <div className="px-5 py-3 border-t border-border">
                    {/* Source image thumbnail for I2V */}
                    {item.type === 'i2v' && item.source_image_urls?.[0] && (
                      <div className="flex items-center gap-3 mb-2">
                        {item.source_image_urls.map((url, idx) => (
                          <img
                            key={idx}
                            src={url}
                            alt={`Source ${idx + 1}`}
                            className="h-12 w-auto rounded-lg object-cover"
                          />
                        ))}
                      </div>
                    )}

                    {/* Metadata row */}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground/70 mb-2 flex-wrap">
                      {item.width && item.height && (
                        <span>{item.width}x{item.height}</span>
                      )}
                      {item.num_frames != null && (
                        <>
                          <span className="text-muted-foreground/30">&middot;</span>
                          <span>{item.num_frames} frames</span>
                        </>
                      )}
                      {item.fps != null && (
                        <>
                          <span className="text-muted-foreground/30">&middot;</span>
                          <span>{item.fps} fps</span>
                        </>
                      )}
                      {item.steps != null && (
                        <>
                          <span className="text-muted-foreground/30">&middot;</span>
                          <span>{item.steps} steps</span>
                        </>
                      )}
                    </div>

                    {/* Prompt */}
                    <p className="text-sm text-muted-foreground truncate">{item.prompt}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
