import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/pwa-player-music/' : '/',
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
        start_url: '/pwa-player-music/',
        scope: '/pwa-player-music/',
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
