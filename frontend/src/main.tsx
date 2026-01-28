import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider, MutationCache } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from './contexts/ThemeContext'
import { Layout } from './components/Layout'
import { ImagePage } from './pages/ImagePage'
import { VideoPage } from './pages/VideoPage'
import { AssetsPage } from './pages/AssetsPage'
import { ModelsPage } from './pages/ModelsPage'
import { CivitaiModelDetailPage } from './pages/CivitaiModelDetailPage'
import { ProviderDetailPage } from './pages/ProviderDetailPage'
import { JobDetailPage } from './pages/JobDetailPage'
import { ModelDetailPage } from './pages/ModelDetailPage'
import { AssetDetailPage } from './pages/AssetDetailPage'
import { VideoAssetDetailPage } from './pages/VideoAssetDetailPage'
import { BulkOperationPage } from './pages/BulkOperationPage'
import SettingsPage from './pages/SettingsPage'
import RequestLogsPage from './pages/RequestLogsPage'
import QueuePage from './pages/QueuePage'
import { Toaster } from './components/ui/toaster'
import { toast } from './hooks/use-toast'
import './index.css'

// Redirect to spark.local if running on a DGX Spark and accessed via localhost
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
  fetch('/api/health')
    .then(r => r.json())
    .then(data => {
      if (data.hostname) {
        window.location.replace(
          `${window.location.protocol}//${data.hostname}:${window.location.port}${window.location.pathname}${window.location.search}${window.location.hash}`
        )
      }
    })
    .catch(() => {})
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
  mutationCache: new MutationCache({
    onSuccess: (_data, _variables, _context, mutation) => {
      const msg = (mutation.meta as Record<string, string> | undefined)?.successMessage
      if (msg) {
        toast({ title: msg, variant: 'success' })
      }
    },
    onError: (error, _variables, _context, mutation) => {
      const meta = mutation.meta as Record<string, string> | undefined
      const msg = meta?.errorMessage
      if (msg) {
        toast({ title: msg, description: (error as Error).message, variant: 'destructive' })
      }
    },
  }),
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            {/* Full-screen views (no header) */}
            <Route path="asset/:assetId" element={<AssetDetailPage />} />
            <Route path="asset/video/:assetId" element={<VideoAssetDetailPage />} />

            {/* Main app with header */}
            <Route path="/" element={<Layout />}>
              <Route path="logs" element={<RequestLogsPage />} />
              <Route path="queue" element={<QueuePage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route index element={<Navigate to="/image" replace />} />
              <Route path="image" element={<ImagePage />} />
              <Route path="video" element={<VideoPage />} />
              <Route path="bulk" element={<BulkOperationPage />} />
              <Route path="assets" element={<AssetsPage />} />
              <Route path="models" element={<ModelsPage />} />
              <Route path="models/civitai/:modelId" element={<CivitaiModelDetailPage />} />
              <Route path="provider/:providerId" element={<ProviderDetailPage />} />
              <Route path="model/:modelId" element={<ModelDetailPage />} />
              <Route path="job/:jobId" element={<JobDetailPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
      <Toaster />
    </ThemeProvider>
  </React.StrictMode>
)
