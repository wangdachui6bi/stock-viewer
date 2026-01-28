import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { fileURLToPath } from 'url'
import Inspector from 'vite-plugin-vue-inspector'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [
    vue(),
    Inspector({
      enabled: true, // 开发时默认开启：按住 Cmd+Shift(Mac) / Ctrl+Shift(Win) 后点击页面元素，在编辑器中打开对应 .vue 源码
      toggleButtonVisibility: 'always', // 页面右下角常显「点击跳源码」开关
      launchEditor: 'cursor', // 用 Cursor 打开；若用 VS Code 可改为 'code'
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
