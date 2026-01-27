import { useState, useCallback } from 'react'
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Loader2, Download, Check, ExternalLink, Zap, Sparkles, Star,
  Shield, AlertCircle, Trash2, HardDrive, Clock, ChevronRight,
  Image, Video, Lock, Search, X, ChevronDown, ArrowDownToLine, User,
  Globe,
} from 'lucide-react'
import {
  api,
  type ModelDetailedInfo,
  type CacheDeleteResponse,
  type CivitaiModelSummary,
  type CivitaiDownloadRequest,
  type CivitaiDownloadJob,
} from '@/api/client'
import { cn } from '@/lib/utils'
import {
  PROVIDER_PRESETS,
  PREVIEW_MODELS,
  type ModelProvider,
} from '@/types/providers'

type SelectedView = 'curated' | 'civitai' | ModelProvider
type CategoryFilter = 'all' | 'fast' | 'quality' | 'specialized'
type StatusFilter = 'all' | 'downloaded' | 'not-downloaded'

const PROVIDER_IDS: ModelProvider[] = ['krea', 'higgsfield', 'fal']

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
  const [selectedView, setSelectedView] = useState<SelectedView>('curated')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [expandedModel, setExpandedModel] = useState<string | null>(null)

  // Local models data
  const { data: modelsData, isLoading } = useQuery({
    queryKey: ['models-detailed'],
    queryFn: api.getModelsDetailed,
    refetchInterval: 10000,
  })

  // Provider configuration status
  const { data: providersData } = useQuery({
    queryKey: ['providers'],
    queryFn: api.getProviders,
  })

  const deleteCacheMutation = useMutation({
    mutationFn: api.deleteModelCache,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['models-detailed'] })
    },
  })

  const models = modelsData?.models || []
  const totalCacheSize = modelsData?.total_cache_size_gb || 0
  const providers = providersData?.providers || {}

  const isProviderConfigured = (providerId: string): boolean => {
    return providers[providerId]?.is_configured ?? false
  }

  // Filter models (curated view only)
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

  const handleDeleteCache = (modelId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm('Are you sure you want to delete this model from cache? It will be re-downloaded when needed.')) {
      deleteCacheMutation.mutate(modelId)
    }
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left sidebar */}
      <div className="w-56 flex-shrink-0 border-r border-white/5 flex flex-col">
        <div className="p-4 space-y-4">
          {/* LOCAL section */}
          <div>
            <span className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">
              Local
            </span>
            <button
              onClick={() => setSelectedView('curated')}
              className={cn(
                'w-full flex items-center justify-between mt-2 px-3 py-2 rounded-lg text-sm transition-colors',
                selectedView === 'curated'
                  ? 'bg-primary/20 text-primary'
                  : 'text-white/70 hover:bg-white/5 hover:text-white'
              )}
            >
              <div className="flex items-center gap-2">
                <span className={cn(
                  'w-2 h-2 rounded-full',
                  selectedView === 'curated' ? 'bg-primary' : 'bg-green-500'
                )} />
                <span>Curated</span>
              </div>
              <span className="text-xs text-white/40">{models.length}</span>
            </button>
          </div>

          {/* CIVITAI section */}
          <div>
            <span className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">
              Civitai
            </span>
            <button
              onClick={() => setSelectedView('civitai')}
              className={cn(
                'w-full flex items-center justify-between mt-2 px-3 py-2 rounded-lg text-sm transition-colors',
                selectedView === 'civitai'
                  ? 'bg-primary/20 text-primary'
                  : 'text-white/70 hover:bg-white/5 hover:text-white'
              )}
            >
              <div className="flex items-center gap-2">
                <Globe className="h-3.5 w-3.5" />
                <span>Browse</span>
              </div>
            </button>
          </div>

          {/* REMOTE section */}
          <div>
            <span className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">
              Remote
            </span>
            <div className="mt-2 space-y-1">
              {PROVIDER_IDS.map((providerId) => {
                const preset = PROVIDER_PRESETS[providerId]
                const previewModels = PREVIEW_MODELS[providerId] || []
                const configured = isProviderConfigured(providerId)

                return (
                  <button
                    key={providerId}
                    onClick={() => setSelectedView(providerId)}
                    className={cn(
                      'w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors',
                      selectedView === providerId
                        ? 'bg-primary/20 text-primary'
                        : 'text-white/70 hover:bg-white/5 hover:text-white'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        'w-2 h-2 rounded-full',
                        configured ? 'bg-green-500' : 'bg-white/20'
                      )} />
                      <span>{preset.name}</span>
                    </div>
                    <span className="text-xs text-white/40">{previewModels.length}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Cache stats at bottom */}
        {totalCacheSize > 0 && (
          <div className="mt-auto p-4 border-t border-white/5">
            <div className="flex items-center gap-2 text-xs text-white/40">
              <HardDrive className="h-3.5 w-3.5" />
              <span>{totalCacheSize.toFixed(1)} GB cached</span>
            </div>
          </div>
        )}
      </div>

      {/* Right content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedView === 'curated' ? (
          <CuratedView
            models={models}
            filteredModels={filteredModels}
            groupedModels={groupedModels}
            isLoading={isLoading}
            categoryFilter={categoryFilter}
            setCategoryFilter={setCategoryFilter}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            expandedModel={expandedModel}
            setExpandedModel={setExpandedModel}
            handleDeleteCache={handleDeleteCache}
            deleteCacheMutation={deleteCacheMutation}
            totalCacheSize={totalCacheSize}
            currentModel={modelsData?.current_model}
          />
        ) : selectedView === 'civitai' ? (
          <CivitaiView />
        ) : (
          <ProviderView
            providerId={selectedView}
            isConfigured={isProviderConfigured(selectedView)}
          />
        )}
      </div>
    </div>
  )
}

// =============================================================================
// Curated View (existing local models)
// =============================================================================

interface CuratedViewProps {
  models: ModelDetailedInfo[]
  filteredModels: ModelDetailedInfo[]
  groupedModels: Record<string, ModelDetailedInfo[]>
  isLoading: boolean
  categoryFilter: CategoryFilter
  setCategoryFilter: (f: CategoryFilter) => void
  statusFilter: StatusFilter
  setStatusFilter: (f: StatusFilter) => void
  expandedModel: string | null
  setExpandedModel: (id: string | null) => void
  handleDeleteCache: (modelId: string, e: React.MouseEvent) => void
  deleteCacheMutation: ReturnType<typeof useMutation<CacheDeleteResponse, Error, string>>
  totalCacheSize: number
  currentModel: string | null | undefined
}

function CuratedView({
  models,
  filteredModels,
  groupedModels,
  isLoading,
  categoryFilter,
  setCategoryFilter,
  statusFilter,
  setStatusFilter,
  expandedModel,
  setExpandedModel,
  handleDeleteCache,
  deleteCacheMutation,
  currentModel,
}: CuratedViewProps) {
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

  return (
    <>
      {/* Header with filters */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-white/5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white">Models</h1>
            <p className="text-sm text-white/50 mt-1">
              {models.filter(m => m.is_cached).length} of {models.length} models downloaded
            </p>
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
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-white/40" />
          </div>
        ) : categoryFilter === 'all' ? (
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
                      currentModel={currentModel}
                    />
                  ))}
                </div>
              </div>
            )
          ))
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredModels.map(model => (
              <ModelCard
                key={model.id}
                model={model}
                expanded={expandedModel === model.id}
                onToggle={() => setExpandedModel(expandedModel === model.id ? null : model.id)}
                onDeleteCache={(e) => handleDeleteCache(model.id, e)}
                isDeleting={deleteCacheMutation.isPending && deleteCacheMutation.variables === model.id}
                currentModel={currentModel}
              />
            ))}
          </div>
        )}

        {!isLoading && filteredModels.length === 0 && (
          <div className="text-center py-12">
            <p className="text-white/40">No models match your filters</p>
          </div>
        )}
      </div>
    </>
  )
}

