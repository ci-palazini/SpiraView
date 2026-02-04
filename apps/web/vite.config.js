// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'generateSW',
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.svg',
        'robots.txt',
        'apple-touch-icon.png'
      ],
      //devOptions: { enabled: true },
      manifest: {
        name: 'SpiraView',
        short_name: 'SpiraView',
        description: 'SpiraView - Sistema de Gestão TPM (PWA)',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#111827',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable any' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable any' }
        ]
      },
      workbox: {
        navigationPreload: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,webp}'],
        navigateFallback: '/index.html', // SPA fallback
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024, // ate 6 MiB
        runtimeCaching: [
          // bloqueia googleapis/gstatic gerais (ex: auth, sdk)
          {
            urlPattern: ({ url }) =>
              url.host.includes('googleapis.com') ||
              url.host.includes('gstatic.com'),
            handler: 'NetworkOnly'
          },
          // paginas HTML navegadas
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: { cacheName: 'html-pages' }
          },
          // js/css/workers locais
          {
            urlPattern: ({ request, sameOrigin }) =>
              sameOrigin && ['style', 'script', 'worker'].includes(request.destination),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'static-assets' }
          },
          // imagens
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'images' }
          }
        ]
      }
    })
  ]
})
