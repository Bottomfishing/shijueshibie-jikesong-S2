import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// 多页面入口：index.html 是进入页（名字未定，先占位），app.html 是体验本体
const page = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  // host: true 让我们可以用手机/平板在同局域网打开调试，省得一直守着电脑摄像头
  server: { host: true, port: 5173, open: false },
  build: {
    target: 'esnext',
    sourcemap: false,
    // three 体积较大，单独拆出来便于缓存
    rollupOptions: {
      input: {
        index: page('./index.html'),
        app: page('./app.html'),
      },
      output: {
        manualChunks: {
          three: ['three'],
          mediapipe: ['@mediapipe/tasks-vision'],
        },
      },
    },
  },
})
