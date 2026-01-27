import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Loader2, Download, Copy, Trash2 } from 'lucide-react'
import { api, type Asset, type VideoAsset } from '@/api/client'
import { toast } from '@/hooks/use-toast'

type AssetType = 'image' | 'video'

function AssetDetail({ type }: { type: AssetType }) {
  const { assetId } = useParams<{ assetId: string }>()
  const navigate = useNavigate()
  const isVideo = type === 'video'

  const { data: asset, isLoading } = useQuery({
    queryKey: [isVideo ? 'video-asset' : 'asset', assetId],
    queryFn: () => isVideo ? api.getVideoAsset(assetId!) : api.getAsset(assetId!) as Promise<Asset | VideoAsset>,
    enabled: !!assetId,
  })

  // Type-narrow for video-specific fields
  const videoAsset = isVideo ? (asset as VideoAsset | undefined) : undefined

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-black">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!asset) {
    return (
      <div className="h-screen flex items-center justify-center bg-black text-white">
        <p>{isVideo ? 'Video asset' : 'Asset'} not found</p>
      </div>
    )
  }

  const handleDownload = async () => {
    const response = await fetch(asset.url)
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const ext = isVideo ? 'mp4' : 'png'
    a.download = `${asset.prompt.slice(0, 30).replace(/[^a-z0-9]/gi, '_')}_${asset.seed}.${ext}`
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
  }

  const handleDelete = async () => {
    const label = isVideo ? 'video' : 'image'
    if (confirm(`Delete this ${label}?`)) {
      try {
        if (isVideo) {
          await api.deleteVideoAsset(asset.id)
        } else {
          await api.deleteAsset(asset.id)
        }
        toast({ title: `${isVideo ? 'Video' : 'Image'} deleted`, variant: 'success' })
        navigate(-1)
      } catch (err) {
        toast({ title: 'Delete failed', description: (err as Error).message, variant: 'destructive' })
      }
    }
  }

  return (
    <div className="h-screen bg-black flex">
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="absolute top-4 left-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors z-10"
      >
        <ArrowLeft className="h-6 w-6 text-white" />
      </button>

      {/* Main media area */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        {isVideo ? (
          <video
            src={asset.url}
            controls
            autoPlay
            className="max-w-full max-h-[80vh] rounded-xl"
          />
        ) : (
          <img
            src={asset.url}
            alt={asset.prompt}
            className="max-w-full max-h-[80vh] object-contain rounded-xl"
          />
        )}
        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={handleDownload}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
            title="Download"
          >
            <Download className="h-5 w-5 text-white" />
          </button>
          <button
            onClick={() => navigator.clipboard.writeText(asset.seed.toString())}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
            title="Copy seed"
          >
            <Copy className="h-5 w-5 text-white" />
          </button>
          <button
            onClick={handleDelete}
            className="p-2 rounded-lg bg-white/10 hover:bg-red-500/50 transition-colors"
            title="Delete"
          >
            <Trash2 className="h-5 w-5 text-white" />
          </button>
        </div>
      </div>

      {/* Details sidebar */}
      <div className="w-[320px] h-full bg-[#111] border-l border-white/10 p-6 overflow-y-auto flex-shrink-0">
        <div className="mb-6">
          <h3 className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Prompt</h3>
          <p className="text-sm text-white/80 leading-relaxed">{asset.prompt}</p>
        </div>
        {'negative_prompt' in asset && asset.negative_prompt && (
          <div className="mb-6">
            <h3 className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Negative Prompt</h3>
            <p className="text-sm text-white/60">{asset.negative_prompt}</p>
          </div>
        )}
        <div className="space-y-4">
          <h3 className="text-xs font-medium text-white/40 uppercase tracking-wider">Details</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-xs text-white/40">Model</span>
              <p className="text-sm text-white/80">{asset.model}</p>
            </div>
            <div>
              <span className="text-xs text-white/40">Size</span>
              <p className="text-sm text-white/80">{asset.width} x {asset.height}</p>
            </div>
            {videoAsset && (
              <>
                <div>
                  <span className="text-xs text-white/40">Duration</span>
                  <p className="text-sm text-white/80">{videoAsset.duration.toFixed(1)}s</p>
                </div>
                <div>
                  <span className="text-xs text-white/40">FPS</span>
                  <p className="text-sm text-white/80">{videoAsset.fps}</p>
                </div>
                <div>
                  <span className="text-xs text-white/40">Frames</span>
                  <p className="text-sm text-white/80">{videoAsset.num_frames}</p>
                </div>
              </>
            )}
            {!isVideo && (
              <div>
                <span className="text-xs text-white/40">Guidance</span>
                <p className="text-sm text-white/80">{(asset as Asset).guidance_scale}</p>
              </div>
            )}
            <div>
              <span className="text-xs text-white/40">Steps</span>
              <p className="text-sm text-white/80">{asset.steps}</p>
            </div>
          </div>
          <div>
            <span className="text-xs text-white/40">Seed</span>
            <p className="text-sm text-white/80 font-mono">{asset.seed}</p>
          </div>
          <div>
            <span className="text-xs text-white/40">Created</span>
            <p className="text-sm text-white/80">{new Date(asset.created_at).toLocaleString()}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export function AssetDetailPage() {
  return <AssetDetail type="image" />
}

export function VideoAssetDetailPage() {
  return <AssetDetail type="video" />
}
