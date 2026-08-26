import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  const desktop = mode === "desktop" || Boolean(process.env.TAURI_ENV_PLATFORM);
  return {
  define: { __WEB_BUILD__: JSON.stringify(!desktop) },
  plugins: [react(), VitePWA({
    disable: desktop,
    registerType: "prompt", injectRegister: false,
    includeAssets: ["favicon.svg", "icons/*.png"],
    manifest: { name: "BookReader", short_name: "BookReader", description: "本地优先的 EPUB 阅读器", lang: "zh-CN",
      start_url: "/", scope: "/", display: "standalone", background_color: "#f6f6f3", theme_color: "#f6f6f3",
      icons: [{ src: "/icons/icon-256.png", sizes: "256x256", type: "image/png" }, { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }] },
    workbox: { globPatterns: ["**/*.{js,css,html,png,svg,woff2}"], maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      navigateFallback: "/index.html", cleanupOutdatedCaches: true },
    devOptions: { enabled: false },
  })],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    outDir: desktop ? "dist-desktop" : "dist",
    target: desktop ? "chrome105" : "safari17",
    minify: process.env.TAURI_ENV_DEBUG ? false : "esbuild",
    sourcemap: Boolean(process.env.TAURI_ENV_DEBUG),
  },
};
});
