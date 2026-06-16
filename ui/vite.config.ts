// 「防水卷材国标问答」Web UI（专业暗色三栏工作台）。
// root 指到本目录；dev 时 /api 代理到 `npm run web` 的后端（4111）；生产由 web.ts 托管 dist。
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
      '/api': 'http://localhost:4111',
    },
  },
})
