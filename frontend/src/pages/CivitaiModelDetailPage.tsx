import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Loader2, Download, Check, X, ChevronLeft, ChevronRight,
  Star, ArrowDownToLine, Heart, FileText, User,
} from 'lucide-react'
import {
  api,
  type CivitaiModelSummary,
  type CivitaiDownloadRequest,
  type CivitaiDownloadJob,
  type CivitaiModelVersion,
} from '@/api/client'
import { cn } from '@/lib/utils'

function useCivitaiFavorite(versionId: number | undefined) {
  const queryClient = useQueryClient()
  const favId = versionId != null ? `civitai:${versionId}` : undefined

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: api.getSettings,
  })

  const isFavorited = favId ? (settings?.favorite_models?.includes(favId) ?? false) : false

  const toggleMutation = useMutation({
    mutationFn: api.toggleFavorite,
    meta: { errorMessage: 'Failed to update favorite' },
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ['settings'] })
      const prev = queryClient.getQueryData<typeof settings>(['settings'])
      if (prev) {
        const favs = prev.favorite_models || []
        const idx = favs.indexOf(id)
        const updated = idx >= 0 ? favs.filter((f) => f !== id) : [...favs, id]
        queryClient.setQueryData(['settings'], { ...prev, favorite_models: updated })
      }
      return { prev }
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) queryClient.setQueryData(['settings'], context.prev)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
  })

  const toggle = () => { if (favId) toggleMutation.mutate(favId) }

  return { isFavorited, toggle }
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec <= 0) return ''
  const mbps = bytesPerSec / (1024 * 1024)
  if (mbps >= 1) return `${mbps.toFixed(1)} MB/s`
  return `${(bytesPerSec / 1024).toFixed(0)} KB/s`
}

