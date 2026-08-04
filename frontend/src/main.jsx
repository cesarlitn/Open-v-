// React entry point. Mounts <App> wrapped in <ErrorBoundary> into #root.

import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { getTheme, applyTheme } from './utils/theme'
import './styles/global.css'

// Apply saved theme before first paint to avoid a flash.
applyTheme(getTheme())

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
