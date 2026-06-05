// src/iconLibraryContext.js
// Context + hook for the icon library, split out from IconLibraryProvider so the
// provider file only exports a component (satisfies react-refresh). A safe
// default lets <Icon> render (fallback glyph) without a provider in tests.
import { createContext, useContext } from 'react';

export const DEFAULT_ICON_LIBRARY = {
  images: [], urlForId: () => undefined,
  addFromFile: async () => {}, remove: async () => {},
  updateMeta: async () => {}, reload: () => {},
  snapshot: () => [], restore: async () => {}, registerBeforeChange: () => {},
};

export const IconLibraryContext = createContext(DEFAULT_ICON_LIBRARY);

export function useIconLibrary() { return useContext(IconLibraryContext); }
