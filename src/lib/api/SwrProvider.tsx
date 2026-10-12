'use client';

import { SWRConfig } from 'swr';
import type { ReactNode } from 'react';
import { SWR_GLOBAL_CONFIG } from './swr-config';

// Mounted once in app/layout.tsx: every SWR hook in the tree inherits the ADR-0031 §5 policy.
export function SwrProvider({ children }: { readonly children: ReactNode }) {
  return <SWRConfig value={SWR_GLOBAL_CONFIG}>{children}</SWRConfig>;
}
