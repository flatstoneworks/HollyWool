import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, ImageIcon, Film, Loader2, X, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/api/client'
import { setCurrentSessionId } from '@/lib/sessions'
import { setCurrentVideoSessionId } from '@/lib/video-sessions'

interface ActiveGeneration {
  id: string
  type: 'image' | 'video'
  sessionId: string | null
  prompt: string
  status: string
  progress: number
  model: string
}

export function NotificationsButton() {
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)
  const [activeGenerations, setActiveGenerations] = useState<ActiveGeneration[]>([])

  // Poll for active jobs
  useEffect(() => {
    const fetchActiveJobs = async () => {
      try {
        const [imageJobs, videoJobs] = await Promise.all([
          api.getJobs({ active_only: true }),
          api.getVideoJobs({ active_only: true }),
        ])

        const generations: ActiveGeneration[] = []

        // Add active image jobs
        for (const job of imageJobs.jobs) {
          if (!['completed', 'failed'].includes(job.status)) {
            generations.push({
              id: job.id,
              type: 'image',
              sessionId: job.session_id,
              prompt: job.prompt,
              status: job.status,
              progress: job.progress,
              model: job.model,
            })
          }
        }

        // Add active video jobs
        for (const job of videoJobs.jobs) {
          if (!['completed', 'failed'].includes(job.status)) {
            generations.push({
              id: job.id,
              type: 'video',
              sessionId: job.session_id,
              prompt: job.prompt,
              status: job.status,
              progress: job.progress,
              model: job.model,
            })
          }
        }

        setActiveGenerations(generations)
      } catch (err) {
        console.error('Failed to fetch active jobs:', err)
      }
    }

    fetchActiveJobs()
    const interval = setInterval(fetchActiveJobs, 2000)
    return () => clearInterval(interval)
  }, [])

  const handleNavigateToJob = (gen: ActiveGeneration) => {
    // Switch to the correct session
    if (gen.sessionId) {
      if (gen.type === 'image') {
        setCurrentSessionId(gen.sessionId)
      } else {
        setCurrentVideoSessionId(gen.sessionId)
      }
    }

    // Navigate to the correct page
    navigate(gen.type === 'image' ? '/image' : '/video')

    // Close the dropdown
    setIsOpen(false)
  }

  const count = activeGenerations.length

  const formatStatus = (status: string) => {
    return status.replace('_', ' ')
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'relative p-2 rounded-lg transition-colors',
          isOpen ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white hover:bg-white/5'
        )}
      >
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-80 rounded-xl glass border border-white/10 shadow-xl z-50 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-sm font-medium text-white">Active Generations</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto scrollbar-thin">
              {count === 0 ? (
                <div className="px-4 py-8 text-center">
                  <Bell className="h-8 w-8 text-white/20 mx-auto mb-2" />
                  <p className="text-sm text-white/40">No active generations</p>
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {activeGenerations.map((gen) => (
                    <button
                      key={gen.id}
                      onClick={() => handleNavigateToJob(gen)}
                      className="w-full px-4 py-3 hover:bg-white/5 transition-colors text-left"
                    >
                      <div className="flex items-start gap-3">
                        <div className={cn(
                          'p-1.5 rounded-lg flex-shrink-0',
                          gen.type === 'image' ? 'bg-blue-500/20' : 'bg-purple-500/20'
                        )}>
                          {gen.type === 'image' ? (
                            <ImageIcon className="h-4 w-4 text-blue-400" />
                          ) : (
                            <Film className="h-4 w-4 text-purple-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white/80 truncate">{gen.prompt}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Loader2 className="h-3 w-3 text-primary animate-spin" />
                            <span className="text-xs text-white/50 capitalize">
                              {formatStatus(gen.status)}
                            </span>
                            <span className="text-xs text-white/30">•</span>
                            <span className="text-xs text-white/50">{gen.model}</span>
                          </div>
                          {/* Progress bar */}
                          <div className="mt-2 h-1 bg-white/10 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary transition-all duration-300"
                              style={{ width: `${gen.progress}%` }}
                            />
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-white/30 flex-shrink-0 mt-1" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
