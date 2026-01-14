import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Sparkles, ChevronDown, Palette, X, Wand2,
  Plus, MessageSquare, MoreHorizontal, Pencil, GripVertical, Trash2, Square, Monitor,
  AlertCircle, Loader2, Download, Volume2, Upload, Image as ImageIcon
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  getVideoSessions, createVideoSession, setCurrentVideoSessionId, getCurrentVideoSessionId,
  deleteVideoSession, renameVideoSession, ensureCurrentVideoSession, updateVideoSession,
  type VideoSession
} from '@/lib/video-sessions'
import { api, VideoJob, VideoGenerateRequest, I2VJob, I2VGenerateRequest } from '@/api/client'

type AspectRatio = '16:9' | '9:16' | '1:1'
type Resolution = '720p' | '1080p'
type VideoMode = 't2v' | 'i2v'

// Video generation models
interface VideoModel {
  id: string
  name: string
  description: string
  maxDuration: number  // seconds
  supportedResolutions: Resolution[]
  requiresApproval?: boolean
  approvalUrl?: string
  mode: VideoMode  // t2v = text-to-video, i2v = image-to-video
}

const videoModels: VideoModel[] = [
  // Text-to-Video models
  {
    id: 'ltx-2',
    name: 'LTX-2',
    description: 'High-quality video + audio, 5s at 24fps',
    maxDuration: 5,
    supportedResolutions: ['720p', '1080p'],
    mode: 't2v',
  },
  {
    id: 'ltx-2-fp8',
    name: 'LTX-2 (FP8)',
    description: 'LTX-2 with lower memory usage',
    maxDuration: 5,
    supportedResolutions: ['720p', '1080p'],
    mode: 't2v',
  },
  {
    id: 'cogvideox-5b',
    name: 'CogVideoX-5B',
    description: 'High-quality video generation, 6s clips',
    maxDuration: 6,
    supportedResolutions: ['720p'],
    mode: 't2v',
  },
  {
    id: 'cogvideox-2b',
    name: 'CogVideoX-2B',
    description: 'Faster, lighter video model',
    maxDuration: 6,
    supportedResolutions: ['720p'],
    mode: 't2v',
  },
  // Image-to-Video models
  {
    id: 'cogvideox-5b-i2v',
    name: 'CogVideoX-5B I2V',
    description: 'Animate images into video clips',
    maxDuration: 6,
    supportedResolutions: ['720p'],
    mode: 'i2v',
  },
  {
    id: 'svd-xt',
    name: 'SVD XT',
    description: 'Stable Video Diffusion, smooth motion',
    maxDuration: 4,
    supportedResolutions: ['720p', '1080p'],
    mode: 'i2v',
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

const MIN_SIDEBAR_WIDTH = 200
const MAX_SIDEBAR_WIDTH = 400
const DEFAULT_SIDEBAR_WIDTH = 256

export function VideoPage() {
  const [prompt, setPrompt] = useState('')
  const [mode, setMode] = useState<VideoMode>('t2v')
  const [selectedModel, setSelectedModel] = useState<string>('ltx-2')
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
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [sessionMenuId, setSessionMenuId] = useState<string | null>(null)

  // Resizable sidebar
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH)
  const [isResizing, setIsResizing] = useState(false)
  const sidebarRef = useRef<HTMLDivElement>(null)

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Helper to close all dropdown menus
  const closeAllMenus = useCallback(() => {
    setShowModelMenu(false)
    setShowStyleMenu(false)
    setShowAspectMenu(false)
    setShowResolutionMenu(false)
  }, [])

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

  // Initialize video sessions (separate from image sessions)
  useEffect(() => {
    const session = ensureCurrentVideoSession()
    setCurrentSession(session)
    setSessions(getVideoSessions())
  }, [])

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
            if (updatedJob.video?.url) {
              updateVideoSession(updatedJob.session_id, { thumbnail: updatedJob.video.url })
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

  // Handle sidebar resize
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return
      const newWidth = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, e.clientX))
      setSidebarWidth(newWidth)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizing])

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

  // Switch to first model of selected mode when mode changes
  useEffect(() => {
    const modelsForMode = videoModels.filter(m => m.mode === mode)
    const firstModel = modelsForMode[0]
    if (firstModel && !modelsForMode.some(m => m.id === selectedModel)) {
      setSelectedModel(firstModel.id)
    }
  }, [mode])

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSourceImage(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setSourceImagePreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const clearSourceImage = () => {
    setSourceImage(null)
    setSourceImagePreview(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Helper: file to base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  const handleGenerate = async () => {
    if (!prompt.trim() || isSubmitting || !currentSession) return

    // For I2V mode, require an image
    if (mode === 'i2v' && !sourceImage) {
      setError('Please upload a source image for image-to-video generation')
      return
    }

    setError(null)
    setIsSubmitting(true)

    const { width, height } = getDimensions(aspectRatio, resolution)
    const fullPrompt = selectedStyleInfo.prefix + prompt.trim()

    try {
      if (mode === 'i2v' && sourceImage) {
        // I2V generation
        const imageBase64 = await fileToBase64(sourceImage)
        const request: I2VGenerateRequest = {
          prompt: fullPrompt,
          model: selectedModel,
          image_base64: imageBase64,
          width,
          height,
          session_id: currentSession.id,
        }

        const response = await api.createI2VJob(request)
        const job = await api.getI2VJob(response.job_id)
        setActiveI2VJobs(prev => ({ ...prev, [job.id]: job }))
        setPrompt('')
        clearSourceImage()
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
      setError(err instanceof Error ? err.message : 'Failed to create video job')
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
  }

  const handleSwitchSession = (session: VideoSession) => {
    setCurrentVideoSessionId(session.id)
    setCurrentSession(session)
  }

  const handleDeleteSession = (id: string) => {
    deleteVideoSession(id)
    setSessions(getVideoSessions())
    const newCurrentId = getCurrentVideoSessionId()
    if (newCurrentId) {
      const newSession = getVideoSessions().find(s => s.id === newCurrentId)
      setCurrentSession(newSession || null)
    }
    setSessionMenuId(null)
  }

  const handleRenameSession = (id: string) => {
    if (editingName.trim()) {
      renameVideoSession(id, editingName.trim())
      setSessions(getVideoSessions())
      setCurrentSession(getVideoSessions().find(s => s.id === currentSession?.id) || null)
    }
    setEditingSessionId(null)
    setEditingName('')
  }

  return (
    <div className="flex-1 flex h-full overflow-hidden">
      {/* Session Sidebar */}
      <aside
        ref={sidebarRef}
        style={{ width: sidebarWidth }}
        className="h-full border-r border-white/5 flex flex-col bg-black/20 relative flex-shrink-0"
      >
        <div className="p-3 border-b border-white/5 flex-shrink-0">
          <button
            onClick={handleNewSession}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-white text-sm font-medium transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Session
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-1 min-h-0">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={cn(
                'group relative rounded-lg transition-colors cursor-pointer',
                currentSession?.id === session.id
                  ? 'bg-white/10'
                  : 'hover:bg-white/5'
              )}
            >
              {editingSessionId === session.id ? (
                <input
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={() => handleRenameSession(session.id)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRenameSession(session.id)}
                  className="w-full px-3 py-2 bg-transparent text-sm text-white outline-none"
                  autoFocus
                />
              ) : (
                <div
                  onClick={() => handleSwitchSession(session)}
                  className="flex items-center gap-2 px-2 py-2"
                >
                  {session.thumbnail ? (
                    <div className="w-8 h-8 rounded overflow-hidden flex-shrink-0 bg-white/5">
                      <img src={session.thumbnail} alt="" className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded flex-shrink-0 bg-white/5 flex items-center justify-center">
                      <MessageSquare className="h-4 w-4 text-white/30" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-white/80 truncate block">{session.name}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setSessionMenuId(sessionMenuId === session.id ? null : session.id)
                    }}
                    className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-all"
                  >
                    <MoreHorizontal className="h-4 w-4 text-white/40" />
                  </button>
                </div>
              )}

              {sessionMenuId === session.id && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setSessionMenuId(null)} />
                  <div className="absolute right-0 top-full mt-1 w-36 py-1 rounded-lg bg-[#1a1a1a] border border-white/10 shadow-xl z-50">
                    <button
                      onClick={() => {
                        setEditingSessionId(session.id)
                        setEditingName(session.name)
                        setSessionMenuId(null)
                      }}
                      className="w-full px-3 py-1.5 text-left text-sm text-white/80 hover:bg-white/10 flex items-center gap-2"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Rename
                    </button>
                    <button
                      onClick={() => handleDeleteSession(session.id)}
                      className="w-full px-3 py-1.5 text-left text-sm text-red-400 hover:bg-white/10 flex items-center gap-2"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Resize handle */}
        <div
          onMouseDown={handleMouseDown}
          className={cn(
            'absolute right-0 top-0 bottom-0 w-1 cursor-col-resize group',
            'hover:bg-primary/50 transition-colors',
            isResizing && 'bg-primary/50'
          )}
        >
          <div className="absolute right-0 top-1/2 -translate-y-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
            <GripVertical className="h-6 w-6 text-white/30" />
          </div>
        </div>
      </aside>

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
              <div key={job.id} className="max-w-2xl mx-auto p-6 rounded-xl glass">
                <div className="flex items-center gap-4 mb-4">
                  <Loader2 className="h-6 w-6 text-primary animate-spin" />
                  <div>
                    <p className="text-white font-medium">Generating video...</p>
                    <p className="text-sm text-white/60 capitalize">
                      {job.status.replace('_', ' ')}
                      {job.download_progress > 0 && job.status === 'downloading' && (
                        <span> - {Math.round(job.download_progress)}%</span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${job.progress}%` }}
                  />
                </div>

                {job.eta_seconds && job.eta_seconds > 0 && (
                  <p className="text-xs text-white/40 mt-2">
                    Estimated time: {Math.ceil(job.eta_seconds / 60)} min
                  </p>
                )}

                <p className="text-xs text-white/40 mt-2 truncate">
                  "{job.prompt}"
                </p>
              </div>
            ))}

            {/* Active I2V jobs progress */}
            {currentSessionActiveI2VJobs.map((job) => (
              <div key={job.id} className="max-w-2xl mx-auto p-6 rounded-xl glass">
                <div className="flex items-center gap-4 mb-4">
                  <Loader2 className="h-6 w-6 text-primary animate-spin" />
                  <div className="flex-1">
                    <p className="text-white font-medium">Animating image...</p>
                    <p className="text-sm text-white/60 capitalize">
                      {job.status.replace('_', ' ')}
                      {job.download_progress && job.download_progress > 0 && job.status === 'downloading' && (
                        <span> - {Math.round(job.download_progress)}%</span>
                      )}
                    </p>
                  </div>
                  {job.source_image_url && (
                    <img
                      src={job.source_image_url}
                      alt="Source"
                      className="h-16 w-auto rounded-lg object-cover"
                    />
                  )}
                </div>

                {/* Progress bar */}
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${job.progress}%` }}
                  />
                </div>

                {job.eta_seconds && job.eta_seconds > 0 && (
                  <p className="text-xs text-white/40 mt-2">
                    Estimated time: {Math.ceil(job.eta_seconds / 60)} min
                  </p>
                )}

                <p className="text-xs text-white/40 mt-2 truncate">
                  "{job.prompt}"
                </p>
              </div>
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
                        <p className="text-sm text-white/80 mb-2 line-clamp-2">{job.prompt}</p>
                        <div className="flex items-center justify-between text-xs text-white/40">
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
                              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
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
                      <div className="flex items-start gap-4 p-4 border-b border-white/5">
                        {job.source_image_url && (
                          <div className="flex-shrink-0">
                            <p className="text-[10px] text-white/40 mb-1">Source</p>
                            <img
                              src={job.source_image_url}
                              alt="Source"
                              className="h-16 w-auto rounded-lg object-cover"
                            />
                          </div>
                        )}
                        <div className="flex items-center flex-1">
                          <ImageIcon className="h-4 w-4 text-white/40 mr-2" />
                          <span className="text-xs text-white/40">Image to Video</span>
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
                        <p className="text-sm text-white/80 mb-2 line-clamp-2">{job.prompt}</p>
                        <div className="flex items-center justify-between text-xs text-white/40">
                          <span>{job.video.width}x{job.video.height} • {job.video.duration.toFixed(1)}s • {job.video.fps}fps</span>
                          <a
                            href={job.video.url}
                            download={job.video.filename}
                            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
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
                        <p className="text-xs text-white/60 mt-1 truncate">"{job.prompt}"</p>
                        {job.error && (
                          <p className="text-xs text-red-300/80 mt-2 line-clamp-3">{job.error}</p>
                        )}
                      </div>
                      <button
                        onClick={() => setFailedJobs(prev => prev.filter(j => j.id !== job.id))}
                        className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white transition-colors"
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
                        <p className="text-xs text-white/60 mt-1 truncate">"{job.prompt}"</p>
                        {job.error && (
                          <p className="text-xs text-red-300/80 mt-2 line-clamp-3">{job.error}</p>
                        )}
                      </div>
                      <button
                        onClick={() => setFailedI2VJobs(prev => prev.filter(j => j.id !== job.id))}
                        className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white transition-colors"
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
                <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-6">
                  <Sparkles className="h-10 w-10 text-white/20" />
                </div>
                <h2 className="text-xl font-medium text-white/80 mb-2">Create a video</h2>
                <p className="text-white/40 max-w-md mx-auto">
                  Describe what you want to see and generate AI videos
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Fixed Bottom Prompt Bar */}
        <div
          className="fixed bottom-0 right-0 p-4 z-40 bg-gradient-to-t from-[#0d0d0d] via-[#0d0d0d] to-transparent pt-12"
          style={{ left: sidebarWidth }}
        >
          <div className="max-w-3xl mx-auto">
            <div className="glass rounded-2xl p-3">
              {/* Mode Toggle */}
              <div className="flex items-center justify-center mb-3">
                <div className="flex bg-white/5 rounded-full p-0.5">
                  <button
                    onClick={() => setMode('t2v')}
                    className={cn(
                      'px-4 py-1.5 rounded-full text-sm font-medium transition-all',
                      mode === 't2v'
                        ? 'bg-primary text-white'
                        : 'text-white/60 hover:text-white'
                    )}
                  >
                    Text to Video
                  </button>
                  <button
                    onClick={() => setMode('i2v')}
                    className={cn(
                      'px-4 py-1.5 rounded-full text-sm font-medium transition-all',
                      mode === 'i2v'
                        ? 'bg-primary text-white'
                        : 'text-white/60 hover:text-white'
                    )}
                  >
                    Image to Video
                  </button>
                </div>
              </div>

              {/* Top row - Options */}
              <div className="flex items-center gap-2 mb-3 px-1 flex-wrap">
                {/* Model Selector */}
                <div className="relative">
                  <button
                    onClick={() => {
                      const isOpen = !showModelMenu
                      closeAllMenus()
                      setShowModelMenu(isOpen)
                    }}
                    className="model-pill"
                  >
                    <Wand2 className="h-3.5 w-3.5" />
                    <span>{selectedModelInfo.name}</span>
                    <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showModelMenu && 'rotate-180')} />
                  </button>

                  {showModelMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={closeAllMenus} />
                      <div className="absolute bottom-full left-0 mb-2 w-64 py-1 rounded-xl glass-light shadow-xl z-50">
                        {videoModels.filter(m => m.mode === mode).map((model) => (
                          <button
                            key={model.id}
                            onClick={() => {
                              setSelectedModel(model.id)
                              setShowModelMenu(false)
                            }}
                            className={cn(
                              'w-full px-3 py-2 text-left text-sm transition-colors',
                              'hover:bg-white/10',
                              selectedModel === model.id && 'text-primary'
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <div className="font-medium">{model.name}</div>
                              {model.requiresApproval && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
                                  Approval
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-white/40 mt-0.5">
                              {model.description}
                            </div>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Style Selector */}
                <div className="relative">
                  <button
                    onClick={() => {
                      const isOpen = !showStyleMenu
                      closeAllMenus()
                      setShowStyleMenu(isOpen)
                    }}
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
                    <>
                      <div className="fixed inset-0 z-40" onClick={closeAllMenus} />
                      <div className="absolute bottom-full left-0 mb-2 w-48 py-1 rounded-xl glass-light shadow-xl z-50">
                        {stylePresets.map((style) => (
                          <button
                            key={style.id}
                            onClick={() => {
                              setSelectedStyle(style.id)
                              setShowStyleMenu(false)
                            }}
                            className={cn(
                              'w-full px-3 py-2 text-left text-sm transition-colors',
                              'hover:bg-white/10',
                              selectedStyle === style.id && 'text-primary'
                            )}
                          >
                            {style.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <div className="h-5 w-px bg-white/10" />

                {/* Aspect Ratio Selector */}
                <div className="relative">
                  <button
                    onClick={() => {
                      const isOpen = !showAspectMenu
                      closeAllMenus()
                      setShowAspectMenu(isOpen)
                    }}
                    className="model-pill"
                  >
                    <Square className="h-3.5 w-3.5" />
                    <span>{aspectRatio}</span>
                    <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showAspectMenu && 'rotate-180')} />
                  </button>

                  {showAspectMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={closeAllMenus} />
                      <div className="absolute bottom-full left-0 mb-2 p-3 rounded-xl glass-light shadow-xl z-50">
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
                                  ? 'border-white/40 bg-white/10 text-white'
                                  : 'border-white/10 text-white/60 hover:border-white/20 hover:text-white/80'
                              )}
                            >
                              {ratio.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Resolution Selector */}
                <div className="relative">
                  <button
                    onClick={() => {
                      const isOpen = !showResolutionMenu
                      closeAllMenus()
                      setShowResolutionMenu(isOpen)
                    }}
                    className="model-pill"
                  >
                    <Monitor className="h-3.5 w-3.5" />
                    <span>{resolution}</span>
                    <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showResolutionMenu && 'rotate-180')} />
                  </button>

                  {showResolutionMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={closeAllMenus} />
                      <div className="absolute bottom-full left-0 mb-2 w-32 py-1 rounded-xl glass-light shadow-xl z-50">
                        {availableResolutions.map((res) => (
                          <button
                            key={res.value}
                            onClick={() => {
                              setResolution(res.value)
                              setShowResolutionMenu(false)
                            }}
                            className={cn(
                              'w-full px-3 py-2 text-left text-sm transition-colors',
                              'hover:bg-white/10',
                              resolution === res.value && 'text-primary'
                            )}
                          >
                            {res.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Image upload area - I2V mode only */}
              {mode === 'i2v' && (
                <div className="mb-3 px-1">
                  {sourceImagePreview ? (
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5">
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
                        <p className="text-sm text-white/80">Source image ready</p>
                        <p className="text-xs text-white/40 mt-1">This image will be animated</p>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full p-4 rounded-xl border-2 border-dashed border-white/20 hover:border-primary/50 transition-colors flex items-center justify-center gap-3 text-white/60 hover:text-white"
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
                <div className="flex-1 bg-white/5 rounded-xl px-4 py-3">
                  <textarea
                    ref={textareaRef}
                    placeholder={mode === 'i2v'
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
                  disabled={!prompt.trim() || isSubmitting || (mode === 'i2v' && !sourceImage)}
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
