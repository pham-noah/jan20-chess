import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({
  base: './',
  plugins: [VitePWA({
    registerType: 'autoUpdate',
    manifest: {
      name: 'Jan20', short_name: 'Jan20', display: 'standalone',
      background_color: '#101820', theme_color: '#101820', start_url: './',
      icons: [
        { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
      ]
    },
    workbox: { globPatterns: ['**/*.{js,css,html,png,svg,wasm,json}'], maximumFileSizeToCacheInBytes: 6 * 1024 * 1024 }
  })]
});