export function CivitaiModelDetailPage() {
  const { modelId } = useParams<{ modelId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [selectedImageIdx, setSelectedImageIdx] = useState(0)
  const [splitPercent, setSplitPercent] = useState(50)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const pct = ((ev.clientX - rect.left) / rect.width) * 100
      setSplitPercent(Math.min(80, Math.max(20, pct)))
    }
    const onMouseUp = () => {
      dragging.current = false
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [])

  const numericId = modelId ? parseInt(modelId, 10) : NaN

  // We pass undefined initially; we'll get the real version ID once model loads
  const [firstVersionId, setFirstVersionId] = useState<number | undefined>(undefined)
  const { isFavorited, toggle: toggleFavorite } = useCivitaiFavorite(firstVersionId)

  const { data: model, isLoading, isError } = useQuery({
    queryKey: ['civitai-model', numericId],
    queryFn: () => api.getCivitaiModel(numericId),
    enabled: !isNaN(numericId),
  })

  const { data: downloads = [] } = useQuery({
    queryKey: ['civitai-downloads'],
    queryFn: api.getCivitaiDownloads,
    refetchInterval: 2000,
    staleTime: 0,
  })

  const { data: downloadedVersions = [] } = useQuery({
    queryKey: ['civitai-downloaded-versions'],
    queryFn: api.getCivitaiDownloadedVersions,
    refetchInterval: 5000,
    staleTime: 30_000,
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

  // Reset image index and update version ID when model changes
  useEffect(() => {
    setSelectedImageIdx(0)
    if (model?.modelVersions[0]?.id) {
      setFirstVersionId(model.modelVersions[0].id)
    }
  }, [model?.id, model?.modelVersions])

  const getDownloadJob = (versionId: number | undefined): CivitaiDownloadJob | undefined =>
    versionId != null
      ? downloads.find((d) => d.version_id === versionId && ['queued', 'downloading'].includes(d.status))
      : undefined

  const isVersionDownloaded = (versionId: number | undefined): boolean =>
    versionId != null ? downloadedVersions.includes(versionId) : false

  const handleDownloadVersion = (m: CivitaiModelSummary, version: CivitaiModelVersion) => {
    const file = version.files[0]
    if (!file) return
    const request: CivitaiDownloadRequest = {
      civitai_model_id: m.id,
      version_id: version.id,
      model_name: m.name,
      type: m.type || 'Checkpoint',
      filename: file.name || `${m.name}.safetensors`,
      download_url: version.downloadUrl || '',
      base_model: version.baseModel,
      file_size_kb: file.sizeKB,
    }
    downloadMutation.mutate(request)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (isError || !model) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <p className="text-lg mb-2">Model not found</p>
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Go Back
        </button>
      </div>
    )
  }

  // Collect all images across all versions
  const allImages = model.modelVersions
    .flatMap((v) => v.images.map((img) => ({ ...img, versionName: v.name })))
    .filter((img) => img.url)

  const currentImage = allImages[selectedImageIdx]

  // Strip HTML tags from description
  const cleanDescription = model.description
    ? model.description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    : null

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* App bar */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-border space-y-3">
        {/* Row 1: Back + Title + Download */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate(-1)}
            className="flex-shrink-0 p-1 -ml-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-semibold truncate flex-1">{model.name}</h1>
          <button
            onClick={toggleFavorite}
            className="flex-shrink-0 p-1.5 rounded-lg hover:bg-accent transition-colors"
            title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Star className={cn(
              'h-5 w-5 transition-colors',
              isFavorited ? 'fill-yellow-500 text-yellow-500' : 'text-muted-foreground hover:text-yellow-500/60'
            )} />
          </button>
          {(() => {
            const latestVersion = model.modelVersions[0]
            if (!latestVersion) return null
            const downloaded = isVersionDownloaded(latestVersion.id)
            const job = getDownloadJob(latestVersion.id)
            const isDownloading = job?.status === 'downloading'
            const isQueued = job?.status === 'queued'
            if (downloaded) {
              return (
                <span className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-green-500/10 text-green-400 border border-green-500/20">
                  <Check className="h-4 w-4" /> Downloaded
                </span>
              )
            }
            if (isDownloading && job) {
              return (
                <div className="flex-shrink-0 flex items-center gap-2 min-w-[180px]">
                  <div className="flex-1">
                    <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${job.progress}%` }} />
                    </div>
                  </div>
                  <span className="text-xs text-white/50 w-9 text-right">{job.progress.toFixed(0)}%</span>
                  <span className="text-xs text-white/40">{formatSpeed(job.speed_bytes_per_sec)}</span>
                  <button
                    onClick={() => cancelMutation.mutate(job.id)}
                    className="text-white/30 hover:text-red-400"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )
            }
            if (isQueued) {
              return (
                <span className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-white/5 text-white/40">
                  <Loader2 className="h-4 w-4 animate-spin" /> Queued
                </span>
              )
            }
            return (
              <button
                onClick={() => handleDownloadVersion(model, latestVersion)}
                className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
              >
                <Download className="h-4 w-4" /> Download
              </button>
            )
          })()}
        </div>

        {/* Row 2: Meta info */}
        <div className="flex items-center gap-3 flex-wrap text-sm text-muted-foreground">
          {model.creator?.username && (
            <span className="flex items-center gap-1">
              <User className="h-3.5 w-3.5" />
              {model.creator.username}
            </span>
          )}
          <span className="px-2 py-0.5 text-[11px] rounded bg-white/10 text-white/60">
            {model.type || 'Model'}
          </span>
          {model.stats?.downloadCount != null && (
            <span className="flex items-center gap-1">
              <ArrowDownToLine className="h-3.5 w-3.5" />
              {formatCount(model.stats.downloadCount)}
            </span>
          )}
          {model.stats?.rating != null && model.stats.rating > 0 && (
            <span className="flex items-center gap-1">
              <Star className="h-3.5 w-3.5" />
              {model.stats.rating.toFixed(1)}
              {model.stats.ratingCount ? ` (${formatCount(model.stats.ratingCount)})` : ''}
            </span>
          )}
          {model.stats?.favoriteCount != null && model.stats.favoriteCount > 0 && (
            <span className="flex items-center gap-1">
              <Heart className="h-3.5 w-3.5" />
              {formatCount(model.stats.favoriteCount)}
            </span>
          )}
          {model.tags.length > 0 && (
            <>
              <span className="w-px h-4 bg-white/10" />
              {model.tags.map((tag) => (
                <span key={tag} className="px-2 py-0.5 text-[11px] rounded-full bg-white/5 text-white/40">
                  {tag}
                </span>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Two-column layout */}
      <div ref={containerRef} className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left column — Gallery */}
        <div className="min-w-0 overflow-y-auto p-6 space-y-4" style={{ width: `${splitPercent}%` }}>
          <div className="relative bg-black/40 rounded-xl overflow-hidden">
            {currentImage?.url ? (
              <div className="relative">
                {currentImage.type === 'video' ? (
                  <video
                    key={currentImage.url}
                    src={currentImage.url}
                    className="w-full max-h-[600px] object-contain"
                    autoPlay
                    loop
                    muted
                    playsInline
                    controls
                  />
                ) : (
                  <img
                    src={currentImage.url}
                    alt={model.name}
                    className="w-full max-h-[600px] object-contain"
                  />
                )}
                {allImages.length > 1 && (
                  <>
                    <button
                      onClick={() => setSelectedImageIdx((i) => (i - 1 + allImages.length) % allImages.length)}
                      className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/60 text-white/80 hover:bg-black/80 transition-colors"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => setSelectedImageIdx((i) => (i + 1) % allImages.length)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/60 text-white/80 hover:bg-black/80 transition-colors"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                      {allImages.slice(0, 12).map((_, i) => (
                        <button
                          key={i}
                          onClick={() => setSelectedImageIdx(i)}
                          className={cn(
                            'w-2 h-2 rounded-full transition-colors',
                            i === selectedImageIdx ? 'bg-white' : 'bg-white/40'
                          )}
                        />
                      ))}
                      {allImages.length > 12 && (
                        <span className="text-xs text-white/60 ml-1">+{allImages.length - 12}</span>
                      )}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-muted-foreground">
                No preview available
              </div>
            )}
          </div>

          {/* Thumbnail strip */}
          {allImages.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-2">
              {allImages.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedImageIdx(i)}
                  className={cn(
                    'flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors',
                    i === selectedImageIdx ? 'border-primary' : 'border-transparent hover:border-white/20'
                  )}
                >
                  {img.type === 'video' ? (
                    <video src={img.url!} className="w-full h-full object-cover" muted playsInline preload="metadata" />
                  ) : (
                    <img src={img.url!} alt="" className="w-full h-full object-cover" loading="lazy" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Resize handle */}
        <div
          onMouseDown={onMouseDown}
          className="flex-shrink-0 w-1.5 cursor-col-resize group relative"
        >
          <div className="absolute inset-y-0 -left-1 -right-1" />
          <div className="h-full w-px mx-auto bg-border group-hover:bg-primary/50 transition-colors" />
        </div>

        {/* Right column — Details & Downloads */}
        <div className="flex-1 min-w-[380px] overflow-y-auto p-6 space-y-6">
          {/* Description */}
          {cleanDescription && (
            <div>
              <h3 className="text-sm font-medium text-white/70 mb-2 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" /> Description
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {cleanDescription}
              </p>
            </div>
          )}

          {/* Versions */}
          <div>
            <h3 className="text-sm font-medium text-white/70 mb-3">
              Versions ({model.modelVersions.length})
            </h3>
            <div className="space-y-2">
              {model.modelVersions.map((version) => {
                const file = version.files[0]
                const fileSizeMB = file?.sizeKB ? (file.sizeKB / 1024).toFixed(0) : null
                const downloaded = isVersionDownloaded(version.id)
                const job = getDownloadJob(version.id)
                const isDownloading = job?.status === 'downloading'
                const isQueued = job?.status === 'queued'

                return (
                  <div
                    key={version.id}
                    className="flex items-center justify-between gap-3 p-4 rounded-lg border border-white/5 bg-white/[0.02]"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white truncate">{version.name}</span>
                        {version.baseModel && (
                          <span className="flex-shrink-0 px-1.5 py-0.5 text-[10px] rounded bg-primary/20 text-primary">
                            {version.baseModel}
                          </span>
                        )}
                      </div>
                      {fileSizeMB && (
                        <span className="text-xs text-white/40 mt-0.5 block">
                          {file?.name || 'model file'} &middot; {fileSizeMB} MB
                        </span>
                      )}
                    </div>
                    <div className="flex-shrink-0">
                      {downloaded ? (
                        <span className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-green-500/10 text-green-400 border border-green-500/20">
                          <Check className="h-3.5 w-3.5" /> Downloaded
                        </span>
                      ) : isDownloading && job ? (
                        <div className="flex items-center gap-2 min-w-[160px]">
                          <div className="flex-1">
                            <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${job.progress}%` }} />
                            </div>
                          </div>
                          <span className="text-[10px] text-white/50 w-8 text-right">{job.progress.toFixed(0)}%</span>
                          <span className="text-[10px] text-white/40">{formatSpeed(job.speed_bytes_per_sec)}</span>
                          <button
                            onClick={() => cancelMutation.mutate(job.id)}
                            className="text-white/30 hover:text-red-400"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ) : isQueued ? (
                        <span className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-white/5 text-white/40">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Queued
                        </span>
                      ) : (
                        <button
                          onClick={() => handleDownloadVersion(model, version)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
                        >
                          <Download className="h-3.5 w-3.5" /> Download
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
