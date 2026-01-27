import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Bell, ImageIcon, Film, Loader2, X, ChevronRight,
  CheckCircle2, XCircle, Clock, Download
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { api, Job, VideoJob, CivitaiDownloadJob, HFDownloadJob } from '@/api/client'

interface Activity {
  id: string
  type: 'image' | 'video' | 'download'
  sessionId: string | null
  prompt: string
  status: string
  progress: number
  model: string
  completedAt?: number | null
  createdAt?: number
  error?: string | null
  filename?: string
  civitaiModelId?: number
  hfModelId?: string
}

function jobToActivity(job: Job | VideoJob, type: 'image' | 'video'): Activity {
  return {
    id: job.id,
    type,
    sessionId: job.session_id,
    prompt: job.prompt,
    status: job.status,
    progress: job.progress,
    model: job.model,
    completedAt: job.completed_at ? new Date(job.completed_at).getTime() / 1000 : null,
    createdAt: job.created_at ? new Date(job.created_at).getTime() / 1000 : undefined,
    error: job.error,
  }
}

function downloadToActivity(job: CivitaiDownloadJob): Activity {
  const statusMap: Record<string, string> = {
    queued: 'queued',
    downloading: 'downloading',
    completed: 'completed',
    failed: 'failed',
    cancelled: 'failed',
  }
  return {
    id: job.id,
    type: 'download',
    sessionId: null,
    prompt: job.model_name,
    status: statusMap[job.status] || job.status,
    progress: job.progress,
    model: job.type,
    completedAt: job.completed_at ? new Date(job.completed_at).getTime() / 1000 : null,
    createdAt: job.created_at ? new Date(job.created_at).getTime() / 1000 : undefined,
    error: job.error,
    filename: job.filename,
    civitaiModelId: job.civitai_model_id,
  }
}

function hfDownloadToActivity(job: HFDownloadJob): Activity {
  return {
    id: job.id,
    type: 'download',
    sessionId: null,
    prompt: job.model_name,
    status: job.status,
    progress: job.progress,
    model: job.model_path,
    completedAt: job.completed_at ? new Date(job.completed_at).getTime() / 1000 : null,
    createdAt: job.created_at ? new Date(job.created_at).getTime() / 1000 : undefined,
    error: job.error,
    hfModelId: job.model_id,
  }
}

