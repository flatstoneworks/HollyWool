import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Layers,
  Sparkles,
  Loader2,
  Trash2,
  Plus,
  Minus,
  Pencil,
  Check,
  X,
  AlertCircle,
  CheckCircle,
  ImageIcon,
  Wand2,
  Square,
  Palette,
  ChevronDown,
  Send,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { api, type BulkImageItem, type BulkJob, type BulkSession } from '@/api/client'
import { toast } from '@/hooks/use-toast'
import { useResizableSidebar } from '@/hooks/useResizableSidebar'
import { SessionSidebar } from '@/components/SessionSidebar'
import {
  getBulkSessions, createBulkSession, setCurrentBulkSessionId,
  deleteBulkSession, renameBulkSession, ensureCurrentBulkSession,
  autoRenameBulkSession, addBulkJobToSession, initBulkSessions,
} from '@/lib/bulk-sessions'

// Popular fal.ai models for image generation
const FAL_MODELS = [
  { id: 'fal-ai/flux/schnell', name: 'FLUX.1 Schnell', description: 'Fast generation' },
  { id: 'fal-ai/flux/dev', name: 'FLUX.1 Dev', description: 'High quality' },
  { id: 'fal-ai/flux-pro/v1.1', name: 'FLUX Pro 1.1', description: 'Professional quality' },
  { id: 'fal-ai/fast-sdxl', name: 'SDXL Fast', description: 'Stable Diffusion XL' },
  { id: 'fal-ai/stable-diffusion-v3-medium', name: 'SD3 Medium', description: 'Stable Diffusion 3' },
]

const DIMENSION_PRESETS = [
  { label: '1:1', width: 1024, height: 1024 },
  { label: '16:9', width: 1344, height: 768 },
  { label: '9:16', width: 768, height: 1344 },
  { label: '4:3', width: 1152, height: 896 },
  { label: '3:4', width: 896, height: 1152 },
]

interface BulkSessionSettings {
  falModel: string
  dimensions: { width: number; height: number }
  count: number
  styleGuidance: string
}

// ============================================================================
// Feed card types
// ============================================================================

interface VariationLoadingCard {
  type: 'variation-loading'
  id: string
  count: number
  basePrompt: string
}

interface ReviewCard {
  type: 'review'
  id: string
  prompts: string[]
  basePrompt: string
}

interface GeneratingCard {
  type: 'generating'
  id: string
  jobId: string
  basePrompt: string
}

interface CompletedCard {
  type: 'completed'
  id: string
  job: BulkJob
  basePrompt: string
}

type FeedCard = VariationLoadingCard | ReviewCard | GeneratingCard | CompletedCard

// ============================================================================
// Component
// ============================================================================

