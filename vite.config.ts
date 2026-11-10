import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

let sha = 'nogit';
try { sha = execSync('git rev-parse --short HEAD').toString().trim(); } catch { /* not a repo */ }
const version = JSON.parse(readFileSync('package.json', 'utf8')).version as string;
const localISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16).replace('T', ' ');
const stamp = `${version}+${sha} (${localISO()})`;

export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(stamp) },
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
