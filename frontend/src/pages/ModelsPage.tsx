import { useState, useCallback, useRef, useEffect } from 'react'
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useUrlState, useClearUrlParams } from '@/hooks/useUrlState'
import {
  Loader2, Download, Check, ExternalLink, Zap, Sparkles, Star,
  Shield, AlertCircle, HardDrive,
  Image, Video, Lock, Search, X, ArrowDownToLine, User,
  Globe, Settings,
} from 'lucide-react'
import {
  api,
  type ModelDetailedInfo,
  type CivitaiModelSummary,
  type CivitaiDownloadRequest,
  type CivitaiDownloadJob,
} from '@/api/client'
import { cn } from '@/lib/utils'
import { useFavorites } from '@/hooks/useFavorites'
import {
  PROVIDER_PRESETS,
  PREVIEW_MODELS,
  type ModelProvider,
} from '@/types/providers'

type SelectedView = 'curated' | 'civitai' | 'favorites' | ModelProvider
type CategoryFilter = 'all' | 'fast' | 'quality' | 'specialized'
type StatusFilter = 'all' | 'downloaded' | 'not-downloaded'

const PROVIDER_IDS: ModelProvider[] = ['krea', 'higgsfield', 'fal']

export function ModelsPage() {
  const clearUrlParams = useClearUrlParams()
  const [selectedView, setSelectedViewRaw] = useUrlState('view', 'curated') as [SelectedView, (v: string, opts?: { replace?: boolean }) => void]
  const [categoryFilter, setCategoryFilter] = useUrlState('category', 'all') as [CategoryFilter, (v: string, opts?: { replace?: boolean }) => void]
  const [statusFilter, setStatusFilter] = useUrlState('status', 'all') as [StatusFilter, (v: string, opts?: { replace?: boolean }) => void]
  // When switching views, clear view-specific params
  const setSelectedView = useCallback((view: SelectedView) => {
    // Clear curated filters when leaving curated view
    if (view !== 'curated') {
      clearUrlParams(['category', 'status'])
    }
    // Clear civitai filters when leaving civitai view
    if (view !== 'civitai') {
      clearUrlParams(['sort', 'civitaiType', 'base', 'contentCategory'])
    }
    setSelectedViewRaw(view)
  }, [clearUrlParams, setSelectedViewRaw])

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

  const { favorites, isFavorited, toggle: toggleFavorite } = useFavorites()

  const models = modelsData?.models || []
  const totalCacheSize = modelsData?.total_cache_size_gb || 0
  const providersList = providersData?.providers || []

  const isProviderConfigured = (providerId: string): boolean => {
    return providersList.find(p => p.provider === providerId)?.is_configured ?? false
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

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left sidebar */}
      <div className="w-56 flex-shrink-0 border-r border-white/5 flex flex-col">
        <div className="p-4 space-y-4">
          {/* FAVORITES section */}
          {favorites.length > 0 && (
            <div>
              <span className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">
                Favorites
              </span>
              <button
                onClick={() => setSelectedView('favorites')}
                className={cn(
                  'w-full flex items-center justify-between mt-2 px-3 py-2 rounded-lg text-sm transition-colors',
                  selectedView === 'favorites'
                    ? 'bg-primary/20 text-primary'
                    : 'text-white/70 hover:bg-white/5 hover:text-white'
                )}
              >
                <div className="flex items-center gap-2">
                  <Star className={cn(
                    'h-3.5 w-3.5',
                    selectedView === 'favorites' ? 'fill-primary' : 'fill-yellow-500 text-yellow-500'
                  )} />
                  <span>Starred</span>
                </div>
                <span className="text-xs text-white/40">{favorites.length}</span>
              </button>
            </div>
          )}

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
        {selectedView === 'favorites' ? (
          <FavoritesView
            favorites={favorites}
            models={models}
            isLoading={isLoading}
            currentModel={modelsData?.current_model}
            isFavorited={isFavorited}
            onToggleFavorite={toggleFavorite}
          />
        ) : selectedView === 'curated' ? (
          <CuratedView
            models={models}
            filteredModels={filteredModels}
            groupedModels={groupedModels}
            isLoading={isLoading}
            categoryFilter={categoryFilter}
            setCategoryFilter={setCategoryFilter}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            totalCacheSize={totalCacheSize}
            currentModel={modelsData?.current_model}
            isFavorited={isFavorited}
            onToggleFavorite={toggleFavorite}
          />
        ) : selectedView === 'civitai' ? (
          <CivitaiView isFavorited={isFavorited} onToggleFavorite={toggleFavorite} />
        ) : (
          <ProviderView
            providerId={selectedView as ModelProvider}
            isConfigured={isProviderConfigured(selectedView as string)}
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
  totalCacheSize: number
  currentModel: string | null | undefined
  isFavorited: (id: string) => boolean
  onToggleFavorite: (id: string) => void
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
  currentModel,
  isFavorited,
  onToggleFavorite,
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
                      currentModel={currentModel}
                      isFavorited={isFavorited(model.id)}
                      onToggleFavorite={() => onToggleFavorite(model.id)}
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
// Favorites View
// =============================================================================

interface FavoritesViewProps {
  favorites: string[]
  models: ModelDetailedInfo[]
  isLoading: boolean
  currentModel: string | null | undefined
  isFavorited: (id: string) => boolean
  onToggleFavorite: (id: string) => void
}

function FavoritesView({ favorites, models, isLoading, currentModel, isFavorited, onToggleFavorite }: FavoritesViewProps) {
  // Split favorites by source
  const localFavIds = favorites.filter((id) => !id.includes(':'))
  const civitaiFavIds = favorites.filter((id) => id.startsWith('civitai:'))
  const remoteFavIds = favorites.filter((id) => id.includes(':') && !id.startsWith('civitai:'))

  const localFavModels = localFavIds
    .map((id) => models.find((m) => m.id === id))
    .filter(Boolean) as ModelDetailedInfo[]

  return (
    <>
      <div className="flex-shrink-0 px-6 py-4 border-b border-white/5">
        <h1 className="text-xl font-semibold text-white">Favorites</h1>
        <p className="text-sm text-white/50 mt-1">{favorites.length} starred models</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-white/40" />
          </div>
        ) : favorites.length === 0 ? (
          <div className="text-center py-12">
            <Star className="h-12 w-12 text-white/20 mx-auto mb-3" />
            <p className="text-white/40">No favorites yet</p>
            <p className="text-sm text-white/30 mt-1">Star models to quickly find them here</p>
          </div>
        ) : (
          <>
            {/* Local favorites */}
            {localFavModels.length > 0 && (
              <div>
                <h2 className="text-lg font-medium text-white/80 mb-4">Local Models</h2>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {localFavModels.map((model) => (
                    <ModelCard
                      key={model.id}
                      model={model}
                      currentModel={currentModel}
                      isFavorited={isFavorited(model.id)}
                      onToggleFavorite={() => onToggleFavorite(model.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Civitai favorites (show as ID list since we don't have full model data) */}
            {civitaiFavIds.length > 0 && (
              <div>
                <h2 className="text-lg font-medium text-white/80 mb-4">Civitai Models</h2>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {civitaiFavIds.map((favId) => {
                    const versionId = favId.replace('civitai:', '')
                    return (
                      <Link
                        key={favId}
                        to={`/models?view=civitai`}
                        className="rounded-xl border border-white/10 bg-white/[0.02] p-4 hover:border-primary/30 transition-all"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-white/80">Civitai Version</p>
                            <p className="text-xs text-white/40 font-mono mt-0.5">#{versionId}</p>
                          </div>
                          <button
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleFavorite(favId) }}
                            className="p-1 rounded-md hover:bg-white/10 transition-colors"
                          >
                            <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                          </button>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Remote favorites */}
            {remoteFavIds.length > 0 && (
              <div>
                <h2 className="text-lg font-medium text-white/80 mb-4">Remote Models</h2>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {remoteFavIds.map((favId) => {
                    const [provider, ...rest] = favId.split(':')
                    const modelId = rest.join(':')
                    return (
                      <Link
                        key={favId}
                        to={`/models?view=${provider}`}
                        className="rounded-xl border border-white/10 bg-white/[0.02] p-4 hover:border-primary/30 transition-all"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-white/80 capitalize">{provider}</p>
                            <p className="text-xs text-white/40 font-mono mt-0.5">{modelId}</p>
                          </div>
                          <button
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleFavorite(favId) }}
                            className="p-1 rounded-md hover:bg-white/10 transition-colors"
                          >
                            <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                          </button>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )}
          </>
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

      {/* Config banner */}
      <div className="mx-6 mt-4 flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
        <AlertCircle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm text-amber-200 font-medium">
            {isConfigured ? 'Provider configured' : 'API key required'}
          </p>
          <p className="text-sm text-amber-200/70 mt-1">
            {isConfigured
              ? `${preset.name} is ready to use.`
              : `Configure your API key to use ${preset.name} models.`}
          </p>
        </div>
        <Link
          to={`/provider/${providerId}`}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition-colors flex-shrink-0"
        >
          <Settings className="h-3.5 w-3.5" />
          Configure
        </Link>
      </div>

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
type CivitaiContentCategory = '' | 'image' | 'video'

const IMAGE_BASE_MODELS = [
  { value: 'SD 1.5', label: 'SD 1.5' },
  { value: 'SDXL 1.0', label: 'SDXL 1.0' },
  { value: 'SD 3', label: 'SD 3' },
  { value: 'SD 3.5', label: 'SD 3.5' },
  { value: 'Flux.1 D', label: 'Flux.1 Dev' },
  { value: 'Flux.1 S', label: 'Flux.1 Schnell' },
  { value: 'Pony', label: 'Pony' },
]

const VIDEO_BASE_MODELS = [
  { value: 'Hunyuan Video', label: 'Hunyuan Video' },
  { value: 'CogVideoX', label: 'CogVideoX' },
  { value: 'Wan Video', label: 'Wan Video' },
  { value: 'Wan Video 2.2 T2V-A14B', label: 'Wan 2.2 T2V' },
  { value: 'Wan Video 2.2 I2V-A14B', label: 'Wan 2.2 I2V' },
  { value: 'SVD', label: 'SVD' },
  { value: 'SVD XT', label: 'SVD XT' },
  { value: 'LTX Video', label: 'LTX Video' },
]

function CivitaiView({ isFavorited, onToggleFavorite }: { isFavorited: (id: string) => boolean; onToggleFavorite: (id: string) => void }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [, setSearchParamsRaw] = useSearchParams()

  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [typeFilter, setTypeFilter] = useUrlState('civitaiType', '') as [CivitaiModelType, (v: string, opts?: { replace?: boolean }) => void]
  const [sortBy, setSortBy] = useUrlState('sort', 'Highest Rated') as [CivitaiSortOption, (v: string, opts?: { replace?: boolean }) => void]
  const [baseModelFilter, setBaseModelFilter] = useUrlState('base', '')
  const [nsfwEnabled, setNsfwEnabled] = useState(false)
  const [contentCategory] = useUrlState('contentCategory', '') as [CivitaiContentCategory, (v: string, opts?: { replace?: boolean }) => void]

  // Infinite scroll sentinel ref
  const loadMoreRef = useRef<HTMLDivElement>(null)

  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null)
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value)
    if (debounceTimer) clearTimeout(debounceTimer)
    const timer = setTimeout(() => setDebouncedQuery(value), 400)
    setDebounceTimer(timer)
  }, [debounceTimer])

  const tagFilter = contentCategory === 'video' ? 'video' : undefined

  // Batch contentCategory + base model reset in a single setSearchParams call
  // to avoid race conditions between separate useUrlState setters
  const handleContentCategoryChange = useCallback((cat: CivitaiContentCategory) => {
    setSearchParamsRaw((prev) => {
      const next = new URLSearchParams(prev)
      if (cat === '') {
        next.delete('contentCategory')
      } else {
        next.set('contentCategory', cat)
      }
      next.delete('base')
      return next
    })
  }, [setSearchParamsRaw])

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery({
    queryKey: ['civitai-models', debouncedQuery, typeFilter, sortBy, baseModelFilter, nsfwEnabled, contentCategory],
    queryFn: async ({ pageParam }) => {
      return api.searchCivitaiModels({
        query: debouncedQuery || undefined,
        types: typeFilter || undefined,
        sort: sortBy,
        nsfw: nsfwEnabled,
        base_models: baseModelFilter || undefined,
        limit: 20,
        cursor: pageParam as string | undefined,
        tag: tagFilter,
      })
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.metadata?.nextCursor,
    staleTime: 5 * 60 * 1000, // 5 min — matches backend cache TTL
    gcTime: 15 * 60 * 1000,   // 15 min — keep in memory longer for back/forward nav
  })

  const { data: downloads = [] } = useQuery({
    queryKey: ['civitai-downloads'],
    queryFn: api.getCivitaiDownloads,
    refetchInterval: 2000,
    staleTime: 0, // Always refetch — active polling for real-time progress
  })

  const { data: downloadedVersions = [] } = useQuery({
    queryKey: ['civitai-downloaded-versions'],
    queryFn: api.getCivitaiDownloadedVersions,
    refetchInterval: 5000,
    staleTime: 30_000, // 30s — changes infrequently outside of active downloads
    gcTime: 5 * 60 * 1000,
  })

  const downloadMutation = useMutation({
    mutationFn: api.startCivitaiDownload,
    meta: { successMessage: 'Download started', errorMessage: 'Download failed' },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['civitai-downloads'] })
      queryClient.invalidateQueries({ queryKey: ['civitai-downloaded-versions'] })
    },
  })

  const cancelMutation = useMutation({
    mutationFn: api.cancelCivitaiDownload,
    meta: { successMessage: 'Download cancelled', errorMessage: 'Cancel failed' },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['civitai-downloads'] })
    },
  })

  // Infinite scroll: auto-fetch next page when sentinel enters viewport
  useEffect(() => {
    const sentinel = loadMoreRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage()
        }
      },
      { rootMargin: '200px' }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const allModels = data?.pages.flatMap((p) => p.items) ?? []

  const getDownloadJob = (versionId: number | undefined): CivitaiDownloadJob | undefined =>
    versionId != null
      ? downloads.find((d) => d.version_id === versionId && ['queued', 'downloading'].includes(d.status))
      : undefined

  const isVersionDownloaded = (versionId: number | undefined): boolean =>
    versionId != null ? downloadedVersions.includes(versionId) : false

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
            {/* Content category */}
            <div className="flex items-center bg-white/5 rounded-lg p-1">
              {([
                { value: '' as CivitaiContentCategory, label: 'All' },
                { value: 'image' as CivitaiContentCategory, label: 'Image' },
                { value: 'video' as CivitaiContentCategory, label: 'Video' },
              ]).map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => handleContentCategoryChange(value)}
                  className={cn(
                    'px-3 py-1.5 text-sm rounded-md transition-colors',
                    contentCategory === value
                      ? 'bg-white/10 text-white'
                      : 'text-white/50 hover:text-white/70'
                  )}
                >
                  {label}
                </button>
              ))}
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
              {(contentCategory !== 'video') && (
                <>
                  <optgroup label="Image">
                    {IMAGE_BASE_MODELS.map(({ value, label }) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </optgroup>
                </>
              )}
              {(contentCategory !== 'image') && (
                <>
                  <optgroup label="Video">
                    {VIDEO_BASE_MODELS.map(({ value, label }) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </optgroup>
                </>
              )}
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
              {allModels.map((model) => {
                const firstVersion = model.modelVersions[0]
                const favId = firstVersion ? `civitai:${firstVersion.id}` : undefined
                return (
                <CivitaiModelCard
                  key={model.id}
                  model={model}
                  downloadJob={getDownloadJob(firstVersion?.id)}
                  isDownloaded={firstVersion ? isVersionDownloaded(firstVersion.id) : false}
                  onDownload={() => handleDownload(model)}
                  onClick={() => navigate(`/models/civitai/${model.id}`)}
                  isFavorited={favId ? isFavorited(favId) : false}
                  onToggleFavorite={favId ? () => onToggleFavorite(favId) : undefined}
                />
                )
              })}
            </div>
            {/* Infinite scroll sentinel */}
            <div ref={loadMoreRef} className="flex justify-center py-6">
              {isFetchingNextPage && (
                <Loader2 className="h-6 w-6 animate-spin text-white/40" />
              )}
            </div>
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
  onClick,
  isFavorited,
  onToggleFavorite,
}: {
  model: CivitaiModelSummary
  downloadJob?: CivitaiDownloadJob
  isDownloaded: boolean
  onDownload: () => void
  onClick: () => void
  isFavorited?: boolean
  onToggleFavorite?: () => void
}) {
  const version = model.modelVersions[0]
  const thumbnailItem = version?.images[0]
  const thumbnail = thumbnailItem?.url
  const thumbnailIsVideo = thumbnailItem?.type === 'video'
  const file = version?.files[0]
  const fileSizeMB = file?.sizeKB ? (file.sizeKB / 1024).toFixed(0) : null
  const isDownloading = downloadJob?.status === 'downloading'
  const isQueued = downloadJob?.status === 'queued'

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden transition-all hover:border-primary/30 cursor-pointer" onClick={onClick}>
      {/* Thumbnail */}
      <div className="aspect-[4/3] bg-white/5 relative overflow-hidden">
        {thumbnail ? (
          thumbnailIsVideo ? (
            <video src={thumbnail} className="w-full h-full object-cover" muted autoPlay loop playsInline />
          ) : (
            <img src={thumbnail} alt={model.name} className="w-full h-full object-cover" loading="lazy" />
          )
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/30">No preview</div>
        )}
        <span className="absolute top-2 left-2 px-2 py-0.5 text-[10px] font-medium rounded bg-black/60 text-white">
          {model.type || 'Model'}
        </span>
        <div className="absolute top-2 right-2 flex items-center gap-1">
          {version?.baseModel && (
            <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-primary/80 text-white">
              {version.baseModel}
            </span>
          )}
          {onToggleFavorite && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleFavorite() }}
              className="p-1 rounded bg-black/50 hover:bg-black/70 transition-colors"
              title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
            >
              <Star className={cn(
                'h-3.5 w-3.5',
                isFavorited ? 'fill-yellow-500 text-yellow-500' : 'text-white/60 hover:text-yellow-500/80'
              )} />
            </button>
          )}
        </div>
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
  currentModel: string | null | undefined
  isFavorited?: boolean
  onToggleFavorite?: () => void
}

function ModelCard({ model, currentModel, isFavorited, onToggleFavorite }: ModelCardProps) {
  const isCurrentModel = currentModel === model.id

  return (
    <Link
      to={`/model/${model.id}`}
      className={cn(
        'block rounded-xl border bg-white/[0.02] transition-all hover:border-primary/30',
        model.is_cached ? 'border-green-500/30' : 'border-white/10',
      )}
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
            {onToggleFavorite && (
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleFavorite() }}
                className="p-1 rounded-md hover:bg-white/10 transition-colors"
                title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
              >
                <Star className={cn(
                  'h-4 w-4 transition-colors',
                  isFavorited ? 'fill-yellow-500 text-yellow-500' : 'text-white/30 hover:text-yellow-500/60'
                )} />
              </button>
            )}
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
      </div>
    </Link>
  )
}