// =============================================================================
// Provider View (remote provider preview)
// =============================================================================

interface ProviderViewProps {
  providerId: ModelProvider
  isConfigured: boolean
}

function ProviderView({ providerId, isConfigured }: ProviderViewProps) {
  const preset = PROVIDER_PRESETS[providerId]
  const previewModels = PREVIEW_MODELS[providerId] || []

  return (
    <>
      {/* Provider header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-white/5">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-white">{preset.name}</h1>
              {preset.website && (
                <a
                  href={preset.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/40 hover:text-white/60 transition-colors"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
            <p className="text-sm text-white/50 mt-1">{preset.description}</p>
          </div>
          <div className="flex items-center gap-2">
            {preset.capabilities.map(cap => (
              <span
                key={cap}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-white/5 text-white/50"
              >
                {cap === 'image' ? <Image className="h-3 w-3" /> : <Video className="h-3 w-3" />}
                {cap === 'image' ? 'Image' : 'Video'}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Config banner if not configured */}
      {!isConfigured && (
        <div className="mx-6 mt-4 flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <AlertCircle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-amber-200 font-medium">API key required</p>
            <p className="text-sm text-amber-200/70 mt-1">
              Set <code className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono text-xs">{preset.envVar}</code> to use {preset.name} models.
              Configure in Settings.
            </p>
          </div>
        </div>
      )}

      {/* Preview model cards */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {previewModels.map(model => (
            <div
              key={model.id}
              className={cn(
                'rounded-xl border bg-white/[0.02] p-4',
                isConfigured ? 'border-white/10' : 'border-white/5 opacity-60'
              )}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-medium text-white">{model.name}</h3>
                <div className="flex items-center gap-1.5">
                  <span className={cn(
                    'text-xs px-2 py-0.5 rounded-full flex items-center gap-1',
                    model.type === 'image'
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'bg-purple-500/20 text-purple-400'
                  )}>
                    {model.type === 'image' ? <Image className="h-3 w-3" /> : <Video className="h-3 w-3" />}
                    {model.type === 'image' ? 'Image' : 'Video'}
                  </span>
                  {!isConfigured && (
                    <Lock className="h-3.5 w-3.5 text-white/30" />
                  )}
                </div>
              </div>

              {/* Description */}
              <p className="text-sm text-white/60 mb-3">{model.description}</p>

              {/* Tags */}
              {model.tags && model.tags.length > 0 && (
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
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

// =============================================================================
// Civitai View (browse + download from Civitai)
// =============================================================================

type CivitaiModelType = '' | 'Checkpoint' | 'LORA'
type CivitaiSortOption = 'Highest Rated' | 'Most Downloaded' | 'Newest'

function CivitaiView() {
  const queryClient = useQueryClient()

  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<CivitaiModelType>('')
  const [sortBy, setSortBy] = useState<CivitaiSortOption>('Highest Rated')
  const [baseModelFilter, setBaseModelFilter] = useState('')
  const [nsfwEnabled, setNsfwEnabled] = useState(false)

  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null)
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value)
    if (debounceTimer) clearTimeout(debounceTimer)
    const timer = setTimeout(() => setDebouncedQuery(value), 400)
    setDebounceTimer(timer)
  }, [debounceTimer])

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery({
    queryKey: ['civitai-models', debouncedQuery, typeFilter, sortBy, baseModelFilter, nsfwEnabled],
    queryFn: async ({ pageParam }) => {
      return api.searchCivitaiModels({
        query: debouncedQuery || undefined,
        types: typeFilter || undefined,
        sort: sortBy,
        nsfw: nsfwEnabled,
        base_models: baseModelFilter || undefined,
        limit: 20,
        cursor: pageParam as string | undefined,
      })
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.metadata?.nextCursor,
  })

  const { data: downloads = [] } = useQuery({
    queryKey: ['civitai-downloads'],
    queryFn: api.getCivitaiDownloads,
    refetchInterval: 2000,
  })

  const { data: downloadedVersions = [] } = useQuery({
    queryKey: ['civitai-downloaded-versions'],
    queryFn: api.getCivitaiDownloadedVersions,
    refetchInterval: 5000,
  })

  const downloadMutation = useMutation({
    mutationFn: api.startCivitaiDownload,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['civitai-downloads'] })
      queryClient.invalidateQueries({ queryKey: ['civitai-downloaded-versions'] })
    },
  })

  const cancelMutation = useMutation({
    mutationFn: api.cancelCivitaiDownload,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['civitai-downloads'] })
    },
  })

  const allModels = data?.pages.flatMap((p) => p.items) ?? []

  const getDownloadJob = (versionId: number): CivitaiDownloadJob | undefined =>
    downloads.find((d) => d.version_id === versionId && ['queued', 'downloading'].includes(d.status))

  const isVersionDownloaded = (versionId: number): boolean =>
    downloadedVersions.includes(versionId)

  const handleDownload = (model: CivitaiModelSummary) => {
    const version = model.modelVersions[0]
    if (!version) return
    const file = version.files[0]
    if (!file) return
    const request: CivitaiDownloadRequest = {
      civitai_model_id: model.id,
      version_id: version.id,
      model_name: model.name,
      type: model.type || 'Checkpoint',
      filename: file.name || `${model.name}.safetensors`,
      download_url: version.downloadUrl || '',
      base_model: version.baseModel,
      file_size_kb: file.sizeKB,
    }
    downloadMutation.mutate(request)
  }

  const activeDownloads = downloads.filter((d) => ['queued', 'downloading'].includes(d.status))

  return (
    <>
      {/* Header with filters */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-white/5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex-shrink-0">
            <h1 className="text-xl font-semibold text-white">Civitai</h1>
            <p className="text-sm text-white/50 mt-0.5">
              Browse & download community models
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/40" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search..."
                className="pl-8 pr-3 py-1.5 text-sm rounded-lg border border-white/10 bg-white/5 text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-primary w-44"
              />
            </div>
            {/* Type filter */}
            <div className="flex items-center bg-white/5 rounded-lg p-1">
              {(['', 'Checkpoint', 'LORA'] as CivitaiModelType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => setTypeFilter(type)}
                  className={cn(
                    'px-3 py-1.5 text-sm rounded-md transition-colors',
                    typeFilter === type
                      ? 'bg-white/10 text-white'
                      : 'text-white/50 hover:text-white/70'
                  )}
                >
                  {type || 'All'}
                </button>
              ))}
            </div>
            {/* Sort */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as CivitaiSortOption)}
              className="px-2.5 py-1.5 text-sm rounded-lg border border-white/10 bg-white/5 text-white focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="Highest Rated">Highest Rated</option>
              <option value="Most Downloaded">Most Downloaded</option>
              <option value="Newest">Newest</option>
            </select>
            {/* Base model */}
            <select
              value={baseModelFilter}
              onChange={(e) => setBaseModelFilter(e.target.value)}
              className="px-2.5 py-1.5 text-sm rounded-lg border border-white/10 bg-white/5 text-white focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">All Bases</option>
              <option value="SD 1.5">SD 1.5</option>
              <option value="SDXL 1.0">SDXL 1.0</option>
              <option value="SD 3">SD 3</option>
              <option value="SD 3.5">SD 3.5</option>
              <option value="Flux.1 D">Flux.1 Dev</option>
              <option value="Flux.1 S">Flux.1 Schnell</option>
              <option value="Pony">Pony</option>
            </select>
            {/* NSFW toggle */}
            <button
              onClick={() => setNsfwEnabled(!nsfwEnabled)}
              className={cn(
                'px-3 py-1.5 text-sm rounded-lg transition-colors border',
                nsfwEnabled
                  ? 'bg-primary/20 text-primary border-primary/30'
                  : 'text-white/50 border-white/10 hover:text-white/70'
              )}
            >
              NSFW
            </button>
          </div>
        </div>
      </div>

      {/* Active downloads bar */}
      {activeDownloads.length > 0 && (
        <div className="flex-shrink-0 px-6 py-2 border-b border-white/5 bg-white/[0.02]">
          <div className="flex items-center gap-3 overflow-x-auto">
            <span className="text-xs text-white/40 flex-shrink-0">Downloading:</span>
            {activeDownloads.map((job) => (
              <div key={job.id} className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-white/70 max-w-[140px] truncate">{job.model_name}</span>
                {job.status === 'downloading' ? (
                  <span className="text-xs text-primary">{job.progress.toFixed(0)}%</span>
                ) : (
                  <Loader2 className="h-3 w-3 animate-spin text-white/40" />
                )}
                <button
                  onClick={() => cancelMutation.mutate(job.id)}
                  className="text-white/30 hover:text-red-400"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-white/40" />
          </div>
        ) : isError ? (
          <div className="flex items-center justify-center py-12 text-red-400">
            Failed to load models from Civitai. Check backend connection.
          </div>
        ) : allModels.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-white/40">
            No models found. Try adjusting your search or filters.
          </div>
        ) : (
          <>
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {allModels.map((model) => (
                <CivitaiModelCard
                  key={model.id}
                  model={model}
                  downloadJob={getDownloadJob(model.modelVersions[0]?.id)}
                  isDownloaded={
                    model.modelVersions[0]
                      ? isVersionDownloaded(model.modelVersions[0].id)
                      : false
                  }
                  onDownload={() => handleDownload(model)}
                />
              ))}
            </div>
            {hasNextPage && (
              <div className="flex justify-center mt-6 pb-4">
                <button
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-white/5 text-white/70 hover:bg-white/10 transition-colors disabled:opacity-50"
                >
                  {isFetchingNextPage ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Loading...</>
                  ) : (
                    <><ChevronDown className="h-4 w-4" /> Load More</>
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}

function CivitaiModelCard({
  model,
  downloadJob,
  isDownloaded,
  onDownload,
}: {
  model: CivitaiModelSummary
  downloadJob?: CivitaiDownloadJob
  isDownloaded: boolean
  onDownload: () => void
}) {
  const version = model.modelVersions[0]
  const thumbnail = version?.images[0]?.url
  const file = version?.files[0]
  const fileSizeMB = file?.sizeKB ? (file.sizeKB / 1024).toFixed(0) : null
  const isDownloading = downloadJob?.status === 'downloading'
  const isQueued = downloadJob?.status === 'queued'

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden transition-all hover:border-primary/30">
      {/* Thumbnail */}
      <div className="aspect-[4/3] bg-white/5 relative overflow-hidden">
        {thumbnail ? (
          <img src={thumbnail} alt={model.name} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/30">No preview</div>
        )}
        <span className="absolute top-2 left-2 px-2 py-0.5 text-[10px] font-medium rounded bg-black/60 text-white">
          {model.type || 'Model'}
        </span>
        {version?.baseModel && (
          <span className="absolute top-2 right-2 px-2 py-0.5 text-[10px] font-medium rounded bg-primary/80 text-white">
            {version.baseModel}
          </span>
        )}
      </div>
      {/* Info */}
      <div className="p-3">
        <h3 className="font-medium text-sm text-white line-clamp-1" title={model.name}>{model.name}</h3>
        {model.creator?.username && (
          <div className="flex items-center gap-1 mt-1">
            <User className="h-3 w-3 text-white/40" />
            <span className="text-xs text-white/40">{model.creator.username}</span>
          </div>
        )}
        <div className="flex items-center gap-3 mt-2 text-xs text-white/40">
          {model.stats?.downloadCount != null && (
            <span className="flex items-center gap-1">
              <ArrowDownToLine className="h-3 w-3" />
              {formatCivitaiCount(model.stats.downloadCount)}
            </span>
          )}
          {model.stats?.rating != null && model.stats.rating > 0 && (
            <span className="flex items-center gap-1">
              <Star className="h-3 w-3" />
              {model.stats.rating.toFixed(1)}
            </span>
          )}
          {fileSizeMB && <span>{fileSizeMB} MB</span>}
        </div>
        {model.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {model.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="px-1.5 py-0.5 text-[10px] rounded bg-white/5 text-white/40">{tag}</span>
            ))}
            {model.tags.length > 3 && (
              <span className="px-1.5 py-0.5 text-[10px] rounded bg-white/5 text-white/40">+{model.tags.length - 3}</span>
            )}
          </div>
        )}
        {/* Download button */}
        <div className="mt-3">
          {isDownloaded ? (
            <button disabled className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-green-500/10 text-green-400 border border-green-500/20">
              <Check className="h-3.5 w-3.5" /> Downloaded
            </button>
          ) : isDownloading && downloadJob ? (
            <div className="w-full">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-white/40">{downloadJob.progress.toFixed(0)}%</span>
                <span className="text-[10px] text-white/40">{formatCivitaiSpeed(downloadJob.speed_bytes_per_sec)}</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${downloadJob.progress}%` }} />
              </div>
            </div>
          ) : isQueued ? (
            <button disabled className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-white/5 text-white/40">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Queued
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); onDownload() }}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
            >
              <Download className="h-3.5 w-3.5" /> Download
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function formatCivitaiCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

function formatCivitaiSpeed(bytesPerSec: number): string {
  if (bytesPerSec <= 0) return ''
  const mbps = bytesPerSec / (1024 * 1024)
  if (mbps >= 1) return `${mbps.toFixed(1)} MB/s`
  return `${(bytesPerSec / 1024).toFixed(0)} KB/s`
}

// =============================================================================
// Model Card (local/curated models)
// =============================================================================

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

            {/* View Details Link */}
            <Link
              to={`/model/${model.id}`}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition-colors mt-2"
            >
              View Full Details
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
