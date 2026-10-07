import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

const backend = process.env.BACKEND_URL ?? "http://127.0.0.1:3000";

export default defineConfig({
  root: "web",
  plugins: [vue()],
  server: {
    host: "127.0.0.1",
    port: 8080,
    strictPort: true,
    proxy: {
      "/api": backend,
      "/health": backend,
    },
  },
});