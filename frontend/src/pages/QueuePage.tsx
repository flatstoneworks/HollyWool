import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ListOrdered, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/api/client'
import { JOB_TYPES, getStatusLabel, type QueueItem } from '@/lib/job-types'

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

  // Normalize all jobs into unified shape using registry
  const queryResults = [imageJobs, videoJobs, i2vJobs, upscaleJobs, downloads]

  const items: QueueItem[] = []
  JOB_TYPES.forEach((config, idx) => {
    const data = queryResults[idx]
    if (!data) return
    const jobs = Array.isArray(data) ? data : (data as any).jobs ?? []
    for (const job of jobs) {
      if (config.isActive(job)) items.push(config.normalize(job))
    }
  })

  // Sort by created_at ascending (oldest first = next to run)
  items.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  const handleCardClick = (item: QueueItem) => {
    const config = JOB_TYPES.find(c => c.type === item.type)
    if (config?.isClickable) {
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
              const config = JOB_TYPES.find(c => c.type === item.type)!
              const TypeIcon = config.icon

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
                    config.isClickable && 'cursor-pointer hover:border-primary/30'
                  )}
                >
                  <div className="px-5 py-4">
                    {/* Top row: type badge, status, model pill */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                          <Loader2 className="h-3 w-3 animate-spin text-primary" />
                        </div>
                        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', config.badgeColor)}>
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
                    {item.source_image_urls && item.source_image_urls.length > 0 && (
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
