import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Sparkles, ChevronDown, Palette, ImagePlus, X, Wand2,
  Plus, MessageSquare, MoreHorizontal, Pencil, GripVertical, Trash2, Square, Monitor,
  AlertCircle
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  getVideoSessions, createVideoSession, setCurrentVideoSessionId, getCurrentVideoSessionId,
  deleteVideoSession, renameVideoSession, ensureCurrentVideoSession,
  type VideoSession
} from '@/lib/video-sessions'

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

  // Start and end frames
  const [startFrame, setStartFrame] = useState<string | null>(null)
  const [endFrame, setEndFrame] = useState<string | null>(null)
  const startFrameInputRef = useRef<HTMLInputElement>(null)
  const endFrameInputRef = useRef<HTMLInputElement>(null)

  // Session management (video sessions are separate from image sessions)
  const [sessions, setSessions] = useState<VideoSession[]>([])
  const [currentSession, setCurrentSession] = useState<VideoSession | null>(null)
  const [showToast, setShowToast] = useState(false)
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [sessionMenuId, setSessionMenuId] = useState<string | null>(null)

  // Resizable sidebar
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH)
  const [isResizing, setIsResizing] = useState(false)
  const sidebarRef = useRef<HTMLDivElement>(null)

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Initialize video sessions (separate from image sessions)
  useEffect(() => {
    const session = ensureCurrentVideoSession()
    setCurrentSession(session)
    setSessions(getVideoSessions())
  }, [])

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

  const handleGenerate = () => {
    // Show coming soon notification
    setShowToast(true)
    setTimeout(() => setShowToast(false), 4000)

    // Log the params for debugging
    console.log('Video generation requested:', {
      prompt: selectedStyleInfo.prefix + prompt.trim(),
      model: selectedModel,
      aspectRatio,
      resolution,
      startFrame,
      endFrame,
    })
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

  const handleStartFrameUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setStartFrame(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleEndFrameUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setEndFrame(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
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
            {/* Empty state */}
            <div className="text-center py-20">
              <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-6">
                <Sparkles className="h-10 w-10 text-white/20" />
              </div>
              <h2 className="text-xl font-medium text-white/80 mb-2">Create a video</h2>
              <p className="text-white/40 max-w-md mx-auto">
                Describe what you want to see and generate AI videos
              </p>
            </div>
          </div>
        </div>

        {/* Fixed Bottom Prompt Bar */}
        <div
          className="fixed bottom-0 right-0 p-4 z-40 bg-gradient-to-t from-[#0d0d0d] via-[#0d0d0d] to-transparent pt-12"
          style={{ left: sidebarWidth }}
        >
          <div className="max-w-3xl mx-auto">
            <div className="glass rounded-2xl p-3">
              {/* Top row - Options */}
              <div className="flex items-center gap-2 mb-3 px-1 flex-wrap">
                {/* Start Frame */}
                <input
                  ref={startFrameInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleStartFrameUpload}
                  className="hidden"
                />
                <button
                  onClick={() => startFrameInputRef.current?.click()}
                  className={cn(
                    'model-pill',
                    startFrame && 'bg-primary/20 text-primary'
                  )}
                >
                  {startFrame ? (
                    <>
                      <img src={startFrame} alt="Start" className="h-4 w-4 rounded object-cover" />
                      <span>Start frame</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); setStartFrame(null) }}
                        className="hover:text-red-400"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </>
                  ) : (
                    <>
                      <ImagePlus className="h-3.5 w-3.5" />
                      <span>Start frame</span>
                    </>
                  )}
                </button>

                {/* End Frame */}
                <input
                  ref={endFrameInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleEndFrameUpload}
                  className="hidden"
                />
                <button
                  onClick={() => endFrameInputRef.current?.click()}
                  className={cn(
                    'model-pill',
                    endFrame && 'bg-primary/20 text-primary'
                  )}
                >
                  {endFrame ? (
                    <>
                      <img src={endFrame} alt="End" className="h-4 w-4 rounded object-cover" />
                      <span>End frame</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); setEndFrame(null) }}
                        className="hover:text-red-400"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </>
                  ) : (
                    <>
                      <ImagePlus className="h-3.5 w-3.5" />
                      <span>End frame</span>
                    </>
                  )}
                </button>

                <div className="h-5 w-px bg-white/10" />

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
                  disabled={!prompt.trim()}
                  className="generate-btn flex items-center gap-2"
                >
                  <Sparkles className="h-4 w-4" />
                  <span>Generate</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Coming Soon Toast */}
      {showToast && (
        <div className="fixed bottom-32 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/20 border border-amber-500/30 backdrop-blur-sm">
            <AlertCircle className="h-5 w-5 text-amber-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-200">Video Generation Coming Soon</p>
              <p className="text-xs text-amber-200/60 mt-0.5">
                Backend integration is in progress. Stay tuned!
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
