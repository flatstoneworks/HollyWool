import { Link } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface JobProgressCardProps {
  status: string
  progress: number
  downloadProgress: number
  downloadTotalMb: number | null
  downloadSpeedMbps: number | null
  loadProgress?: number
  etaSeconds: number | null
  model: string
  statusLabel: string
  headerBadges?: React.ReactNode
  className?: string
  children?: React.ReactNode
}

export function JobProgressCard({
  status,
  progress,
  downloadProgress,
  downloadTotalMb,
  downloadSpeedMbps,
  loadProgress = 0,
  etaSeconds,
  model,
  statusLabel,
  headerBadges,
  className,
  children,
}: JobProgressCardProps) {
  const steps = [
    {
      id: 'download',
      label: 'Download',
      active: status === 'downloading',
      completed: ['loading_model', 'generating', 'saving'].includes(status),
      skipped: ['queued', 'submitting'].includes(status) ? undefined : !downloadTotalMb && status !== 'downloading',
    },
    { id: 'load', label: 'Load Model', active: status === 'loading_model', completed: ['generating', 'saving'].includes(status) },
    { id: 'generate', label: 'Generate', active: status === 'generating', completed: status === 'saving' },
    { id: 'save', label: 'Save', active: status === 'saving', completed: false },
  ]

  const displayProgress = status === 'downloading' ? downloadProgress :
                          status === 'loading_model' ? loadProgress :
                          progress

  return (
    <div className={cn('rounded-2xl overflow-hidden border border-primary/30 bg-primary/5', className)}>
      <div className="px-5 py-4">
        {/* Header: spinner + status + badges + model */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
              <Loader2 className="h-3 w-3 animate-spin text-primary" />
            </div>
            <span className="text-sm font-medium text-foreground">{statusLabel}</span>
          </div>
          <div className="flex items-center gap-2">
            {headerBadges}
            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground/70">
              {model}
            </span>
          </div>
        </div>

        {/* Step indicator bars */}
        <div className="flex items-center gap-1 mb-3">
          {steps.map((step, idx) => (
            <div key={step.id} className="flex items-center flex-1">
              <div className={cn(
                'flex-1 h-1.5 rounded-full transition-all duration-300',
                step.active ? 'bg-primary animate-pulse' :
                step.completed ? 'bg-primary' :
                step.skipped ? 'bg-muted' :
                'bg-accent'
              )} />
              {idx < steps.length - 1 && <div className="w-1" />}
            </div>
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground/70 px-1">
          {steps.map(step => (
            <span key={step.id} className={cn(
              'transition-colors',
              step.active && 'text-primary font-medium',
              step.completed && 'text-muted-foreground',
              step.skipped && 'text-primary-foreground/20'
            )}>
              {step.label}
            </span>
          ))}
        </div>

        {/* Progress bar */}
        <div className="mt-3 flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-accent rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${displayProgress}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground min-w-[3ch]">
            {Math.round(displayProgress)}%
          </span>
        </div>

        {/* Download details */}
        {status === 'downloading' && downloadTotalMb && (
          <div className="mt-1 text-xs text-muted-foreground/70">
            {downloadTotalMb > 1024
              ? `${(downloadTotalMb / 1024).toFixed(1)} GB`
              : `${Math.round(downloadTotalMb)} MB`}
            {downloadSpeedMbps != null && downloadSpeedMbps > 0 && (
              <> @ {downloadSpeedMbps.toFixed(1)} MB/s</>
            )}
          </div>
        )}

        {/* ETA */}
        {status !== 'downloading' && etaSeconds != null && etaSeconds > 0 && (
          <div className="mt-1 text-xs text-muted-foreground/70">
            ~{etaSeconds >= 60 ? `${Math.ceil(etaSeconds / 60)} min` : `${Math.round(etaSeconds)}s`} remaining
          </div>
        )}

        {/* Submitting indicator */}
        {status === 'submitting' && (
          <div className="mt-2 text-xs text-muted-foreground/70">
            Submitting to server...
          </div>
        )}

        {/* Queue link */}
        {status === 'queued' && (
          <Link to="/queue" className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline">
            Check the queue &rarr;
          </Link>
        )}
      </div>

      {/* Footer content provided by caller */}
      {children}
    </div>
  )
}
