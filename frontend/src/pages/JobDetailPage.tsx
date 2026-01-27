import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft, Film, ImageIcon, Loader2, CheckCircle2, XCircle,
  Clock, Cpu, HardDrive, Monitor, Download, Play, AlertCircle,
  RefreshCw, Timer
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { api, Job, VideoJob } from '@/api/client'

type JobType = 'image' | 'video'

// Status step definitions
const statusSteps = [
  { key: 'queued', label: 'Queued', description: 'Waiting in queue' },
  { key: 'downloading', label: 'Downloading', description: 'Downloading model files' },
  { key: 'loading_model', label: 'Loading Model', description: 'Loading model into GPU memory' },
  { key: 'generating', label: 'Generating', description: 'Creating your content' },
  { key: 'saving', label: 'Saving', description: 'Saving output files' },
  { key: 'completed', label: 'Completed', description: 'Generation complete' },
]

// Step timing info
interface StepTiming {
  startedAt: number  // timestamp
  endedAt?: number   // timestamp (if completed)
}

function getStatusIndex(status: string): number {
  const idx = statusSteps.findIndex(s => s.key === status)
  return idx >= 0 ? idx : 0
}

function formatDuration(seconds: number): string {
  if (seconds < 0) return '0s'
  if (seconds < 60) return `${Math.round(seconds)}s`
  const mins = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60)
  return `${mins}m ${secs}s`
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString()
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleString()
}

// Regex to match URLs in text
const urlRegex = /(https?:\/\/[^\s)]+)/g

