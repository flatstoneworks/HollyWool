import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  Layers,
  Sparkles,
  Play,
  Loader2,
  Trash2,
  Plus,
  Pencil,
  Check,
  X,
  AlertCircle,
  CheckCircle,
  ImageIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { api, type BulkImageItem } from '@/api/client'
import { toast } from '@/hooks/use-toast'

type Phase = 'input' | 'review' | 'generating'

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

export function BulkOperationPage() {
  // Config state
  const [basePrompt, setBasePrompt] = useState('')
  const [count, setCount] = useState(10)
  const [styleGuidance, setStyleGuidance] = useState('')
  const [falModel, setFalModel] = useState('fal-ai/flux/schnell')
  const [dimensions, setDimensions] = useState({ width: 1024, height: 1024 })
  const [steps, setSteps] = useState<number | null>(null)

  // Phase / flow state
  const [phase, setPhase] = useState<Phase>('input')
  const [prompts, setPrompts] = useState<string[]>([])
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [activeJobId, setActiveJobId] = useState<string | null>(null)

  const editInputRef = useRef<HTMLTextAreaElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  // Variation generation mutation
  const variationMutation = useMutation({
    mutationFn: api.generateVariations,
    onSuccess: (data) => {
      setPrompts(data.variations)
      setPhase('review')
    },
    onError: (error) => {
      toast({
        title: 'Failed to generate variations',
        description: (error as Error).message,
        variant: 'destructive',
      })
    },
  })

  // Bulk job creation mutation
  const createJobMutation = useMutation({
    mutationFn: api.createBulkJob,
    onSuccess: (data) => {
      setActiveJobId(data.job_id)
      setPhase('generating')
    },
    onError: (error) => {
      toast({
        title: 'Failed to start bulk generation',
        description: (error as Error).message,
        variant: 'destructive',
      })
    },
  })

  // Poll active job
  const { data: activeJob } = useQuery({
    queryKey: ['bulk-job', activeJobId],
    queryFn: () => api.getBulkJob(activeJobId!),
    enabled: !!activeJobId && phase === 'generating',
    refetchInterval: 2000,
  })

  // Stop polling when job completes
  useEffect(() => {
    if (activeJob && (activeJob.status === 'completed' || activeJob.status === 'failed')) {
      // Job is done - keep showing results
    }
  }, [activeJob])

  // Handle generating variations
  const handleGenerateVariations = () => {
    if (!basePrompt.trim()) return
    variationMutation.mutate({
      base_prompt: basePrompt.trim(),
      count,
      style_guidance: styleGuidance.trim() || undefined,
    })
  }

  // Handle starting generation
  const handleGenerateAll = () => {
    if (prompts.length === 0) return
    createJobMutation.mutate({
      prompts,
      fal_model: falModel,
      width: dimensions.width,
      height: dimensions.height,
      steps: steps || undefined,
      base_prompt: basePrompt.trim() || undefined,
    })
  }

  // Prompt editing
  const handleStartEdit = (index: number) => {
    setEditingIndex(index)
    setEditValue(prompts[index] ?? '')
    setTimeout(() => editInputRef.current?.focus(), 50)
  }

  const handleSaveEdit = () => {
    if (editingIndex !== null && editValue.trim()) {
      const updated = [...prompts]
      updated[editingIndex] = editValue.trim()
      setPrompts(updated)
    }
    setEditingIndex(null)
    setEditValue('')
  }

  const handleCancelEdit = () => {
    setEditingIndex(null)
    setEditValue('')
  }

  const handleDeletePrompt = (index: number) => {
    setPrompts(prompts.filter((_, i) => i !== index))
  }

  const handleAddPrompt = () => {
    setPrompts([...prompts, ''])
    setEditingIndex(prompts.length)
    setEditValue('')
    setTimeout(() => editInputRef.current?.focus(), 50)
  }

  // Reset to start
  const handleReset = () => {
    setPhase('input')
    setPrompts([])
    setActiveJobId(null)
    setEditingIndex(null)
  }

  const selectedDimPreset = DIMENSION_PRESETS.find(
    (d) => d.width === dimensions.width && d.height === dimensions.height
  )

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: Config Panel */}
      <div className="w-80 flex-shrink-0 border-r border-border bg-background overflow-y-auto">
        <div className="p-5 space-y-5">
          {/* Header */}
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Bulk Operation</h1>
          </div>

          <p className="text-xs text-muted-foreground">
            Generate many images at once. Claude creates prompt variations from your base prompt, then fal.ai generates the images.
          </p>

          {/* Base Prompt */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Base Prompt</label>
            <textarea
              value={basePrompt}
              onChange={(e) => setBasePrompt(e.target.value)}
              placeholder="A majestic mountain landscape at sunset..."
              rows={3}
              disabled={phase === 'generating'}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            />
          </div>

          {/* Count */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Count</label>
              <span className="text-xs text-muted-foreground">{count}</span>
            </div>
            <input
              type="range"
              min={1}
              max={100}
              value={count}
              onChange={(e) => setCount(parseInt(e.target.value))}
              disabled={phase === 'generating'}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>1</span>
              <span>25</span>
              <span>50</span>
              <span>75</span>
              <span>100</span>
            </div>
          </div>

          {/* Style Guidance */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Style Guidance <span className="text-muted-foreground font-normal">(optional)</span></label>
            <textarea
              value={styleGuidance}
              onChange={(e) => setStyleGuidance(e.target.value)}
              placeholder="e.g., photorealistic, cinematic lighting, 8k resolution..."
              rows={2}
              disabled={phase === 'generating'}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            />
          </div>

          <div className="border-t border-border" />

          {/* fal.ai Model */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">fal.ai Model</label>
            <select
              value={falModel}
              onChange={(e) => setFalModel(e.target.value)}
              disabled={phase === 'generating'}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            >
              {FAL_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} — {m.description}
                </option>
              ))}
            </select>
          </div>

          {/* Dimensions */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Dimensions</label>
            <div className="flex gap-1.5">
              {DIMENSION_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => setDimensions({ width: preset.width, height: preset.height })}
                  disabled={phase === 'generating'}
                  className={cn(
                    'flex-1 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50',
                    selectedDimPreset?.label === preset.label
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-accent'
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground text-center">
              {dimensions.width} x {dimensions.height}
            </p>
          </div>

          {/* Steps */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Steps <span className="text-muted-foreground font-normal">(optional)</span></label>
            <input
              type="number"
              value={steps ?? ''}
              onChange={(e) => setSteps(e.target.value ? parseInt(e.target.value) : null)}
              placeholder="Model default"
              min={1}
              max={100}
              disabled={phase === 'generating'}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            />
          </div>

          <div className="border-t border-border" />

          {/* Action Buttons */}
          <div className="space-y-2">
            {phase === 'input' && (
              <Button
                onClick={handleGenerateVariations}
                disabled={!basePrompt.trim() || variationMutation.isPending}
                className="w-full"
              >
                {variationMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                {variationMutation.isPending ? 'Generating Variations...' : 'Generate Variations'}
              </Button>
            )}

            {phase === 'review' && (
              <>
                <Button
                  onClick={handleGenerateAll}
                  disabled={prompts.length === 0 || createJobMutation.isPending}
                  className="w-full"
                >
                  {createJobMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Play className="h-4 w-4 mr-2" />
                  )}
                  Generate All ({prompts.length} images)
                </Button>
                <Button
                  variant="outline"
                  onClick={handleReset}
                  className="w-full"
                >
                  Start Over
                </Button>
              </>
            )}

            {phase === 'generating' && activeJob && (
              <>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {activeJob.status === 'completed' ? 'Completed' :
                       activeJob.status === 'failed' ? 'Failed' : 'Generating...'}
                    </span>
                    <span className="font-medium">
                      {activeJob.completed + activeJob.failed}/{activeJob.total}
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-500',
                        activeJob.status === 'failed' ? 'bg-destructive' :
                        activeJob.status === 'completed' ? 'bg-green-500' : 'bg-primary'
                      )}
                      style={{ width: `${activeJob.progress}%` }}
                    />
                  </div>
                  {activeJob.failed > 0 && (
                    <p className="text-[10px] text-destructive">
                      {activeJob.failed} failed
                    </p>
                  )}
                </div>
                {(activeJob.status === 'completed' || activeJob.status === 'failed') && (
                  <Button
                    variant="outline"
                    onClick={handleReset}
                    className="w-full"
                  >
                    New Batch
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Right: Content Panel */}
      <div className="flex-1 overflow-y-auto bg-background">
        {/* Phase 1: Empty state */}
        {phase === 'input' && !variationMutation.isPending && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Layers className="h-12 w-12 mb-4 opacity-30" />
            <p className="text-lg font-medium mb-1">Bulk Image Generation</p>
            <p className="text-sm max-w-md text-center">
              Enter a base prompt and count on the left, then click "Generate Variations" to
              create diverse prompts using Claude AI.
            </p>
          </div>
        )}

        {/* Loading variations */}
        {variationMutation.isPending && (
          <div className="flex flex-col items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-sm text-muted-foreground">
              Claude is generating {count} prompt variations...
            </p>
          </div>
        )}

        {/* Phase 2: Review prompts */}
        {phase === 'review' && (
          <div className="p-5 space-y-4">
            {/* Summary bar */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="font-medium">Prompt Variations</h2>
                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                  {prompts.length} prompts
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddPrompt}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add Prompt
              </Button>
            </div>

            {/* Prompt list */}
            <div className="space-y-2">
              {prompts.map((prompt, index) => (
                <div
                  key={index}
                  className="group flex items-start gap-2 p-3 rounded-lg border border-border hover:border-foreground/20 transition-colors"
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
          </div>
        )}

        {/* Phase 3: Generation progress + image grid */}
        {phase === 'generating' && activeJob && (
          <div className="p-5 space-y-4">
            {/* Progress header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="font-medium">
                  {activeJob.status === 'completed' ? 'Generation Complete' :
                   activeJob.status === 'failed' ? 'Generation Failed' : 'Generating Images'}
                </h2>
                {activeJob.status === 'completed' && (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                )}
                {activeJob.status === 'failed' && activeJob.error && (
                  <AlertCircle className="h-4 w-4 text-destructive" />
                )}
              </div>
              <span className="text-sm text-muted-foreground">
                {activeJob.completed} completed
                {activeJob.failed > 0 && `, ${activeJob.failed} failed`}
                {' / '}{activeJob.total} total
              </span>
            </div>

            {/* Overall progress bar */}
            <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  activeJob.status === 'completed' ? 'bg-green-500' : 'bg-primary'
                )}
                style={{ width: `${activeJob.progress}%` }}
              />
            </div>

            {/* Image grid */}
            <div ref={gridRef} className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {activeJob.items.map((item: BulkImageItem) => (
                <div
                  key={item.index}
                  className="relative aspect-square rounded-lg border border-border overflow-hidden bg-muted/30"
                >
                  {/* Completed: show image */}
                  {item.status === 'completed' && item.image_url && (
                    <img
                      src={item.image_url}
                      alt={item.prompt}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  )}

                  {/* Generating: spinner */}
                  {item.status === 'generating' && (
                    <div className="flex flex-col items-center justify-center h-full">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      <span className="text-[10px] text-muted-foreground mt-2">Generating</span>
                    </div>
                  )}

                  {/* Pending: placeholder */}
                  {item.status === 'pending' && (
                    <div className="flex flex-col items-center justify-center h-full">
                      <ImageIcon className="h-5 w-5 text-muted-foreground/30" />
                    </div>
                  )}

                  {/* Failed: error */}
                  {item.status === 'failed' && (
                    <div className="flex flex-col items-center justify-center h-full p-2">
                      <AlertCircle className="h-5 w-5 text-destructive mb-1" />
                      <span className="text-[10px] text-destructive text-center line-clamp-2">
                        {item.error || 'Failed'}
                      </span>
                    </div>
                  )}

                  {/* Index badge */}
                  <div className="absolute top-1.5 left-1.5 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                    {item.index + 1}
                  </div>

                  {/* Hover overlay with prompt */}
                  {item.status === 'completed' && (
                    <div className="absolute inset-0 bg-black/70 opacity-0 hover:opacity-100 transition-opacity flex items-end p-2">
                      <p className="text-[10px] text-white line-clamp-3">{item.prompt}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
