import { defineConfig } from "vite";

export default defineConfig({
  build: {
    assetsDir: "Assets",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: "./index.html",
        game: "./game.html",
        howToPlay: "./how-to-play.html",
        botStabilityLab: "./bot-stability-lab.html",
        botShortFuseLab: "./bot-short-fuse-lab.html",
        dangerChainLab: "./danger-chain-lab.html",
        suddenDeathLab: "./sudden-death-lab.html",
        botPowerUpDangerLab: "./bot-powerup-danger-lab.html",
        botTargetLab: "./bot-target-lab.html",
        privacy: "./privacy.html",
        terms: "./terms.html",
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5174,
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
