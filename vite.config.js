import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import cesium from 'vite-plugin-cesium'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    cesium(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://100.104.49.70:9997', //虚拟局域网802主机
        // target: 'http://192.168.100.214:9992', //莫干山服务器-湖南服务
        // target: 'http://192.168.100.214:9990', //莫干山服务器-浙江服务
        // target: 'http://127.0.0.1:9997', //本地测试
        changeOrigin: true,
      },
    }
  }
  
})