export function BulkOperationPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  // Session state
  const [sessions, setSessions] = useState<BulkSession[]>([])
  const [currentSession, setCurrentSession] = useState<BulkSession | null>(null)
  const [sessionDrafts, setSessionDrafts] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('hollywool_bulk_session_drafts')
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  })

  // Session settings - persisted to localStorage
  const [sessionSettings, setSessionSettings] = useState<Record<string, BulkSessionSettings>>(() => {
    try {
      const saved = localStorage.getItem('hollywool_bulk_session_settings')
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  })

  // Form state (chatbox)
  const [prompt, setPrompt] = useState('')
  const [count, setCount] = useState(10)
  const [styleGuidance, setStyleGuidance] = useState('')
  const [showStyleInput, setShowStyleInput] = useState(false)
  const [falModel, setFalModel] = useState('fal-ai/flux/schnell')
  const [dimensions, setDimensions] = useState({ width: 1024, height: 1024 })
  const [steps] = useState<number | null>(null)

  // Dropdown state
  const [showModelMenu, setShowModelMenu] = useState(false)
  const [showDimsMenu, setShowDimsMenu] = useState(false)

  // Feed state
  const [feedCards, setFeedCards] = useState<FeedCard[]>([])

  // Unique ID counter for cards (avoids Date.now() collisions)
  const cardIdCounter = useRef(0)
  const [polledJobs, setPolledJobs] = useState<Record<string, BulkJob>>({})

  // Resizable sidebar
  const { sidebarWidth, isResizing, handleResizeStart } = useResizableSidebar()

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const feedRef = useRef<HTMLDivElement>(null)
  const modelMenuRef = useRef<HTMLDivElement>(null)
  const dimsMenuRef = useRef<HTMLDivElement>(null)

  // ============================================================================
  // Session management
  // ============================================================================

  // Persist session drafts to localStorage
  useEffect(() => {
    localStorage.setItem('hollywool_bulk_session_drafts', JSON.stringify(sessionDrafts))
  }, [sessionDrafts])

  // Persist session settings to localStorage
  useEffect(() => {
    localStorage.setItem('hollywool_bulk_session_settings', JSON.stringify(sessionSettings))
  }, [sessionSettings])

  // Save prompt to current session's draft whenever it changes
  useEffect(() => {
    if (currentSession) {
      setSessionDrafts(prev => {
        if (prev[currentSession.id] === prompt) return prev
        return { ...prev, [currentSession.id]: prompt }
      })
    }
  }, [prompt, currentSession?.id])

  // Save settings to current session whenever they change
  useEffect(() => {
    if (currentSession) {
      const newSettings: BulkSessionSettings = {
        falModel,
        dimensions,
        count,
        styleGuidance,
      }
      setSessionSettings(prev => {
        const existing = prev[currentSession.id]
        if (existing &&
            existing.falModel === newSettings.falModel &&
            existing.dimensions.width === newSettings.dimensions.width &&
            existing.dimensions.height === newSettings.dimensions.height &&
            existing.count === newSettings.count &&
            existing.styleGuidance === newSettings.styleGuidance) {
          return prev
        }
        return { ...prev, [currentSession.id]: newSettings }
      })
    }
  }, [falModel, dimensions, count, styleGuidance, currentSession?.id])

  // Initialize sessions
  useEffect(() => {
    const loadSessions = async () => {
      await initBulkSessions()
      const urlSessionId = searchParams.get('session')
      const allSessions = getBulkSessions()

      let session: BulkSession | null = null

      if (urlSessionId) {
        session = allSessions.find(s => s.id === urlSessionId) || null
      }

      if (!session) {
        session = await ensureCurrentBulkSession()
        if (session) {
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev)
            next.set('session', session!.id)
            return next
          }, { replace: true })
        }
      } else {
        setCurrentBulkSessionId(session.id)
      }

      setCurrentSession(session)
      setSessions(getBulkSessions())

      if (session) {
        const draft = sessionDrafts[session.id] || ''
        setPrompt(draft)
        // Restore settings
        const savedSettings = sessionSettings[session.id]
        if (savedSettings) {
          setFalModel(savedSettings.falModel)
          setDimensions(savedSettings.dimensions)
          setCount(savedSettings.count)
          setStyleGuidance(savedSettings.styleGuidance)
          if (savedSettings.styleGuidance) {
            setShowStyleInput(true)
          }
        }
      }

      // Load completed jobs for this session
      if (session) {
        loadSessionJobs(session)
      }
    }
    loadSessions()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadSessionJobs = useCallback(async (session: BulkSession) => {
    if (!session.bulkJobIds || session.bulkJobIds.length === 0) return

    const completedCards: CompletedCard[] = []
    for (const jobId of session.bulkJobIds) {
      try {
        const job = await api.getBulkJob(jobId)
        if (job.status === 'completed' || job.status === 'failed') {
          completedCards.push({
            type: 'completed',
            id: `completed-${job.id}`,
            job,
            basePrompt: job.base_prompt || '',
          })
        }
      } catch {
        // Job may have been deleted
      }
    }

    setFeedCards(completedCards)
  }, [])

  const handleNewSession = () => {
    // Save current session state before switching
    if (currentSession) {
      setSessionDrafts(prev => ({ ...prev, [currentSession.id]: prompt }))
      setSessionSettings(prev => ({ ...prev, [currentSession.id]: {
        falModel,
        dimensions,
        count,
        styleGuidance,
      }}))
    }
    const session = createBulkSession()
    setSessions(getBulkSessions())
    setCurrentSession(session)
    setPrompt('')
    setFeedCards([])
    setSearchParams({ session: session.id }, { replace: true })
  }

  const handleSwitchSession = async (id: string) => {
    const session = getBulkSessions().find(s => s.id === id)
    if (!session) return

    // Save current session state before switching
    if (currentSession) {
      setSessionDrafts(prev => ({ ...prev, [currentSession.id]: prompt }))
      setSessionSettings(prev => ({ ...prev, [currentSession.id]: {
        falModel,
        dimensions,
        count,
        styleGuidance,
      }}))
    }

    setCurrentBulkSessionId(id)
    setCurrentSession(session)
    setSessions(getBulkSessions())
    setSearchParams({ session: id }, { replace: true })

    // Load draft
    const draft = sessionDrafts[id] || ''
    setPrompt(draft)

    // Restore settings
    const savedSettings = sessionSettings[id]
    if (savedSettings) {
      setFalModel(savedSettings.falModel)
      setDimensions(savedSettings.dimensions)
      setCount(savedSettings.count)
      setStyleGuidance(savedSettings.styleGuidance)
      setShowStyleInput(!!savedSettings.styleGuidance)
    }

    // Load completed jobs for this session
    setFeedCards([])
    loadSessionJobs(session)
  }

  const handleDeleteSession = (id: string) => {
    deleteBulkSession(id)
    // Clean up session data
    setSessionDrafts(prev => {
      const updated = { ...prev }
      delete updated[id]
      return updated
    })
    setSessionSettings(prev => {
      const updated = { ...prev }
      delete updated[id]
      return updated
    })
    const allSessions = getBulkSessions()
    setSessions(allSessions)

    if (currentSession?.id === id) {
      const next = allSessions[0] || null
      setCurrentSession(next)
      if (next) {
        setSearchParams({ session: next.id }, { replace: true })
        setPrompt(sessionDrafts[next.id] || '')
        // Restore settings for new current session
        const savedSettings = sessionSettings[next.id]
        if (savedSettings) {
          setFalModel(savedSettings.falModel)
          setDimensions(savedSettings.dimensions)
          setCount(savedSettings.count)
          setStyleGuidance(savedSettings.styleGuidance)
          setShowStyleInput(!!savedSettings.styleGuidance)
        }
        setFeedCards([])
        loadSessionJobs(next)
      }
    }
  }

  const handleRenameSession = (id: string, name: string) => {
    renameBulkSession(id, name)
    setSessions(getBulkSessions())
    setCurrentSession(prev => getBulkSessions().find(s => s.id === prev?.id) || null)
  }

  // ============================================================================
  // Click-outside for dropdowns
  // ============================================================================

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (showModelMenu && modelMenuRef.current && !modelMenuRef.current.contains(target)) {
        setShowModelMenu(false)
      }
      if (showDimsMenu && dimsMenuRef.current && !dimsMenuRef.current.contains(target)) {
        setShowDimsMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showModelMenu, showDimsMenu])

  // ============================================================================
  // Polling for generating jobs
  // ============================================================================

  useEffect(() => {
    const generatingCards = feedCards.filter(c => c.type === 'generating') as GeneratingCard[]
    if (generatingCards.length === 0) return

    const interval = setInterval(async () => {
      for (const card of generatingCards) {
        try {
          const job = await api.getBulkJob(card.jobId)
          setPolledJobs(prev => ({ ...prev, [card.jobId]: job }))

          if (job.status === 'completed' || job.status === 'failed') {
            // Transition generating card to completed card
            setFeedCards(prev => prev.map(c => {
              if (c.type === 'generating' && (c as GeneratingCard).jobId === card.jobId) {
                return {
                  type: 'completed' as const,
                  id: `completed-${job.id}`,
                  job,
                  basePrompt: card.basePrompt,
                }
              }
              return c
            }))

            // Update session with job ID and thumbnail
            if (currentSession && job.status === 'completed') {
              const firstCompleted = job.items.find(i => i.status === 'completed' && i.image_url)
              addBulkJobToSession(currentSession.id, job.id, firstCompleted?.image_url || undefined)
              setSessions(getBulkSessions())
              setCurrentSession(getBulkSessions().find(s => s.id === currentSession.id) || null)

              // Auto-rename on first job
              const session = getBulkSessions().find(s => s.id === currentSession.id)
              if (session && session.bulkJobIds.length === 1) {
                try {
                  const titleResponse = await api.generateTitle(card.basePrompt)
                  autoRenameBulkSession(currentSession.id, titleResponse.title)
                } catch {
                  const fallbackTitle = card.basePrompt.split(' ').slice(0, 4).join(' ')
                  autoRenameBulkSession(currentSession.id, fallbackTitle)
                }
                setSessions(getBulkSessions())
                setCurrentSession(getBulkSessions().find(s => s.id === currentSession.id) || null)
              }
            }
          }
        } catch {
          // Job may have been deleted
        }
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [feedCards, currentSession?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ============================================================================
  // Submit flow
  // ============================================================================

  const handleSubmit = async () => {
    if (!prompt.trim() || !currentSession) return

    const basePrompt = prompt.trim()
    const variationCount = count
    const cardId = `var-${++cardIdCounter.current}`

    // Add variation loading card to feed
    setFeedCards(prev => [...prev, {
      type: 'variation-loading',
      id: cardId,
      count: variationCount,
      basePrompt,
    }])

    // Clear prompt
    setPrompt('')

    // Scroll to bottom
    setTimeout(() => {
      feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' })
    }, 100)

    try {
      const data = await api.generateVariations({
        base_prompt: basePrompt,
        count: variationCount,
        style_guidance: styleGuidance.trim() || undefined,
      })

      // Replace loading card with review card
      setFeedCards(prev => prev.map(c =>
        c.id === cardId
          ? {
              type: 'review' as const,
              id: `review-${++cardIdCounter.current}`,
              prompts: data.variations,
              basePrompt,
            }
          : c
      ))
    } catch (error) {
      // Remove loading card on error
      setFeedCards(prev => prev.filter(c => c.id !== cardId))
      toast({
        title: 'Failed to generate variations',
        description: (error as Error).message,
        variant: 'destructive',
      })
    }
  }

  const handleGenerateAll = async (reviewCardId: string, prompts: string[]) => {
    if (!currentSession || prompts.length === 0) return

    const reviewCard = feedCards.find(c => c.id === reviewCardId) as ReviewCard | undefined
    const basePrompt = reviewCard?.basePrompt || ''

    try {
      const response = await api.createBulkJob({
        prompts,
        fal_model: falModel,
        width: dimensions.width,
        height: dimensions.height,
        steps: steps || undefined,
        base_prompt: basePrompt || undefined,
        session_id: currentSession.id,
      })

      // Replace review card with generating card
      setFeedCards(prev => prev.map(c =>
        c.id === reviewCardId
          ? {
              type: 'generating' as const,
              id: `gen-${response.job_id}`,
              jobId: response.job_id,
              basePrompt,
            }
          : c
      ))
    } catch (error) {
      toast({
        title: 'Failed to start bulk generation',
        description: (error as Error).message,
        variant: 'destructive',
      })
    }
  }

  const handleDiscardReview = (cardId: string) => {
    setFeedCards(prev => prev.filter(c => c.id !== cardId))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  // ============================================================================
  // Derived state
  // ============================================================================

  const selectedModelInfo = FAL_MODELS.find(m => m.id === falModel)
  const selectedDimPreset = DIMENSION_PRESETS.find(
    d => d.width === dimensions.width && d.height === dimensions.height
  )

  // ============================================================================
  // Render
  // ============================================================================

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
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col relative min-w-0 h-full">
        {/* Scrollable Feed */}
        <div ref={feedRef} className="flex-1 overflow-y-auto pb-56 scrollbar-thin min-h-0">
          <div className="p-4 space-y-6">
            {/* Feed Cards */}
            {feedCards.map(card => {
              switch (card.type) {
                case 'variation-loading':
                  return <VariationLoadingCardComponent key={card.id} card={card} />
                case 'review':
                  return (
                    <ReviewCardComponent
                      key={card.id}
                      card={card}
                      onGenerateAll={(prompts) => handleGenerateAll(card.id, prompts)}
                      onDiscard={() => handleDiscardReview(card.id)}
                      onUpdatePrompts={(prompts) => {
                        setFeedCards(prev => prev.map(c =>
                          c.id === card.id ? { ...c, prompts } : c
                        ))
                      }}
                    />
                  )
                case 'generating':
                  return (
                    <GeneratingCardComponent
                      key={card.id}
                      card={card}
                      job={polledJobs[card.jobId]}
                    />
                  )
                case 'completed':
                  return <CompletedBulkJobCard key={card.id} card={card} />
              }
            })}

            {/* Empty state */}
            {feedCards.length === 0 && (
              <div className="text-center py-20">
                <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
                  <Layers className="h-10 w-10 text-primary-foreground/20" />
                </div>
                <h2 className="text-xl font-medium text-foreground/80 mb-2">Bulk Image Generation</h2>
                <p className="text-muted-foreground/70 max-w-md mx-auto">
                  Describe a base concept below and Claude will generate creative variations, then fal.ai generates the images in bulk.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Fixed Bottom Chatbox */}
        <div
          className="fixed bottom-0 right-0 p-4 z-40 bg-gradient-to-t from-background via-background to-transparent pt-12"
          style={{ left: `calc(var(--nav-sidebar-width, 0px) + ${sidebarWidth}px)` }}
        >
          <div className="max-w-3xl mx-auto">
            <div className="glass rounded-2xl p-3">
              {/* Top row - Pill controls */}
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
                    <div className="absolute bottom-full left-0 mb-2 w-64 rounded-xl glass-light shadow-xl z-[60] max-h-72 overflow-y-auto py-1">
                      {FAL_MODELS.map((model) => (
                        <button
                          key={model.id}
                          onClick={() => {
                            setFalModel(model.id)
                            setShowModelMenu(false)
                          }}
                          className={cn(
                            'w-full px-3 py-2 text-left text-sm transition-colors',
                            'hover:bg-accent',
                            falModel === model.id && 'bg-muted'
                          )}
                        >
                          <span className={cn(
                            'font-medium',
                            falModel === model.id && 'text-primary'
                          )}>
                            {model.name}
                          </span>
                          <div className="text-xs text-muted-foreground/70 mt-0.5">
                            {model.description}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Dimensions Selector */}
                <div className="relative" ref={dimsMenuRef}>
                  <button
                    onClick={() => setShowDimsMenu(!showDimsMenu)}
                    className="model-pill"
                  >
                    <Square className="h-3.5 w-3.5" />
                    <span>{selectedDimPreset?.label || `${dimensions.width}x${dimensions.height}`}</span>
                    <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showDimsMenu && 'rotate-180')} />
                  </button>

                  {showDimsMenu && (
                    <div className="absolute bottom-full left-0 mb-2 p-3 rounded-xl glass-light shadow-xl z-[60]">
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        {DIMENSION_PRESETS.map((preset) => (
                          <button
                            key={preset.label}
                            onClick={() => {
                              setDimensions({ width: preset.width, height: preset.height })
                              setShowDimsMenu(false)
                            }}
                            className={cn(
                              'px-4 py-2 rounded-lg border text-sm font-medium transition-all',
                              selectedDimPreset?.label === preset.label
                                ? 'border-white/40 bg-accent text-primary-foreground'
                                : 'border-white/10 text-muted-foreground hover:border-white/20 hover:text-foreground/80'
                            )}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                      <div className="text-xs text-muted-foreground/70 text-center">
                        {dimensions.width}x{dimensions.height}
                      </div>
                    </div>
                  )}
                </div>

                <div className="h-5 w-px bg-accent" />

                {/* Count Selector */}
                <div className="flex items-center bg-muted rounded-full">
                  <button
                    onClick={() => setCount(Math.max(1, count - 1))}
                    disabled={count <= 1}
                    className="p-2 text-muted-foreground hover:text-primary-foreground disabled:text-primary-foreground/20 disabled:cursor-not-allowed transition-colors"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="px-2 text-sm font-medium text-foreground/80 min-w-[50px] text-center">
                    {count}/200
                  </span>
                  <button
                    onClick={() => setCount(Math.min(200, count + 1))}
                    disabled={count >= 200}
                    className="p-2 text-muted-foreground hover:text-primary-foreground disabled:text-primary-foreground/20 disabled:cursor-not-allowed transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                <div className="h-5 w-px bg-accent" />

                {/* Style Toggle */}
                <button
                  onClick={() => setShowStyleInput(!showStyleInput)}
                  className={cn(
                    'model-pill',
                    (showStyleInput || styleGuidance.trim()) && 'bg-primary/20 text-primary'
                  )}
                >
                  <Palette className="h-3.5 w-3.5" />
                  <span>Style</span>
                </button>
              </div>

              {/* Style guidance textarea (collapsible) */}
              {showStyleInput && (
                <div className="mb-3 px-1">
                  <div className="p-3 rounded-xl bg-muted">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-muted-foreground/70 uppercase tracking-wider">Style Guidance</span>
                      {styleGuidance.trim() && (
                        <button
                          onClick={() => setStyleGuidance('')}
                          className="text-xs text-red-400 hover:text-red-300 transition-colors"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <textarea
                      value={styleGuidance}
                      onChange={(e) => setStyleGuidance(e.target.value)}
                      placeholder="e.g., photorealistic, cinematic lighting, 8k resolution..."
                      rows={2}
                      className="w-full bg-transparent text-sm resize-none focus:outline-none placeholder:text-muted-foreground/50"
                    />
                  </div>
                </div>
              )}

              {/* Prompt input row */}
              <div className="flex items-end gap-3">
                <div className="flex-1 bg-muted rounded-xl px-4 py-3">
                  <textarea
                    ref={textareaRef}
                    placeholder="Describe your base concept..."
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={1}
                    className="prompt-input w-full text-sm leading-relaxed"
                    style={{ minHeight: '24px', maxHeight: '120px' }}
                  />
                </div>
                <button
                  onClick={handleSubmit}
                  disabled={!prompt.trim()}
                  className="generate-btn flex items-center gap-2"
                >
                  <Send className="h-4 w-4" />
                  <span>Send</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Feed Card Components
// ============================================================================

function VariationLoadingCardComponent({ card }: { card: VariationLoadingCard }) {
  return (
    <div className="card-container rounded-2xl overflow-hidden border border-white/10 bg-white/[0.02] p-6">
      <div className="flex items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <div>
          <p className="text-sm font-medium">Claude is generating {card.count} variations...</p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-md">
            Based on: "{card.basePrompt}"
          </p>
        </div>
      </div>
    </div>
  )
}

function ReviewCardComponent({
  card,
  onGenerateAll,
  onDiscard,
  onUpdatePrompts,
}: {
  card: ReviewCard
  onGenerateAll: (prompts: string[]) => void
  onDiscard: () => void
  onUpdatePrompts: (prompts: string[]) => void
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const editInputRef = useRef<HTMLTextAreaElement>(null)

  const handleStartEdit = (index: number) => {
    setEditingIndex(index)
    setEditValue(card.prompts[index] ?? '')
    setTimeout(() => editInputRef.current?.focus(), 50)
  }

  const handleSaveEdit = () => {
    if (editingIndex !== null && editValue.trim()) {
      const updated = [...card.prompts]
      updated[editingIndex] = editValue.trim()
      onUpdatePrompts(updated)
    }
    setEditingIndex(null)
    setEditValue('')
  }

  const handleCancelEdit = () => {
    setEditingIndex(null)
    setEditValue('')
  }

  const handleDeletePrompt = (index: number) => {
    onUpdatePrompts(card.prompts.filter((_, i) => i !== index))
  }

  const handleAddPrompt = () => {
    onUpdatePrompts([...card.prompts, ''])
    setEditingIndex(card.prompts.length)
    setEditValue('')
    setTimeout(() => editInputRef.current?.focus(), 50)
  }

  return (
    <div className="card-container rounded-2xl overflow-hidden border border-white/10 bg-white/[0.02]">
      {/* Header */}
      <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-medium">Prompt Variations</h3>
          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
            {card.prompts.length} prompts
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleAddPrompt}
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Add
        </Button>
      </div>

      {/* Base prompt */}
      <div className="px-5 py-2 border-b border-white/5 bg-muted/30">
        <p className="text-xs text-muted-foreground">
          Base: "{card.basePrompt}"
        </p>
      </div>

      {/* Prompt list */}
      <div className="px-5 py-3 space-y-2 max-h-[400px] overflow-y-auto scrollbar-thin">
        {card.prompts.map((prompt, index) => (
          <div
            key={index}
            className="group flex items-start gap-2 p-2.5 rounded-lg border border-border hover:border-foreground/20 transition-colors"
          >
            <span className="text-xs font-mono text-muted-foreground mt-1 w-6 text-right flex-shrink-0">
              {index + 1}
            </span>

            {editingIndex === index ? (
              <div className="flex-1 space-y-2">
                <textarea
                  ref={editInputRef}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSaveEdit()
                    }
                    if (e.key === 'Escape') handleCancelEdit()
                  }}
                  rows={3}
                  className="w-full rounded-md border border-primary bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <div className="flex gap-1">
                  <Button size="sm" onClick={handleSaveEdit}>
                    <Check className="h-3 w-3 mr-1" />
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={handleCancelEdit}>
                    <X className="h-3 w-3 mr-1" />
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <p className="flex-1 text-sm leading-relaxed">{prompt}</p>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <button
                    onClick={() => handleStartEdit(index)}
                    className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeletePrompt(index)}
                    className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div className="px-5 py-3 border-t border-white/5 flex items-center gap-2">
        <Button
          onClick={() => onGenerateAll(card.prompts.filter(p => p.trim()))}
          disabled={card.prompts.filter(p => p.trim()).length === 0}
          className="flex-1"
        >
          <Sparkles className="h-4 w-4 mr-2" />
          Generate All ({card.prompts.filter(p => p.trim()).length} images)
        </Button>
        <Button variant="outline" onClick={onDiscard}>
          Discard
        </Button>
      </div>
    </div>
  )
}

function GeneratingCardComponent({
  card,
  job,
}: {
  card: GeneratingCard
  job?: BulkJob
}) {
  if (!job) {
    return (
      <div className="card-container rounded-2xl overflow-hidden border border-white/10 bg-white/[0.02] p-6">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <p className="text-sm font-medium">Starting bulk generation...</p>
        </div>
      </div>
    )
  }

  const done = job.completed + job.failed

  return (
    <div className="card-container rounded-2xl overflow-hidden border border-white/10 bg-white/[0.02]">
      {/* Progress header */}
      <div className="px-5 py-3 border-b border-white/5">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <h3 className="text-sm font-medium">Generating Images</h3>
          </div>
          <span className="text-xs text-muted-foreground">
            {done}/{job.total} ({job.failed > 0 ? `${job.failed} failed` : ''})
          </span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${job.progress}%` }}
          />
        </div>
        {card.basePrompt && (
          <p className="text-xs text-muted-foreground mt-2 truncate">
            Base: "{card.basePrompt}"
          </p>
        )}
      </div>

      {/* Image grid */}
      <div className="p-3">
        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
          {job.items.map((item: BulkImageItem) => (
            <div
              key={item.index}
              className="relative aspect-square rounded-lg border border-border overflow-hidden bg-muted/30"
            >
              {item.status === 'completed' && item.image_url && (
                <img
                  src={item.image_url}
                  alt={item.prompt}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              )}
              {item.status === 'generating' && (
                <div className="flex flex-col items-center justify-center h-full">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              )}
              {item.status === 'pending' && (
                <div className="flex items-center justify-center h-full">
                  <ImageIcon className="h-4 w-4 text-muted-foreground/20" />
                </div>
              )}
              {item.status === 'failed' && (
                <div className="flex flex-col items-center justify-center h-full p-1">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                </div>
              )}
              <div className="absolute top-1 left-1 bg-black/60 text-white text-[9px] px-1 py-0.5 rounded">
                {item.index + 1}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function CompletedBulkJobCard({ card }: { card: CompletedCard }) {
  const { job } = card

  return (
    <div className="card-container rounded-2xl overflow-hidden border border-white/10 bg-white/[0.02]">
      {/* Header */}
      <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {job.status === 'completed' ? (
            <CheckCircle className="h-4 w-4 text-green-500" />
          ) : (
            <AlertCircle className="h-4 w-4 text-destructive" />
          )}
          <h3 className="text-sm font-medium">
            {job.status === 'completed' ? 'Generation Complete' : 'Generation Failed'}
          </h3>
          <span className="text-xs text-muted-foreground">
            {job.completed} completed
            {job.failed > 0 && `, ${job.failed} failed`}
            {' / '}{job.total} total
          </span>
        </div>
        {card.basePrompt && (
          <span className="text-xs text-muted-foreground truncate max-w-[200px]">
            {card.basePrompt}
          </span>
        )}
      </div>

      {/* Image grid */}
      <div className="p-3">
        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
          {job.items.map((item: BulkImageItem) => (
            <div
              key={item.index}
              className="relative aspect-square rounded-lg border border-border overflow-hidden bg-muted/30 group"
            >
              {item.status === 'completed' && item.image_url && (
                <>
                  <img
                    src={item.image_url}
                    alt={item.prompt}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {/* Hover overlay with prompt */}
                  <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                    <p className="text-[10px] text-white line-clamp-3">{item.prompt}</p>
                  </div>
                </>
              )}
              {item.status === 'failed' && (
                <div className="flex flex-col items-center justify-center h-full p-1">
                  <AlertCircle className="h-4 w-4 text-destructive mb-0.5" />
                  <span className="text-[9px] text-destructive text-center line-clamp-2">
                    {item.error || 'Failed'}
                  </span>
                </div>
              )}
              <div className="absolute top-1 left-1 bg-black/60 text-white text-[9px] px-1 py-0.5 rounded">
                {item.index + 1}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
