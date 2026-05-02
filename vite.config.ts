import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },

  build: {
    // Multi-page build:
    //   - `index.html`         → Tauri desktop shell (Mac app)
    //   - `index.landing.html` → public marketing landing (`/` on Vercel)
    //   - `index.demo.html`    → standalone canvas demo (`/demo` on Vercel)
    // All ship from `dist/` after `pnpm build`.
    rollupOptions: {
      input: {
        main: "index.html",
        landing: "index.landing.html",
        demo: "index.demo.html",
      },
    },
  },
}));
