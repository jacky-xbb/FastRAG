// 「防水卷材国标问答」Web UI（专业暗色三栏工作台）。
// root 指到本目录；dev 时 /api 代理到本地 `wrangler dev`（8787）；生产由 Workers assets 托管 dist。
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  root: __dirname,
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
})
