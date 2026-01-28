import { useState, useRef, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Sparkles, ChevronDown, Palette, X, Wand2,
  Plus, Square, Monitor,
  AlertCircle, Loader2, Download, Volume2, Upload, Image as ImageIcon
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { JobProgressCard } from '@/components/JobProgressCard'
import { toast } from '@/hooks/use-toast'
import { useResizableSidebar } from '@/hooks/useResizableSidebar'
import { SessionSidebar } from '@/components/SessionSidebar'
import { fileToBase64 } from '@/lib/file-utils'
import {
  getVideoSessions, createVideoSession, setCurrentVideoSessionId, getCurrentVideoSessionId,
  deleteVideoSession, renameVideoSession, ensureCurrentVideoSession, updateVideoSession,
  type VideoSession
} from '@/lib/video-sessions'
import { api, VideoJob, VideoGenerateRequest, I2VJob, I2VGenerateRequest } from '@/api/client'
import { PREVIEW_MODELS, PROVIDER_PRESETS, type ModelProvider } from '@/types/providers'

type AspectRatio = '16:9' | '9:16' | '1:1'
type Resolution = '720p' | '1080p'

// Video generation models
interface VideoModel {
  id: string
  name: string
  description: string
  maxDuration: number  // seconds
  supportedResolutions: Resolution[]
  requiresApproval?: boolean
  approvalUrl?: string
  supportsI2V: boolean  // true if model supports image-to-video
}

const videoModels: VideoModel[] = [
  // Text-to-Video models
  {
    id: 'ltx-2',
    name: 'LTX-2',
    description: 'High-quality video + audio, 5s at 24fps',
    maxDuration: 5,
    supportedResolutions: ['720p', '1080p'],
    supportsI2V: false,
  },
  {
    id: 'ltx-2-fp8',
    name: 'LTX-2 (FP8)',
    description: 'LTX-2 with lower memory usage',
    maxDuration: 5,
    supportedResolutions: ['720p', '1080p'],
    supportsI2V: false,
  },
  {
    id: 'cogvideox-5b',
    name: 'CogVideoX-5B',
    description: 'High-quality video generation, 6s clips',
    maxDuration: 6,
    supportedResolutions: ['720p'],
    supportsI2V: false,
  },
  {
    id: 'cogvideox-2b',
    name: 'CogVideoX-2B',
    description: 'Faster, lighter video model',
    maxDuration: 6,
    supportedResolutions: ['720p'],
    supportsI2V: false,
  },
  {
    id: 'wan22-t2v',
    name: 'Wan2.2 T2V',
    description: 'High-quality MoE text-to-video, 5s at 16fps',
    maxDuration: 5,
    supportedResolutions: ['720p'],
    supportsI2V: false,
  },
  {
    id: 'mochi-1',
    name: 'Mochi 1',
    description: 'Genmo 10B video model, smooth motion at 30fps',
    maxDuration: 3,
    supportedResolutions: ['720p'],
    supportsI2V: false,
  },
  // Image-to-Video models
  {
    id: 'cogvideox-5b-i2v',
    name: 'CogVideoX-5B',
    description: 'Animate images into video clips, 6s',
    maxDuration: 6,
    supportedResolutions: ['720p'],
    supportsI2V: true,
  },
  {
    id: 'wan22-i2v',
    name: 'Wan2.2 I2V',
    description: 'Animate images with Wan2.2 MoE, 5s at 16fps',
    maxDuration: 5,
    supportedResolutions: ['720p'],
    supportsI2V: true,
  },
  {
    id: 'svd-xt',
    name: 'SVD XT',
    description: 'Stable Video Diffusion, smooth motion',
    maxDuration: 4,
    supportedResolutions: ['720p', '1080p'],
    supportsI2V: true,
  },
]

const aspectRatios: { value: AspectRatio; label: string }[] = [
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '1:1', label: '1:1' },
]

const resolutions: { value: Resolution; label: string }[] = [
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' },
]

const stylePresets = [
  { id: 'none', label: 'None', prefix: '' },
  { id: 'cinematic', label: 'Cinematic', prefix: 'cinematic film, dramatic lighting, ' },
  { id: 'anime', label: 'Anime', prefix: 'anime style, vibrant colors, ' },
  { id: 'realistic', label: 'Realistic', prefix: 'photorealistic, 4k footage, ' },
]

