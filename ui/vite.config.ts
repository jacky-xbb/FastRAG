// 「防水卷材国标问答」Web UI（专业暗色三栏工作台）。
// root 指到本目录；dev 时 /api 代理到本地 node 服务 `src/server.ts`（8080）；生产由 server.ts 托管 dist。
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
      '/api': 'http://localhost:8080',
    },
  },
})
