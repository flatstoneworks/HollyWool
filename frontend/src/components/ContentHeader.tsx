import { useQuery } from '@tanstack/react-query'
import { Monitor, Cpu } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/api/client'
import { HoverCard, HoverCardTrigger, HoverCardContent } from './ui/hover-card'
import { NotificationsButton } from './NotificationsButton'

export function ContentHeader() {
  const { data: systemInfo } = useQuery({
    queryKey: ['system-info'],
    queryFn: api.getSystemInfo,
    staleTime: 60_000,
  })

  const appName = systemInfo?.app_name || 'HollyWool'
  const deviceType = systemInfo?.device_type
  const computeMode = systemInfo?.compute_mode

  return (
    <header className="h-12 flex-shrink-0 flex items-center justify-between px-4 relative z-40 border-b border-border bg-background">
      {/* Left side - App name + system info */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-foreground">{appName}</span>
        {deviceType && computeMode && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="text-muted-foreground/30">|</span>

            <HoverCard openDelay={200} closeDelay={100}>
              <HoverCardTrigger asChild>
                <button className="flex items-center gap-1 hover:text-foreground transition-colors">
                  <Monitor className="h-3.5 w-3.5" />
                  <span>{deviceType}</span>
                </button>
              </HoverCardTrigger>
              <HoverCardContent side="bottom" align="start" className="w-60">
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-white">Device</h4>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-white/50">Name</span>
                      <span className="font-medium text-white">{systemInfo?.hostname}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/50">Type</span>
                      <span className="font-medium text-white">{deviceType}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/50">OS</span>
                      <span className="font-medium text-white">{systemInfo?.os_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/50">Python</span>
                      <span className="font-medium text-white">{systemInfo?.python_version}</span>
                    </div>
                  </div>
                </div>
              </HoverCardContent>
            </HoverCard>

            <span className="text-muted-foreground/40">&middot;</span>

            <HoverCard openDelay={200} closeDelay={100}>
              <HoverCardTrigger asChild>
                <button className={cn(
                  "flex items-center gap-1 transition-colors",
                  computeMode === 'GPU' ? 'text-green-500 hover:text-green-400' : 'hover:text-foreground'
                )}>
                  <Cpu className="h-3.5 w-3.5" />
                  <span>{computeMode}</span>
                </button>
              </HoverCardTrigger>
              <HoverCardContent side="bottom" align="start" className="w-60">
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-white">Compute</h4>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-white/50">Mode</span>
                      <span className={cn(
                        "font-medium",
                        computeMode === 'GPU' ? 'text-green-400' : 'text-white'
                      )}>{computeMode}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/50">CUDA</span>
                      <span className={cn(
                        "font-medium",
                        systemInfo?.cuda_available ? 'text-green-400' : 'text-white/40'
                      )}>{systemInfo?.cuda_available ? 'Available' : 'Not available'}</span>
                    </div>
                    {systemInfo?.gpu_name && (
                      <div className="flex justify-between">
                        <span className="text-white/50">GPU</span>
                        <span className="font-medium text-white">{systemInfo.gpu_name}</span>
                      </div>
                    )}
                    {systemInfo?.gpu_memory_gb && (
                      <div className="flex justify-between">
                        <span className="text-white/50">VRAM</span>
                        <span className="font-medium text-white">{systemInfo.gpu_memory_gb} GB</span>
                      </div>
                    )}
                    {systemInfo?.torch_version && (
                      <div className="flex justify-between">
                        <span className="text-white/50">PyTorch</span>
                        <span className="font-medium text-white">{systemInfo.torch_version}</span>
                      </div>
                    )}
                  </div>
                </div>
              </HoverCardContent>
            </HoverCard>
          </div>
        )}
      </div>

      {/* Right side - Notifications */}
      <div className="flex items-center gap-1">
        <NotificationsButton />
      </div>
    </header>
  )
}
