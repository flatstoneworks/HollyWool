import { Outlet } from 'react-router-dom'
import { ImageIcon, Film, Images, Box, Sparkles } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { NotificationsButton } from './NotificationsButton'
import { UserSettingsButton } from './UserSettingsButton'

export function Layout() {
  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Ultra minimal top bar - sticky */}
      <header className="h-12 flex-shrink-0 flex items-center justify-between px-4 relative z-50 border-b border-border bg-background">
        {/* Left side - App icon */}
        <div className="flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-foreground" />
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
