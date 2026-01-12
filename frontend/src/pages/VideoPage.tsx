import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Sparkles, ChevronDown, Palette, X, Wand2,
  Plus, MessageSquare, MoreHorizontal, Pencil, GripVertical, Trash2, Square, Monitor,
  AlertCircle, Loader2, Download
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  getVideoSessions, createVideoSession, setCurrentVideoSessionId, getCurrentVideoSessionId,
  deleteVideoSession, renameVideoSession, ensureCurrentVideoSession, updateVideoSession,
  type VideoSession
} from '@/lib/video-sessions'
import { api, VideoJob, VideoGenerateRequest } from '@/api/client'

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
}

const videoModels: VideoModel[] = [
  {
    id: 'cogvideox-5b',
    name: 'CogVideoX-5B',
    description: 'High-quality video generation, 6s clips',
    maxDuration: 6,
    supportedResolutions: ['720p'],
  },
  {
    id: 'cogvideox-2b',
    name: 'CogVideoX-2B',
    description: 'Faster, lighter video model',
    maxDuration: 6,
    supportedResolutions: ['720p'],
  },
  {
    id: 'wan2-1-t2v',
    name: 'Wan2.1 T2V',
    description: 'Text-to-video, cinematic quality',
    maxDuration: 5,
    supportedResolutions: ['720p', '1080p'],
    requiresApproval: true,
    approvalUrl: 'https://huggingface.co/Wan-AI/Wan2.1-T2V-14B',
  },
  {
    id: 'wan2-1-i2v',
    name: 'Wan2.1 I2V',
    description: 'Image-to-video animation',
    maxDuration: 5,
    supportedResolutions: ['720p', '1080p'],
    requiresApproval: true,
    approvalUrl: 'https://huggingface.co/Wan-AI/Wan2.1-I2V-14B',
  },
  {
    id: 'ltx-video',
    name: 'LTX-Video',
    description: 'Fast video generation',
    maxDuration: 5,
    supportedResolutions: ['720p'],
  },
  {
    id: 'mochi-1',
    name: 'Mochi 1',
    description: 'Genmo\'s open video model',
    maxDuration: 5,
    supportedResolutions: ['720p'],
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
  const [selectedModel, setSelectedModel] = useState<string>('cogvideox-5b')
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9')
  const [resolution, setResolution] = useState<Resolution>('720p')
  const [selectedStyle, setSelectedStyle] = useState('none')
  const [showModelMenu, setShowModelMenu] = useState(false)
  const [showStyleMenu, setShowStyleMenu] = useState(false)
  const [showAspectMenu, setShowAspectMenu] = useState(false)
  const [showResolutionMenu, setShowResolutionMenu] = useState(false)

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

  // Video generation state - track jobs by ID like ImagePage
  const [activeJobs, setActiveJobs] = useState<Record<string, VideoJob>>({})
  const [completedJobs, setCompletedJobs] = useState<VideoJob[]>([])
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

  // Load jobs for current session (both active and completed)
  useEffect(() => {
    if (!currentSession) return

    const loadSessionJobs = async () => {
      try {
        const { jobs } = await api.getVideoJobs({ session_id: currentSession.id })

        // Separate active and completed jobs
        const active: Record<string, VideoJob> = {}
        const completed: VideoJob[] = []

        for (const job of jobs) {
          if (job.status === 'completed' && job.video) {
            completed.push(job)
          } else if (!['completed', 'failed'].includes(job.status)) {
            active[job.id] = job
          }
        }

        // Sort completed by created_at descending
        completed.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

        setActiveJobs(prev => ({ ...prev, ...active }))
        setCompletedJobs(completed)
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
            // Update session thumbnail with first frame
            if (updatedJob.video?.url) {
              updateVideoSession(updatedJob.session_id, { thumbnail: updatedJob.video.url })
              setSessions(getVideoSessions())
            }
          } else if (updatedJob.status === 'failed') {
            setError(updatedJob.error || 'Video generation failed')
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

  const handleGenerate = async () => {
    if (!prompt.trim() || isSubmitting || !currentSession) return

    setError(null)
    setIsSubmitting(true)

    const { width, height } = getDimensions(aspectRatio, resolution)
    const fullPrompt = selectedStyleInfo.prefix + prompt.trim()

    const request: VideoGenerateRequest = {
      prompt: fullPrompt,
      model: selectedModel,
      width,
      height,
      session_id: currentSession.id,
    }

    try {
      const response = await api.createVideoJob(request)
      // Get the initial job state and add to activeJobs
      const job = await api.getVideoJob(response.job_id)
      setActiveJobs(prev => ({ ...prev, [job.id]: job }))
      setPrompt('')
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

            {/* Active jobs progress */}
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
                          <span>{job.video.width}x{job.video.height} • {job.video.duration.toFixed(1)}s • {job.video.fps}fps</span>
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

            {/* Empty state - only show when no videos and not generating */}
            {completedJobs.length === 0 && currentSessionActiveJobs.length === 0 && (
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
              {/* Top row - Options (text-to-video) */}
              <div className="flex items-center gap-2 mb-3 px-1 flex-wrap">
                {/* Model Selector */}
                <div className="relative">
                  <button
                    onClick={() => setShowModelMenu(!showModelMenu)}
                    className="model-pill"
                  >
                    <Wand2 className="h-3.5 w-3.5" />
                    <span>{selectedModelInfo.name}</span>
                    <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showModelMenu && 'rotate-180')} />
                  </button>

                  {showModelMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowModelMenu(false)} />
                      <div className="absolute bottom-full left-0 mb-2 w-64 py-1 rounded-xl glass-light shadow-xl z-50">
                        {videoModels.map((model) => (
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
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowStyleMenu(false)} />
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
                    onClick={() => setShowAspectMenu(!showAspectMenu)}
                    className="model-pill"
                  >
                    <Square className="h-3.5 w-3.5" />
                    <span>{aspectRatio}</span>
                    <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showAspectMenu && 'rotate-180')} />
                  </button>

                  {showAspectMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowAspectMenu(false)} />
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
                    onClick={() => setShowResolutionMenu(!showResolutionMenu)}
                    className="model-pill"
                  >
                    <Monitor className="h-3.5 w-3.5" />
                    <span>{resolution}</span>
                    <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showResolutionMenu && 'rotate-180')} />
                  </button>

                  {showResolutionMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowResolutionMenu(false)} />
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

              {/* Prompt input row */}
              <div className="flex items-end gap-3">
                <div className="flex-1 bg-white/5 rounded-xl px-4 py-3">
                  <textarea
                    ref={textareaRef}
                    placeholder="Describe a video and click generate..."
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
                  disabled={!prompt.trim() || isSubmitting}
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
