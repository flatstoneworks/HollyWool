import { Outlet } from 'react-router-dom'
import { ImageIcon, Film, Images, Box, Sparkles, Monitor, Cpu } from 'lucide-react'
import { NavLink, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { api } from '@/api/client'
import { HoverCard, HoverCardTrigger, HoverCardContent } from './ui/hover-card'
import { NotificationsButton } from './NotificationsButton'
import { UserSettingsButton } from './UserSettingsButton'

export function Layout() {
  const { data: systemInfo } = useQuery({
    queryKey: ['system-info'],
    queryFn: api.getSystemInfo,
    staleTime: 60_000,
  })

  const appName = systemInfo?.app_name || 'HollyWool'
  const deviceType = systemInfo?.device_type
  const computeMode = systemInfo?.compute_mode

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Ultra minimal top bar - sticky */}
      <header className="h-12 flex-shrink-0 flex items-center justify-between px-4 relative z-50 border-b border-border bg-background">
        {/* Left side - App icon + name + system info */}
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <Sparkles className="h-5 w-5 text-primary" />
            <span className="text-sm font-semibold text-foreground">{appName}</span>
          </Link>
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

              <span className="text-muted-foreground/40">·</span>

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

        {/* Center navigation - grouped */}
        <nav className="flex items-center gap-2">
          {/* Generation modes: Image & Video */}
          <div className="flex items-center bg-muted rounded-full p-0.5">
            <NavLink
              to="/image"
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all',
                  isActive
                    ? 'bg-background dark:bg-white/10 text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )
              }
            >
              <ImageIcon className="h-4 w-4" />
              <span>Image</span>
            </NavLink>
            <NavLink
              to="/video"
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all',
                  isActive
                    ? 'bg-background dark:bg-white/10 text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )
              }
            >
              <Film className="h-4 w-4" />
              <span>Video</span>
            </NavLink>
          </div>

          {/* Gallery */}
          <div className="flex items-center bg-muted rounded-full p-0.5">
            <NavLink
              to="/assets"
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all',
                  isActive
                    ? 'bg-background dark:bg-white/10 text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )
              }
            >
              <Images className="h-4 w-4" />
              <span>Gallery</span>
            </NavLink>
          </div>

          {/* Models */}
          <div className="flex items-center bg-muted rounded-full p-0.5">
            <NavLink
              to="/models"
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all',
                  isActive
                    ? 'bg-background dark:bg-white/10 text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )
              }
            >
              <Box className="h-4 w-4" />
              <span>Models</span>
            </NavLink>
          </div>
        </nav>

        {/* Right side - Notifications & Settings */}
        <div className="flex items-center gap-1">
          <NotificationsButton />
          <UserSettingsButton />
        </div>
      </header>
      <main className="flex-1 flex overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}
