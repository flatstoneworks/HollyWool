import { Outlet } from 'react-router-dom'
import { ImageIcon, Film, Images, Box } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { NotificationsButton } from './NotificationsButton'
import { UserSettingsButton } from './UserSettingsButton'

export function Layout() {
  return (
    <div className="h-screen flex flex-col bg-[#0d0d0d] overflow-hidden">
      {/* Ultra minimal top bar - sticky */}
      <header className="h-12 flex-shrink-0 flex items-center justify-between px-4 relative z-50 border-b border-white/5 bg-[#0d0d0d]">
        {/* Left spacer for centering */}
        <div className="w-24" />

        {/* Center navigation */}
        <nav className="flex items-center bg-white/5 rounded-full p-0.5">
          <NavLink
            to="/image"
            className={({ isActive }) =>
              cn(
                'flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all',
                isActive
                  ? 'bg-white/10 text-white'
                  : 'text-white/50 hover:text-white/80'
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
                  ? 'bg-white/10 text-white'
                  : 'text-white/50 hover:text-white/80'
              )
            }
          >
            <Film className="h-4 w-4" />
            <span>Video</span>
          </NavLink>
          <NavLink
            to="/gallery"
            className={({ isActive }) =>
              cn(
                'flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all',
                isActive
                  ? 'bg-white/10 text-white'
                  : 'text-white/50 hover:text-white/80'
              )
            }
          >
            <Images className="h-4 w-4" />
            <span>Gallery</span>
          </NavLink>
          <NavLink
            to="/models"
            className={({ isActive }) =>
              cn(
                'flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all',
                isActive
                  ? 'bg-white/10 text-white'
                  : 'text-white/50 hover:text-white/80'
              )
            }
          >
            <Box className="h-4 w-4" />
            <span>Models</span>
          </NavLink>
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
