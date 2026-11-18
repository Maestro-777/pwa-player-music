import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const githubPages = Boolean(process.env.GITHUB_ACTIONS)

export default defineConfig({
  base: githubPages ? '/pwa-player-music/' : '/',
  server: {
    host: '0.0.0.0',
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4317',
        changeOrigin: true,
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Resonance Music',
        short_name: 'Resonance',
        description: 'Твоя музыка. Твоё пространство.',
        theme_color: '#111318',
        background_color: '#111318',
        display: 'standalone',
        start_url: githubPages ? '/pwa-player-music/' : '/',
        scope: githubPages ? '/pwa-player-music/' : '/',
        icons: [
          { src: 'icon-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,webmanifest}'],
        navigateFallback: 'index.html',
        runtimeCaching: [{
          urlPattern: ({ url }) => url.pathname.includes('/api/stream/'),
          handler: 'NetworkOnly'
        }]
      }
    })
  ],
})