// Component to render text with clickable URLs
function TextWithLinks({ text, className }: { text: string; className?: string }) {
  const parts = text.split(urlRegex)

  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (urlRegex.test(part)) {
          // Reset regex lastIndex since we're reusing it
          urlRegex.lastIndex = 0
          return (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary/80 hover:underline break-all"
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </a>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </span>
  )
}

export function JobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>()
  const navigate = useNavigate()

  // Track which type of job this is (resolved on first successful fetch)
  const [jobType, setJobType] = useState<JobType | null>(null)

  // Track step timings (persisted in ref to survive re-renders)
  const stepTimingsRef = useRef<Record<string, StepTiming>>({})
  const [stepTimings, setStepTimings] = useState<Record<string, StepTiming>>({})
  const [now, setNow] = useState(Date.now())

  // Update current time every second for live elapsed display
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])

  // Fetch job data -- try video first, then image
  const { data: jobData, isLoading: loading, error: jobError } = useQuery({
    queryKey: ['job-detail', jobId, jobType],
    queryFn: async () => {
      if (!jobId) throw new Error('No job ID')

      // If we already know the type, fetch directly
      if (jobType === 'video') {
        const videoJob = await api.getVideoJob(jobId)
        return { job: videoJob as Job | VideoJob, type: 'video' as JobType }
      }
      if (jobType === 'image') {
        const imageJob = await api.getJob(jobId)
        return { job: imageJob as Job | VideoJob, type: 'image' as JobType }
      }

      // First fetch: try video first, then image
      try {
        const videoJob = await api.getVideoJob(jobId)
        return { job: videoJob as Job | VideoJob, type: 'video' as JobType }
      } catch {
        // Not a video job, try image
      }

      try {
        const imageJob = await api.getJob(jobId)
        return { job: imageJob as Job | VideoJob, type: 'image' as JobType }
      } catch {
        // Not found
      }

      throw new Error('Job not found')
    },
    enabled: !!jobId,
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data) return false
      // Stop polling when job is completed or failed
      if (['completed', 'failed'].includes(data.job.status)) return false
      return 1000
    },
    staleTime: 0,
  })

  // Persist the resolved job type so subsequent fetches go directly to the right endpoint
  useEffect(() => {
    if (jobData && !jobType) {
      setJobType(jobData.type)
    }
  }, [jobData, jobType])

  const job = jobData?.job ?? null
  const error = jobError ? (jobError instanceof Error ? jobError.message : 'Failed to load job') : null

  // Fetch system status while job is active
  const isJobActive = job ? !['completed', 'failed'].includes(job.status) : false
  const { data: systemStatus = null } = useQuery({
    queryKey: ['job-system-status', jobId],
    queryFn: () => api.getSystemStatus(),
    enabled: isJobActive,
    refetchInterval: (query) => {
      // Only poll while enabled (job is active)
      if (!query.state.data && !isJobActive) return false
      return isJobActive ? 2000 : false
    },
    staleTime: 0,
  })

  // Track step transitions and timings
  useEffect(() => {
    if (!job) return

    const currentStatus = job.status
    const currentTime = Date.now()
    const timings = stepTimingsRef.current

    // If this status hasn't been seen before, mark its start time
    if (!timings[currentStatus]) {
      timings[currentStatus] = { startedAt: currentTime }

      // Mark previous step as ended (if it exists and isn't already ended)
      const currentIdx = getStatusIndex(currentStatus)
      if (currentIdx > 0) {
        const prevStep = statusSteps[currentIdx - 1]
        if (prevStep && timings[prevStep.key] && !timings[prevStep.key]!.endedAt) {
          timings[prevStep.key]!.endedAt = currentTime
        }
      }

      // If job started_at is available and we're past queued, use it for better accuracy
      if (job.started_at && currentStatus !== 'queued' && !timings['queued']?.endedAt) {
        const startedAtTime = new Date(job.started_at).getTime()
        if (!timings['queued']) {
          timings['queued'] = { startedAt: new Date(job.created_at).getTime(), endedAt: startedAtTime }
        } else {
          timings['queued'].endedAt = startedAtTime
        }
        // First non-queued step starts at started_at
        if (timings[currentStatus] && currentIdx === 1) {
          timings[currentStatus].startedAt = startedAtTime
        }
      }

      // Update state to trigger re-render
      setStepTimings({ ...timings })
    }

    // If job completed, mark the final step
    if ((currentStatus === 'completed' || currentStatus === 'failed') && job.completed_at) {
      const completedTime = new Date(job.completed_at).getTime()
      // End the previous step if not already ended
      const currentIdx = getStatusIndex(currentStatus)
      if (currentIdx > 0) {
        const prevStep = statusSteps[currentIdx - 1]
        if (prevStep && timings[prevStep.key] && !timings[prevStep.key]!.endedAt) {
          timings[prevStep.key]!.endedAt = completedTime
        }
      }
      if (timings[currentStatus] && !timings[currentStatus].endedAt) {
        timings[currentStatus].endedAt = completedTime
      }
      setStepTimings({ ...timings })
    }
  }, [job?.status, job?.started_at, job?.completed_at])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
      </div>
    )
  }

  if (error || !job) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <XCircle className="h-12 w-12 text-red-400" />
        <p className="text-white/60">{error || 'Job not found'}</p>
        <button
          onClick={() => navigate(-1)}
          className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm transition-colors"
        >
          Go Back
        </button>
      </div>
    )
  }

  const isVideo = jobType === 'video'
  const videoJob = isVideo ? (job as VideoJob) : null
  const currentStepIndex = getStatusIndex(job.status)
  const isFailed = job.status === 'failed'
  const isCompleted = job.status === 'completed'
  const isActive = !isFailed && !isCompleted

  // Calculate elapsed time
  const startTime = job.started_at ? new Date(job.started_at).getTime() : null
  const endTime = job.completed_at ? new Date(job.completed_at).getTime() : Date.now()
  const elapsedSeconds = startTime ? (endTime - startTime) / 1000 : 0

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className={cn(
              'p-2 rounded-lg',
              isVideo ? 'bg-purple-500/20' : 'bg-blue-500/20'
            )}>
              {isVideo ? (
                <Film className="h-5 w-5 text-purple-400" />
              ) : (
                <ImageIcon className="h-5 w-5 text-blue-400" />
              )}
            </div>
            <div>
              <h1 className="text-lg font-medium text-white">
                {isVideo ? 'Video' : 'Image'} Generation
              </h1>
              <p className="text-xs text-white/40 font-mono">{job.id}</p>
            </div>
          </div>
        </div>

        {/* Status Banner */}
        <div className={cn(
          'p-4 rounded-xl border',
          isFailed ? 'bg-red-500/10 border-red-500/30' :
          isCompleted ? 'bg-green-500/10 border-green-500/30' :
          'bg-primary/10 border-primary/30'
        )}>
          <div className="flex items-center gap-3">
            {isFailed ? (
              <XCircle className="h-6 w-6 text-red-400" />
            ) : isCompleted ? (
              <CheckCircle2 className="h-6 w-6 text-green-400" />
            ) : (
              <Loader2 className="h-6 w-6 text-primary animate-spin" />
            )}
            <div className="flex-1">
              <p className={cn(
                'font-medium',
                isFailed ? 'text-red-300' :
                isCompleted ? 'text-green-300' :
                'text-primary'
              )}>
                {isFailed ? 'Generation Failed' :
                 isCompleted ? 'Generation Complete' :
                 statusSteps[currentStepIndex]?.label || job.status}
              </p>
              <p className="text-sm text-white/60">
                {isFailed ? <TextWithLinks text={job.error || 'Unknown error'} /> :
                 isCompleted ? `Completed in ${formatDuration(elapsedSeconds)}` :
                 statusSteps[currentStepIndex]?.description}
              </p>
            </div>
            {isActive && job.eta_seconds && job.eta_seconds > 0 && (
              <div className="text-right">
                <p className="text-sm text-white/40">ETA</p>
                <p className="text-white font-medium">{formatDuration(job.eta_seconds)}</p>
              </div>
            )}
          </div>
        </div>

        {/* Progress and Details side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Progress Steps */}
          <div className="glass rounded-xl p-6">
            <h2 className="text-sm font-medium text-white/60 mb-4">Progress</h2>
            <div className="space-y-4">
              {statusSteps.slice(0, -1).map((step, idx) => {
                const isPast = idx < currentStepIndex
                const isCurrent = idx === currentStepIndex && isActive
                const timing = stepTimings[step.key]

                // Calculate duration for this step
                let stepDuration: number | null = null
                let stepStartTime: string | null = null
                let stepEndTime: string | null = null

                if (timing) {
                  stepStartTime = formatTime(timing.startedAt)
                  if (timing.endedAt) {
                    stepEndTime = formatTime(timing.endedAt)
                    stepDuration = (timing.endedAt - timing.startedAt) / 1000
                  } else if (isCurrent) {
                    // Live elapsed time for current step
                    stepDuration = (now - timing.startedAt) / 1000
                  }
                }

                return (
                  <div key={step.key} className="flex items-start gap-3">
                    <div className={cn(
                      'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-all mt-0.5',
                      isPast ? 'bg-primary border-primary' :
                      isCurrent ? 'border-primary bg-primary/20' :
                      isFailed && idx === currentStepIndex ? 'border-red-500 bg-red-500/20' :
                      'border-white/20 bg-white/5'
                    )}>
                      {isPast ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                      ) : isCurrent ? (
                        <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
                      ) : isFailed && idx === currentStepIndex ? (
                        <XCircle className="h-3.5 w-3.5 text-red-400" />
                      ) : (
                        <span className="text-xs text-white/40">{idx + 1}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className={cn(
                          'text-sm font-medium',
                          isPast || isCurrent ? 'text-white' : 'text-white/40'
                        )}>
                          {step.label}
                        </p>
                        {/* Duration badge */}
                        {stepDuration !== null && (
                          <span className={cn(
                            'text-xs px-2 py-0.5 rounded-full flex items-center gap-1',
                            isCurrent ? 'bg-primary/20 text-primary' : 'bg-white/10 text-white/60'
                          )}>
                            <Timer className="h-3 w-3" />
                            {formatDuration(stepDuration)}
                          </span>
                        )}
                      </div>

                      {/* Timing details for past/current steps */}
                      {timing && (isPast || isCurrent) && (
                        <div className="flex items-center gap-3 mt-1 text-xs text-white/40">
                          <span>Started: {stepStartTime}</span>
                          {stepEndTime && <span>Ended: {stepEndTime}</span>}
                        </div>
                      )}

                      {/* Download progress */}
                      {isCurrent && step.key === 'downloading' && job.download_progress > 0 && (
                        <div className="mt-2">
                          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary transition-all"
                              style={{ width: `${job.download_progress}%` }}
                            />
                          </div>
                          <p className="text-xs text-white/40 mt-1">
                            {job.download_progress.toFixed(1)}%
                            {job.download_speed_mbps && ` • ${job.download_speed_mbps.toFixed(1)} MB/s`}
                          </p>
                        </div>
                      )}

                      {/* Generation progress */}
                      {isCurrent && step.key === 'generating' && (
                        <div className="mt-2">
                          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary transition-all"
                              style={{ width: `${job.progress}%` }}
                            />
                          </div>
                          <p className="text-xs text-white/40 mt-1">
                            {job.progress.toFixed(0)}% complete
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Total elapsed time */}
            {job.started_at && (
              <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between">
                <span className="text-sm text-white/60">Total Time</span>
                <span className="text-sm font-medium text-white flex items-center gap-2">
                  <Clock className="h-4 w-4 text-white/40" />
                  {formatDuration(elapsedSeconds)}
                  {isActive && <span className="text-xs text-white/40">(running)</span>}
                </span>
              </div>
            )}
          </div>

          {/* Job Details */}
          <div className="glass rounded-xl p-6">
            <h2 className="text-sm font-medium text-white/60 mb-4">Details</h2>
            <dl className="space-y-3">
              <div>
                <dt className="text-xs text-white/40">Prompt</dt>
                <dd className="text-sm text-white mt-1">{job.prompt}</dd>
              </div>
              <div>
                <dt className="text-xs text-white/40">Model</dt>
                <dd className="text-sm mt-1">
                  <Link
                    to={`/model/${job.model}`}
                    className="text-primary hover:text-primary/80 hover:underline transition-colors"
                  >
                    {job.model}
                  </Link>
                </dd>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-xs text-white/40">Resolution</dt>
                  <dd className="text-sm text-white mt-1">{job.width} × {job.height}</dd>
                </div>
                <div>
                  <dt className="text-xs text-white/40">Steps</dt>
                  <dd className="text-sm text-white mt-1">{job.steps}</dd>
                </div>
              </div>
              {isVideo && videoJob && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <dt className="text-xs text-white/40">Frames</dt>
                    <dd className="text-sm text-white mt-1">{videoJob.num_frames} @ {videoJob.fps}fps</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-white/40">Duration</dt>
                    <dd className="text-sm text-white mt-1">
                      {(videoJob.num_frames / videoJob.fps).toFixed(1)}s
                    </dd>
                  </div>
                </div>
              )}
            </dl>

            {/* Timeline inside Details */}
            <div className="mt-6 pt-4 border-t border-white/10">
              <h3 className="text-xs text-white/40 mb-3">Timeline</h3>
              <dl className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <dt className="text-white/40 flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Created
                  </dt>
                  <dd className="text-white">{formatDateTime(job.created_at)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-white/40 flex items-center gap-1">
                    <Play className="h-3 w-3" /> Started
                  </dt>
                  <dd className="text-white">{formatDateTime(job.started_at)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-white/40 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Completed
                  </dt>
                  <dd className="text-white">{formatDateTime(job.completed_at)}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>

        {/* System Resources (only while active) */}
        {isActive && systemStatus && (
          <div className="glass rounded-xl p-6">
            <h2 className="text-sm font-medium text-white/60 mb-4 flex items-center gap-2">
              <RefreshCw className="h-4 w-4 animate-spin" />
              System Resources (Live)
            </h2>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <dt className="text-xs text-white/40 flex items-center gap-1">
                  <HardDrive className="h-3 w-3" /> Memory
                </dt>
                <dd className="text-sm text-white mt-1">
                  {systemStatus.memory_used_gb.toFixed(1)} / {systemStatus.memory_total_gb.toFixed(0)} GB
                </dd>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden mt-2">
                  <div
                    className="h-full bg-blue-500 transition-all"
                    style={{ width: `${systemStatus.memory_percent}%` }}
                  />
                </div>
                <p className="text-xs text-white/40 mt-1">{systemStatus.memory_percent.toFixed(1)}% used</p>
              </div>
              <div>
                <dt className="text-xs text-white/40 flex items-center gap-1">
                  <Monitor className="h-3 w-3" /> GPU
                </dt>
                <dd className="text-sm text-white mt-1">
                  {systemStatus.gpu_utilization !== null ? `${systemStatus.gpu_utilization.toFixed(0)}%` : 'N/A'}
                </dd>
                {systemStatus.gpu_utilization !== null && (
                  <>
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden mt-2">
                      <div
                        className="h-full bg-green-500 transition-all"
                        style={{ width: `${systemStatus.gpu_utilization}%` }}
                      />
                    </div>
                    <p className="text-xs text-white/40 mt-1">utilization</p>
                  </>
                )}
              </div>
              <div>
                <dt className="text-xs text-white/40 flex items-center gap-1">
                  <Cpu className="h-3 w-3" /> CPU
                </dt>
                <dd className="text-sm text-white mt-1">{systemStatus.cpu_percent.toFixed(0)}%</dd>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden mt-2">
                  <div
                    className="h-full bg-amber-500 transition-all"
                    style={{ width: `${systemStatus.cpu_percent}%` }}
                  />
                </div>
                <p className="text-xs text-white/40 mt-1">utilization</p>
              </div>
            </div>
          </div>
        )}

        {/* Result Preview (for completed video jobs) */}
        {isCompleted && isVideo && videoJob?.video && (
          <div className="glass rounded-xl overflow-hidden">
            <div className="p-4 border-b border-white/10">
              <h2 className="text-sm font-medium text-white/60">Result</h2>
            </div>
            <div className="relative aspect-video bg-black">
              <video
                src={videoJob.video.url}
                controls
                className="w-full h-full object-contain"
              />
            </div>
            <div className="p-4 flex items-center justify-between">
              <div className="text-sm text-white/60">
                {videoJob.video.width}×{videoJob.video.height} • {videoJob.video.duration.toFixed(1)}s • {videoJob.video.fps}fps
                {videoJob.video.has_audio && ' • Audio'}
              </div>
              <a
                href={videoJob.video.url}
                download={videoJob.video.filename}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-white text-sm font-medium transition-colors"
              >
                <Download className="h-4 w-4" />
                Download
              </a>
            </div>
          </div>
        )}

        {/* Error Details */}
        {isFailed && job.error && (
          <div className="glass rounded-xl p-6 border border-red-500/30">
            <h2 className="text-sm font-medium text-red-400 mb-2 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Error Details
            </h2>
            <div className="text-sm text-white/80 font-mono bg-red-500/10 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap">
              <TextWithLinks text={job.error} />
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between pt-4">
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm transition-colors"
          >
            Go Back
          </button>
          {isCompleted && (
            <Link
              to={isVideo ? '/video' : '/image'}
              className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-white text-sm font-medium transition-colors"
            >
              Generate More
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
