import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import IconLibraryProvider from './IconLibraryProvider.jsx'
import { migrateStorageNamespace } from './migrateStorageNamespace.js'
import { takeReloadNote } from './crossWindowSync.js'
import { registerSW } from 'virtual:pwa-register'

// Relocate any legacy billtracker-* localStorage to the tallio-* namespace
// before React mounts, since hooks read storage at first render.
migrateStorageNamespace()

// Install the offline service worker in production builds only.
if (import.meta.env.PROD) registerSW({ immediate: true })

// Taken once per page load, outside React: StrictMode runs mount effects twice in dev.
const reloadedByOtherWindow = takeReloadNote()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <IconLibraryProvider>
      <App reloadedByOtherWindow={reloadedByOtherWindow} />
    </IconLibraryProvider>
  </StrictMode>,
)
