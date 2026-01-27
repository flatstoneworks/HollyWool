import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams, Link } from 'react-router-dom'
import { useUrlState, useUrlStateNumber } from '@/hooks/useUrlState'
import {
  ScrollText, Loader2, Trash2, CheckCircle, AlertCircle, Clock,
  Image as ImageIcon, Video, Wand2, Copy, ChevronLeft, ChevronRight, Download,
  ExternalLink,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { api, type RequestLog } from '@/api/client'

const STATUS_ICON: Record<string, typeof Clock> = {
  pending: Clock,
  generating: Loader2,
  downloading: Loader2,
  completed: CheckCircle,
  failed: AlertCircle,
}

const STATUS_COLOR: Record<string, string> = {
  pending: 'text-yellow-500',
  generating: 'text-blue-500',
  downloading: 'text-blue-500',
  completed: 'text-green-500',
  failed: 'text-red-500',
}

const TYPE_ICON: Record<string, typeof ImageIcon> = {
  image: ImageIcon,
  video: Video,
  i2v: Wand2,
  download: Download,
}

function formatDuration(ms: number | null) {
  if (!ms) return '-'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function formatDate(timestamp: string) {
  return new Date(timestamp).toLocaleString()
}

function getModelLink(log: RequestLog): string | null {
  const params = log.parameters as Record<string, unknown>

  if (log.type === 'download') {
    // CivitAI download
    const civitaiId = params?.civitai_model_id
    if (civitaiId) return `/models/civitai/${civitaiId}`
    // HuggingFace download
    const modelId = params?.model_id
    if (modelId) return `/model/${modelId}`
    return null
  }

  // Image / video / i2v generation logs — model field is the model ID
  if (log.model.startsWith('civitai-')) {
    // Format: civitai-<modelId>-v<versionId>
    const match = log.model.match(/^civitai-(\d+)-v\d+$/)
    if (match) return `/models/civitai/${match[1]}`
  }

  // Local model
  return `/model/${log.model}`
}

export default function RequestLogsPage() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedLog, setSelectedLog] = useState<RequestLog | null>(null)
  const [page, setPage] = useUrlStateNumber('page', 1)
  const [typeFilter, setTypeFilter] = useUrlState('type', 'all')
  const [statusFilter, setStatusFilter] = useUrlState('status', 'all')

  // Deep-link: ?selected=<logId> auto-selects a specific log
  const selectedParam = searchParams.get('selected')

  const { data: deepLinkedLog } = useQuery({
    queryKey: ['request-log', selectedParam],
    queryFn: () => api.getRequestLog(selectedParam!),
    enabled: !!selectedParam,
  })

  useEffect(() => {
    if (deepLinkedLog && selectedParam) {
      setSelectedLog(deepLinkedLog)
      // Clear the selected param so it doesn't re-trigger on refetch
      const next = new URLSearchParams(searchParams)
      next.delete('selected')
      setSearchParams(next, { replace: true })
    }
  }, [deepLinkedLog, selectedParam, searchParams, setSearchParams])

  const apiTypeFilter = typeFilter === 'all' ? undefined : typeFilter
  const apiStatusFilter = statusFilter === 'all' ? undefined : statusFilter

  const { data: logsData, isLoading } = useQuery({
    queryKey: ['request-logs', page, typeFilter, statusFilter],
    queryFn: () => api.getRequestLogs({ page, page_size: 50, type: apiTypeFilter, status: apiStatusFilter }),
    refetchInterval: 5000,
  })

  const clearLogs = useMutation({
    mutationFn: api.clearRequestLogs,
    meta: { successMessage: 'Logs cleared', errorMessage: 'Failed to clear logs' },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['request-logs'] })
      setSelectedLog(null)
    },
  })

  const deleteLog = useMutation({
    mutationFn: api.deleteRequestLog,
    meta: { successMessage: 'Log deleted', errorMessage: 'Delete failed' },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['request-logs'] })
      setSelectedLog(null)
    },
  })

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const totalPages = Math.ceil((logsData?.total || 0) / 50)

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
        <div>
          <h1 className="text-xl font-semibold">Request Logs</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {logsData?.total ?? 0} total logs
          </p>
        </div>
        <button
          onClick={() => clearLogs.mutate()}
          disabled={clearLogs.isPending || !logsData?.logs.length}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-destructive/10 text-destructive hover:bg-destructive/20 rounded-lg transition-colors disabled:opacity-50"
        >
          {clearLogs.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          Clear All
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 px-6 py-3 border-b border-border flex-shrink-0">
        <div className="flex gap-1.5">
          {['all', 'image', 'video', 'i2v', 'download'].map((type) => (
            <button
              key={type}
              onClick={() => { setTypeFilter(type); setPage(1) }}
              className={cn(
                'px-3 py-1.5 text-sm rounded-lg transition-colors',
                typeFilter === type
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent'
              )}
            >
              {type === 'all' ? 'All' : type === 'i2v' ? 'I2V' : type === 'download' ? 'Download' : type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>
        <div className="w-px h-5 bg-border" />
        <div className="flex gap-1.5">
          {['all', 'completed', 'failed', 'generating', 'downloading', 'pending'].map((status) => (
            <button
              key={status}
              onClick={() => { setStatusFilter(status); setPage(1) }}
              className={cn(
                'px-3 py-1.5 text-sm rounded-lg transition-colors',
                statusFilter === status
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent'
              )}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Main content: list + detail split */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Log List */}
        <div className="w-[400px] flex-shrink-0 border-r border-border flex flex-col">
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !logsData?.logs.length ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <ScrollText className="h-12 w-12 mb-3 opacity-40" />
                <p className="font-medium">No logs yet</p>
                <p className="text-sm mt-1">Generate some images or videos to see logs here</p>
              </div>
            ) : (
              <div>
                {logsData.logs.map((log) => {
                  const TypeIcon = TYPE_ICON[log.type] || ImageIcon
                  const StatusIcon = STATUS_ICON[log.status] || Clock
                  const statusColor = STATUS_COLOR[log.status] || 'text-yellow-500'
                  return (
                    <button
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      className={cn(
                        'w-full text-left p-4 border-b border-border hover:bg-accent/50 transition-colors',
                        selectedLog?.id === log.id && 'bg-accent'
                      )}
                    >
                      <div className="flex items-center gap-2.5 mb-1.5">
                        <TypeIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="font-medium text-sm truncate flex-1">{log.model}</span>
                        <StatusIcon className={cn('h-4 w-4 flex-shrink-0', statusColor, (log.status === 'generating' || log.status === 'downloading') && 'animate-spin')} />
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-1 mb-1.5">{log.prompt}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground/70">
                        <span>{formatDate(log.timestamp)}</span>
                        {log.duration_ms != null && (
                          <>
                            <span className="text-muted-foreground/30">&middot;</span>
                            <span>{formatDuration(log.duration_ms)}</span>
                          </>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="border-t border-border px-4 py-2 flex items-center justify-between text-sm flex-shrink-0">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="p-1.5 hover:bg-accent rounded disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-muted-foreground text-xs">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
                className="p-1.5 hover:bg-accent rounded disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* Detail Panel */}
        <div className="flex-1 overflow-hidden">
          {selectedLog ? (
            <div className="h-full flex flex-col">
              {/* Detail header */}
              <div className="px-6 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-3">
                  {(() => {
                    const TypeIcon = TYPE_ICON[selectedLog.type] || ImageIcon
                    const StatusIcon = STATUS_ICON[selectedLog.status] || Clock
                    const statusColor = STATUS_COLOR[selectedLog.status] || 'text-yellow-500'
                    return (
                      <>
                        <TypeIcon className="h-5 w-5 text-muted-foreground" />
                        {(() => {
                          const link = getModelLink(selectedLog)
                          return link ? (
                            <Link to={link} className="font-semibold hover:text-primary transition-colors">
                              {selectedLog.model}
                            </Link>
                          ) : (
                            <span className="font-semibold">{selectedLog.model}</span>
                          )
                        })()}
                        <span className={cn('flex items-center gap-1 text-sm', statusColor)}>
                          <StatusIcon className={cn('h-4 w-4', (selectedLog.status === 'generating' || selectedLog.status === 'downloading') && 'animate-spin')} />
                          {selectedLog.status}
                        </span>
                      </>
                    )
                  })()}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => copyToClipboard(selectedLog.prompt)}
                    className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    title="Copy prompt"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => deleteLog.mutate(selectedLog.id)}
                    className="p-2 rounded-lg text-destructive hover:bg-destructive/10 transition-colors"
                    title="Delete log"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Detail content */}
              <div className="flex-1 overflow-y-auto scrollbar-thin p-6 space-y-6">
                {/* Overview grid */}
                <section>
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Overview</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-muted-foreground">Type</label>
                      <p className="text-sm mt-0.5 capitalize">{selectedLog.type}</p>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Model</label>
                      {(() => {
                        const link = getModelLink(selectedLog)
                        return link ? (
                          <Link to={link} className="text-sm mt-0.5 text-primary hover:underline flex items-center gap-1 w-fit">
                            {selectedLog.model}
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        ) : (
                          <p className="text-sm mt-0.5">{selectedLog.model}</p>
                        )
                      })()}
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Timestamp</label>
                      <p className="text-sm mt-0.5">{formatDate(selectedLog.timestamp)}</p>
                    </div>
                    {selectedLog.duration_ms != null && (
                      <div>
                        <label className="text-xs text-muted-foreground">Duration</label>
                        <p className="text-sm mt-0.5">{formatDuration(selectedLog.duration_ms)}</p>
                      </div>
                    )}
                    {selectedLog.result_id && (
                      <div className="col-span-2">
                        <label className="text-xs text-muted-foreground">Result ID</label>
                        <p className="text-sm mt-0.5 font-mono text-muted-foreground">{selectedLog.result_id}</p>
                      </div>
                    )}
                  </div>
                </section>

                {/* Error */}
                {selectedLog.error && (
                  <section className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                    <h3 className="text-xs font-medium text-destructive uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5" />
                      Error
                    </h3>
                    <pre className="text-sm text-destructive whitespace-pre-wrap font-mono">{selectedLog.error}</pre>
                  </section>
                )}

                {/* Prompt */}
                <section>
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Prompt</h3>
                  <pre className="text-sm bg-muted/50 p-4 rounded-lg whitespace-pre-wrap font-mono leading-relaxed">{selectedLog.prompt}</pre>
                </section>

                {/* Negative Prompt */}
                {selectedLog.negative_prompt && (
                  <section>
                    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Negative Prompt</h3>
                    <pre className="text-sm bg-muted/50 p-4 rounded-lg whitespace-pre-wrap font-mono leading-relaxed">{selectedLog.negative_prompt}</pre>
                  </section>
                )}

                {/* Parameters */}
                <section>
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Parameters</h3>
                  <pre className="text-sm bg-muted/50 p-4 rounded-lg whitespace-pre-wrap font-mono leading-relaxed">
                    {JSON.stringify(selectedLog.parameters, null, 2)}
                  </pre>
                </section>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
              <ScrollText className="h-12 w-12 mb-3 opacity-40" />
              <p className="font-medium">Select a log to view details</p>
              <p className="text-sm mt-1">Click on any log entry in the list</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
