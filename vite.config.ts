import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 前端 dev server 监听 0.0.0.0:5173（bonfire-tds 为 host 网络，宿主机可直接访问）
// /api 反代到后端 FastAPI(127.0.0.1:8000)
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
