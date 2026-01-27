import { useState } from 'react'
import {
  Plus, MessageSquare, MoreHorizontal, Pencil, GripVertical, Trash2
} from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SessionItem {
  id: string
  name: string
  thumbnail?: string
}

interface SessionSidebarProps {
  sessions: SessionItem[]
  currentSessionId: string | null
  onNewSession: () => void
  onSwitchSession: (id: string) => void
  onDeleteSession: (id: string) => void
  onRenameSession: (id: string, name: string) => void
  sidebarWidth: number
  isResizing: boolean
  onResizeStart: (e: React.MouseEvent) => void
  /** Optional custom renderer for the session row content (thumbnail + name area) */
  renderSessionContent?: (session: SessionItem) => React.ReactNode
  /** Optional custom class for the "New Session" button text color */
  newSessionButtonClass?: string
}

export function SessionSidebar({
  sessions,
  currentSessionId,
  onNewSession,
  onSwitchSession,
  onDeleteSession,
  onRenameSession,
  sidebarWidth,
  isResizing,
  onResizeStart,
  renderSessionContent,
  newSessionButtonClass,
}: SessionSidebarProps) {
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [sessionMenuId, setSessionMenuId] = useState<string | null>(null)

  const handleRenameSubmit = (id: string) => {
    if (editingName.trim()) {
      onRenameSession(id, editingName.trim())
    }
    setEditingSessionId(null)
    setEditingName('')
  }

  const defaultRenderSessionContent = (session: SessionItem) => (
    <>
      {session.thumbnail ? (
        <div className="w-8 h-8 rounded overflow-hidden flex-shrink-0 bg-muted">
          <img
            src={session.thumbnail}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
      ) : (
        <div className="w-8 h-8 rounded flex-shrink-0 bg-muted flex items-center justify-center">
          <MessageSquare className="h-4 w-4 text-muted-foreground/50" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <span className="text-sm text-foreground/80 truncate block">
          {session.name}
        </span>
      </div>
    </>
  )

  return (
    <aside
      style={{ width: sidebarWidth }}
      className="h-full border-r border-border flex flex-col bg-muted/50 dark:bg-black/20 relative flex-shrink-0"
    >
      <div className="p-3 border-b border-border flex-shrink-0">
        <button
          onClick={onNewSession}
          className={cn(
            'w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-sm font-medium transition-colors',
            newSessionButtonClass || 'text-primary-foreground'
          )}
        >
          <Plus className="h-4 w-4" />
          New Session
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-1 min-h-0">
        {sessions.map((session) => (
          <div
            key={session.id}
            className={cn(
              'group relative rounded-lg transition-colors cursor-pointer',
              currentSessionId === session.id
                ? 'bg-accent'
                : 'hover:bg-muted'
            )}
          >
            {editingSessionId === session.id ? (
              <input
                type="text"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={() => handleRenameSubmit(session.id)}
                onKeyDown={(e) => e.key === 'Enter' && handleRenameSubmit(session.id)}
                className="w-full px-3 py-2 bg-transparent text-sm text-foreground outline-none"
                autoFocus
              />
            ) : (
              <div
                onClick={() => onSwitchSession(session.id)}
                className="flex items-center gap-2 px-2 py-2"
              >
                {(renderSessionContent || defaultRenderSessionContent)(session)}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setSessionMenuId(sessionMenuId === session.id ? null : session.id)
                  }}
                  className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-accent transition-all"
                >
                  <MoreHorizontal className="h-4 w-4 text-muted-foreground/70" />
                </button>
              </div>
            )}

            {/* Session menu */}
            {sessionMenuId === session.id && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setSessionMenuId(null)} />
                <div className="absolute right-0 top-full mt-1 w-36 py-1 rounded-lg bg-[#1a1a1a] border border-white/10 shadow-xl z-50">
                  <button
                    onClick={() => {
                      setEditingSessionId(session.id)
                      setEditingName(session.name)
                      setSessionMenuId(null)
                    }}
                    className="w-full px-3 py-1.5 text-left text-sm text-foreground/80 hover:bg-accent flex items-center gap-2"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Rename
                  </button>
                  <button
                    onClick={() => {
                      onDeleteSession(session.id)
                      setSessionMenuId(null)
                    }}
                    className="w-full px-3 py-1.5 text-left text-sm text-red-400 hover:bg-accent flex items-center gap-2"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={onResizeStart}
        className={cn(
          'absolute right-0 top-0 bottom-0 w-1 cursor-col-resize group',
          'hover:bg-primary/50 transition-colors',
          isResizing && 'bg-primary/50'
        )}
      >
        <div className="absolute right-0 top-1/2 -translate-y-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
          <GripVertical className="h-6 w-6 text-muted-foreground/50" />
        </div>
      </div>
    </aside>
  )
}
