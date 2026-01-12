import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Loader2, Download, Check, ExternalLink, Zap, Sparkles, Star,
  Shield, AlertCircle, Trash2, HardDrive, Clock
} from 'lucide-react'
import { api, type ModelDetailedInfo } from '@/api/client'
import { cn } from '@/lib/utils'

type CategoryFilter = 'all' | 'fast' | 'quality' | 'specialized'
type StatusFilter = 'all' | 'downloaded' | 'not-downloaded'

function formatBytes(mb: number): string {
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)} GB`
  }
  return `${mb.toFixed(0)} MB`
}

function formatTimeAgo(timestamp: number | null): string {
  if (!timestamp) return 'Never'
  const now = Date.now() / 1000
  const diff = now - timestamp

  if (diff < 60) return 'Just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return `${Math.floor(diff / 604800)}w ago`
}

export function ModelsPage() {
  const queryClient = useQueryClient()
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [expandedModel, setExpandedModel] = useState<string | null>(null)

  const { data: modelsData, isLoading } = useQuery({
    queryKey: ['models-detailed'],
    queryFn: api.getModelsDetailed,
    refetchInterval: 10000,
  })

  const deleteCacheMutation = useMutation({
    mutationFn: api.deleteModelCache,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['models-detailed'] })
    },
  })

  const models = modelsData?.models || []
  const totalCacheSize = modelsData?.total_cache_size_gb || 0

  // Filter models
  const filteredModels = models.filter(model => {
    if (categoryFilter !== 'all' && model.category !== categoryFilter) return false
    if (statusFilter === 'downloaded' && !model.is_cached) return false
    if (statusFilter === 'not-downloaded' && model.is_cached) return false
    return true
  })

  // Group by category
  const groupedModels = {
    fast: filteredModels.filter(m => m.category === 'fast'),
    quality: filteredModels.filter(m => m.category === 'quality'),
    specialized: filteredModels.filter(m => m.category === 'specialized'),
  }

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'fast': return <Zap className="h-4 w-4" />
      case 'quality': return <Sparkles className="h-4 w-4" />
      case 'specialized': return <Star className="h-4 w-4" />
      default: return null
    }
  }

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'fast': return 'Fast Models (1-4 steps)'
      case 'quality': return 'Quality Models (20-50 steps)'
      case 'specialized': return 'Specialized Models'
      default: return category
    }
  }

  const handleDeleteCache = (modelId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm('Are you sure you want to delete this model from cache? It will be re-downloaded when needed.')) {
      deleteCacheMutation.mutate(modelId)
    }
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-white/40" />
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header with filters */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-white/5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white">Models</h1>
            <div className="flex items-center gap-4 mt-1">
              <p className="text-sm text-white/50">
                {models.filter(m => m.is_cached).length} of {models.length} models downloaded
              </p>
              {totalCacheSize > 0 && (
                <span className="text-sm text-white/40 flex items-center gap-1">
                  <HardDrive className="h-3.5 w-3.5" />
                  {totalCacheSize.toFixed(1)} GB used
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Category filter */}
            <div className="flex items-center bg-white/5 rounded-lg p-1">
              {(['all', 'fast', 'quality', 'specialized'] as CategoryFilter[]).map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={cn(
                    'px-3 py-1.5 text-sm rounded-md transition-colors capitalize',
                    categoryFilter === cat
                      ? 'bg-white/10 text-white'
                      : 'text-white/50 hover:text-white/70'
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
            {/* Status filter */}
            <div className="flex items-center bg-white/5 rounded-lg p-1">
              {(['all', 'downloaded', 'not-downloaded'] as StatusFilter[]).map(status => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={cn(
                    'px-3 py-1.5 text-sm rounded-md transition-colors',
                    statusFilter === status
                      ? 'bg-white/10 text-white'
                      : 'text-white/50 hover:text-white/70'
                  )}
                >
                  {status === 'all' ? 'All' : status === 'downloaded' ? 'Downloaded' : 'Not Downloaded'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Models list */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {categoryFilter === 'all' ? (
          // Show grouped by category
          Object.entries(groupedModels).map(([category, categoryModels]) => (
            categoryModels.length > 0 && (
              <div key={category}>
                <div className="flex items-center gap-2 mb-4">
                  {getCategoryIcon(category)}
                  <h2 className="text-lg font-medium text-white/80">
                    {getCategoryLabel(category)}
                  </h2>
                  <span className="text-sm text-white/40">({categoryModels.length})</span>
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {categoryModels.map(model => (
                    <ModelCard
                      key={model.id}
                      model={model}
                      expanded={expandedModel === model.id}
                      onToggle={() => setExpandedModel(expandedModel === model.id ? null : model.id)}
                      onDeleteCache={(e) => handleDeleteCache(model.id, e)}
                      isDeleting={deleteCacheMutation.isPending && deleteCacheMutation.variables === model.id}
                      currentModel={modelsData?.current_model}
                    />
                  ))}
                </div>
              </div>
            )
          ))
        ) : (
          // Show flat list
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredModels.map(model => (
              <ModelCard
                key={model.id}
                model={model}
                expanded={expandedModel === model.id}
                onToggle={() => setExpandedModel(expandedModel === model.id ? null : model.id)}
                onDeleteCache={(e) => handleDeleteCache(model.id, e)}
                isDeleting={deleteCacheMutation.isPending && deleteCacheMutation.variables === model.id}
                currentModel={modelsData?.current_model}
              />
            ))}
          </div>
        )}

        {filteredModels.length === 0 && (
          <div className="text-center py-12">
            <p className="text-white/40">No models match your filters</p>
          </div>
        )}
      </div>
    </div>
  )
}

interface ModelCardProps {
  model: ModelDetailedInfo
  expanded: boolean
  onToggle: () => void
  onDeleteCache: (e: React.MouseEvent) => void
  isDeleting: boolean
  currentModel: string | null | undefined
}

function ModelCard({ model, expanded, onToggle, onDeleteCache, isDeleting, currentModel }: ModelCardProps) {
  const isCurrentModel = currentModel === model.id

  return (
    <div
      className={cn(
        'rounded-xl border bg-white/[0.02] transition-all cursor-pointer',
        model.is_cached ? 'border-green-500/30' : 'border-white/10',
        expanded && 'ring-1 ring-primary/50'
      )}
      onClick={onToggle}
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-white">{model.name}</h3>
              {isCurrentModel && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-primary/20 text-primary">
                  Active
                </span>
              )}
            </div>
            <p className="text-xs text-white/40 font-mono mt-0.5">{model.path}</p>
          </div>
          <div className="flex items-center gap-2">
            {model.requires_approval && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 flex items-center gap-1">
                <Shield className="h-3 w-3" />
                Approval
              </span>
            )}
            {model.is_cached ? (
              <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 flex items-center gap-1">
                <Check className="h-3 w-3" />
                {model.actual_size_gb ? `${model.actual_size_gb.toFixed(1)} GB` : 'Ready'}
              </span>
            ) : (
              <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/50 flex items-center gap-1">
                <Download className="h-3 w-3" />
                {model.estimated_size_gb} GB
              </span>
            )}
          </div>
        </div>

        {/* Description */}
        <p className="text-sm text-white/60 mb-3">{model.description}</p>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5">
          {model.tags.map(tag => (
            <span
              key={tag}
              className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-white/50"
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Expanded details */}
        {expanded && (
          <div className="mt-4 pt-4 border-t border-white/5 space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-white/40">Type</span>
                <p className="text-white/80">{model.type.toUpperCase()}</p>
              </div>
              <div>
                <span className="text-white/40">Default Steps</span>
                <p className="text-white/80">{model.default_steps}</p>
              </div>
              <div>
                <span className="text-white/40">Guidance Scale</span>
                <p className="text-white/80">{model.default_guidance}</p>
              </div>
              <div>
                <span className="text-white/40">Size</span>
                <p className="text-white/80">
                  {model.is_cached && model.cached_size_mb ? (
                    <span>
                      {formatBytes(model.cached_size_mb)}
                      <span className="text-white/40 ml-1">
                        (est. {model.estimated_size_gb} GB)
                      </span>
                    </span>
                  ) : (
                    `~${model.estimated_size_gb} GB`
                  )}
                </p>
              </div>
            </div>

            {/* Cache info */}
            {model.is_cached && model.last_accessed && (
              <div className="flex items-center gap-4 text-xs text-white/40">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Last used: {formatTimeAgo(model.last_accessed)}
                </span>
              </div>
            )}

            {model.requires_approval && model.approval_url && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <AlertCircle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="text-amber-200">This model requires accepting terms</p>
                  <a
                    href={model.approval_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber-400 hover:underline flex items-center gap-1 mt-1"
                    onClick={e => e.stopPropagation()}
                  >
                    Accept on HuggingFace
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            )}

            {/* Actions */}
            {model.is_cached && !isCurrentModel && (
              <button
                onClick={onDeleteCache}
                disabled={isDeleting}
                className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
              >
                {isDeleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                {isDeleting ? 'Deleting...' : `Delete from cache (frees ${model.actual_size_gb?.toFixed(1) || model.estimated_size_gb} GB)`}
              </button>
            )}

            {model.is_cached && isCurrentModel && (
              <p className="text-xs text-white/40">
                Cannot delete cache for currently active model
              </p>
            )}

            {!model.is_cached && (
              <p className="text-xs text-white/40">
                Model will be downloaded automatically when first used
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
