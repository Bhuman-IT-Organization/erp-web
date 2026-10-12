'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { DEFAULT_FORMAT_SETTINGS, type FormatSettings } from './format';

// `null` rather than DEFAULT_FORMAT_SETTINGS: format.ts imports this file, so reading its export at
// module load could meet it uninitialised; the default is applied at call time instead.
const FormatSettingsContext = createContext<FormatSettings | null>(null);

// Mounted once in app/layout.tsx with the request's `getBranding().formats` (D-33): every
// `useFormat()` in the tree renders the customer's Perfex formats.
export function FormatSettingsProvider({
  settings,
  children,
}: {
  readonly settings: FormatSettings;
  readonly children: ReactNode;
}) {
  return <FormatSettingsContext value={settings}>{children}</FormatSettingsContext>;
}

/** The provided settings; `DEFAULT_FORMAT_SETTINGS` outside a provider. */
export function useFormatSettings(): FormatSettings {
  return useContext(FormatSettingsContext) ?? DEFAULT_FORMAT_SETTINGS;
}
