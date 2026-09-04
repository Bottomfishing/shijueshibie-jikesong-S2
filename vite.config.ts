import { defineConfig } from 'vite'

export default defineConfig({
  // host: true 让我们可以用手机/平板在同局域网打开调试，省得一直守着电脑摄像头
  server: { host: true, port: 5173, open: false },
  build: {
    target: 'esnext',
    sourcemap: false,
    // three 体积较大，单独拆出来便于缓存
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          mediapipe: ['@mediapipe/tasks-vision'],
        },
      },
    },
  },
})
