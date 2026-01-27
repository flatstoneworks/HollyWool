import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Settings, Info, Cpu, Palette,
  Loader2, CheckCircle, Sun, Moon, Monitor, Wand2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { api, ThemeOption } from '@/api/client'
import { useTheme } from '@/contexts/ThemeContext'

type SettingsSection = 'appearance' | 'system' | 'about'

const sections: { id: SettingsSection; label: string; icon: typeof Settings }[] = [
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'system', label: 'System', icon: Cpu },
  { id: 'about', label: 'About', icon: Info },
]

export default function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const currentSection = (searchParams.get('section') as SettingsSection) || 'appearance'

  const setSection = (section: SettingsSection) => {
    setSearchParams({ section })
  }

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="flex flex-col border-r border-border bg-card w-56">
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
                <span>{section.label}</span>
              </button>
            )
          })}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-6">
          {currentSection === 'appearance' && <AppearanceSection />}
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

  const { data: settings } = useQuery({
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
