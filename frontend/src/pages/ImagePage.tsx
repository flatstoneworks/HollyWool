import { useState, useRef, useEffect, useCallback } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import {
  Loader2, Sparkles, ChevronDown, Wand2, Download, Copy,
  RefreshCw, Trash2, Palette, Plus, Minus, MessageSquare,
  MoreHorizontal, Pencil, GripVertical, Square, Layers,
  Image as ImageIcon, X, Upload
} from 'lucide-react'
import { api, type ModelInfo, type Asset, type Job, type LoRAInfo, groupAssetsByBatch } from '@/api/client'
import { cn } from '@/lib/utils'
import {
  getSessions, createSession, setCurrentSessionId, getCurrentSessionId,
  addBatchToSession, deleteSession, renameSession, ensureCurrentSession,
  autoRenameSession,
} from '@/lib/sessions'
import type { Session } from '@/api/client'
import { PREVIEW_MODELS, PROVIDER_PRESETS, type ModelProvider } from '@/types/providers'

type AspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4'

const aspectRatios: { value: AspectRatio; label: string; width: number; height: number }[] = [
  { value: '1:1', label: '1:1', width: 1024, height: 1024 },
  { value: '16:9', label: '16:9', width: 1344, height: 768 },
  { value: '9:16', label: '9:16', width: 768, height: 1344 },
  { value: '4:3', label: '4:3', width: 1152, height: 896 },
  { value: '3:4', label: '3:4', width: 896, height: 1152 },
]

const stylePresets = [
  { id: 'none', label: 'None', prefix: '' },
  { id: 'cinematic', label: 'Cinematic', prefix: 'cinematic film still, dramatic lighting, ' },
  { id: 'anime', label: 'Anime', prefix: 'anime style, vibrant colors, detailed illustration, ' },
  { id: 'photo', label: 'Photo', prefix: 'professional photography, 8k uhd, dslr, ' },
  { id: 'digital', label: 'Digital Art', prefix: 'digital art, highly detailed, artstation, ' },
  { id: 'oil', label: 'Oil Paint', prefix: 'oil painting, classical art style, textured brushstrokes, ' },
]

const MIN_SIDEBAR_WIDTH = 200
const MAX_SIDEBAR_WIDTH = 400
const DEFAULT_SIDEBAR_WIDTH = 256

