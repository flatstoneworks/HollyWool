import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 8030,
    host: '0.0.0.0',
    allowedHosts: ['spark.local'],
    proxy: {
      '/api': {
        target: 'http://localhost:8031',
        changeOrigin: true,
      },
      '/outputs': {
        target: 'http://localhost:8031',
        changeOrigin: true,
      },
    },
  },
})
