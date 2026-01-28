import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, Wand2, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ModelInfo } from '@/api/client'
import { PREVIEW_MODELS, PROVIDER_PRESETS, type ModelProvider, type PreviewModel } from '@/types/providers'

export interface ModelSelectorProps {
  /** Currently selected model ID */
  selectedModel: string
  /** Callback when model selection changes */
  onModelChange: (modelId: string) => void
  /** List of local models from API */
  models: ModelInfo[]
  /** List of configured provider IDs (e.g., ['krea', 'fal']) */
  configuredProviders: string[]
  /** Filter function for models (e.g., exclude video models for image page) */
  modelFilter?: (model: ModelInfo) => boolean
  /** Filter for remote model type ('image' | 'video') */
  remoteModelType?: 'image' | 'video'
  /** Custom label for the button */
  buttonLabel?: string
}

export function ModelSelector({
  selectedModel,
  onModelChange,
  models,
  configuredProviders,
  modelFilter = () => true,
  remoteModelType = 'image',
  buttonLabel,
}: ModelSelectorProps) {
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filteredModels = models.filter(modelFilter)
  const selectedModelInfo = models.find(m => m.id === selectedModel)
  const displayLabel = buttonLabel || selectedModelInfo?.name || 'Model'

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="model-pill"
      >
        <Wand2 className="h-3.5 w-3.5" />
        <span>{displayLabel}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showMenu && 'rotate-180')} />
      </button>

      {showMenu && (
        <div className="absolute bottom-full left-0 mb-2 w-64 rounded-xl glass-light shadow-xl z-[60] flex flex-col">
          {/* Scrollable model list */}
          <div className="max-h-72 overflow-y-auto scrollbar-thin py-1">
            {/* Local Models Section */}
            <div className="px-3 py-1.5 text-[10px] font-medium text-amber-400/70 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400/70" />
              Local Models
            </div>
            {filteredModels.map((model: ModelInfo) => (
              <button
                key={model.id}
                onClick={() => {
                  onModelChange(model.id)
                  setShowMenu(false)
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
                  {model.default_steps} steps {model.type && `\u2022 ${model.type}`}
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
                const providerKey = providerId as ModelProvider
                const providerModels: PreviewModel[] = PREVIEW_MODELS[providerKey]?.filter((m: PreviewModel) => m.type === remoteModelType) || []
                const providerName = PROVIDER_PRESETS[providerKey]?.name || providerId
                if (providerModels.length === 0) return null
                return (
                  <div key={providerId}>
                    <div className="px-3 py-1 text-[10px] text-blue-400/50 uppercase">
                      {providerName}
                    </div>
                    {providerModels.map((model: PreviewModel) => (
                      <button
                        key={model.id}
                        onClick={() => {
                          onModelChange(model.id)
                          setShowMenu(false)
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
            onClick={() => setShowMenu(false)}
            className="flex items-center gap-2 px-3 py-2.5 text-sm text-primary hover:bg-accent transition-colors border-t border-white/10"
          >
            <Plus className="h-4 w-4" />
            <span>Browse all models</span>
          </Link>
        </div>
      )}
    </div>
  )
}

export default ModelSelector