export function ImagePage() {
  const navigate = useNavigate()
  const [prompt, setPrompt] = useState('')
  const [selectedModel, setSelectedModel] = useState<string>('sd-turbo')
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1')
  const [selectedStyle, setSelectedStyle] = useState('none')
  const [imageCount, setImageCount] = useState(4)
  const [showModelMenu, setShowModelMenu] = useState(false)
  const [showStyleMenu, setShowStyleMenu] = useState(false)
  const [showAspectMenu, setShowAspectMenu] = useState(false)
  const [showLoraMenu, setShowLoraMenu] = useState(false)

  // LoRA state
  const [selectedLoras, setSelectedLoras] = useState<{ id: string; name: string; weight: number }[]>([])
  const [availableLoras, setAvailableLoras] = useState<LoRAInfo[]>([])
  const [hoveredImage, setHoveredImage] = useState<string | null>(null)

  // Reference images for I2I
  const [referenceImages, setReferenceImages] = useState<{file: File, preview: string}[]>([])
  const [strength, setStrength] = useState(0.75)
  const refImageInputRef = useRef<HTMLInputElement>(null)

  // Session management
  const [sessions, setSessions] = useState<Session[]>([])
  const [currentSession, setCurrentSession] = useState<Session | null>(null)
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [sessionMenuId, setSessionMenuId] = useState<string | null>(null)

  // Session prompt drafts - persisted to localStorage
  const [sessionDrafts, setSessionDrafts] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('hollywool_session_drafts')
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  })

  // Job tracking - map job_id to job (supports multiple queued jobs)
  const [activeJobs, setActiveJobs] = useState<Record<string, Job>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Resizable sidebar
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH)
  const [isResizing, setIsResizing] = useState(false)
  const sidebarRef = useRef<HTMLDivElement>(null)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const feedRef = useRef<HTMLDivElement>(null)

  // Dropdown refs for click-outside detection
  const modelMenuRef = useRef<HTMLDivElement>(null)
  const styleMenuRef = useRef<HTMLDivElement>(null)
  const loraMenuRef = useRef<HTMLDivElement>(null)
  const aspectMenuRef = useRef<HTMLDivElement>(null)

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
      if (showLoraMenu && loraMenuRef.current && !loraMenuRef.current.contains(target)) {
        setShowLoraMenu(false)
      }
      if (showAspectMenu && aspectMenuRef.current && !aspectMenuRef.current.contains(target)) {
        setShowAspectMenu(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showModelMenu, showStyleMenu, showLoraMenu, showAspectMenu])

  // Persist session drafts to localStorage
  useEffect(() => {
    localStorage.setItem('hollywool_session_drafts', JSON.stringify(sessionDrafts))
  }, [sessionDrafts])

  // Save prompt to current session's draft whenever it changes
  useEffect(() => {
    if (currentSession) {
      setSessionDrafts(prev => {
        // Only update if the value actually changed to avoid unnecessary re-renders
        if (prev[currentSession.id] === prompt) return prev
        return { ...prev, [currentSession.id]: prompt }
      })
    }
  }, [prompt, currentSession?.id])

  // Initialize sessions from backend
  useEffect(() => {
    const loadSessions = async () => {
      const session = await ensureCurrentSession()
      setCurrentSession(session)
      setSessions(getSessions())
      // Load draft for initial session
      if (session) {
        const draft = sessionDrafts[session.id] || ''
        setPrompt(draft)
      }
    }
    loadSessions()
  }, [])

  // Handle sidebar resize
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return
      const navWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-sidebar-width')) || 56
      const newWidth = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, e.clientX - navWidth))
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

  const { data: modelsData } = useQuery({
    queryKey: ['models'],
    queryFn: api.getModels,
  })

  const { data: providersData } = useQuery({
    queryKey: ['providers'],
    queryFn: api.getProviders,
  })

  // Get configured remote providers with image models
  const configuredProviders = Object.entries(providersData?.providers || {})
    .filter(([_, config]) => config.is_configured && config.is_enabled)
    .map(([providerId]) => providerId as ModelProvider)

  const { data: assetsData, refetch: refetchAssets } = useQuery({
    queryKey: ['assets'],
    queryFn: () => api.getAssets({ limit: 200 }),
  })

  // Get model type for current model
  const selectedModelType = modelsData?.models.find(m => m.id === selectedModel)?.type || 'sd'

  // Fetch available LoRAs when model changes
  useEffect(() => {
    const fetchLoras = async () => {
      try {
        const { loras } = await api.getLoras(selectedModelType)
        setAvailableLoras(loras)
        // Clear selected LoRAs that are no longer compatible
        setSelectedLoras(prev =>
          prev.filter(l => loras.some(al => al.id === l.id))
        )
      } catch (err) {
        console.error('Failed to fetch LoRAs:', err)
        setAvailableLoras([])
      }
    }
    fetchLoras()
  }, [selectedModelType])

  // Poll for active jobs from backend (supports multiple queued jobs)
  useEffect(() => {
    const pollJobs = async () => {
      try {
        // Fetch ALL active jobs from backend
        const { jobs: backendJobs } = await api.getJobs({ active_only: true })

        // Update activeJobs state with backend data (keyed by job ID)
        const updatedJobs: Record<string, Job> = {}
        for (const job of backendJobs) {
          updatedJobs[job.id] = job
        }

        // Merge with existing local state (for jobs we started)
        setActiveJobs(prev => {
          const merged = { ...updatedJobs }
          // Keep local jobs that might not be in backend yet
          for (const [jobId, job] of Object.entries(prev)) {
            if (!merged[jobId] && job && !['completed', 'failed'].includes(job.status)) {
              merged[jobId] = job
            }
          }
          return merged
        })

        // Check for completed jobs and update sessions
        for (const job of backendJobs) {
          if (job.status === 'completed' && job.batch_id && job.session_id) {
            const session = getSessions().find(s => s.id === job.session_id)
            if (session && !session.batchIds.includes(job.batch_id)) {
              const thumbnail = job.images[0]?.url
              addBatchToSession(job.session_id, job.batch_id, thumbnail)
              setSessions(getSessions())
              setCurrentSession(prev => getSessions().find(s => s.id === prev?.id) || null)
              refetchAssets()
            }
          }
        }
      } catch (err) {
        console.error('Failed to poll jobs:', err)
      }

      // Poll individual jobs we're tracking locally (by job ID)
      const jobIds = Object.keys(activeJobs)
      for (const jobId of jobIds) {
        const job = activeJobs[jobId]
        if (!job || job.status === 'completed' || job.status === 'failed') continue

        try {
          const updatedJob = await api.getJob(job.id)
          setActiveJobs(prev => ({ ...prev, [jobId]: updatedJob }))

          // Job completed - update session
          if (updatedJob.status === 'completed' && updatedJob.batch_id && updatedJob.session_id) {
            const sessionId = updatedJob.session_id
            const thumbnail = updatedJob.images[0]?.url

            // Check if this is the first generation for this session
            const session = getSessions().find(s => s.id === sessionId)
            const isFirstGeneration = session && session.batchIds.length === 0

            addBatchToSession(sessionId, updatedJob.batch_id, thumbnail)

            // Auto-rename session on first generation
            if (isFirstGeneration) {
              try {
                const titleResponse = await api.generateTitle(updatedJob.prompt)
                autoRenameSession(sessionId, titleResponse.title)
              } catch {
                const fallbackTitle = updatedJob.prompt.split(' ').slice(0, 4).join(' ')
                autoRenameSession(sessionId, fallbackTitle)
              }
            }

            setSessions(getSessions())
            setCurrentSession(prev => getSessions().find(s => s.id === prev?.id) || null)
            refetchAssets()

            // Scroll to bottom if this is the current session
            if (sessionId === currentSession?.id && feedRef.current) {
              setTimeout(() => {
                feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' })
              }, 100)
            }

            // Remove completed job after a delay
            setTimeout(() => {
              setActiveJobs(prev => {
                const updated = { ...prev }
                delete updated[jobId]
                return updated
              })
            }, 2000)
          }

          // Job failed - remove after showing error (keep visible for 30 seconds)
          if (updatedJob.status === 'failed') {
            setTimeout(() => {
              setActiveJobs(prev => {
                const updated = { ...prev }
                delete updated[jobId]
                return updated
              })
            }, 30000)
          }
        } catch (err) {
          console.error('Failed to poll job:', err)
        }
      }
    }

    const interval = setInterval(pollJobs, 1000)
    return () => clearInterval(interval)
  }, [activeJobs, currentSession?.id, refetchAssets])

  // Submit a new generation job
  const submitJob = async () => {
    if (!prompt.trim() || !currentSession || isSubmitting) return

    setIsSubmitting(true)
    const fullPrompt = selectedStyleInfo.prefix + prompt.trim()

    try {
      // Build reference_images array if any
      let reference_images: { image_base64: string }[] | undefined
      if (referenceImages.length > 0) {
        reference_images = []
        for (const ref of referenceImages) {
          const base64 = await fileToBase64(ref.file)
          reference_images.push({ image_base64: base64 })
        }
      }

      const response = await api.createJob({
        prompt: fullPrompt,
        model: selectedModel,
        width: selectedAspect.width,
        height: selectedAspect.height,
        num_images: imageCount,
        session_id: currentSession.id,
        loras: selectedLoras.length > 0
          ? selectedLoras.map(l => ({ lora_id: l.id, weight: l.weight }))
          : undefined,
        reference_images,
        strength: reference_images ? strength : undefined,
      })

      // Fetch the job details and track it by job ID
      const job = await api.getJob(response.job_id)
      setActiveJobs(prev => ({ ...prev, [job.id]: job }))

      // Scroll to bottom to show the generation card
      setTimeout(() => {
        feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' })
      }, 100)
    } catch (err) {
      console.error('Failed to create job:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Get the first active job for a session (for backwards compatibility)
  const getSessionJob = (sessionId: string) =>
    Object.values(activeJobs).find(job => job && job.session_id === sessionId && !['completed', 'failed'].includes(job.status))
  const currentJob = currentSession ? getSessionJob(currentSession.id) : null

  // Get all active jobs for current session (supports queuing multiple jobs)
  const currentSessionJobs = Object.values(activeJobs)
    .filter(job => job && job.session_id === currentSession?.id && !['completed', 'failed'].includes(job.status))
    .map(job => ({ sessionId: job.session_id || job.id, job: job!, sessionName: currentSession?.name || 'Session' }))

  // For the empty state check and rendering queued jobs
  const activeInProgressJobs = currentSessionJobs

  const deleteMutation = useMutation({
    mutationFn: api.deleteAsset,
    onSuccess: () => refetchAssets(),
  })

  const selectedModelInfo = modelsData?.models.find((m: ModelInfo) => m.id === selectedModel)
  const selectedAspect = aspectRatios.find(a => a.value === aspectRatio)!
  const selectedStyleInfo = stylePresets.find(s => s.id === selectedStyle)!

  // Filter assets by current session's batch IDs
  const sessionBatchIds = currentSession?.batchIds || []
  const filteredAssets = assetsData?.assets.filter(a =>
    a.batch_id && sessionBatchIds.includes(a.batch_id)
  ) || []
  // Reverse batches so oldest is on top (chat-like order)
  const batches = groupAssetsByBatch(filteredAssets).reverse()

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px'
    }
  }, [prompt])

  const handleGenerate = () => {
    submitJob()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleGenerate()
    }
  }

  // Reference image handlers
  const handleRefImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const remaining = 5 - referenceImages.length
    const toAdd = files.slice(0, remaining)

    for (const file of toAdd) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setReferenceImages(prev => {
          if (prev.length >= 5) return prev
          return [...prev, { file, preview: reader.result as string }]
        })
      }
      reader.readAsDataURL(file)
    }

    // Reset input so same file can be re-selected
    if (refImageInputRef.current) refImageInputRef.current.value = ''
  }

  const removeReferenceImage = (index: number) => {
    setReferenceImages(prev => prev.filter((_, i) => i !== index))
  }

  const clearReferenceImages = () => {
    setReferenceImages([])
  }

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  // Count active jobs in queue (for limiting to 10)
  const activeJobCount = Object.values(activeJobs).filter(
    job => job && !['completed', 'failed'].includes(job.status)
  ).length
  const canQueueMore = activeJobCount < 10

  const handleNewSession = () => {
    // Save current prompt as draft before switching
    if (currentSession) {
      setSessionDrafts(prev => ({ ...prev, [currentSession.id]: prompt }))
    }
    const session = createSession()
    setSessions(getSessions())
    setCurrentSession(session)
    setPrompt('')  // New session starts with empty prompt
  }

  const handleSwitchSession = (session: Session) => {
    // Save current prompt as draft for current session
    if (currentSession) {
      setSessionDrafts(prev => ({ ...prev, [currentSession.id]: prompt }))
    }
    // Switch to new session
    setCurrentSessionId(session.id)
    setCurrentSession(session)
    // Restore draft for new session
    setPrompt(sessionDrafts[session.id] || '')
  }

  const handleDeleteSession = (id: string) => {
    deleteSession(id)
    // Clean up draft for deleted session
    setSessionDrafts(prev => {
      const updated = { ...prev }
      delete updated[id]
      return updated
    })
    setSessions(getSessions())
    const newCurrentId = getCurrentSessionId()
    if (newCurrentId) {
      const newSession = getSessions().find(s => s.id === newCurrentId)
      setCurrentSession(newSession || null)
      // Restore draft for new current session
      if (newSession) {
        setPrompt(sessionDrafts[newSession.id] || '')
      }
    }
    setSessionMenuId(null)
  }

  const handleRenameSession = (id: string) => {
    if (editingName.trim()) {
      renameSession(id, editingName.trim())
      setSessions(getSessions())
      setCurrentSession(getSessions().find(s => s.id === currentSession?.id) || null)
    }
    setEditingSessionId(null)
    setEditingName('')
  }

  const handleDownload = async (asset: Asset) => {
    const response = await fetch(asset.url)
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${asset.prompt.slice(0, 30).replace(/[^a-z0-9]/gi, '_')}_${asset.seed}.png`
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
  }

  const handleCopySeed = (seed: number) => {
    navigator.clipboard.writeText(seed.toString())
  }

  const handleCopyPrompt = (promptText: string) => {
    setPrompt(promptText)
    textareaRef.current?.focus()
  }

  const handleRegenerate = async (asset: Asset) => {
    if (!currentSession || isSubmitting) return
    setPrompt(asset.prompt)
    setSelectedModel(asset.model)

    setIsSubmitting(true)
    try {
      const response = await api.createJob({
        prompt: asset.prompt,
        model: asset.model,
        width: asset.width,
        height: asset.height,
        num_images: imageCount,
        session_id: currentSession.id,
        loras: selectedLoras.length > 0
          ? selectedLoras.map(l => ({ lora_id: l.id, weight: l.weight }))
          : undefined,
      })
      const job = await api.getJob(response.job_id)
      setActiveJobs(prev => ({ ...prev, [job.id]: job }))
    } catch (err) {
      console.error('Failed to create job:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex-1 flex h-full overflow-hidden">
      {/* Session Sidebar - fixed position, scrolls independently */}
      <aside
        ref={sidebarRef}
        style={{ width: sidebarWidth }}
        className="h-full border-r border-border flex flex-col bg-muted/50 dark:bg-black/20 relative flex-shrink-0"
      >
        <div className="p-3 border-b border-border flex-shrink-0">
          <button
            onClick={handleNewSession}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium transition-colors"
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
                  ? 'bg-accent'
                  : 'hover:bg-muted'
              )}
            >
              {editingSessionId === session.id ? (
                <input
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={() => handleRenameSession(session.id)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRenameSession(session.id)}
                  className="w-full px-3 py-2 bg-transparent text-sm text-primary-foreground outline-none"
                  autoFocus
                />
              ) : (
                <div
                  onClick={() => handleSwitchSession(session)}
                  className="flex items-center gap-2 px-2 py-2"
                >
                  {/* Thumbnail */}
                  {session.thumbnail ? (
                    <div className="w-8 h-8 rounded overflow-hidden flex-shrink-0 bg-muted">
                      <img
                        src={session.thumbnail}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded flex-shrink-0 bg-muted flex items-center justify-center">
                      <MessageSquare className="h-4 w-4 text-muted-foreground/50" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-foreground/80 truncate block">
                      {session.name}
                    </span>
                    {/* Show job status for this session */}
                    {getSessionJob(session.id) && !['completed', 'failed'].includes(getSessionJob(session.id)!.status) && (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Loader2 className="h-3 w-3 animate-spin text-primary" />
                        <span className="text-xs text-primary">
                          {getSessionJob(session.id)!.status === 'downloading'
                            ? `Downloading ${Math.round(getSessionJob(session.id)!.download_progress)}%`
                            : getSessionJob(session.id)!.status === 'loading_model'
                            ? 'Loading...'
                            : `${Math.round(getSessionJob(session.id)!.progress)}%`}
                        </span>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setSessionMenuId(sessionMenuId === session.id ? null : session.id)
                    }}
                    className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-accent transition-all"
                  >
                    <MoreHorizontal className="h-4 w-4 text-muted-foreground/70" />
                  </button>
                </div>
              )}

              {/* Session menu */}
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
                      className="w-full px-3 py-1.5 text-left text-sm text-foreground/80 hover:bg-accent flex items-center gap-2"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Rename
                    </button>
                    <button
                      onClick={() => handleDeleteSession(session.id)}
                      className="w-full px-3 py-1.5 text-left text-sm text-red-400 hover:bg-accent flex items-center gap-2"
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
            <GripVertical className="h-6 w-6 text-muted-foreground/50" />
          </div>
        </div>
      </aside>

      {/* Main Content Area - scrolls independently */}
      <div className="flex-1 flex flex-col relative min-w-0 h-full">
        <div ref={feedRef} className="flex-1 overflow-y-auto pb-40 scrollbar-thin min-h-0">
          <div className="p-4 space-y-6">
            {/* Generation Cards (completed batches) */}
            {batches.map((batch) => {
              const singleImage = batch.images.length === 1 ? batch.images[0] : null
              return (
              <div key={batch.batch_id} className="card-container rounded-2xl overflow-hidden border border-white/10 bg-white/[0.02] group/card">
                {/* Single image: side-by-side layout with image left, details right */}
                {singleImage ? (
                  <div className="flex flex-col md:flex-row">
                    {/* Image - constrained height */}
                    <div className="flex-shrink-0 md:w-auto">
                      <div
                        className="relative cursor-pointer group/image"
                        onMouseEnter={() => setHoveredImage(singleImage.id)}
                        onMouseLeave={() => setHoveredImage(null)}
                        onClick={() => navigate(`/asset/${singleImage.id}`)}
                      >
                        <img
                          src={singleImage.url}
                          alt={singleImage.prompt}
                          className="max-h-[65vh] w-auto object-contain rounded-l-2xl md:rounded-r-none rounded-r-2xl"
                          loading="lazy"
                        />

                        {/* Image hover overlay */}
                        <div className={cn(
                          'absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent',
                          'flex flex-col justify-end p-3 transition-opacity duration-200 rounded-l-2xl',
                          hoveredImage === singleImage.id ? 'opacity-100' : 'opacity-0'
                        )}>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDownload(singleImage) }}
                              className="p-1.5 rounded-md bg-accent hover:bg-white/20 transition-colors"
                              title="Download"
                            >
                              <Download className="h-4 w-4" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleCopySeed(singleImage.seed) }}
                              className="p-1.5 rounded-md bg-accent hover:bg-white/20 transition-colors"
                              title={`Copy seed: ${singleImage.seed}`}
                            >
                              <Copy className="h-4 w-4" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleRegenerate(singleImage) }}
                              className="p-1.5 rounded-md bg-accent hover:bg-white/20 transition-colors"
                              title="Regenerate"
                            >
                              <RefreshCw className="h-4 w-4" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(singleImage.id) }}
                              className="p-1.5 rounded-md bg-accent hover:bg-red-500/50 transition-colors ml-auto"
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Details panel on right */}
                    <div className="flex-1 p-4 flex flex-col justify-between min-w-[200px] md:max-w-[280px]">
                      <div>
                        <h3 className="text-xs font-medium text-muted-foreground/70 uppercase tracking-wider mb-2">Prompt</h3>
                        <p className="text-sm text-foreground/80 leading-relaxed">{batch.prompt}</p>
                      </div>

                      <div className="mt-4 space-y-3">
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <span className="text-xs text-muted-foreground/70">Model</span>
                            <p className="text-muted-foreground truncate">{batch.model}</p>
                          </div>
                          <div>
                            <span className="text-xs text-muted-foreground/70">Size</span>
                            <p className="text-muted-foreground">{batch.width}×{batch.height}</p>
                          </div>
                          <div>
                            <span className="text-xs text-muted-foreground/70">Seed</span>
                            <p className="text-muted-foreground font-mono text-xs">{singleImage.seed}</p>
                          </div>
                          <div>
                            <span className="text-xs text-muted-foreground/70">Steps</span>
                            <p className="text-muted-foreground">{singleImage.steps}</p>
                          </div>
                        </div>

                        <button
                          onClick={() => handleCopyPrompt(batch.prompt)}
                          className="w-full mt-2 px-3 py-2 rounded-lg bg-muted hover:bg-accent text-muted-foreground hover:text-foreground/80 text-sm transition-colors flex items-center justify-center gap-2"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          Use this prompt
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Multi-image: grid layout */
                  <>
                    <div className={cn(
                      'grid gap-1 p-1',
                      batch.images.length === 2 ? 'grid-cols-2' :
                      batch.images.length === 3 ? 'grid-cols-3' :
                      'grid-cols-2 md:grid-cols-4'
                    )}>
                      {batch.images.map((image) => (
                        <div
                          key={image.id}
                          className="relative aspect-square rounded-lg overflow-hidden bg-muted cursor-pointer group/image"
                          onMouseEnter={() => setHoveredImage(image.id)}
                          onMouseLeave={() => setHoveredImage(null)}
                          onClick={() => navigate(`/asset/${image.id}`)}
                        >
                          <img
                            src={image.url}
                            alt={image.prompt}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover/image:scale-105"
                            loading="lazy"
                          />

                          {/* Image hover overlay */}
                          <div className={cn(
                            'absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent',
                            'flex flex-col justify-end p-2 transition-opacity duration-200',
                            hoveredImage === image.id ? 'opacity-100' : 'opacity-0'
                          )}>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDownload(image) }}
                                className="p-1.5 rounded-md bg-accent hover:bg-white/20 transition-colors"
                                title="Download"
                              >
                                <Download className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleCopySeed(image.seed) }}
                                className="p-1.5 rounded-md bg-accent hover:bg-white/20 transition-colors"
                                title={`Copy seed: ${image.seed}`}
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleRegenerate(image) }}
                                className="p-1.5 rounded-md bg-accent hover:bg-white/20 transition-colors"
                                title="Regenerate"
                              >
                                <RefreshCw className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(image.id) }}
                                className="p-1.5 rounded-md bg-accent hover:bg-red-500/50 transition-colors ml-auto"
                                title="Delete"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Seed badge */}
                          <div className="absolute top-2 right-2 opacity-0 group-hover/image:opacity-100 transition-opacity">
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/60 text-muted-foreground">
                              {image.seed}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Card Footer with prompt */}
                    <div className="px-4 py-3 border-t border-border">
                      <div className="flex items-start justify-between gap-4">
                        <p className="text-sm text-muted-foreground leading-relaxed flex-1">{batch.prompt}</p>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground/70">
                            {batch.model}
                          </span>
                          <span className="text-xs text-muted-foreground/50">
                            {batch.width}×{batch.height}
                          </span>
                          <button
                            onClick={() => handleCopyPrompt(batch.prompt)}
                            className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted transition-colors"
                            title="Use this prompt"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )})}


            {/* Generation in progress - Cards for ALL active jobs (persists across session switches) */}
            {activeInProgressJobs.map(({ sessionId, job, sessionName }) => {
              // Determine step states
              const steps = [
                { id: 'download', label: 'Download', active: job.status === 'downloading', completed: ['loading_model', 'generating', 'saving'].includes(job.status), skipped: job.status === 'queued' ? undefined : !job.download_total_mb && job.status !== 'downloading' },
                { id: 'load', label: 'Load Model', active: job.status === 'loading_model', completed: ['generating', 'saving'].includes(job.status) },
                { id: 'generate', label: 'Generate', active: job.status === 'generating', completed: job.status === 'saving' },
                { id: 'save', label: 'Save', active: job.status === 'saving', completed: false },
              ]

              return (
              <div key={job.id} className="card-container rounded-2xl overflow-hidden border border-primary/30 bg-primary/5">
                {/* Card Header with status */}
                <div className="px-4 py-3 border-b border-border">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                        <Loader2 className="h-3 w-3 animate-spin text-primary" />
                      </div>
                      <span className="text-sm font-medium text-foreground">
                        {job.status === 'queued' ? 'Queued' :
                         job.status === 'downloading' ? 'Downloading model' :
                         job.status === 'loading_model' ? 'Loading model' :
                         job.status === 'saving' ? 'Saving images' :
                         `Generating image ${job.current_image}/${job.total_images}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {job.source_image_urls && job.source_image_urls.length > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary flex items-center gap-1">
                          <ImageIcon className="h-3 w-3" />
                          I2I
                        </span>
                      )}
                      {sessionId !== currentSession?.id && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-accent text-muted-foreground">
                          {sessionName}
                        </span>
                      )}
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground/70">
                        {job.model}
                      </span>
                    </div>
                  </div>

                  {/* Step indicators */}
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

                  {/* Progress details */}
                  <div className="mt-3 flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-accent rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-300"
                        style={{ width: `${job.status === 'downloading' ? job.download_progress : job.progress}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground min-w-[3ch]">
                      {job.status === 'downloading'
                        ? `${Math.round(job.download_progress)}%`
                        : `${Math.round(job.progress)}%`}
                    </span>
                  </div>
                  {/* Extra download info */}
                  {job.status === 'downloading' && job.download_total_mb && (
                    <div className="mt-1 text-xs text-muted-foreground/70">
                      {job.download_total_mb > 1024
                        ? `${(job.download_total_mb / 1024).toFixed(1)} GB`
                        : `${Math.round(job.download_total_mb)} MB`}
                      {job.download_speed_mbps && job.download_speed_mbps > 0 && (
                        <> @ {job.download_speed_mbps.toFixed(1)} MB/s</>
                      )}
                    </div>
                  )}
                  {/* ETA for generation */}
                  {job.status !== 'downloading' && job.eta_seconds !== null && job.eta_seconds > 0 && (
                    <div className="mt-1 text-xs text-muted-foreground/70">
                      ~{Math.round(job.eta_seconds)}s remaining
                    </div>
                  )}
                </div>

                {/* Card Images Grid - Responsive */}
                <div className={cn(
                  'grid gap-1 p-1',
                  job.num_images === 1 ? 'grid-cols-1' :
                  job.num_images === 2 ? 'grid-cols-2' :
                  job.num_images === 3 ? 'grid-cols-3' :
                  'grid-cols-2 md:grid-cols-4'
                )}>
                  {[...Array(job.num_images)].map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        'aspect-square rounded-lg',
                        i < job.current_image
                          ? 'bg-primary/20 border border-primary/30'
                          : 'bg-muted animate-pulse'
                      )}
                    />
                  ))}
                </div>

                {/* Show prompt and source images */}
                <div className="px-4 py-3 border-t border-border">
                  {job.source_image_urls && job.source_image_urls.length > 0 && (
                    <div className="flex items-center gap-2 mb-2">
                      {job.source_image_urls.map((url, idx) => (
                        <img
                          key={idx}
                          src={url}
                          alt={`Source ${idx + 1}`}
                          className="h-10 w-10 rounded object-cover"
                        />
                      ))}
                      {job.strength !== null && job.strength !== undefined && (
                        <span className="text-xs text-muted-foreground/70 ml-1">
                          Strength: {job.strength.toFixed(2)}
                        </span>
                      )}
                    </div>
                  )}
                  <p className="text-sm text-muted-foreground">{job.prompt}</p>
                </div>
              </div>
            )})}


            {/* Empty state */}
            {batches.length === 0 && activeInProgressJobs.length === 0 && (
              <div className="text-center py-20">
                <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
                  <Sparkles className="h-10 w-10 text-primary-foreground/20" />
                </div>
                <h2 className="text-xl font-medium text-foreground/80 mb-2">Start creating</h2>
                <p className="text-muted-foreground/70 max-w-md mx-auto">
                  Describe what you want to see and generate images
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
            <div className="glass rounded-2xl p-3">
              {/* Top row - Options */}
              <div className="flex items-center gap-2 mb-3 px-1 flex-wrap">
                {/* Model Selector */}
                <div className="relative" ref={modelMenuRef}>
                  <button
                    onClick={() => setShowModelMenu(!showModelMenu)}
                    className="model-pill"
                  >
                    <Wand2 className="h-3.5 w-3.5" />
                    <span>{selectedModelInfo?.name || 'Model'}</span>
                    <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showModelMenu && 'rotate-180')} />
                  </button>

                  {showModelMenu && (
                    <div className="absolute bottom-full left-0 mb-2 w-64 rounded-xl glass-light shadow-xl z-[60] flex flex-col">
                        {/* Scrollable model list */}
                        <div className="max-h-72 overflow-y-auto scrollbar-thin py-1">
                          {/* Local Models Section */}
                          <div className="px-3 py-1.5 text-[10px] font-medium text-amber-400/70 uppercase tracking-wider flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400/70" />
                            Local Models
                          </div>
                          {modelsData?.models
                            .filter((model: ModelInfo) => !['video', 'ltx2', 'svd', 'video-i2v'].includes(model.type))
                            .map((model: ModelInfo) => (
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
                                {model.default_steps} steps • {model.type}
                              </div>
                            </button>
                          ))}

                          {/* Remote Models Section */}
                          <div className="px-3 py-1.5 mt-2 text-[10px] font-medium text-blue-400/70 uppercase tracking-wider flex items-center gap-1.5 border-t border-border pt-3">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400/70" />
                            Remote Models
                          </div>
                          {configuredProviders.length > 0 ? (
                            configuredProviders.map(providerId => {
                              const providerModels = PREVIEW_MODELS[providerId]?.filter(m => m.type === 'image') || []
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

                {/* LoRA Selector */}
                <div className="relative" ref={loraMenuRef}>
                  <button
                    onClick={() => setShowLoraMenu(!showLoraMenu)}
                    className={cn(
                      'model-pill',
                      selectedLoras.length > 0 && 'bg-primary/20 text-primary'
                    )}
                  >
                    <Layers className="h-3.5 w-3.5" />
                    <span>{selectedLoras.length > 0 ? `${selectedLoras.length} LoRA` : 'LoRAs'}</span>
                    <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showLoraMenu && 'rotate-180')} />
                  </button>

                  {showLoraMenu && (
                    <div className="absolute bottom-full left-0 mb-2 w-80 py-2 rounded-xl glass-light shadow-xl z-[60] max-h-96 overflow-y-auto">
                        <div className="px-3 pb-2 border-b border-white/10">
                          <h3 className="text-xs font-medium text-muted-foreground/70 uppercase">Available LoRAs</h3>
                        </div>

                        {availableLoras.length === 0 ? (
                          <div className="px-3 py-4 text-center text-sm text-muted-foreground/70">
                            No compatible LoRAs for this model
                          </div>
                        ) : (
                          availableLoras.map((lora) => {
                            const isSelected = selectedLoras.some(l => l.id === lora.id)
                            const selectedLora = selectedLoras.find(l => l.id === lora.id)

                            return (
                              <div key={lora.id} className="px-3 py-2 hover:bg-muted">
                                <div className="flex items-center justify-between">
                                  <label className="flex items-center gap-2 cursor-pointer flex-1">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          setSelectedLoras([...selectedLoras, {
                                            id: lora.id,
                                            name: lora.name,
                                            weight: lora.default_weight
                                          }])
                                        } else {
                                          setSelectedLoras(selectedLoras.filter(l => l.id !== lora.id))
                                        }
                                      }}
                                      className="rounded border-white/20 bg-muted text-primary focus:ring-primary/50"
                                    />
                                    <div>
                                      <div className="text-sm font-medium">{lora.name}</div>
                                      {lora.description && (
                                        <div className="text-xs text-muted-foreground/70">{lora.description}</div>
                                      )}
                                    </div>
                                  </label>
                                  {!lora.is_downloaded && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
                                      Download
                                    </span>
                                  )}
                                </div>

                                {/* Weight slider when selected */}
                                {isSelected && selectedLora && (
                                  <div className="mt-2 pl-6">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-muted-foreground/70 w-12">Weight:</span>
                                      <input
                                        type="range"
                                        min="0"
                                        max="1.5"
                                        step="0.05"
                                        value={selectedLora.weight}
                                        onChange={(e) => {
                                          setSelectedLoras(selectedLoras.map(l =>
                                            l.id === lora.id ? { ...l, weight: parseFloat(e.target.value) } : l
                                          ))
                                        }}
                                        className="flex-1 h-1 bg-accent rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
                                      />
                                      <span className="text-xs text-muted-foreground w-8 text-right">
                                        {selectedLora.weight.toFixed(2)}
                                      </span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )
                          })
                        )}

                        {/* Selected LoRAs summary */}
                        {selectedLoras.length > 0 && (
                          <div className="px-3 pt-2 mt-2 border-t border-white/10">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground/70">
                                {selectedLoras.length} selected
                              </span>
                              <button
                                onClick={() => setSelectedLoras([])}
                                className="text-xs text-red-400 hover:text-red-300"
                              >
                                Clear all
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                  )}
                </div>

                <div className="h-5 w-px bg-accent" />

                {/* Aspect Ratio - Popup selector */}
                <div className="relative" ref={aspectMenuRef}>
                  <button
                    onClick={() => setShowAspectMenu(!showAspectMenu)}
                    className="model-pill"
                  >
                    <Square className="h-3.5 w-3.5" />
                    <span>{selectedAspect.label}</span>
                    <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showAspectMenu && 'rotate-180')} />
                  </button>

                  {showAspectMenu && (
                    <div className="absolute bottom-full left-0 mb-2 p-3 rounded-xl glass-light shadow-xl z-[60]">
                      <div className="grid grid-cols-3 gap-2 mb-3">
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
                                ? 'border-white/40 bg-accent text-primary-foreground'
                                : 'border-white/10 text-muted-foreground hover:border-white/20 hover:text-foreground/80'
                            )}
                          >
                            {ratio.label}
                          </button>
                        ))}
                      </div>
                      <div className="text-xs text-muted-foreground/70 text-center">
                        {selectedAspect.width}×{selectedAspect.height}
                      </div>
                    </div>
                  )}
                </div>

                <div className="h-5 w-px bg-accent" />

                {/* Image Count Selector - Higgsfield style */}
                <div className="flex items-center bg-muted rounded-full">
                  <button
                    onClick={() => setImageCount(Math.max(1, imageCount - 1))}
                    disabled={imageCount <= 1}
                    className="p-2 text-muted-foreground hover:text-primary-foreground disabled:text-primary-foreground/20 disabled:cursor-not-allowed transition-colors"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="px-2 text-sm font-medium text-foreground/80 min-w-[40px] text-center">
                    {imageCount}/4
                  </span>
                  <button
                    onClick={() => setImageCount(Math.min(4, imageCount + 1))}
                    disabled={imageCount >= 4}
                    className="p-2 text-muted-foreground hover:text-primary-foreground disabled:text-primary-foreground/20 disabled:cursor-not-allowed transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                <div className="h-5 w-px bg-accent" />

                {/* Ref Image Button */}
                <button
                  onClick={() => refImageInputRef.current?.click()}
                  className={cn(
                    'model-pill',
                    referenceImages.length > 0 && 'bg-primary/20 text-primary'
                  )}
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                  <span>{referenceImages.length > 0 ? `${referenceImages.length} Ref` : 'Ref Image'}</span>
                </button>
                <input
                  ref={refImageInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleRefImageUpload}
                  className="hidden"
                />
              </div>

              {/* Reference images strip */}
              {referenceImages.length > 0 && (
                <div className="mb-3 px-1">
                  <div className="p-3 rounded-xl bg-muted">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-medium text-muted-foreground/70 uppercase tracking-wider">Reference Images</span>
                      <span className="text-xs text-muted-foreground/50">({referenceImages.length}/5)</span>
                      <button
                        onClick={clearReferenceImages}
                        className="ml-auto text-xs text-red-400 hover:text-red-300 transition-colors"
                      >
                        Clear all
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      {referenceImages.map((ref, i) => (
                        <div key={i} className="relative group/ref">
                          <img
                            src={ref.preview}
                            alt={`Ref ${i + 1}`}
                            className="w-16 h-16 rounded-lg object-cover"
                          />
                          <button
                            onClick={() => removeReferenceImage(i)}
                            className="absolute -top-1.5 -right-1.5 p-0.5 rounded-full bg-red-500 hover:bg-red-600 opacity-0 group-hover/ref:opacity-100 transition-opacity"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                      {referenceImages.length < 5 && (
                        <button
                          onClick={() => refImageInputRef.current?.click()}
                          className="w-16 h-16 rounded-lg border-2 border-dashed border-white/20 hover:border-primary/50 flex items-center justify-center transition-colors"
                        >
                          <Plus className="h-4 w-4 text-muted-foreground" />
                        </button>
                      )}
                    </div>
                    {/* Strength slider */}
                    <div className="mt-3 flex items-center gap-3">
                      <span className="text-xs text-muted-foreground/70 w-14">Strength:</span>
                      <input
                        type="range"
                        min="0.1"
                        max="1.0"
                        step="0.05"
                        value={strength}
                        onChange={(e) => setStrength(parseFloat(e.target.value))}
                        className="flex-1 h-1 bg-accent rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
                      />
                      <span className="text-xs text-muted-foreground w-8 text-right font-mono">
                        {strength.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Prompt input row */}
              <div className="flex items-end gap-3">
                <div className="flex-1 bg-muted rounded-xl px-4 py-3">
                  <textarea
                    ref={textareaRef}
                    placeholder="Describe what you want to create..."
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
                  disabled={!prompt.trim() || !canQueueMore || isSubmitting}
                  className="generate-btn flex items-center gap-2"
                  title={!canQueueMore ? 'Maximum 10 jobs in queue' : ''}
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  <span>Generate</span>
                </button>
              </div>
            </div>

            {currentJob?.status === 'failed' && currentJob.error && (
              <div className="mt-2 px-4 py-2 rounded-lg bg-red-500/20 border border-red-500/30">
                <p className="text-sm text-red-400">{currentJob.error}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
