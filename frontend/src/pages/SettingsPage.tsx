import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Settings, ScrollText, Info, Cpu, Palette, ChevronLeft, ChevronRight,
  Loader2, Trash2, CheckCircle, AlertCircle, Sun, Moon, Monitor,
  Image as ImageIcon, Video, Wand2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { api, AppSettings, RequestLog, SystemInfo, ThemeOption } from '@/api/client'
import { useTheme } from '@/contexts/ThemeContext'

type SettingsSection = 'appearance' | 'logs' | 'system' | 'about'

const sections: { id: SettingsSection; label: string; icon: typeof Settings }[] = [
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'logs', label: 'Request Logs', icon: ScrollText },
  { id: 'system', label: 'System', icon: Cpu },
  { id: 'about', label: 'About', icon: Info },
]

export default function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const currentSection = (searchParams.get('section') as SettingsSection) || 'appearance'
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const queryClient = useQueryClient()

  const setSection = (section: SettingsSection) => {
    setSearchParams({ section })
  }

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div
        className={cn(
          'flex flex-col border-r border-border bg-card transition-all duration-200',
          sidebarCollapsed ? 'w-14' : 'w-56'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          {!sidebarCollapsed && (
            <h2 className="text-sm font-medium">Settings</h2>
          )}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className={cn("p-1 hover:bg-accent rounded", sidebarCollapsed && "mx-auto")}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2 space-y-1">
          {sections.map((section) => {
            const Icon = section.icon
            return (
              <button
                key={section.id}
                onClick={() => setSection(section.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                  currentSection === section.id
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!sidebarCollapsed && <span>{section.label}</span>}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-6">
          {currentSection === 'appearance' && <AppearanceSection />}
          {currentSection === 'logs' && <LogsSection />}
          {currentSection === 'system' && <SystemSection />}
          {currentSection === 'about' && <AboutSection />}
        </div>
      </div>
    </div>
  )
}

// ============== Appearance Section ==============
function AppearanceSection() {
  const { theme, setTheme } = useTheme()
  const queryClient = useQueryClient()

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: api.getSettings,
  })

  const updateSettings = useMutation({
    mutationFn: api.updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
  })

  const themeOptions: { value: ThemeOption; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
  ]

  const handleThemeChange = (newTheme: ThemeOption) => {
    setTheme(newTheme)
    if (settings) {
      updateSettings.mutate({ ...settings, theme: newTheme })
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Appearance</h2>
        <p className="text-sm text-muted-foreground mt-1">Customize the look and feel of the application</p>
      </div>

      {/* Theme Selection */}
      <div className="bg-card rounded-lg border border-border p-4">
        <h3 className="font-medium mb-4">Theme</h3>
        <div className="flex gap-2">
          {themeOptions.map((option) => {
            const Icon = option.icon
            const isSelected = theme === option.value
            return (
              <button
                key={option.value}
                onClick={() => handleThemeChange(option.value)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors',
                  isSelected
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background border-border hover:bg-accent'
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{option.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Additional Settings */}
      <div className="bg-card rounded-lg border border-border p-4">
        <h3 className="font-medium mb-4">Preferences</h3>
        <div className="space-y-4">
          <label className="flex items-center justify-between">
            <div>
              <div className="font-medium text-sm">Auto-save History</div>
              <div className="text-xs text-muted-foreground">Automatically save generation history</div>
            </div>
            <input
              type="checkbox"
              checked={settings?.auto_save_history ?? true}
              onChange={(e) => {
                if (settings) {
                  updateSettings.mutate({ ...settings, auto_save_history: e.target.checked })
                }
              }}
              className="h-4 w-4 rounded border-border"
            />
          </label>

          <div>
            <label className="block">
              <div className="font-medium text-sm">Max Log Entries</div>
              <div className="text-xs text-muted-foreground mb-2">Maximum number of request logs to keep</div>
              <input
                type="number"
                min={100}
                max={10000}
                value={settings?.max_log_entries ?? 1000}
                onChange={(e) => {
                  if (settings) {
                    updateSettings.mutate({ ...settings, max_log_entries: parseInt(e.target.value) || 1000 })
                  }
                }}
                className="w-32 px-3 py-2 bg-background border border-border rounded-md text-sm"
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============== Logs Section ==============
function LogsSection() {
  const [selectedLog, setSelectedLog] = useState<RequestLog | null>(null)
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState<string | undefined>(undefined)
  const queryClient = useQueryClient()

  const { data: logsData, isLoading, refetch } = useQuery({
    queryKey: ['request-logs', page, typeFilter],
    queryFn: () => api.getRequestLogs({ page, page_size: 50, type: typeFilter }),
    refetchInterval: 5000,
  })

  const clearLogs = useMutation({
    mutationFn: api.clearRequestLogs,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['request-logs'] })
      setSelectedLog(null)
    },
  })

  const deleteLog = useMutation({
    mutationFn: api.deleteRequestLog,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['request-logs'] })
      setSelectedLog(null)
    },
  })

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'image': return <ImageIcon className="h-4 w-4" />
      case 'video': return <Video className="h-4 w-4" />
      case 'i2v': return <Wand2 className="h-4 w-4" />
      default: return <ImageIcon className="h-4 w-4" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-500'
      case 'failed': return 'text-red-500'
      case 'generating': return 'text-blue-500'
      default: return 'text-yellow-500'
    }
  }

  const formatDuration = (ms: number | null) => {
    if (!ms) return '-'
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleString()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Request Logs</h2>
          <p className="text-sm text-muted-foreground mt-1">
            View history of all generation requests ({logsData?.total ?? 0} total)
          </p>
        </div>
        <button
          onClick={() => clearLogs.mutate()}
          disabled={clearLogs.isPending || !logsData?.logs.length}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-destructive/10 text-destructive hover:bg-destructive/20 rounded-lg disabled:opacity-50"
        >
          {clearLogs.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          Clear All
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {['all', 'image', 'video', 'i2v'].map((type) => (
          <button
            key={type}
            onClick={() => setTypeFilter(type === 'all' ? undefined : type)}
            className={cn(
              'px-3 py-1.5 text-sm rounded-lg transition-colors',
              (type === 'all' && !typeFilter) || typeFilter === type
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-accent'
            )}
          >
            {type === 'all' ? 'All' : type.charAt(0).toUpperCase() + type.slice(1)}
          </button>
        ))}
      </div>

      <div className="flex gap-4 h-[600px]">
        {/* Log List */}
        <div className="w-96 bg-card rounded-lg border border-border overflow-hidden flex flex-col">
          <div className="flex-1 overflow-auto">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !logsData?.logs.length ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <ScrollText className="h-12 w-12 mb-2 opacity-50" />
                <p>No logs yet</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {logsData.logs.map((log) => (
                  <button
                    key={log.id}
                    onClick={() => setSelectedLog(log)}
                    className={cn(
                      'w-full text-left p-3 hover:bg-accent/50 transition-colors',
                      selectedLog?.id === log.id && 'bg-accent'
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {getTypeIcon(log.type)}
                      <span className="font-medium text-sm truncate flex-1">{log.model}</span>
                      <span className={cn('text-xs', getStatusColor(log.status))}>
                        {log.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1">{log.prompt}</p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <span>{formatDate(log.timestamp)}</span>
                      {log.duration_ms && <span>({formatDuration(log.duration_ms)})</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Pagination */}
          {logsData && logsData.total > 50 && (
            <div className="border-t border-border p-2 flex items-center justify-between text-sm">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-2 py-1 hover:bg-accent rounded disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-muted-foreground">
                Page {page} of {Math.ceil(logsData.total / 50)}
              </span>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={page * 50 >= logsData.total}
                className="px-2 py-1 hover:bg-accent rounded disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </div>

        {/* Log Details */}
        <div className="flex-1 bg-card rounded-lg border border-border overflow-hidden">
          {selectedLog ? (
            <div className="h-full flex flex-col">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getTypeIcon(selectedLog.type)}
                  <span className="font-medium">{selectedLog.model}</span>
                  <span className={cn('text-sm', getStatusColor(selectedLog.status))}>
                    {selectedLog.status === 'completed' && <CheckCircle className="h-4 w-4 inline mr-1" />}
                    {selectedLog.status === 'failed' && <AlertCircle className="h-4 w-4 inline mr-1" />}
                    {selectedLog.status}
                  </span>
                </div>
                <button
                  onClick={() => deleteLog.mutate(selectedLog.id)}
                  className="p-2 hover:bg-destructive/10 text-destructive rounded"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 overflow-auto p-4 space-y-4">
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground uppercase mb-1">Timestamp</h4>
                  <p className="text-sm">{formatDate(selectedLog.timestamp)}</p>
                </div>

                {selectedLog.duration_ms && (
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground uppercase mb-1">Duration</h4>
                    <p className="text-sm">{formatDuration(selectedLog.duration_ms)}</p>
                  </div>
                )}

                <div>
                  <h4 className="text-xs font-medium text-muted-foreground uppercase mb-1">Prompt</h4>
                  <pre className="text-sm bg-muted/50 p-3 rounded-lg whitespace-pre-wrap font-mono">{selectedLog.prompt}</pre>
                </div>

                {selectedLog.negative_prompt && (
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground uppercase mb-1">Negative Prompt</h4>
                    <pre className="text-sm bg-muted/50 p-3 rounded-lg whitespace-pre-wrap font-mono">{selectedLog.negative_prompt}</pre>
                  </div>
                )}

                <div>
                  <h4 className="text-xs font-medium text-muted-foreground uppercase mb-1">Parameters</h4>
                  <pre className="text-sm bg-muted/50 p-3 rounded-lg whitespace-pre-wrap font-mono">
                    {JSON.stringify(selectedLog.parameters, null, 2)}
                  </pre>
                </div>

                {selectedLog.error && (
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground uppercase mb-1">Error</h4>
                    <pre className="text-sm bg-red-500/10 text-red-500 p-3 rounded-lg whitespace-pre-wrap font-mono">
                      {selectedLog.error}
                    </pre>
                  </div>
                )}

                {selectedLog.result_id && (
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground uppercase mb-1">Result ID</h4>
                    <p className="text-sm font-mono">{selectedLog.result_id}</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
              <ScrollText className="h-12 w-12 mb-2 opacity-50" />
              <p>Select a log to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ============== System Section ==============
function SystemSection() {
  const { data: systemInfo, isLoading } = useQuery({
    queryKey: ['system-info'],
    queryFn: api.getSystemInfo,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">System Information</h2>
        <p className="text-sm text-muted-foreground mt-1">Technical details about your system</p>
      </div>

      <div className="grid gap-4">
        {/* GPU Info */}
        <div className="bg-card rounded-lg border border-border p-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              'w-10 h-10 rounded-lg flex items-center justify-center',
              systemInfo?.cuda_available ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
            )}>
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <div className="font-medium">
                {systemInfo?.cuda_available ? 'CUDA Available' : 'CPU Mode'}
              </div>
              <div className="text-sm text-muted-foreground">
                {systemInfo?.gpu_name || 'No GPU detected'}
                {systemInfo?.gpu_memory_gb && ` (${systemInfo.gpu_memory_gb} GB)`}
              </div>
            </div>
          </div>
        </div>

        {/* Version Info */}
        <div className="bg-card rounded-lg border border-border p-4">
          <h3 className="font-medium mb-3">Software Versions</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">HollyWool:</span>
              <span className="ml-2 font-mono">{systemInfo?.version}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Python:</span>
              <span className="ml-2 font-mono">{systemInfo?.python_version}</span>
            </div>
            {systemInfo?.torch_version && (
              <div>
                <span className="text-muted-foreground">PyTorch:</span>
                <span className="ml-2 font-mono">{systemInfo.torch_version}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ============== About Section ==============
function AboutSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">About HollyWool</h2>
        <p className="text-sm text-muted-foreground mt-1">Local AI image and video generation</p>
      </div>

      <div className="bg-card rounded-lg border border-border p-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <Wand2 className="h-8 w-8 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">HollyWool</h3>
            <p className="text-sm text-muted-foreground">Version 1.0.0</p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          HollyWool is a local AI-powered image and video generation application.
          Generate stunning images using Stable Diffusion models and create videos
          with state-of-the-art video generation models, all running locally on your machine.
        </p>

        <div className="space-y-2">
          <h4 className="font-medium text-sm">Features</h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              Local image generation with Stable Diffusion
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              Video generation with LTX-Video
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              Image-to-video conversion
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              LoRA support for custom styles
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              Session management and history
            </li>
          </ul>
        </div>
      </div>

      <div className="bg-card rounded-lg border border-border p-4">
        <h4 className="font-medium mb-2">Tech Stack</h4>
        <div className="flex flex-wrap gap-2">
          {['React', 'TypeScript', 'FastAPI', 'PyTorch', 'Diffusers', 'Tailwind CSS'].map((tech) => (
            <span key={tech} className="px-2 py-1 bg-muted rounded text-xs">
              {tech}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
