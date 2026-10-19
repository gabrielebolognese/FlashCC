import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // The engine page (31.3) ships beside the app: the API drives it headless.
      input: { main: "index.html", engine: "engine.html" },
    },
  },
  server: {
    // Overridable, because a stale dev server holding 5173 is common enough that
    // picking another port should not mean editing a config file. Vite falls
    // forward on its own when this one is taken too.
    port: Number(process.env.VITE_PORT ?? 5173),
    strictPort: false,
    // The API key lives on the drafting server, never in the browser bundle.
    proxy: {
      "/api": { target: "http://localhost:8787", changeOrigin: true },
    },
  },
});
