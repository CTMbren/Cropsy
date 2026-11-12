/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

declare const process: { env: Record<string, string | undefined> };

/** Build label shown in Settings and problem reports: date plus commit (GitHub Actions sets GITHUB_SHA). */
const version = `${new Date().toISOString().slice(0, 10)}${process.env.GITHUB_SHA ? ` ${process.env.GITHUB_SHA.slice(0, 7)}` : ' dev'}`;

// Relative base so the build works at https://<user>.github.io/<Repo>/ whatever the repo's casing,
// and on a custom domain later.
export default defineConfig({
  base: './',
  // version plus the commit it was built from, so Settings shows exactly which build a phone is running
  define: { __APP_VERSION__: JSON.stringify(process.env.GITHUB_SHA ? `${version} (${process.env.GITHUB_SHA.slice(0, 7)})` : version) },
  plugins: [
    preact(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['apple-touch-icon.png', 'favicon.png', 'fonts/*.txt'],
      manifest: {
        name: 'Cropsy',
        short_name: 'Cropsy',
        description: 'Plant, wait, harvest, and bring Bramblewick back to life.',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#8fd16a',
        theme_color: '#5cb83a',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webp,woff2,json}'],
        // Art atlases: only the index and the core pages are installed up front. Other pages (crop
        // tiers, buildings, seasons…) are cached the first time the game loads them. Their file names
        // carry a content hash, so cache-first can never serve stale art.
        globIgnores: ['art/!(index.json|core.*|core-*)'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /\/art\/[^/]+\.[0-9a-f]{8}\.(?:webp|json)$/,
            handler: 'CacheFirst',
            options: { cacheName: 'cropsy-art', expiration: { maxEntries: 80 } },
          },
        ],
      },
    }),
  ],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1600,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
