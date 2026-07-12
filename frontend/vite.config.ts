import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

// PWA is configured now (manifest + SW registration) so Web Push in Phase 7
// only needs to add push handlers, not restructure the app.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'En voiture !',
        short_name: 'En voiture',
        description: 'Jeu multijoueur coopératif de conduite de train',
        theme_color: '#1b2838',
        background_color: '#0e1621',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      // Placeholder for Phase 7 Web Push handlers.
      strategies: 'generateSW',
      workbox: { clientsClaim: true, skipWaiting: true },
    }),
  ],
  resolve: {
    alias: { '@shared': path.resolve(__dirname, '../shared') },
  },
  server: { port: 5173 },
});
