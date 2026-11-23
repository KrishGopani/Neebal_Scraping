/**
 * Vite build/dev-server configuration for the PriceIQ frontend.
 *
 * Vite serves the React app in development (http://localhost:5173) and bundles it for production into
 * `frontend/dist/`, which the FastAPI backend then serves as static files. This is the only config file the
 * frontend toolchain needs (Tailwind v4 is configured in src/index.css, not in a tailwind.config file).
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // react(): JSX/TSX compilation + hot reload.  tailwindcss(): scans the source for class names and generates only the CSS used.
  plugins: [react(), tailwindcss()],
  // Dev server: any request starting with /api is forwarded to the FastAPI backend on :8000, so the browser sees one origin
  // (no CORS setup needed while developing).
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:8000' } },
  // The bundle includes the ECharts library (~1 MB). Raise the warning threshold so the build output stays quiet.
  build: { chunkSizeWarningLimit: 1500 },
})
