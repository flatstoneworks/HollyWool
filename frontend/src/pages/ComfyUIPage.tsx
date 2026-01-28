import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Loader2, Upload, Trash2, Play, Plus, FileJson, AlertCircle,
  XCircle, Workflow, Download
} from 'lucide-react'
import {
  api,
  type ComfyUIJob,
  type ImageResult,
} from '@/api/client'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { WorkflowParameterForm } from '@/components/WorkflowParameterForm'
import { JobProgressCard } from '@/components/JobProgressCard'
import { handleDownload as downloadFile } from '@/lib/download'

export function ComfyUIPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // State
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null)
  const [parameterValues, setParameterValues] = useState<Record<string, string | number>>({})
  const [isDragging, setIsDragging] = useState(false)
  const dragCounter = useRef(0)

  // Track active jobs
  const [activeJobIds, setActiveJobIds] = useState<string[]>([])

  // Queries
  const { data: status } = useQuery({
    queryKey: ['comfyui-status'],
    queryFn: api.getComfyUIStatus,
    refetchInterval: 5000,
  })

  const { data: workflows = [], isLoading: loadingWorkflows } = useQuery({
    queryKey: ['comfyui-workflows'],
    queryFn: api.getComfyUIWorkflows,
  })

  const { data: selectedWorkflow, isLoading: loadingWorkflow } = useQuery({
    queryKey: ['comfyui-workflow', selectedWorkflowId],
    queryFn: () => selectedWorkflowId ? api.getComfyUIWorkflow(selectedWorkflowId) : null,
    enabled: !!selectedWorkflowId,
  })

  // Poll active jobs
  const { data: activeJobs = [] } = useQuery({
    queryKey: ['comfyui-jobs', activeJobIds],
    queryFn: async () => {
      const jobs: ComfyUIJob[] = []
      for (const jobId of activeJobIds) {
        try {
          const job = await api.getComfyUIJob(jobId)
          jobs.push(job)
        } catch {
          // Job may have been cleaned up
        }
      }
      return jobs
    },
    enabled: activeJobIds.length > 0,
    refetchInterval: 1000,
  })

  // Remove completed/failed jobs from tracking after a delay
  useEffect(() => {
    const completed = activeJobs.filter(j => ['completed', 'failed'].includes(j.status))
    if (completed.length > 0) {
      setTimeout(() => {
        setActiveJobIds(prev => prev.filter(id => !completed.some(j => j.id === id)))
      }, 5000)
    }
  }, [activeJobs])

  // Load default parameter values when workflow changes
  useEffect(() => {
    if (selectedWorkflow) {
      const defaults: Record<string, string | number> = {}
      for (const param of selectedWorkflow.parameters) {
        const key = `${param.node_id}.${param.input_name}`
        if (param.current_value !== null && param.current_value !== undefined) {
          defaults[key] = param.current_value as string | number
        }
      }
      setParameterValues(defaults)
    } else {
      setParameterValues({})
    }
  }, [selectedWorkflow])

  // Mutations
  const importMutation = useMutation({
    mutationFn: (data: { name: string; workflow_json: Record<string, unknown> }) =>
      api.importComfyUIWorkflow(data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['comfyui-workflows'] })
      setSelectedWorkflowId(result.id)
      toast({ title: 'Workflow imported', description: result.message, variant: 'success' })
    },
    onError: (error: Error) => {
      toast({ title: 'Import failed', description: error.message, variant: 'destructive' })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: api.deleteComfyUIWorkflow,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comfyui-workflows'] })
      if (selectedWorkflowId) {
        setSelectedWorkflowId(null)
      }
      toast({ title: 'Workflow deleted', variant: 'success' })
    },
  })

  const generateMutation = useMutation({
    mutationFn: api.createComfyUIJob,
    onSuccess: (result) => {
      setActiveJobIds(prev => [...prev, result.job_id])
      toast({ title: 'Generation started', description: result.message, variant: 'success' })
    },
    onError: (error: Error) => {
      toast({ title: 'Generation failed', description: error.message, variant: 'destructive' })
    },
  })

  // File handling
  const handleFileImport = useCallback(async (file: File) => {
    try {
      const text = await file.text()
      const json = JSON.parse(text)

      // Use filename (without extension) as default name
      const name = file.name.replace(/\.(json|workflow)$/i, '')

      importMutation.mutate({ name, workflow_json: json })
    } catch (error) {
      toast({
        title: 'Invalid file',
        description: 'Please select a valid ComfyUI workflow JSON file',
        variant: 'destructive',
      })
    }
  }, [importMutation])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFileImport(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Drag and drop
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current++
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current--
    if (dragCounter.current === 0) {
      setIsDragging(false)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current = 0
    setIsDragging(false)

    const file = e.dataTransfer.files?.[0]
    if (file && file.type === 'application/json') {
      handleFileImport(file)
    } else if (file) {
      toast({
        title: 'Invalid file type',
        description: 'Please drop a JSON file',
        variant: 'destructive',
      })
    }
  }

  const handleGenerate = () => {
    if (!selectedWorkflowId) return

    generateMutation.mutate({
      workflow_id: selectedWorkflowId,
      parameters: parameterValues,
    })
  }

  const handleDownload = async (image: ImageResult) => {
    const filename = `comfyui_${image.id.slice(0, 8)}.png`
    await downloadFile(image.url, filename)
  }

  // Get completed images from recent jobs
  const completedImages = activeJobs
    .filter(j => j.status === 'completed')
    .flatMap(j => j.images)

  return (
    <div
      className="flex-1 flex h-full overflow-hidden"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary z-50 flex items-center justify-center">
          <div className="text-center">
            <Upload className="h-12 w-12 text-primary mx-auto mb-4" />
            <p className="text-lg font-medium text-primary">Drop workflow JSON here</p>
          </div>
        </div>
      )}

      {/* Workflow Sidebar */}
      <div className="w-64 flex-shrink-0 border-r border-border bg-background/50 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-foreground/80">Workflows</h2>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importMutation.isPending}
              className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              title="Import workflow"
            >
              {importMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
            </button>
          </div>

          {/* Status indicator */}
          <div className="flex items-center gap-2 text-xs">
            {status?.available ? (
              <>
                <span className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-muted-foreground">ComfyUI connected</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-red-400">ComfyUI offline</span>
              </>
            )}
          </div>
        </div>

        {/* Workflow list */}
        <div className="flex-1 overflow-y-auto p-2">
          {loadingWorkflows ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : workflows.length === 0 ? (
            <div className="text-center py-8 px-4">
              <FileJson className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No workflows yet</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Import a ComfyUI workflow JSON to get started
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="mt-4 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition-colors"
              >
                Import Workflow
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              {workflows.map((wf) => (
                <button
                  key={wf.id}
                  onClick={() => setSelectedWorkflowId(wf.id)}
                  className={cn(
                    'w-full px-3 py-2 rounded-lg text-left transition-colors group',
                    selectedWorkflowId === wf.id
                      ? 'bg-primary/20 text-primary'
                      : 'hover:bg-accent text-foreground/80'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Workflow className="h-4 w-4 flex-shrink-0" />
                    <span className="text-sm truncate flex-1">{wf.name}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (confirm(`Delete "${wf.name}"?`)) {
                          deleteMutation.mutate(wf.id)
                        }
                      }}
                      className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/20 hover:text-red-400 transition-all"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="text-xs text-muted-foreground/70 mt-0.5 pl-6">
                    {wf.parameter_count} parameters
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedWorkflow ? (
          <>
            {/* Workflow header */}
            <div className="p-4 border-b border-border bg-background/50">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-lg font-medium text-foreground">{selectedWorkflow.name}</h1>
                  <p className="text-sm text-muted-foreground">
                    {selectedWorkflow.parameters.length} editable parameters
                  </p>
                </div>
                <button
                  onClick={handleGenerate}
                  disabled={!status?.available || generateMutation.isPending}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                >
                  {generateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  Generate
                </button>
              </div>

              {!status?.available && (
                <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30">
                  <AlertCircle className="h-4 w-4 text-red-400" />
                  <span className="text-sm text-red-400">
                    ComfyUI server is not available. Please start ComfyUI to generate.
                  </span>
                </div>
              )}
            </div>

            {/* Parameter form and results */}
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-3xl mx-auto p-6 space-y-8">
                {/* Parameter form */}
                {loadingWorkflow ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <WorkflowParameterForm
                    parameters={selectedWorkflow.parameters}
                    values={parameterValues}
                    onChange={setParameterValues}
                    disabled={generateMutation.isPending}
                  />
                )}

                {/* Active jobs */}
                {activeJobs.filter(j => !['completed', 'failed'].includes(j.status)).map((job) => (
                  <JobProgressCard
                    key={job.id}
                    status={job.status}
                    progress={job.progress}
                    downloadProgress={0}
                    downloadTotalMb={null}
                    downloadSpeedMbps={null}
                    loadProgress={0}
                    etaSeconds={job.eta_seconds}
                    model="ComfyUI"
                    statusLabel={
                      job.status === 'queued' ? 'Queued' :
                      job.status === 'generating' ? 'Generating' :
                      job.status === 'saving' ? 'Saving' :
                      job.status
                    }
                  >
                    <div className="p-4 text-sm text-muted-foreground">
                      {job.workflow_name}
                      {job.current_node && (
                        <span className="ml-2 text-xs text-muted-foreground/70">
                          ({job.current_node})
                        </span>
                      )}
                    </div>
                  </JobProgressCard>
                ))}

                {/* Completed results */}
                {completedImages.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-4">Results</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {completedImages.map((image) => (
                        <div
                          key={image.id}
                          className="relative group rounded-xl overflow-hidden bg-muted cursor-pointer"
                          onClick={() => navigate(`/asset/${image.id}`)}
                        >
                          <img
                            src={image.url}
                            alt=""
                            className="w-full aspect-square object-cover"
                          />
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                            <div className="flex gap-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDownload(image)
                                }}
                                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                              >
                                <Download className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Failed job errors */}
                {activeJobs.filter(j => j.status === 'failed').map((job) => (
                  <div
                    key={job.id}
                    className="p-4 rounded-xl bg-red-500/10 border border-red-500/30"
                  >
                    <div className="flex items-center gap-2 text-red-400">
                      <XCircle className="h-5 w-5" />
                      <span className="font-medium">Generation failed</span>
                    </div>
                    {job.error && (
                      <p className="mt-2 text-sm text-red-400/80">{job.error}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          /* Empty state */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-md px-8">
              <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
                <Workflow className="h-10 w-10 text-muted-foreground/30" />
              </div>
              <h2 className="text-xl font-medium text-foreground/80 mb-2">
                ComfyUI Workflows
              </h2>
              <p className="text-muted-foreground/70 mb-6">
                Import your ComfyUI workflows to run them with a simple form interface.
                Edit prompts, seeds, and other parameters without the full node graph.
              </p>

              {workflows.length === 0 ? (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importMutation.isPending}
                  className="px-6 py-3 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-2 mx-auto"
                >
                  {importMutation.isPending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Upload className="h-5 w-5" />
                  )}
                  Import Workflow
                </button>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Select a workflow from the sidebar to get started
                </p>
              )}

              <div className="mt-8 p-4 rounded-xl bg-muted/50 text-left">
                <h3 className="text-sm font-medium text-foreground/80 mb-2">How to export from ComfyUI:</h3>
                <ol className="text-sm text-muted-foreground/70 space-y-1 list-decimal list-inside">
                  <li>Open your workflow in ComfyUI</li>
                  <li>Click the gear icon in the menu</li>
                  <li>Enable "Enable Dev mode Options"</li>
                  <li>Click "Save (API Format)" to download</li>
                  <li>Drop the JSON file here</li>
                </ol>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
