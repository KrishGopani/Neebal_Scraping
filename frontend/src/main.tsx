/**
 * Application entry point (loaded by index.html).
 *
 * Mounts the React tree into <div id="root">, pulls in the global stylesheet, and renders <App /> (src/App.tsx),
 * which sets up routing, data fetching, theming and user settings.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

// StrictMode double-invokes effects in development to surface bugs early; it has no effect in the production build.
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
