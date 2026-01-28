import { useQuery } from '@tanstack/react-query'
import { Monitor, Cpu, Activity } from 'lucide-react'
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

  // Poll system status for live CPU/GPU usage
  const { data: systemStatus } = useQuery({
    queryKey: ['system-status'],
    queryFn: api.getSystemStatus,
    refetchInterval: 2000,  // Update every 2 seconds
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

            {/* CPU */}
            <HoverCard openDelay={200} closeDelay={100}>
              <HoverCardTrigger asChild>
                <button className={cn(
                  "flex items-center gap-1 transition-colors hover:text-foreground",
                  systemStatus && systemStatus.cpu_percent > 80 ? 'text-orange-500' : ''
                )}>
                  <Activity className="h-3.5 w-3.5" />
                  <span>{systemStatus ? `${Math.round(systemStatus.cpu_percent)}%` : '...'}</span>
                </button>
              </HoverCardTrigger>
              <HoverCardContent side="bottom" align="start" className="w-64">
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-white">CPU</h4>
                  <div className="space-y-1.5 text-xs">
                    {systemStatus?.cpu_name && (
                      <div className="flex justify-between gap-2">
                        <span className="text-white/50">Model</span>
                        <span className="font-medium text-white text-right truncate max-w-[160px]">{systemStatus.cpu_name}</span>
                      </div>
                    )}
                    {systemStatus?.cpu_cores && (
                      <div className="flex justify-between">
                        <span className="text-white/50">Cores</span>
                        <span className="font-medium text-white">{systemStatus.cpu_cores}C / {systemStatus.cpu_threads}T</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-white/50">Usage</span>
                      <span className={cn(
                        "font-medium",
                        systemStatus && systemStatus.cpu_percent > 80 ? 'text-orange-400' : 'text-white'
                      )}>{systemStatus ? `${systemStatus.cpu_percent.toFixed(1)}%` : '...'}</span>
                    </div>
                    {/* CPU usage bar */}
                    <div className="mt-1">
                      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full transition-all duration-300 rounded-full",
                            systemStatus && systemStatus.cpu_percent > 80 ? 'bg-orange-500' : 'bg-primary'
                          )}
                          style={{ width: `${systemStatus?.cpu_percent ?? 0}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </HoverCardContent>
            </HoverCard>

            <span className="text-muted-foreground/40">&middot;</span>

            {/* GPU / Compute */}
            <HoverCard openDelay={200} closeDelay={100}>
              <HoverCardTrigger asChild>
                <button className={cn(
                  "flex items-center gap-1 transition-colors",
                  computeMode !== 'GPU' ? 'text-muted-foreground/50' :
                  systemStatus && systemStatus.memory_percent > 80 ? 'text-red-500 hover:text-red-400' :
                  systemStatus && systemStatus.memory_percent > 50 ? 'text-orange-500 hover:text-orange-400' :
                  'text-green-500 hover:text-green-400'
                )}>
                  <Cpu className="h-3.5 w-3.5" />
                  <span>
                    {computeMode !== 'GPU' ? 'CPU' :
                     systemStatus ? `${Math.round(systemStatus.memory_percent)}%` : 'GPU'}
                  </span>
                </button>
              </HoverCardTrigger>
              <HoverCardContent side="bottom" align="start" className="w-64">
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-white">GPU / Memory</h4>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-white/50">Mode</span>
                      <span className={cn(
                        "font-medium",
                        computeMode === 'GPU' ? 'text-green-400' : 'text-white/40'
                      )}>{computeMode}</span>
                    </div>
                    {systemInfo?.gpu_name && (
                      <div className="flex justify-between">
                        <span className="text-white/50">GPU</span>
                        <span className="font-medium text-white">{systemInfo.gpu_name}</span>
                      </div>
                    )}
                    {systemStatus && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-white/50">Memory</span>
                          <span className={cn(
                            "font-medium",
                            systemStatus.memory_percent > 80 ? 'text-red-400' :
                            systemStatus.memory_percent > 50 ? 'text-orange-400' : 'text-green-400'
                          )}>
                            {systemStatus.memory_used_gb.toFixed(1)} / {systemStatus.memory_total_gb.toFixed(0)} GB
                          </span>
                        </div>
                        {/* Memory usage bar */}
                        <div className="mt-1">
                          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div
                              className={cn(
                                "h-full transition-all duration-300 rounded-full",
                                systemStatus.memory_percent > 80 ? 'bg-red-500' :
                                systemStatus.memory_percent > 50 ? 'bg-orange-500' : 'bg-green-500'
                              )}
                              style={{ width: `${systemStatus.memory_percent}%` }}
                            />
                          </div>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-white/50">Available</span>
                          <span className={cn(
                            "font-medium",
                            systemStatus.memory_available_gb < 20 ? 'text-red-400' :
                            systemStatus.memory_available_gb < 50 ? 'text-orange-400' : 'text-green-400'
                          )}>
                            {systemStatus.memory_available_gb.toFixed(1)} GB
                          </span>
                        </div>
                        {systemStatus.gpu_utilization !== null && systemStatus.gpu_utilization > 0 && (
                          <div className="flex justify-between">
                            <span className="text-white/50">GPU Load</span>
                            <span className={cn(
                              "font-medium",
                              systemStatus.gpu_utilization > 80 ? 'text-orange-400' : 'text-white'
                            )}>
                              {systemStatus.gpu_utilization.toFixed(0)}%
                            </span>
                          </div>
                        )}
                      </>
                    )}
                    <div className="flex justify-between">
                      <span className="text-white/50">CUDA</span>
                      <span className={cn(
                        "font-medium",
                        systemInfo?.cuda_available ? 'text-green-400' : 'text-white/40'
                      )}>{systemInfo?.cuda_available ? 'Available' : 'Not available'}</span>
                    </div>
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
