import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Loader2, Download, Check, ExternalLink, Zap, Sparkles, Star,
  Shield, AlertCircle, Trash2, HardDrive, Clock, Film, ImageIcon, Settings,
  Play
} from 'lucide-react'
import { api, type ModelDetailedInfo } from '@/api/client'
import { cn } from '@/lib/utils'

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
  if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`
  return `${Math.floor(diff / 604800)} weeks ago`
}

function getCategoryIcon(category: string) {
  switch (category) {
    case 'fast': return <Zap className="h-5 w-5 text-yellow-400" />
    case 'quality': return <Sparkles className="h-5 w-5 text-blue-400" />
    case 'specialized': return <Star className="h-5 w-5 text-purple-400" />
    case 'video': return <Film className="h-5 w-5 text-pink-400" />
    default: return <ImageIcon className="h-5 w-5 text-white/40" />
  }
}

function getCategoryLabel(category: string) {
  switch (category) {
    case 'fast': return 'Fast Model'
    case 'quality': return 'Quality Model'
    case 'specialized': return 'Specialized Model'
    case 'video': return 'Video Model'
    default: return category
  }
}

export function ModelDetailPage() {
  const { modelId } = useParams<{ modelId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: modelsData, isLoading } = useQuery({
    queryKey: ['models-detailed'],
    queryFn: api.getModelsDetailed,
  })

  const deleteCacheMutation = useMutation({
    mutationFn: api.deleteModelCache,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['models-detailed'] })
    },
  })

  const model = modelsData?.models.find(m => m.id === modelId)
  const isCurrentModel = modelsData?.current_model === modelId
  const isVideoModel = model?.type === 'video' || model?.type === 'ltx2'

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
      </div>
    )
  }

  if (!model) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <AlertCircle className="h-12 w-12 text-red-400" />
        <p className="text-white/60">Model not found: {modelId}</p>
        <button
          onClick={() => navigate('/models')}
          className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm transition-colors"
        >
          Back to Models
        </button>
      </div>
    )
  }

  const handleDeleteCache = () => {
    if (confirm('Are you sure you want to delete this model from cache? It will be re-downloaded when needed.')) {
      deleteCacheMutation.mutate(model.id)
    }
  }

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
              'p-2.5 rounded-xl',
              model.category === 'fast' ? 'bg-yellow-500/20' :
              model.category === 'quality' ? 'bg-blue-500/20' :
              model.category === 'specialized' ? 'bg-purple-500/20' :
              model.category === 'video' ? 'bg-pink-500/20' :
              'bg-white/10'
            )}>
              {getCategoryIcon(model.category)}
            </div>
            <div>
              <h1 className="text-xl font-semibold text-white">{model.name}</h1>
              <p className="text-sm text-white/40 font-mono">{model.path}</p>
            </div>
          </div>
        </div>

        {/* Status Banner */}
        <div className={cn(
          'p-4 rounded-xl border',
          model.is_cached ? 'bg-green-500/10 border-green-500/30' : 'bg-white/5 border-white/10'
        )}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {model.is_cached ? (
                <Check className="h-6 w-6 text-green-400" />
              ) : (
                <Download className="h-6 w-6 text-white/40" />
              )}
              <div>
                <p className={cn('font-medium', model.is_cached ? 'text-green-300' : 'text-white/60')}>
                  {model.is_cached ? 'Downloaded & Ready' : 'Not Downloaded'}
                </p>
                <p className="text-sm text-white/50">
                  {model.is_cached
                    ? `Using ${model.actual_size_gb?.toFixed(1) || model.estimated_size_gb} GB of storage`
                    : `Will download ~${model.estimated_size_gb} GB when first used`}
                </p>
              </div>
            </div>
            {isCurrentModel && (
              <span className="px-3 py-1 rounded-full bg-primary/20 text-primary text-sm font-medium">
                Currently Active
              </span>
            )}
          </div>
        </div>

        {/* Main Info Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Description & Tags */}
          <div className="glass rounded-xl p-6">
            <h2 className="text-sm font-medium text-white/60 mb-4">About</h2>
            <p className="text-white/80 mb-4">{model.description}</p>

            <div className="flex items-center gap-2 mb-4">
              {getCategoryIcon(model.category)}
              <span className="text-sm text-white/60">{getCategoryLabel(model.category)}</span>
            </div>

            <div className="flex flex-wrap gap-2">
              {model.tags.map(tag => (
                <span
                  key={tag}
                  className="text-xs px-2.5 py-1 rounded-full bg-white/10 text-white/70"
                >
                  {tag}
                </span>
              ))}
            </div>

            {model.requires_approval && model.approval_url && (
              <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <div className="flex items-start gap-2">
                  <Shield className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="text-amber-200">Requires accepting terms on HuggingFace</p>
                    <a
                      href={model.approval_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-400 hover:underline flex items-center gap-1 mt-1"
                    >
                      Accept Terms
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Technical Details */}
          <div className="glass rounded-xl p-6">
            <h2 className="text-sm font-medium text-white/60 mb-4">Configuration</h2>
            <dl className="space-y-3">
              <div className="flex items-center justify-between">
                <dt className="text-sm text-white/50">Model Type</dt>
                <dd className="text-sm text-white font-mono">{model.type.toUpperCase()}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-sm text-white/50">Default Steps</dt>
                <dd className="text-sm text-white">{model.default_steps}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-sm text-white/50">Guidance Scale</dt>
                <dd className="text-sm text-white">{model.default_guidance}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-sm text-white/50">Estimated Size</dt>
                <dd className="text-sm text-white">{model.estimated_size_gb} GB</dd>
              </div>
              {model.is_cached && model.cached_size_mb && (
                <div className="flex items-center justify-between">
                  <dt className="text-sm text-white/50">Actual Size</dt>
                  <dd className="text-sm text-white">{formatBytes(model.cached_size_mb)}</dd>
                </div>
              )}
            </dl>

            {/* Cache Info */}
            {model.is_cached && (
              <div className="mt-6 pt-4 border-t border-white/10">
                <h3 className="text-xs text-white/40 mb-3">Cache Info</h3>
                <dl className="space-y-2 text-sm">
                  {model.last_accessed && (
                    <div className="flex items-center justify-between">
                      <dt className="text-white/50 flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Last Used
                      </dt>
                      <dd className="text-white">{formatTimeAgo(model.last_accessed)}</dd>
                    </div>
                  )}
                  {model.num_cached_revisions > 0 && (
                    <div className="flex items-center justify-between">
                      <dt className="text-white/50">Cached Revisions</dt>
                      <dd className="text-white">{model.num_cached_revisions}</dd>
                    </div>
                  )}
                </dl>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="glass rounded-xl p-6">
          <h2 className="text-sm font-medium text-white/60 mb-4">Actions</h2>
          <div className="flex flex-wrap gap-3">
            {/* Use Model Button */}
            <Link
              to={isVideoModel ? '/video' : '/image'}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-white text-sm font-medium transition-colors"
            >
              <Play className="h-4 w-4" />
              Use {isVideoModel ? 'for Video' : 'for Image'}
            </Link>

            {/* HuggingFace Link */}
            <a
              href={`https://huggingface.co/${model.path}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
              View on HuggingFace
            </a>

            {/* Delete Cache Button */}
            {model.is_cached && !isCurrentModel && (
              <button
                onClick={handleDeleteCache}
                disabled={deleteCacheMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
              >
                {deleteCacheMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                {deleteCacheMutation.isPending ? 'Deleting...' : 'Delete from Cache'}
              </button>
            )}
          </div>

          {model.is_cached && isCurrentModel && (
            <p className="text-xs text-white/40 mt-3">
              Cannot delete cache for currently active model
            </p>
          )}
        </div>

        {/* Back to Models */}
        <div className="flex items-center justify-between pt-4">
          <Link
            to="/models"
            className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm transition-colors"
          >
            Back to Models
          </Link>
        </div>
      </div>
    </div>
  )
}
