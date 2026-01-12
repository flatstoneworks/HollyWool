import { useState } from 'react'
import { Settings, Moon, HardDrive, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function UserSettingsButton() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'p-2 rounded-lg transition-colors',
          isOpen ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white hover:bg-white/5'
        )}
      >
        <Settings className="h-5 w-5" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-56 rounded-xl glass border border-white/10 shadow-xl z-50 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-sm font-medium text-white">Settings</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="py-1">
              <button className="w-full px-4 py-2.5 flex items-center gap-3 text-left hover:bg-white/5 transition-colors">
                <Moon className="h-4 w-4 text-white/60" />
                <div className="flex-1">
                  <p className="text-sm text-white/80">Dark Mode</p>
                  <p className="text-xs text-white/40">Always on</p>
                </div>
              </button>

              <button className="w-full px-4 py-2.5 flex items-center gap-3 text-left hover:bg-white/5 transition-colors">
                <HardDrive className="h-4 w-4 text-white/60" />
                <div className="flex-1">
                  <p className="text-sm text-white/80">Storage</p>
                  <p className="text-xs text-white/40">Manage cache & outputs</p>
                </div>
              </button>

              <div className="my-1 border-t border-white/5" />

              <button className="w-full px-4 py-2.5 flex items-center gap-3 text-left hover:bg-white/5 transition-colors">
                <Info className="h-4 w-4 text-white/60" />
                <div className="flex-1">
                  <p className="text-sm text-white/80">About HollyWool</p>
                  <p className="text-xs text-white/40">Version 0.1.0</p>
                </div>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
