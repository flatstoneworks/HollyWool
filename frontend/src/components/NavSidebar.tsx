import { NavLink, Link, useLocation } from 'react-router-dom'
import { Sparkles, ImageIcon, Film, Layers, Images, Box, FileText, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/image', icon: ImageIcon, label: 'Image' },
  { to: '/video', icon: Film, label: 'Video' },
  { to: '/bulk', icon: Layers, label: 'Bulk' },
  { to: '/assets', icon: Images, label: 'Gallery' },
  { to: '/models', icon: Box, label: 'Models' },
]

export function NavSidebar() {
  const location = useLocation()

  return (
    <nav className="w-14 h-full flex-shrink-0 flex flex-col items-center border-r border-border bg-background py-3 z-50">
      {/* Home / Logo */}
      <Link
        to="/"
        className="flex items-center justify-center w-10 h-10 rounded-xl hover:bg-accent transition-colors mb-4 group relative"
      >
        <Sparkles className="h-5 w-5 text-primary" />
        <span className="nav-tooltip">Home</span>
      </Link>

      {/* Main nav items */}
      <div className="flex-1 flex flex-col items-center gap-1">
        {navItems.map(({ to, icon: Icon, label }) => {
          const isActive = location.pathname.startsWith(to)
          return (
            <NavLink
              key={to}
              to={to}
              className={cn(
                'flex items-center justify-center w-10 h-10 rounded-xl transition-colors group relative',
                isActive
                  ? 'bg-primary/20 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="nav-tooltip">{label}</span>
            </NavLink>
          )
        })}
      </div>

      {/* Bottom: Logs + Settings */}
      <div className="flex flex-col items-center gap-1 pt-2 border-t border-border">
        <NavLink
          to="/logs"
          className={cn(
            'flex items-center justify-center w-10 h-10 rounded-xl transition-colors group relative',
            location.pathname === '/logs'
              ? 'bg-primary/20 text-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
          )}
        >
          <FileText className="h-5 w-5" />
          <span className="nav-tooltip">Logs</span>
        </NavLink>
        <NavLink
          to="/settings"
          className={cn(
            'flex items-center justify-center w-10 h-10 rounded-xl transition-colors group relative',
            location.pathname === '/settings'
              ? 'bg-primary/20 text-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
          )}
        >
          <Settings className="h-5 w-5" />
          <span className="nav-tooltip">Settings</span>
        </NavLink>
      </div>
    </nav>
  )
}
