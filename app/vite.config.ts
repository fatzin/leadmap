import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 6900,
    host: true,
    proxy: {
      '/api/v1': {
        target: process.env.VITE_SCRAPER_URL || 'http://localhost:6901',
        changeOrigin: true,
        ws: true,
        rewriteWsOrigin: true,
      },
    },
  },
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
})
