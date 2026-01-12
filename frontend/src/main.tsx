import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ImagePage } from './pages/ImagePage'
import { VideoPage } from './pages/VideoPage'
import { GalleryPage } from './pages/GalleryPage'
import { ModelsPage } from './pages/ModelsPage'
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
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/image" replace />} />
            <Route path="image" element={<ImagePage />} />
            <Route path="video" element={<VideoPage />} />
            <Route path="gallery" element={<GalleryPage />} />
            <Route path="models" element={<ModelsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
)
