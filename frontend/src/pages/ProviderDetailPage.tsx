import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useUrlState } from '@/hooks/useUrlState'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  ExternalLink,
  CheckCircle,
  KeyRound,
  Loader2,
  Image,
  Video,
  Eye,
  EyeOff,
  Wifi,
  WifiOff,
  AlertTriangle,
  RotateCcw,
  Save,
  Trash2,
  Search,
  Radar,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  api,
  type ProviderConfigRequest,
  type TestConnectionResponse,
  type DiscoveredModel,
} from '@/api/client'
import { PROVIDERS } from '@/data/previewModels'

// Providers that support auto-discovery
const DISCOVERY_PROVIDERS = new Set(['krea', 'fal'])

type DiscoveryFilter = 'all' | 'image' | 'video'

export function ProviderDetailPage() {
  const { providerId } = useParams<{ providerId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const provider = providerId ? PROVIDERS[providerId] : undefined
  const supportsDiscovery = providerId ? DISCOVERY_PROVIDERS.has(providerId) : false

  // Form state
  const [apiKey, setApiKey] = useState('')
  const [apiUrl, setApiUrl] = useState('')
  const [isEnabled, setIsEnabled] = useState(true)
  const [showKey, setShowKey] = useState(false)
  const [showResetDialog, setShowResetDialog] = useState(false)

  // Test connection result
  const [testResult, setTestResult] = useState<TestConnectionResponse | null>(null)

  // Discovery state
  const [discoveredModels, setDiscoveredModels] = useState<DiscoveredModel[]>([])
  const [discoveryFilter, setDiscoveryFilter] = useUrlState('filter', 'all') as [DiscoveryFilter, (v: string, opts?: { replace?: boolean }) => void]
  const [hasDiscovered, setHasDiscovered] = useState(false)

  // Fetch provider config
  const { data: providerConfig, isLoading } = useQuery({
    queryKey: ['provider', providerId],
    queryFn: () => api.getProvider(providerId!),
    enabled: !!providerId,
  })

  // Initialize form from server data
  useEffect(() => {
    if (providerConfig) {
      setApiUrl(providerConfig.api_url || '')
      setIsEnabled(providerConfig.is_enabled)
    }
  }, [providerConfig])

  // Mutations
  const updateMutation = useMutation({
    mutationFn: (data: ProviderConfigRequest) =>
      api.updateProvider(providerId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['provider', providerId] })
      queryClient.invalidateQueries({ queryKey: ['providers'] })
      setApiKey('')
      setShowKey(false)
    },
  })

  const testMutation = useMutation({
    mutationFn: () => api.testProviderConnection(providerId!),
    onSuccess: (result) => {
      setTestResult(result)
    },
  })

  const resetMutation = useMutation({
    mutationFn: () => api.deleteProvider(providerId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['provider', providerId] })
      queryClient.invalidateQueries({ queryKey: ['providers'] })
      setApiKey('')
      setApiUrl('')
      setIsEnabled(true)
      setTestResult(null)
      setShowResetDialog(false)
    },
  })

  const discoverMutation = useMutation({
    mutationFn: () => api.discoverProviderModels(providerId!),
    onSuccess: (result) => {
      setDiscoveredModels(result.models)
      setHasDiscovered(true)
    },
  })

  const handleSave = () => {
    const data: ProviderConfigRequest = {
      is_enabled: isEnabled,
    }
    if (apiKey.trim()) {
      data.api_key = apiKey.trim()
    }
    if (apiUrl.trim()) {
      data.api_url = apiUrl.trim()
    }
    setTestResult(null)
    updateMutation.mutate(data)
  }

  // Not found
  if (!provider) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <p className="text-lg mb-2">Provider not found</p>
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Go Back
        </Button>
      </div>
    )
  }

  // Status: configured+enabled, has key but disabled, or unconfigured
  const statusType = providerConfig?.is_configured
    ? 'configured'
    : providerConfig?.has_api_key
      ? 'disabled'
      : 'unconfigured'

  // Filter discovered models
  const filteredDiscovered = discoveredModels.filter(
    (m) => discoveryFilter === 'all' || m.type === discoveryFilter,
  )
  const imageCount = discoveredModels.filter((m) => m.type === 'image').length
  const videoCount = discoveredModels.filter((m) => m.type === 'video').length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-6 border-b border-border">
        <div className="max-w-3xl mx-auto">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold">{provider.name}</h1>
              <Button
                variant="outline"
                size="sm"
                className="flex-shrink-0"
                onClick={() => window.open(provider.website, '_blank')}
              >
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Website
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              {provider.capabilities.map((cap) => (
                <span
                  key={cap}
                  className="text-xs bg-muted px-2 py-0.5 rounded text-muted-foreground"
                >
                  {cap}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto p-6 space-y-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Status banner */}
              <div
                className={cn(
                  'rounded-xl p-4 border flex items-center gap-3',
                  statusType === 'configured' && 'bg-green-500/10 border-green-500/30',
                  statusType === 'disabled' && 'bg-yellow-500/10 border-yellow-500/30',
                  statusType === 'unconfigured' && 'bg-muted/50 border-border',
                )}
              >
                {statusType === 'configured' && (
                  <>
                    <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-green-400">
                        Configured and enabled
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {provider.name} is ready to use with your API key.
                      </p>
                    </div>
                  </>
                )}
                {statusType === 'disabled' && (
                  <>
                    <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-yellow-400">
                        API key set but provider disabled
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Toggle the enable switch below to activate this provider.
                      </p>
                    </div>
                  </>
                )}
                {statusType === 'unconfigured' && (
                  <>
                    <KeyRound className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium">Not configured</p>
                      <p className="text-xs text-muted-foreground">
                        Add your {provider.name} API key to get started.
                      </p>
                    </div>
                  </>
                )}
              </div>

              {/* Configuration card */}
              <section className="bg-card rounded-xl p-5 border border-border space-y-5">
                <div className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-muted-foreground" />
                  <h2 className="font-medium">Configuration</h2>
                </div>

                {/* API Key */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">API Key</label>
                  {providerConfig?.has_api_key && !apiKey ? (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 flex items-center gap-2 h-9 px-3 rounded-md border border-border bg-muted/30 text-sm text-muted-foreground">
                        <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                        API key is set
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setApiKey(' ')}
                      >
                        Change
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input
                          type={showKey ? 'text' : 'password'}
                          placeholder={`Enter ${provider.name} API key`}
                          value={apiKey.trim()}
                          onChange={(e) => setApiKey(e.target.value)}
                          className="pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowKey(!showKey)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showKey ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                      {providerConfig?.has_api_key && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setApiKey('')}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {/* API URL */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">API URL</label>
                  <Input
                    type="url"
                    placeholder="https://api.example.com"
                    value={apiUrl}
                    onChange={(e) => setApiUrl(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave as default unless you need a custom endpoint.
                  </p>
                </div>

                {/* Enable/disable toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Enable provider</p>
                    <p className="text-xs text-muted-foreground">
                      When disabled, this provider's models won't be available.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isEnabled}
                    onClick={() => setIsEnabled(!isEnabled)}
                    className={cn(
                      'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                      isEnabled ? 'bg-primary' : 'bg-muted',
                    )}
                  >
                    <span
                      className={cn(
                        'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                        isEnabled ? 'translate-x-6' : 'translate-x-1',
                      )}
                    />
                  </button>
                </div>

                <div className="border-t border-border" />

                {/* Actions */}
                <div className="flex items-center gap-3">
                  <Button
                    onClick={handleSave}
                    disabled={updateMutation.isPending}
                  >
                    {updateMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                    ) : (
                      <Save className="h-4 w-4 mr-1.5" />
                    )}
                    Save
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => {
                      setTestResult(null)
                      testMutation.mutate()
                    }}
                    disabled={testMutation.isPending || !providerConfig?.has_api_key}
                  >
                    {testMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                    ) : (
                      <Wifi className="h-4 w-4 mr-1.5" />
                    )}
                    Test Connection
                  </Button>

                  {updateMutation.isSuccess && (
                    <span className="text-sm text-green-400 flex items-center gap-1.5">
                      <CheckCircle className="h-3.5 w-3.5" />
                      Saved
                    </span>
                  )}
                </div>

                {/* Test result */}
                {testResult && (
                  <div
                    className={cn(
                      'rounded-lg p-3 text-sm border',
                      testResult.success
                        ? 'bg-green-500/10 border-green-500/30'
                        : 'bg-destructive/10 border-destructive/30',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {testResult.success ? (
                        <Wifi className="h-4 w-4 text-green-500" />
                      ) : (
                        <WifiOff className="h-4 w-4 text-destructive" />
                      )}
                      <span className={testResult.success ? 'text-green-400' : 'text-destructive'}>
                        {testResult.message}
                      </span>
                    </div>
                    {testResult.error && (
                      <p className="text-xs text-muted-foreground mt-1 ml-6">
                        {testResult.error}
                      </p>
                    )}
                  </div>
                )}
              </section>

              {/* Model Discovery (for supported providers) */}
              {supportsDiscovery && (
                <section className="bg-card rounded-xl p-5 border border-border space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Radar className="h-4 w-4 text-muted-foreground" />
                      <h2 className="font-medium">Discover Models</h2>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => discoverMutation.mutate()}
                      disabled={discoverMutation.isPending}
                    >
                      {discoverMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                      ) : (
                        <Search className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      {hasDiscovered ? 'Refresh' : 'Discover'}
                    </Button>
                  </div>

                  <p className="text-sm text-muted-foreground">
                    Auto-discover all available models from the {provider.name} API.
                    {providerId === 'krea' && ' Uses the public OpenAPI specification.'}
                    {providerId === 'fal' && ' Queries the fal.ai model catalog.'}
                  </p>

                  {/* Discovery loading state */}
                  {discoverMutation.isPending && (
                    <div className="flex items-center justify-center py-8">
                      <div className="text-center">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto" />
                        <p className="text-sm text-muted-foreground mt-2">
                          Searching for available models...
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Discovery error */}
                  {discoverMutation.isError && (
                    <div className="rounded-lg p-3 text-sm border bg-destructive/10 border-destructive/30">
                      <p className="text-destructive">
                        Discovery failed: {discoverMutation.error?.message || 'Unknown error'}
                      </p>
                    </div>
                  )}

                  {/* Discovery results */}
                  {hasDiscovered && !discoverMutation.isPending && (
                    <>
                      {/* Filter tabs + count */}
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
                          <button
                            onClick={() => setDiscoveryFilter('all')}
                            className={cn(
                              'px-3 py-1 text-xs rounded-md transition-colors',
                              discoveryFilter === 'all'
                                ? 'bg-background text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground',
                            )}
                          >
                            All ({discoveredModels.length})
                          </button>
                          <button
                            onClick={() => setDiscoveryFilter('image')}
                            className={cn(
                              'px-3 py-1 text-xs rounded-md transition-colors flex items-center gap-1',
                              discoveryFilter === 'image'
                                ? 'bg-background text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground',
                            )}
                          >
                            <Image className="h-3 w-3" />
                            Image ({imageCount})
                          </button>
                          <button
                            onClick={() => setDiscoveryFilter('video')}
                            className={cn(
                              'px-3 py-1 text-xs rounded-md transition-colors flex items-center gap-1',
                              discoveryFilter === 'video'
                                ? 'bg-background text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground',
                            )}
                          >
                            <Video className="h-3 w-3" />
                            Video ({videoCount})
                          </button>
                        </div>
                      </div>

                      {filteredDiscovered.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4 text-center">
                          No models found matching the filter.
                        </p>
                      ) : (
                        <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                          {filteredDiscovered.map((model) => {
                            const TypeIcon = model.type === 'video' ? Video : Image
                            return (
                              <div
                                key={model.id}
                                className="flex items-start gap-3 p-3 rounded-lg border border-border hover:border-foreground/20 transition-colors"
                              >
                                {/* Type icon */}
                                <div
                                  className={cn(
                                    'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
                                    model.type === 'video'
                                      ? 'bg-purple-500/20 text-purple-400'
                                      : 'bg-blue-500/20 text-blue-400',
                                  )}
                                >
                                  <TypeIcon className="h-4 w-4" />
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <h4 className="font-medium text-sm truncate">
                                      {model.name}
                                    </h4>
                                    {model.input_type && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground flex-shrink-0">
                                        {model.input_type}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground font-mono truncate mt-0.5">
                                    {model.model_id}
                                  </p>
                                  {model.description && (
                                    <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                                      {model.description}
                                    </p>
                                  )}
                                  {model.tags.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1.5">
                                      {model.tags.slice(0, 4).map((tag) => (
                                        <span
                                          key={tag}
                                          className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary"
                                        >
                                          {tag}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </>
                  )}
                </section>
              )}

              {/* Preview Models (static, from client-side data) */}
              <section>
                <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wide">
                  {supportsDiscovery ? 'Preview Models' : 'Available Models'}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {provider.models.map((model) => {
                    const TypeIcon = model.type === 'video' ? Video : Image
                    return (
                      <div
                        key={model.id}
                        className="bg-card rounded-xl p-4 border border-border hover:border-primary/50 transition-colors flex flex-col group"
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h3 className="font-medium text-sm leading-tight">
                            {model.name}
                          </h3>
                          <span className="flex-shrink-0 flex items-center gap-1 text-xs text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                            <TypeIcon className="h-3 w-3" />
                            {model.type}
                          </span>
                        </div>

                        <p className="text-xs text-muted-foreground mb-3 line-clamp-2 flex-1">
                          {model.description}
                        </p>

                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          {model.tags.map((tag) => (
                            <span
                              key={tag}
                              className="bg-primary/10 text-primary px-1.5 py-0.5 rounded"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>

              {/* Danger Zone */}
              <section className="bg-card rounded-xl p-5 border border-destructive/30 space-y-3">
                <h2 className="font-medium text-destructive">Danger Zone</h2>
                <p className="text-sm text-muted-foreground">
                  Reset this provider to its unconfigured state. This will remove your API key
                  and all settings.
                </p>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowResetDialog(true)}
                  disabled={!providerConfig?.has_api_key}
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  Reset Provider
                </Button>
              </section>
            </>
          )}
        </div>
      </div>

      {/* Reset confirmation dialog */}
      {showResetDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowResetDialog(false)} />
          <div className="relative bg-card border border-border rounded-xl p-6 max-w-md w-full mx-4 space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Reset {provider.name} Configuration</h2>
              <p className="text-sm text-muted-foreground mt-2">
                This will remove your API key and reset all settings for {provider.name}.
                You'll need to reconfigure it to use its models again.
              </p>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setShowResetDialog(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => resetMutation.mutate()}
                disabled={resetMutation.isPending}
              >
                {resetMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                Reset
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
