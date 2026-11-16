import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import http from 'node:http'
import { spawn } from 'node:child_process'

const autoBackendPlugin = () => ({
  name: 'auto-backend',
  configureServer() {
    const req = http.get('http://localhost:3000/health', () => {});
    req.on('error', () => {
      console.log('⚡ Démarrage automatique du serveur API ALTYFLIX sur le port 3000...');
      const proc = spawn('node', ['server/server-vf-api.cjs'], {
        cwd: process.cwd(),
        stdio: 'inherit',
      });
      process.on('exit', () => proc.kill());
    });
  }
});

// https://vite.dev/config/
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/player': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
    headers: {
      'Permissions-Policy': 'fullscreen=*, picture-in-picture=*, autoplay=*',
      'Feature-Policy': 'fullscreen *; picture-in-picture *; autoplay *',
    },
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      'framer-motion',
      'firebase/app',
      'firebase/auth',
      'firebase/firestore',
      'firebase/storage',
      'date-fns',
      'react-helmet-async',
    ],
  },
  plugins: [
    autoBackendPlugin(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'ALTYFLIX - Streaming Premium',
        short_name: 'ALTYFLIX',
        description: 'Films et séries en illimité en haute qualité. Regardez gratuitement sur ALTYFLIX.',
        theme_color: '#E50914',
        background_color: '#141414',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'any',
        scope: '/',
        start_url: '/?source=pwa',
        lang: 'fr',
        categories: ['entertainment', 'lifestyle'],
        prefer_related_applications: false,
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ],
        screenshots: [
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            label: 'ALTYFLIX - Accueil'
          }
        ]
      },
      workbox: {
        globIgnores: ['**/hls-*.js', '**/dash.all.min-*.js', '**/artplayer-*.js'],
        globPatterns: ['**/*.{js,css,html,ico,svg}'],
        runtimeCaching: [
          {
            // Cache TMDB images for 30 days
            urlPattern: /^https:\/\/image\.tmdb\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tmdb-images',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          },
          {
            // Cache TMDB API calls for 1 hour
            urlPattern: /^https:\/\/api\.themoviedb\.org\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'tmdb-api',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 }
            }
          }
        ]
      }
    })
  ],
  css: {
    preprocessorOptions: {
      sass: {
        api: 'modern-compiler',
        silenceDeprecations: ['import', 'global-builtin', 'color-functions', 'mixed-decls'],
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-firebase-core': ['firebase/app', 'firebase/auth'],
          'vendor-firebase-db': ['firebase/firestore', 'firebase/storage'],
          'vendor-ui': ['framer-motion']
        }
      }
    }
  }
})

