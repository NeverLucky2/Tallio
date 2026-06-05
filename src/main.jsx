import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import IconLibraryProvider from './IconLibraryProvider.jsx'
import { migrateStorageNamespace } from './migrateStorageNamespace.js'

// Relocate any legacy billtracker-* localStorage to the tallio-* namespace
// before React mounts, since hooks read storage at first render.
migrateStorageNamespace()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <IconLibraryProvider>
      <App />
    </IconLibraryProvider>
  </StrictMode>,
)
