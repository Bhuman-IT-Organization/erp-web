'use client';

import { NuqsAdapter } from 'nuqs/adapters/next/app';
import type { ReactElement, ReactNode } from 'react';

// Mounted once in app/layout.tsx: every `useListQueryState` reads and writes the URL through it (FE-15).
// A wrapper because app/ may import only `@/lib/...` (APP_IMPORT), and nuqs only lives in src/lib/url.
export function UrlStateProvider({ children }: { readonly children: ReactNode }): ReactElement {
  return <NuqsAdapter>{children}</NuqsAdapter>;
}
