import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Loader2, Trash2, Copy, X, ChevronLeft, ChevronRight,
  Search, Home, Wand2, ChevronDown, ChevronUp, Download,
  MessageSquare, GripVertical
} from 'lucide-react'
import { api, type Asset } from '@/api/client'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const MIN_SIDEBAR_WIDTH = 200
const MAX_SIDEBAR_WIDTH = 350
const DEFAULT_SIDEBAR_WIDTH = 256

export function GalleryPage() {
  const queryClient = useQueryClient()
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedFilter, setSelectedFilter] = useState<string>('all')
  const [showAllModels, setShowAllModels] = useState(false)

  // Resizable sidebar
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH)
  const [isResizing, setIsResizing] = useState(false)
  const sidebarRef = useRef<HTMLDivElement>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['assets'],
    queryFn: () => api.getAssets({ limit: 100 }),
  })

  const deleteMutation = useMutation({
    mutationFn: api.deleteAsset,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] })
      setSelectedAsset(null)
    },
  })

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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
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

  const navigateAsset = (direction: 'prev' | 'next') => {
    if (!selectedAsset || !data?.assets) return
    const currentIndex = data.assets.findIndex((a) => a.id === selectedAsset.id)
    if (currentIndex === -1) return

    const newIndex = direction === 'prev'
      ? (currentIndex - 1 + data.assets.length) % data.assets.length
      : (currentIndex + 1) % data.assets.length

    setSelectedAsset(data.assets[newIndex] ?? null)
  }

  // Keyboard navigation for lightbox
  useEffect(() => {
    if (!selectedAsset) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        navigateAsset('prev')
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        navigateAsset('next')
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setSelectedAsset(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedAsset, data?.assets])

  // Compute model counts and filtered assets
  const { modelCounts, filteredAssets } = useMemo(() => {
    const assets = data?.assets || []
    const counts: Record<string, number> = {}

    // Count assets per model
    assets.forEach(asset => {
      counts[asset.model] = (counts[asset.model] || 0) + 1
    })

    // Filter assets based on search and selected filter
    let filtered = assets

    // Apply model filter
    if (selectedFilter !== 'all') {
      filtered = filtered.filter(a => a.model === selectedFilter)
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(a =>
        a.prompt.toLowerCase().includes(query) ||
        a.model.toLowerCase().includes(query)
      )
    }

    return { modelCounts: counts, filteredAssets: filtered }
  }, [data?.assets, selectedFilter, searchQuery])

  // Get sorted models for sidebar
  const sortedModels = useMemo(() => {
    return Object.entries(modelCounts)
      .sort((a, b) => b[1] - a[1])
  }, [modelCounts])

  const visibleModels = showAllModels ? sortedModels : sortedModels.slice(0, 5)

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!data?.assets.length) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-full text-muted-foreground">
        <p className="text-lg">No images generated yet</p>
        <p className="text-sm">Go to Generate to create your first image</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex h-full overflow-hidden">
      {/* Sidebar */}
      <aside
        ref={sidebarRef}
        style={{ width: sidebarWidth }}
        className="h-full border-r border-white/5 flex flex-col bg-black/20 flex-shrink-0 relative"
      >
        {/* Search */}
        <div className="p-3 border-b border-white/5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
            <input
              type="text"
              placeholder="Search assets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-white/20"
            />
          </div>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-2">
          {/* All */}
          <button
            onClick={() => setSelectedFilter('all')}
            className={cn(
              'w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors',
              selectedFilter === 'all'
                ? 'bg-primary/20 text-primary'
                : 'text-white/70 hover:bg-white/5'
            )}
          >
            <div className="flex items-center gap-3">
              <Home className="h-4 w-4" />
              <span>All</span>
            </div>
            <span className={cn(
              'text-xs px-2 py-0.5 rounded-full',
              selectedFilter === 'all' ? 'bg-primary/30' : 'bg-white/10'
            )}>
              {data.assets.length}
            </span>
          </button>

          {/* Models section */}
          <div className="mt-4">
            <div className="px-3 py-2 text-xs font-medium text-white/40 uppercase tracking-wider">
              Models
            </div>
            <div className="space-y-0.5">
              {visibleModels.map(([model, count]) => (
                <button
                  key={model}
                  onClick={() => setSelectedFilter(model)}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors',
                    selectedFilter === model
                      ? 'bg-primary/20 text-primary'
                      : 'text-white/70 hover:bg-white/5'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Wand2 className="h-4 w-4" />
                    <span className="truncate">{model}</span>
                  </div>
                  <span className={cn(
                    'text-xs px-2 py-0.5 rounded-full flex-shrink-0',
                    selectedFilter === model ? 'bg-primary/30' : 'bg-white/10'
                  )}>
                    {count}
                  </span>
                </button>
              ))}
            </div>

            {/* Show more/less */}
            {sortedModels.length > 5 && (
              <button
                onClick={() => setShowAllModels(!showAllModels)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white/50 hover:text-white/70 transition-colors"
              >
                {showAllModels ? (
                  <>
                    <ChevronUp className="h-4 w-4" />
                    <span>Show less</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4" />
                    <span>Show more ({sortedModels.length - 5})</span>
                  </>
                )}
              </button>
            )}
          </div>
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

      {/* Main Gallery Grid */}
      <div className="flex-1 h-full overflow-y-auto">
        <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filteredAssets.map((asset) => (
          <Card
            key={asset.id}
            className="aspect-square overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary transition-all"
            onClick={() => setSelectedAsset(asset)}
          >
            <img
              src={asset.url}
              alt={asset.prompt}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </Card>
        ))}
        </div>
      </div>

      {/* Lightbox */}
      {selectedAsset && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex"
          onClick={() => setSelectedAsset(null)}
        >
          {/* Close button */}
          <button
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors z-10"
            onClick={() => setSelectedAsset(null)}
          >
            <X className="h-6 w-6" />
          </button>

          {/* Navigation buttons */}
          <button
            className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors z-10"
            onClick={(e) => { e.stopPropagation(); navigateAsset('prev') }}
          >
            <ChevronLeft className="h-6 w-6" />
          </button>

          <button
            className="absolute right-[340px] top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors z-10"
            onClick={(e) => { e.stopPropagation(); navigateAsset('next') }}
          >
            <ChevronRight className="h-6 w-6" />
          </button>

          {/* Main image area */}
          <div className="flex-1 flex flex-col items-center justify-center p-8" onClick={(e) => e.stopPropagation()}>
            <img
              src={selectedAsset.url}
              alt={selectedAsset.prompt}
              className="max-w-full max-h-[80vh] object-contain rounded-xl"
            />

            {/* Action buttons below image */}
            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={() => handleDownload(selectedAsset)}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                title="Download"
              >
                <Download className="h-5 w-5" />
              </button>
              <button
                onClick={() => copyToClipboard(selectedAsset.seed.toString())}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                title="Copy seed"
              >
                <Copy className="h-5 w-5" />
              </button>
              <button
                onClick={() => copyToClipboard(selectedAsset.prompt)}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                title="Copy prompt"
              >
                <MessageSquare className="h-5 w-5" />
              </button>
              <button
                onClick={() => {
                  if (confirm('Delete this image?')) {
                    deleteMutation.mutate(selectedAsset.id)
                  }
                }}
                className="p-2 rounded-lg bg-white/10 hover:bg-red-500/50 transition-colors"
                title="Delete"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Details sidebar */}
          <div
            className="w-[320px] h-full bg-[#111] border-l border-white/10 p-6 overflow-y-auto flex-shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Prompt */}
            <div className="mb-6">
              <h3 className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Prompt</h3>
              <p className="text-sm text-white/80 leading-relaxed">{selectedAsset.prompt}</p>
            </div>

            {/* Negative Prompt */}
            {selectedAsset.negative_prompt && (
              <div className="mb-6">
                <h3 className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Negative Prompt</h3>
                <p className="text-sm text-white/60">{selectedAsset.negative_prompt}</p>
              </div>
            )}

            {/* Details grid */}
            <div className="space-y-4">
              <h3 className="text-xs font-medium text-white/40 uppercase tracking-wider">Details</h3>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-xs text-white/40">Model</span>
                  <p className="text-sm text-white/80">{selectedAsset.model}</p>
                </div>
                <div>
                  <span className="text-xs text-white/40">Size</span>
                  <p className="text-sm text-white/80">{selectedAsset.width} × {selectedAsset.height}</p>
                </div>
                <div>
                  <span className="text-xs text-white/40">Steps</span>
                  <p className="text-sm text-white/80">{selectedAsset.steps}</p>
                </div>
                <div>
                  <span className="text-xs text-white/40">Guidance</span>
                  <p className="text-sm text-white/80">{selectedAsset.guidance_scale}</p>
                </div>
              </div>

              <div>
                <span className="text-xs text-white/40">Seed</span>
                <p className="text-sm text-white/80 font-mono">{selectedAsset.seed}</p>
              </div>

              <div>
                <span className="text-xs text-white/40">Created</span>
                <p className="text-sm text-white/80">{new Date(selectedAsset.created_at).toLocaleString()}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
