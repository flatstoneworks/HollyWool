import { useNavigate, useLocation } from 'react-router-dom'
import { Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

export function UserSettingsButton() {
  const navigate = useNavigate()
  const location = useLocation()
  const isActive = location.pathname === '/settings'

  return (
    <button
      onClick={() => navigate('/settings')}
      className={cn(
        'p-2 rounded-lg transition-colors',
        isActive
          ? 'bg-accent text-foreground'
          : 'text-muted-foreground hover:text-foreground hover:bg-accent'
      )}
      title="Settings"
    >
      <Settings className="h-5 w-5" />
    </button>
  )
}
