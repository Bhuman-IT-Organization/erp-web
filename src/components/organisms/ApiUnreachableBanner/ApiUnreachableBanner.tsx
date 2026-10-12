'use client';

import { useTranslations } from 'next-intl';
import { useSyncExternalStore } from 'react';
import { REACHABLE, getApiStatus, subscribeApiStatus } from '@/lib/api/api-status';

// The single global "API unreachable" banner (ADR-0031 §5): one banner for every page, mounted
// once in app/layout.tsx; no per-widget error copies. Server snapshot is always "reachable".
// Colours are the `destructive` / `background` tokens: shadcn 4 declares no
// `--destructive-foreground`, and `text-destructive` on a tinted background is 3.98:1 (axe).
//
// On a shell page the fixed sidebar would cover the root banner's start (lead 2026-10-07: it read
// "ck your connection"), so `PageShell` renders it `inShell`, at the top of its content column, and
// the root one hides itself while a shell header is on the page (CSS `:has`, no second store).
// One banner is ever shown.
const ROOT = 'bg-destructive text-background px-4 py-2 text-sm';
const HIDDEN_UNDER_SHELL = '[body:has([data-page-header])_&]:hidden';

export interface ApiUnreachableBannerProps {
  /** `PageShell`'s copy, in its content column; absent = the root mount. */
  readonly inShell?: boolean;
}

export function ApiUnreachableBanner({ inShell = false }: ApiUnreachableBannerProps) {
  const t = useTranslations('common');
  const status = useSyncExternalStore(subscribeApiStatus, getApiStatus, () => REACHABLE);
  if (status.reachable) return null;
  return (
    <div
      role="status"
      data-testid="api-unreachable"
      className={inShell ? ROOT : `${ROOT} ${HIDDEN_UNDER_SHELL}`}
    >
      {status.retryAfterS !== null
        ? t('api_unreachable_in', { seconds: String(status.retryAfterS) })
        : t('api_unreachable')}
    </div>
  );
}
