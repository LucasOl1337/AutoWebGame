import { defineConfig } from "vite";

export default defineConfig({
  build: {
    assetsDir: "Assets",
    emptyOutDir: true,
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
      "/online": {
        target: "ws://127.0.0.1:8787",
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