function formatTimeAgo(timestamp: number | null | undefined): string {
  if (!timestamp) return ''
  const now = Date.now() / 1000
  const diff = now - timestamp

  if (diff < 60) return 'Just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export function NotificationsButton() {
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)

  // Poll for image jobs
  const { data: imageJobsData } = useQuery({
    queryKey: ['notifications-image-jobs'],
    queryFn: () => api.getJobs(),
    refetchInterval: 2000,
    staleTime: 0,
  })

  // Poll for video jobs
  const { data: videoJobsData } = useQuery({
    queryKey: ['notifications-video-jobs'],
    queryFn: () => api.getVideoJobs(),
    refetchInterval: 2000,
    staleTime: 0,
  })

  // Poll for civitai downloads
  const { data: downloadJobsData } = useQuery({
    queryKey: ['notifications-civitai-downloads'],
    queryFn: () => api.getCivitaiDownloads(),
    refetchInterval: 2000,
    staleTime: 0,
  })

  // Poll for HuggingFace model downloads
  const { data: hfDownloadJobsData } = useQuery({
    queryKey: ['notifications-hf-downloads'],
    queryFn: () => api.getHFDownloads(),
    refetchInterval: 2000,
    staleTime: 0,
  })

  // Derive active and done activities from query data
  const { activeActivities, doneActivities } = useMemo(() => {
    const active: Activity[] = []
    const done: Activity[] = []

    // Process image jobs
    if (imageJobsData) {
      for (const job of imageJobsData.jobs) {
        const activity = jobToActivity(job, 'image')
        if (['completed', 'failed'].includes(job.status)) {
          done.push(activity)
        } else {
          active.push(activity)
        }
      }
    }

    // Process video jobs
    if (videoJobsData) {
      for (const job of videoJobsData.jobs) {
        const activity = jobToActivity(job, 'video')
        if (['completed', 'failed'].includes(job.status)) {
          done.push(activity)
        } else {
          active.push(activity)
        }
      }
    }

    // Process civitai download jobs
    if (downloadJobsData) {
      for (const job of downloadJobsData) {
        const activity = downloadToActivity(job)
        if (['completed', 'failed', 'cancelled'].includes(job.status)) {
          done.push(activity)
        } else {
          active.push(activity)
        }
      }
    }

    // Process HuggingFace model download jobs
    if (hfDownloadJobsData) {
      for (const job of hfDownloadJobsData) {
        const activity = hfDownloadToActivity(job)
        if (['completed', 'failed'].includes(job.status)) {
          done.push(activity)
        } else {
          active.push(activity)
        }
      }
    }

    // Sort done by completion time (most recent first)
    done.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0))

    return { activeActivities: active, doneActivities: done.slice(0, 5) }
  }, [imageJobsData, videoJobsData, downloadJobsData, hfDownloadJobsData])

  const handleNavigateToJob = (activity: Activity) => {
    if (activity.status === 'failed') {
      navigate(`/logs?selected=${activity.id}`)
    } else if (activity.type === 'download' && activity.civitaiModelId) {
      navigate(`/models/civitai/${activity.civitaiModelId}`)
    } else if (activity.type === 'download' && activity.hfModelId) {
      navigate(`/model/${activity.hfModelId}`)
    } else if (activity.type !== 'download') {
      navigate(`/job/${activity.id}`)
    }
    setIsOpen(false)
  }

  const activeCount = activeActivities.length
  const totalCount = activeCount + doneActivities.length

  const formatStatus = (status: string) => {
    return status.replace(/_/g, ' ')
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'relative p-2 rounded-lg transition-colors',
          isOpen
            ? 'bg-accent text-foreground'
            : 'text-muted-foreground hover:text-foreground hover:bg-accent'
        )}
      >
        <Bell className="h-5 w-5" />
        {activeCount > 0 && (
          <span className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
            {activeCount > 9 ? '9+' : activeCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-96 rounded-xl bg-card border border-border shadow-xl z-50 overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground">Activity</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[28rem] overflow-y-auto scrollbar-thin">
              {totalCount === 0 ? (
                <div className="px-4 py-8 text-center">
                  <Bell className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No recent activity</p>
                </div>
              ) : (
                <>
                  {/* Active Section */}
                  {activeCount > 0 && (
                    <div>
                      <div className="px-4 py-2 bg-muted border-b border-border">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          In Progress ({activeCount})
                        </span>
                      </div>
                      <div className="divide-y divide-border">
                        {activeActivities.map((activity) => (
                          <button
                            key={activity.id}
                            onClick={() => handleNavigateToJob(activity)}
                            className="w-full px-4 py-3 hover:bg-accent transition-colors text-left"
                          >
                            <div className="flex items-start gap-3">
                              <div className={cn(
                                'p-1.5 rounded-lg flex-shrink-0',
                                activity.type === 'download' ? 'bg-green-500/20' :
                                activity.type === 'image' ? 'bg-blue-500/20' : 'bg-purple-500/20'
                              )}>
                                {activity.type === 'download' ? (
                                  <Download className="h-4 w-4 text-green-500" />
                                ) : activity.type === 'image' ? (
                                  <ImageIcon className="h-4 w-4 text-blue-500" />
                                ) : (
                                  <Film className="h-4 w-4 text-purple-500" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-foreground/80 truncate">{activity.prompt}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <Loader2 className="h-3 w-3 text-primary animate-spin" />
                                  <span className="text-xs text-muted-foreground capitalize">
                                    {formatStatus(activity.status)}
                                  </span>
                                  <span className="text-xs text-muted-foreground/50">•</span>
                                  <span className="text-xs text-muted-foreground">{activity.model}</span>
                                </div>
                                {/* Progress bar */}
                                <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-primary transition-all duration-300"
                                    style={{ width: `${activity.progress}%` }}
                                  />
                                </div>
                              </div>
                              <ChevronRight className="h-4 w-4 text-muted-foreground/50 flex-shrink-0 mt-1" />
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Done Section */}
                  {doneActivities.length > 0 && (
                    <div>
                      <div className="px-4 py-2 bg-muted border-b border-border">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                          <Clock className="h-3 w-3" />
                          Recent ({doneActivities.length})
                        </span>
                      </div>
                      <div className="divide-y divide-border">
                        {doneActivities.map((activity) => (
                          <button
                            key={activity.id}
                            onClick={() => handleNavigateToJob(activity)}
                            className="w-full px-4 py-3 hover:bg-accent transition-colors text-left"
                          >
                            <div className="flex items-start gap-3">
                              <div className={cn(
                                'p-1.5 rounded-lg flex-shrink-0',
                                activity.status === 'completed'
                                  ? 'bg-green-500/20'
                                  : 'bg-red-500/20'
                              )}>
                                {activity.status === 'completed' ? (
                                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                                ) : (
                                  <XCircle className="h-4 w-4 text-red-500" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-foreground/80 truncate">{activity.prompt}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  {activity.type === 'download' ? (
                                    <Download className="h-3 w-3 text-muted-foreground" />
                                  ) : activity.type === 'image' ? (
                                    <ImageIcon className="h-3 w-3 text-muted-foreground" />
                                  ) : (
                                    <Film className="h-3 w-3 text-muted-foreground" />
                                  )}
                                  <span className="text-xs text-muted-foreground capitalize">
                                    {activity.type}
                                  </span>
                                  <span className="text-xs text-muted-foreground/50">•</span>
                                  <span className="text-xs text-muted-foreground">{activity.model}</span>
                                  {activity.completedAt && (
                                    <>
                                      <span className="text-xs text-muted-foreground/50">•</span>
                                      <span className="text-xs text-muted-foreground">
                                        {formatTimeAgo(activity.completedAt)}
                                      </span>
                                    </>
                                  )}
                                </div>
                                {activity.status === 'failed' && activity.error && (
                                  <p className="text-xs text-red-500/80 mt-1 truncate">
                                    {activity.error}
                                  </p>
                                )}
                              </div>
                              <ChevronRight className="h-4 w-4 text-muted-foreground/50 flex-shrink-0 mt-1" />
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
