import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell, ImageIcon, Film, Loader2, X, ChevronRight,
  CheckCircle2, XCircle, Clock
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/api/client'

interface Activity {
  id: string
  type: 'image' | 'video'
  sessionId: string | null
  prompt: string
  status: string
  progress: number
  model: string
  completedAt?: number | null
  createdAt?: number
  error?: string | null
}

function formatTimeAgo(timestamp: number | null | undefined): string {
  if (!timestamp) return ''
  const now = Date.now() / 1000
  const diff = now - timestamp

  if (diff < 60) return 'Just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export function NotificationsButton() {
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)
  const [activeActivities, setActiveActivities] = useState<Activity[]>([])
  const [doneActivities, setDoneActivities] = useState<Activity[]>([])

  // Poll for jobs
  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const [imageJobs, videoJobs] = await Promise.all([
          api.getJobs({ limit: 10 }),
          api.getVideoJobs({ limit: 10 }),
        ])

        const active: Activity[] = []
        const done: Activity[] = []

        // Process image jobs
        for (const job of imageJobs.jobs) {
          const activity: Activity = {
            id: job.id,
            type: 'image',
            sessionId: job.session_id,
            prompt: job.prompt,
            status: job.status,
            progress: job.progress,
            model: job.model,
            completedAt: job.completed_at,
            createdAt: job.created_at,
            error: job.error,
          }

          if (['completed', 'failed'].includes(job.status)) {
            done.push(activity)
          } else {
            active.push(activity)
          }
        }

        // Process video jobs
        for (const job of videoJobs.jobs) {
          const activity: Activity = {
            id: job.id,
            type: 'video',
            sessionId: job.session_id,
            prompt: job.prompt,
            status: job.status,
            progress: job.progress,
            model: job.model,
            completedAt: job.completed_at,
            createdAt: job.created_at,
            error: job.error,
          }

          if (['completed', 'failed'].includes(job.status)) {
            done.push(activity)
          } else {
            active.push(activity)
          }
        }

        // Sort done by completion time (most recent first)
        done.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0))

        // Limit done activities to last 5
        setActiveActivities(active)
        setDoneActivities(done.slice(0, 5))
      } catch (err) {
        console.error('Failed to fetch jobs:', err)
      }
    }

    fetchJobs()
    const interval = setInterval(fetchJobs, 2000)
    return () => clearInterval(interval)
  }, [])

  const handleNavigateToJob = (activity: Activity) => {
    navigate(`/job/${activity.id}`)
    setIsOpen(false)
  }

  const activeCount = activeActivities.length
  const totalCount = activeCount + doneActivities.length

  const formatStatus = (status: string) => {
    return status.replace(/_/g, ' ')
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
        {activeCount > 0 && (
          <span className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
            {activeCount > 9 ? '9+' : activeCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-96 rounded-xl glass border border-white/10 shadow-xl z-50 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-sm font-medium text-white">Activity</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[28rem] overflow-y-auto scrollbar-thin">
              {totalCount === 0 ? (
                <div className="px-4 py-8 text-center">
                  <Bell className="h-8 w-8 text-white/20 mx-auto mb-2" />
                  <p className="text-sm text-white/40">No recent activity</p>
                </div>
              ) : (
                <>
                  {/* Active Section */}
                  {activeCount > 0 && (
                    <div>
                      <div className="px-4 py-2 bg-white/5 border-b border-white/5">
                        <span className="text-xs font-medium text-white/60 uppercase tracking-wide flex items-center gap-2">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          In Progress ({activeCount})
                        </span>
                      </div>
                      <div className="divide-y divide-white/5">
                        {activeActivities.map((activity) => (
                          <button
                            key={activity.id}
                            onClick={() => handleNavigateToJob(activity)}
                            className="w-full px-4 py-3 hover:bg-white/5 transition-colors text-left"
                          >
                            <div className="flex items-start gap-3">
                              <div className={cn(
                                'p-1.5 rounded-lg flex-shrink-0',
                                activity.type === 'image' ? 'bg-blue-500/20' : 'bg-purple-500/20'
                              )}>
                                {activity.type === 'image' ? (
                                  <ImageIcon className="h-4 w-4 text-blue-400" />
                                ) : (
                                  <Film className="h-4 w-4 text-purple-400" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-white/80 truncate">{activity.prompt}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <Loader2 className="h-3 w-3 text-primary animate-spin" />
                                  <span className="text-xs text-white/50 capitalize">
                                    {formatStatus(activity.status)}
                                  </span>
                                  <span className="text-xs text-white/30">•</span>
                                  <span className="text-xs text-white/50">{activity.model}</span>
                                </div>
                                {/* Progress bar */}
                                <div className="mt-2 h-1 bg-white/10 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-primary transition-all duration-300"
                                    style={{ width: `${activity.progress}%` }}
                                  />
                                </div>
                              </div>
                              <ChevronRight className="h-4 w-4 text-white/30 flex-shrink-0 mt-1" />
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Done Section */}
                  {doneActivities.length > 0 && (
                    <div>
                      <div className="px-4 py-2 bg-white/5 border-b border-white/5">
                        <span className="text-xs font-medium text-white/60 uppercase tracking-wide flex items-center gap-2">
                          <Clock className="h-3 w-3" />
                          Recent ({doneActivities.length})
                        </span>
                      </div>
                      <div className="divide-y divide-white/5">
                        {doneActivities.map((activity) => (
                          <button
                            key={activity.id}
                            onClick={() => handleNavigateToJob(activity)}
                            className="w-full px-4 py-3 hover:bg-white/5 transition-colors text-left"
                          >
                            <div className="flex items-start gap-3">
                              <div className={cn(
                                'p-1.5 rounded-lg flex-shrink-0',
                                activity.status === 'completed'
                                  ? 'bg-green-500/20'
                                  : 'bg-red-500/20'
                              )}>
                                {activity.status === 'completed' ? (
                                  <CheckCircle2 className="h-4 w-4 text-green-400" />
                                ) : (
                                  <XCircle className="h-4 w-4 text-red-400" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-white/80 truncate">{activity.prompt}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  {activity.type === 'image' ? (
                                    <ImageIcon className="h-3 w-3 text-white/40" />
                                  ) : (
                                    <Film className="h-3 w-3 text-white/40" />
                                  )}
                                  <span className="text-xs text-white/50 capitalize">
                                    {activity.type}
                                  </span>
                                  <span className="text-xs text-white/30">•</span>
                                  <span className="text-xs text-white/50">{activity.model}</span>
                                  {activity.completedAt && (
                                    <>
                                      <span className="text-xs text-white/30">•</span>
                                      <span className="text-xs text-white/40">
                                        {formatTimeAgo(activity.completedAt)}
                                      </span>
                                    </>
                                  )}
                                </div>
                                {activity.status === 'failed' && activity.error && (
                                  <p className="text-xs text-red-400/80 mt-1 truncate">
                                    {activity.error}
                                  </p>
                                )}
                              </div>
                              <ChevronRight className="h-4 w-4 text-white/30 flex-shrink-0 mt-1" />
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
