import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from './contexts/ThemeContext'
import { Layout } from './components/Layout'
import { ImagePage } from './pages/ImagePage'
import { VideoPage } from './pages/VideoPage'
import { AssetsPage } from './pages/AssetsPage'
import { ModelsPage } from './pages/ModelsPage'
import { JobDetailPage } from './pages/JobDetailPage'
import { ModelDetailPage } from './pages/ModelDetailPage'
import { AssetDetailPage } from './pages/AssetDetailPage'
import { VideoAssetDetailPage } from './pages/VideoAssetDetailPage'
import SettingsPage from './pages/SettingsPage'
import RequestLogsPage from './pages/RequestLogsPage'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
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
              <Route path="settings" element={<SettingsPage />} />
              <Route index element={<Navigate to="/image" replace />} />
              <Route path="image" element={<ImagePage />} />
              <Route path="video" element={<VideoPage />} />
              <Route path="assets" element={<AssetsPage />} />
              <Route path="models" element={<ModelsPage />} />
              <Route path="model/:modelId" element={<ModelDetailPage />} />
              <Route path="job/:jobId" element={<JobDetailPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  </React.StrictMode>
)