export function VideoPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  // Fetch configured providers
  const { data: providersData } = useQuery({
    queryKey: ['providers'],
    queryFn: api.getProviders,
  })

  // Get configured remote providers with video models
  const configuredVideoProviders = Object.entries(providersData?.providers || {})
    .filter(([_, config]) => config.is_configured && config.is_enabled)
    .map(([providerId]) => providerId as ModelProvider)
    .filter(providerId => PREVIEW_MODELS[providerId]?.some(m => m.type === 'video'))

  const [prompt, setPrompt] = useState('')
  const initialModel = searchParams.get('model') || 'ltx-2'
  const [selectedModel, setSelectedModel] = useState<string>(initialModel)
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9')
  const [resolution, setResolution] = useState<Resolution>('720p')
  const [selectedStyle, setSelectedStyle] = useState('none')
  const [showModelMenu, setShowModelMenu] = useState(false)
  const [showStyleMenu, setShowStyleMenu] = useState(false)
  const [showAspectMenu, setShowAspectMenu] = useState(false)
  const [showResolutionMenu, setShowResolutionMenu] = useState(false)

  // I2V state - source image
  const [sourceImage, setSourceImage] = useState<File | null>(null)
  const [sourceImagePreview, setSourceImagePreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Session management (video sessions are separate from image sessions)
  const [sessions, setSessions] = useState<VideoSession[]>([])
  const [currentSession, setCurrentSession] = useState<VideoSession | null>(null)

  // Resizable sidebar
  const { sidebarWidth, isResizing, handleResizeStart } = useResizableSidebar()

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Dropdown refs for click-outside detection
  const modelMenuRef = useRef<HTMLDivElement>(null)
  const styleMenuRef = useRef<HTMLDivElement>(null)
  const aspectMenuRef = useRef<HTMLDivElement>(null)
  const resolutionMenuRef = useRef<HTMLDivElement>(null)

  // Click-outside detection for dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (showModelMenu && modelMenuRef.current && !modelMenuRef.current.contains(target)) {
        setShowModelMenu(false)
      }
      if (showStyleMenu && styleMenuRef.current && !styleMenuRef.current.contains(target)) {
        setShowStyleMenu(false)
      }
      if (showAspectMenu && aspectMenuRef.current && !aspectMenuRef.current.contains(target)) {
        setShowAspectMenu(false)
      }
      if (showResolutionMenu && resolutionMenuRef.current && !resolutionMenuRef.current.contains(target)) {
        setShowResolutionMenu(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showModelMenu, showStyleMenu, showAspectMenu, showResolutionMenu])

  // Video generation state - track jobs by ID like ImagePage
  const [activeJobs, setActiveJobs] = useState<Record<string, VideoJob>>({})
  const [completedJobs, setCompletedJobs] = useState<VideoJob[]>([])
  const [failedJobs, setFailedJobs] = useState<VideoJob[]>([])

  // I2V job state
  const [activeI2VJobs, setActiveI2VJobs] = useState<Record<string, I2VJob>>({})
  const [completedI2VJobs, setCompletedI2VJobs] = useState<I2VJob[]>([])
  const [failedI2VJobs, setFailedI2VJobs] = useState<I2VJob[]>([])

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Initialize video sessions - resolve from URL or set default
  useEffect(() => {
    const initSessions = async () => {
      const urlSessionId = searchParams.get('session')
      const allSessions = getVideoSessions()

      let session: VideoSession | null = null

      // Try to find session from URL param
      if (urlSessionId) {
        session = allSessions.find(s => s.id === urlSessionId) || null
      }

      // If no valid session from URL, use ensureCurrentVideoSession
      if (!session) {
        session = await ensureCurrentVideoSession()
        // Set URL with replace so back button doesn't go to no-session URL
        if (session) {
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev)
            next.set('session', session!.id)
            return next
          }, { replace: true })
        }
      } else {
        // Valid session from URL - make it current in localStorage too
        setCurrentVideoSessionId(session.id)
      }

      setCurrentSession(session)
      setSessions(getVideoSessions())
    }
    initSessions()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Helper to get dimensions from aspect ratio and resolution
  const getDimensions = (aspect: AspectRatio, res: Resolution): { width: number; height: number } => {
    const heights = { '720p': 720, '1080p': 1080 }
    const h = heights[res]
    switch (aspect) {
      case '16:9': return { width: Math.round(h * 16 / 9), height: h }
      case '9:16': return { width: Math.round(h * 9 / 16), height: h }
      case '1:1': return { width: h, height: h }
    }
  }

  // Load jobs for current session (both active and completed) + orphaned jobs
  useEffect(() => {
    if (!currentSession) return

    const loadSessionJobs = async () => {
      try {
        // Load jobs for current session
        const { jobs: sessionJobs } = await api.getVideoJobs({ session_id: currentSession.id })

        // Also load all jobs to find orphaned ones (no session_id)
        const { jobs: allJobs } = await api.getVideoJobs({})
        const orphanedJobs = allJobs.filter(j => !j.session_id)

        // Combine session jobs and orphaned jobs
        const jobs = [...sessionJobs, ...orphanedJobs]

        // Deduplicate by job id
        const uniqueJobs = jobs.filter((job, index, self) =>
          index === self.findIndex(j => j.id === job.id)
        )

        // Separate active, completed, and failed jobs
        const active: Record<string, VideoJob> = {}
        const completed: VideoJob[] = []
        const failed: VideoJob[] = []

        for (const job of uniqueJobs) {
          if (job.status === 'completed' && job.video) {
            completed.push(job)
          } else if (job.status === 'failed') {
            failed.push(job)
          } else if (!['completed', 'failed'].includes(job.status)) {
            active[job.id] = job
          }
        }

        // Sort by created_at descending
        completed.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        failed.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

        setActiveJobs(active)
        setCompletedJobs(completed)
        setFailedJobs(failed)
      } catch (err) {
        console.error('Failed to load session videos:', err)
      }
    }

    loadSessionJobs()
  }, [currentSession?.id])

  // Poll for job status updates
  useEffect(() => {
    const hasActiveJobs = Object.values(activeJobs).some(
      job => job && !['completed', 'failed'].includes(job.status)
    )

    if (!hasActiveJobs) return

    const pollJobs = async () => {
      const jobIds = Object.keys(activeJobs)

      for (const jobId of jobIds) {
        const job = activeJobs[jobId]
        if (!job || job.status === 'completed' || job.status === 'failed') continue

        try {
          const updatedJob = await api.getVideoJob(jobId)
          setActiveJobs(prev => ({ ...prev, [jobId]: updatedJob }))

          if (updatedJob.status === 'completed' && updatedJob.session_id === currentSession?.id) {
            // Add to completed jobs for this session
            setCompletedJobs(prev => [updatedJob, ...prev.filter(j => j.id !== updatedJob.id)])
            // Remove from active jobs
            setActiveJobs(prev => {
              const next = { ...prev }
              delete next[jobId]
              return next
            })
            // Update session thumbnail with first frame
            if (updatedJob.video?.url) {
              updateVideoSession(updatedJob.session_id, { thumbnail: updatedJob.video.url })
              setSessions(getVideoSessions())
            }
          } else if (updatedJob.status === 'failed') {
            // Add to failed jobs for this session
            if (updatedJob.session_id === currentSession?.id) {
              setFailedJobs(prev => [updatedJob, ...prev.filter(j => j.id !== updatedJob.id)])
            }
            // Remove from active jobs
            setActiveJobs(prev => {
              const next = { ...prev }
              delete next[jobId]
              return next
            })
          }
        } catch (err) {
          console.error('Failed to poll job status:', err)
        }
      }
    }

    const interval = setInterval(pollJobs, 1000)
    return () => clearInterval(interval)
  }, [activeJobs, currentSession?.id])

  // Get active jobs for current session
  const currentSessionActiveJobs = Object.values(activeJobs).filter(
    job => job && job.session_id === currentSession?.id && !['completed', 'failed'].includes(job.status)
  )

  // Load I2V jobs for current session
  useEffect(() => {
    if (!currentSession) return

    const loadI2VJobs = async () => {
      try {
        const { jobs } = await api.getI2VJobs({ session_id: currentSession.id })

        const active: Record<string, I2VJob> = {}
        const completed: I2VJob[] = []
        const failed: I2VJob[] = []

        for (const job of jobs) {
          if (job.status === 'completed' && job.video) {
            completed.push(job)
          } else if (job.status === 'failed') {
            failed.push(job)
          } else if (!['completed', 'failed'].includes(job.status)) {
            active[job.id] = job
          }
        }

        completed.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        failed.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

        setActiveI2VJobs(active)
        setCompletedI2VJobs(completed)
        setFailedI2VJobs(failed)
      } catch (err) {
        console.error('Failed to load I2V jobs:', err)
      }
    }

    loadI2VJobs()
  }, [currentSession?.id])

  // Poll for I2V job status updates
  useEffect(() => {
    const hasActiveI2VJobs = Object.values(activeI2VJobs).some(
      job => job && !['completed', 'failed'].includes(job.status)
    )

    if (!hasActiveI2VJobs) return

    const pollI2VJobs = async () => {
      const jobIds = Object.keys(activeI2VJobs)

      for (const jobId of jobIds) {
        const job = activeI2VJobs[jobId]
        if (!job || job.status === 'completed' || job.status === 'failed') continue

        try {
          const updatedJob = await api.getI2VJob(jobId)
          setActiveI2VJobs(prev => ({ ...prev, [jobId]: updatedJob }))

          if (updatedJob.status === 'completed' && updatedJob.session_id === currentSession?.id) {
            setCompletedI2VJobs(prev => [updatedJob, ...prev.filter(j => j.id !== updatedJob.id)])
            setActiveI2VJobs(prev => {
              const next = { ...prev }
              delete next[jobId]
              return next
            })
            // Use source image as thumbnail for I2V (it's an actual image, not video)
            if (updatedJob.source_image_urls?.[0]) {
              updateVideoSession(updatedJob.session_id, { thumbnail: updatedJob.source_image_urls[0] })
              setSessions(getVideoSessions())
            }
          } else if (updatedJob.status === 'failed') {
            if (updatedJob.session_id === currentSession?.id) {
              setFailedI2VJobs(prev => [updatedJob, ...prev.filter(j => j.id !== updatedJob.id)])
            }
            setActiveI2VJobs(prev => {
              const next = { ...prev }
              delete next[jobId]
              return next
            })
          }
        } catch (err) {
          console.error('Failed to poll I2V job status:', err)
        }
      }
    }

    const interval = setInterval(pollI2VJobs, 1000)
    return () => clearInterval(interval)
  }, [activeI2VJobs, currentSession?.id])

  // Get active I2V jobs for current session
  const currentSessionActiveI2VJobs = Object.values(activeI2VJobs).filter(
    job => job && job.session_id === currentSession?.id && !['completed', 'failed'].includes(job.status)
  )

  const selectedStyleInfo = stylePresets.find(s => s.id === selectedStyle)!
  const selectedModelInfo = videoModels.find(m => m.id === selectedModel)!

  // Filter resolutions based on selected model
  const availableResolutions = resolutions.filter(r =>
    selectedModelInfo.supportedResolutions.includes(r.value)
  )

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px'
    }
  }, [prompt])

  // Reset resolution if not supported by new model
  useEffect(() => {
    if (!selectedModelInfo.supportedResolutions.includes(resolution)) {
      const defaultRes = selectedModelInfo.supportedResolutions[0] || '720p'
      setResolution(defaultRes)
    }
  }, [selectedModel])

  // Handle file upload
  const addSourceFile = (file: File) => {
    setSourceImage(file)
    const reader = new FileReader()
    reader.onloadend = () => {
      setSourceImagePreview(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      addSourceFile(file)
    }
  }

  const clearSourceImage = () => {
    setSourceImage(null)
    setSourceImagePreview(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Drag and drop for source images (I2V)
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const dragCounter = useRef(0)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current++
    if (e.dataTransfer.types.includes('Files') && selectedModelInfo?.supportsI2V) {
      setIsDraggingOver(true)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current--
    if (dragCounter.current === 0) {
      setIsDraggingOver(false)
    }
  }

  const handleDropImage = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current = 0
    setIsDraggingOver(false)
    if (!selectedModelInfo?.supportsI2V) return
    const file = Array.from(e.dataTransfer.files).find(f => f.type.startsWith('image/'))
    if (file) {
      addSourceFile(file)
    }
  }

  const handleGenerate = async () => {
    if (!prompt.trim() || isSubmitting || !currentSession) return

    // For I2V models, require an image
    if (selectedModelInfo.supportsI2V && !sourceImage) {
      setError('Please upload a source image for this model')
      return
    }

    setError(null)
    setIsSubmitting(true)

    const { width, height } = getDimensions(aspectRatio, resolution)
    const fullPrompt = selectedStyleInfo.prefix + prompt.trim()

    try {
      if (selectedModelInfo.supportsI2V && sourceImage) {
        // I2V generation
        const imageBase64 = await fileToBase64(sourceImage)
        const request: I2VGenerateRequest = {
          prompt: fullPrompt,
          model: selectedModel,
          reference_images: [{ image_base64: imageBase64 }],
          width,
          height,
          session_id: currentSession.id,
        }

        const response = await api.createI2VJob(request)
        const job = await api.getI2VJob(response.job_id)
        setActiveI2VJobs(prev => ({ ...prev, [job.id]: job }))
        setPrompt('')
        // Don't clear source image - let user keep it for retries if generation fails
      } else {
        // T2V generation
        const request: VideoGenerateRequest = {
          prompt: fullPrompt,
          model: selectedModel,
          width,
          height,
          session_id: currentSession.id,
        }

        const response = await api.createVideoJob(request)
        const job = await api.getVideoJob(response.job_id)
        setActiveJobs(prev => ({ ...prev, [job.id]: job }))
        setPrompt('')
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Failed to create video job'
      setError(errMsg)
      toast({ title: 'Generation failed', description: errMsg, variant: 'destructive' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleGenerate()
    }
  }

  const handleNewSession = () => {
    const session = createVideoSession()
    setSessions(getVideoSessions())
    setCurrentSession(session)
    setPrompt('')
    // Push new session to URL (creates history entry)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('session', session.id)
      return next
    })
  }

  const handleSwitchSession = (sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId)
    if (!session) return
    setCurrentVideoSessionId(session.id)
    setCurrentSession(session)
    // Push session to URL (creates history entry)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('session', session.id)
      return next
    })
  }

  const handleDeleteSession = (id: string) => {
    deleteVideoSession(id)
    setSessions(getVideoSessions())
    const newCurrentId = getCurrentVideoSessionId()
    if (newCurrentId) {
      const newSession = getVideoSessions().find(s => s.id === newCurrentId)
      setCurrentSession(newSession || null)
    }
  }

  const handleRenameSession = (id: string, name: string) => {
    renameVideoSession(id, name)
    setSessions(getVideoSessions())
    setCurrentSession(getVideoSessions().find(s => s.id === currentSession?.id) || null)
  }

  return (
    <div className="flex-1 flex h-full overflow-hidden">
      {/* Session Sidebar */}
      <SessionSidebar
        sessions={sessions}
        currentSessionId={currentSession?.id ?? null}
        onNewSession={handleNewSession}
        onSwitchSession={handleSwitchSession}
        onDeleteSession={handleDeleteSession}
        onRenameSession={handleRenameSession}
        sidebarWidth={sidebarWidth}
        isResizing={isResizing}
        onResizeStart={handleResizeStart}
        newSessionButtonClass="text-foreground"
        renderSessionContent={(session) => (
          <>
            {session.thumbnail ? (
              <div className="w-8 h-8 rounded overflow-hidden flex-shrink-0 bg-muted">
                {session.thumbnail.endsWith('.mp4') ? (
                  <video src={session.thumbnail} className="w-full h-full object-cover" muted />
                ) : (
                  <img src={session.thumbnail} alt="" className="w-full h-full object-cover" />
                )}
              </div>
            ) : (
              <div className="w-8 h-8 rounded flex-shrink-0 bg-muted flex items-center justify-center">
                <ImageIcon className="h-4 w-4 text-muted-foreground/50" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <span className="text-sm text-foreground/80 truncate block">{session.name}</span>
            </div>
          </>
        )}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col relative min-w-0 h-full">
        <div className="flex-1 overflow-y-auto pb-40 scrollbar-thin min-h-0">
          <div className="p-4 space-y-6">
            {/* Error message */}
            {error && (
              <div className="max-w-2xl mx-auto p-4 rounded-xl bg-red-500/20 border border-red-500/30">
                <div className="flex items-center gap-3">
                  <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
                  <p className="text-sm text-red-200">{error}</p>
                  <button
                    onClick={() => setError(null)}
                    className="ml-auto text-red-200/60 hover:text-red-200"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Active T2V jobs progress */}
            {currentSessionActiveJobs.map((job) => (
              <JobProgressCard
                key={job.id}
                className="max-w-2xl mx-auto"
                status={job.status}
                progress={job.progress}
                downloadProgress={job.download_progress}
                downloadTotalMb={job.download_total_mb}
                downloadSpeedMbps={job.download_speed_mbps}
                etaSeconds={job.eta_seconds}
                model={job.model}
                statusLabel={
                  job.status === 'queued' ? 'Queued \u2014 waiting to start' :
                  job.status === 'downloading' ? 'Downloading model' :
                  job.status === 'loading_model' ? 'Loading model into GPU' :
                  job.status === 'saving' ? 'Encoding & saving video' :
                  'Generating frames'
                }
              >
                <div className="px-5 py-3 border-t border-border">
                  <div className="flex items-center gap-3 text-xs text-muted-foreground/70 mb-2">
                    <span>{job.width}x{job.height}</span>
                    <span className="text-muted-foreground/30">&middot;</span>
                    <span>{job.num_frames} frames</span>
                    <span className="text-muted-foreground/30">&middot;</span>
                    <span>{job.fps} fps</span>
                    <span className="text-muted-foreground/30">&middot;</span>
                    <span>{job.steps} steps</span>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{job.prompt}</p>
                </div>
              </JobProgressCard>
            ))}

            {/* Active I2V jobs progress */}
            {currentSessionActiveI2VJobs.map((job) => (
              <JobProgressCard
                key={job.id}
                className="max-w-2xl mx-auto"
                status={job.status}
                progress={job.progress}
                downloadProgress={job.download_progress}
                downloadTotalMb={job.download_total_mb}
                downloadSpeedMbps={job.download_speed_mbps}
                etaSeconds={job.eta_seconds}
                model={job.model}
                statusLabel={
                  job.status === 'queued' ? 'Queued \u2014 waiting to start' :
                  job.status === 'downloading' ? 'Downloading model' :
                  job.status === 'loading_model' ? 'Loading model into GPU' :
                  job.status === 'saving' ? 'Encoding & saving video' :
                  'Animating image'
                }
                headerBadges={
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary flex items-center gap-1">
                    <ImageIcon className="h-3 w-3" />
                    I2V
                  </span>
                }
              >
                <div className="px-5 py-3 border-t border-border">
                  {job.source_image_urls?.[0] && (
                    <div className="flex items-center gap-3 mb-2">
                      {job.source_image_urls.map((url, idx) => (
                        <img
                          key={idx}
                          src={url}
                          alt={`Source ${idx + 1}`}
                          className="h-12 w-auto rounded-lg object-cover"
                        />
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground/70 mb-2">
                    <span>{job.width}x{job.height}</span>
                    <span className="text-muted-foreground/30">&middot;</span>
                    <span>{job.num_frames} frames</span>
                    <span className="text-muted-foreground/30">&middot;</span>
                    <span>{job.fps} fps</span>
                    <span className="text-muted-foreground/30">&middot;</span>
                    <span>{job.steps} steps</span>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{job.prompt}</p>
                </div>
              </JobProgressCard>
            ))}

            {/* Completed videos for this session */}
            {completedJobs.length > 0 && (
              <div className="max-w-4xl mx-auto space-y-6">
                {completedJobs.map((job) => (
                  job.video && (
                    <div key={job.id} className="rounded-xl glass overflow-hidden">
                      <div className="relative aspect-video bg-black">
                        <video
                          src={job.video.url}
                          controls
                          className="w-full h-full object-contain"
                          poster={job.video.url.replace('.mp4', '_thumb.jpg')}
                        />
                      </div>
                      <div className="p-4">
                        <p className="text-sm text-foreground/80 mb-2 line-clamp-2">{job.prompt}</p>
                        <div className="flex items-center justify-between text-xs text-muted-foreground/70">
                          <div className="flex items-center gap-2">
                            <span>{job.video.width}x{job.video.height} • {job.video.duration.toFixed(1)}s • {job.video.fps}fps</span>
                            {job.video.has_audio && (
                              <span className="flex items-center gap-1 text-primary" title="Has synchronized audio">
                                <Volume2 className="h-3 w-3" />
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <a
                              href={job.video.url}
                              download={job.video.filename}
                              className="p-2 rounded-lg hover:bg-accent transition-colors"
                              title="Download video"
                            >
                              <Download className="h-4 w-4" />
                            </a>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                ))}
              </div>
            )}

            {/* Completed I2V videos */}
            {completedI2VJobs.length > 0 && (
              <div className="max-w-4xl mx-auto space-y-6">
                {completedI2VJobs.map((job) => (
                  job.video && (
                    <div key={job.id} className="rounded-xl glass overflow-hidden">
                      <div className="flex items-start gap-4 p-4 border-b border-border">
                        {job.source_image_urls?.[0] && (
                          <div className="flex-shrink-0">
                            <p className="text-[10px] text-muted-foreground/70 mb-1">Source</p>
                            <img
                              src={job.source_image_urls?.[0]}
                              alt="Source"
                              className="h-16 w-auto rounded-lg object-cover"
                            />
                          </div>
                        )}
                        <div className="flex items-center flex-1">
                          <ImageIcon className="h-4 w-4 text-muted-foreground/70 mr-2" />
                          <span className="text-xs text-muted-foreground/70">Image to Video</span>
                        </div>
                      </div>
                      <div className="relative aspect-video bg-black">
                        <video
                          src={job.video.url}
                          controls
                          className="w-full h-full object-contain"
                          poster={job.video.url.replace('.mp4', '_thumb.jpg')}
                        />
                      </div>
                      <div className="p-4">
                        <p className="text-sm text-foreground/80 mb-2 line-clamp-2">{job.prompt}</p>
                        <div className="flex items-center justify-between text-xs text-muted-foreground/70">
                          <span>{job.video.width}x{job.video.height} • {job.video.duration.toFixed(1)}s • {job.video.fps}fps</span>
                          <a
                            href={job.video.url}
                            download={job.video.filename}
                            className="p-2 rounded-lg hover:bg-accent transition-colors"
                            title="Download video"
                          >
                            <Download className="h-4 w-4" />
                          </a>
                        </div>
                      </div>
                    </div>
                  )
                ))}
              </div>
            )}

            {/* Failed T2V jobs */}
            {failedJobs.length > 0 && (
              <div className="max-w-2xl mx-auto space-y-4">
                {failedJobs.map((job) => (
                  <div key={job.id} className="p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-red-300">Generation failed</p>
                        <p className="text-xs text-muted-foreground mt-1 truncate">"{job.prompt}"</p>
                        {job.error && (
                          <p className="text-xs text-red-300/80 mt-2 line-clamp-3">{job.error}</p>
                        )}
                      </div>
                      <button
                        onClick={() => setFailedJobs(prev => prev.filter(j => j.id !== job.id))}
                        className="p-1 rounded hover:bg-accent text-muted-foreground/70 hover:text-foreground transition-colors"
                        title="Dismiss"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Failed I2V jobs */}
            {failedI2VJobs.length > 0 && (
              <div className="max-w-2xl mx-auto space-y-4">
                {failedI2VJobs.map((job) => (
                  <div key={job.id} className="p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-red-300">I2V generation failed</p>
                        <p className="text-xs text-muted-foreground mt-1 truncate">"{job.prompt}"</p>
                        {job.error && (
                          <p className="text-xs text-red-300/80 mt-2 line-clamp-3">{job.error}</p>
                        )}
                      </div>
                      <button
                        onClick={() => setFailedI2VJobs(prev => prev.filter(j => j.id !== job.id))}
                        className="p-1 rounded hover:bg-accent text-muted-foreground/70 hover:text-foreground transition-colors"
                        title="Dismiss"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty state - only show when no videos and not generating */}
            {completedJobs.length === 0 && completedI2VJobs.length === 0 &&
             currentSessionActiveJobs.length === 0 && currentSessionActiveI2VJobs.length === 0 &&
             failedJobs.length === 0 && failedI2VJobs.length === 0 && (
              <div className="text-center py-20">
                <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
                  <Sparkles className="h-10 w-10 text-foreground/20" />
                </div>
                <h2 className="text-xl font-medium text-foreground/80 mb-2">Create a video</h2>
                <p className="text-muted-foreground/70 max-w-md mx-auto">
                  Describe what you want to see and generate AI videos
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Fixed Bottom Prompt Bar */}
        <div
          className="fixed bottom-0 right-0 p-4 z-40 bg-gradient-to-t from-background via-background to-transparent pt-12"
          style={{ left: `calc(var(--nav-sidebar-width, 0px) + ${sidebarWidth}px)` }}
        >
          <div className="max-w-3xl mx-auto">
            <div
              className={cn("glass rounded-2xl p-3", isDraggingOver && "ring-2 ring-primary")}
              onDragOver={handleDragOver}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDrop={handleDropImage}
            >
              {/* Drop zone indicator */}
              {isDraggingOver && (
                <div className="mb-3 flex items-center justify-center p-4 rounded-xl border-2 border-dashed border-primary/50 bg-primary/10">
                  <ImageIcon className="h-4 w-4 text-primary mr-2" />
                  <span className="text-sm text-primary font-medium">Drop image to animate</span>
                </div>
              )}
              {/* Top row - Options */}
              <div className="flex items-center gap-2 mb-3 px-1 flex-wrap">
                {/* Model Selector */}
                <div className="relative" ref={modelMenuRef}>
                  <button
                    onClick={() => setShowModelMenu(!showModelMenu)}
                    className="model-pill"
                  >
                    {selectedModelInfo.supportsI2V && <ImageIcon className="h-3.5 w-3.5 text-primary" />}
                    <Wand2 className="h-3.5 w-3.5" />
                    <span>{selectedModelInfo.name}</span>
                    <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showModelMenu && 'rotate-180')} />
                  </button>

                  {showModelMenu && (
                    <div className="absolute bottom-full left-0 mb-2 w-72 rounded-xl glass-light shadow-xl z-[60] flex flex-col">
                        {/* Scrollable model list */}
                        <div className="max-h-72 overflow-y-auto scrollbar-thin py-1">
                          {/* Local Models Section */}
                          <div className="px-3 py-1.5 text-[10px] font-medium text-amber-400/70 uppercase tracking-wider flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400/70" />
                            Local Video Models
                          </div>
                          {videoModels.map((model) => (
                            <button
                              key={model.id}
                              onClick={() => {
                                setSelectedModel(model.id)
                                setShowModelMenu(false)
                              }}
                              className={cn(
                                'w-full px-3 py-2 text-left text-sm transition-colors',
                                'hover:bg-accent',
                                selectedModel === model.id && 'bg-muted'
                              )}
                            >
                              <div className="flex items-center gap-2">
                                {model.supportsI2V && <ImageIcon className="h-4 w-4 text-primary flex-shrink-0" />}
                                <div className="flex-1">
                                  <div className="flex items-center justify-between">
                                    <div className={cn(
                                      'font-medium',
                                      selectedModel === model.id && 'text-primary'
                                    )}>{model.name}</div>
                                    {model.requiresApproval && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
                                        Approval
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs text-muted-foreground/70 mt-0.5">
                                    {model.description}
                                  </div>
                                </div>
                              </div>
                            </button>
                          ))}

                          {/* Remote Models Section */}
                          <div className="px-3 py-1.5 mt-2 text-[10px] font-medium text-blue-400/70 uppercase tracking-wider flex items-center gap-1.5 border-t border-border pt-3">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400/70" />
                            Remote Models
                          </div>
                          {configuredVideoProviders.length > 0 ? (
                            configuredVideoProviders.map(providerId => {
                              const providerModels = PREVIEW_MODELS[providerId]?.filter(m => m.type === 'video') || []
                              const providerName = PROVIDER_PRESETS[providerId]?.name || providerId
                              if (providerModels.length === 0) return null
                              return (
                                <div key={providerId}>
                                  <div className="px-3 py-1 text-[10px] text-blue-400/50 uppercase">
                                    {providerName}
                                  </div>
                                  {providerModels.map(model => (
                                    <button
                                      key={model.id}
                                      onClick={() => {
                                        setSelectedModel(model.id)
                                        setShowModelMenu(false)
                                      }}
                                      className={cn(
                                        'w-full px-3 py-2 text-left text-sm transition-colors',
                                        'hover:bg-accent',
                                        selectedModel === model.id && 'bg-muted'
                                      )}
                                    >
                                      <div className="flex items-center gap-2">
                                        <span className={cn(
                                          'font-medium truncate',
                                          selectedModel === model.id && 'text-primary'
                                        )}>
                                          {model.name}
                                        </span>
                                      </div>
                                      <div className="text-xs text-muted-foreground/70 mt-0.5">
                                        {model.description}
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              )
                            })
                          ) : (
                            <div className="px-3 py-2 text-xs text-muted-foreground/50 italic">
                              Configure API providers in Models page
                            </div>
                          )}
                        </div>
                        {/* Add model link */}
                        <Link
                          to="/models"
                          onClick={() => setShowModelMenu(false)}
                          className="flex items-center gap-2 px-3 py-2.5 text-sm text-primary hover:bg-accent transition-colors border-t border-white/10"
                        >
                          <Plus className="h-4 w-4" />
                          <span>Browse all models</span>
                        </Link>
                      </div>
                  )}
                </div>

                {/* Style Selector */}
                <div className="relative" ref={styleMenuRef}>
                  <button
                    onClick={() => setShowStyleMenu(!showStyleMenu)}
                    className={cn(
                      'model-pill',
                      selectedStyle !== 'none' && 'bg-primary/20 text-primary'
                    )}
                  >
                    <Palette className="h-3.5 w-3.5" />
                    <span>{selectedStyleInfo.label}</span>
                    <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showStyleMenu && 'rotate-180')} />
                  </button>

                  {showStyleMenu && (
                    <div className="absolute bottom-full left-0 mb-2 w-48 py-1 rounded-xl glass-light shadow-xl z-[60]">
                      {stylePresets.map((style) => (
                        <button
                          key={style.id}
                          onClick={() => {
                            setSelectedStyle(style.id)
                            setShowStyleMenu(false)
                          }}
                          className={cn(
                            'w-full px-3 py-2 text-left text-sm transition-colors',
                            'hover:bg-accent',
                            selectedStyle === style.id && 'text-primary'
                          )}
                        >
                          {style.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="h-5 w-px bg-accent" />

                {/* Aspect Ratio Selector */}
                <div className="relative" ref={aspectMenuRef}>
                  <button
                    onClick={() => setShowAspectMenu(!showAspectMenu)}
                    className="model-pill"
                  >
                    <Square className="h-3.5 w-3.5" />
                    <span>{aspectRatio}</span>
                    <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showAspectMenu && 'rotate-180')} />
                  </button>

                  {showAspectMenu && (
                    <div className="absolute bottom-full left-0 mb-2 p-3 rounded-xl glass-light shadow-xl z-[60]">
                      <div className="grid grid-cols-3 gap-2">
                        {aspectRatios.map((ratio) => (
                          <button
                            key={ratio.value}
                            onClick={() => {
                              setAspectRatio(ratio.value)
                              setShowAspectMenu(false)
                            }}
                            className={cn(
                              'px-4 py-2 rounded-lg border text-sm font-medium transition-all',
                              aspectRatio === ratio.value
                                ? 'border-white/40 bg-accent text-foreground'
                                : 'border-white/10 text-muted-foreground hover:border-white/20 hover:text-foreground/80'
                            )}
                          >
                            {ratio.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Resolution Selector */}
                <div className="relative" ref={resolutionMenuRef}>
                  <button
                    onClick={() => setShowResolutionMenu(!showResolutionMenu)}
                    className="model-pill"
                  >
                    <Monitor className="h-3.5 w-3.5" />
                    <span>{resolution}</span>
                    <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showResolutionMenu && 'rotate-180')} />
                  </button>

                  {showResolutionMenu && (
                    <div className="absolute bottom-full left-0 mb-2 w-32 py-1 rounded-xl glass-light shadow-xl z-[60]">
                      {availableResolutions.map((res) => (
                        <button
                          key={res.value}
                          onClick={() => {
                            setResolution(res.value)
                            setShowResolutionMenu(false)
                          }}
                          className={cn(
                            'w-full px-3 py-2 text-left text-sm transition-colors',
                            'hover:bg-accent',
                            resolution === res.value && 'text-primary'
                          )}
                        >
                          {res.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Image upload area - I2V models only */}
              {selectedModelInfo.supportsI2V && (
                <div className="mb-3 px-1">
                  {sourceImagePreview ? (
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-muted">
                      <div className="relative">
                        <img
                          src={sourceImagePreview}
                          alt="Source"
                          className="h-20 w-auto rounded-lg object-cover"
                        />
                        <button
                          onClick={clearSourceImage}
                          className="absolute -top-2 -right-2 p-1 rounded-full bg-red-500 hover:bg-red-600 transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-foreground/80">Source image ready</p>
                        <p className="text-xs text-muted-foreground/70 mt-1">This image will be animated</p>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full p-4 rounded-xl border-2 border-dashed border-white/20 hover:border-primary/50 transition-colors flex items-center justify-center gap-3 text-muted-foreground hover:text-foreground"
                    >
                      <Upload className="h-5 w-5" />
                      <span>Upload source image to animate</span>
                    </button>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </div>
              )}

              {/* Prompt input row */}
              <div className="flex items-end gap-3">
                <div className="flex-1 bg-muted rounded-xl px-4 py-3">
                  <textarea
                    ref={textareaRef}
                    placeholder={selectedModelInfo.supportsI2V
                      ? "Describe how the image should animate..."
                      : "Describe a video and click generate..."}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={1}
                    className="prompt-input w-full text-sm leading-relaxed"
                    style={{ minHeight: '24px', maxHeight: '120px' }}
                  />
                </div>
                <button
                  onClick={handleGenerate}
                  disabled={!prompt.trim() || isSubmitting || (selectedModelInfo.supportsI2V && !sourceImage)}
                  className="generate-btn flex items-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      <span>Generate</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}
