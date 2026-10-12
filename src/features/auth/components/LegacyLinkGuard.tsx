'use client';

import { handoffToLegacy } from '@/features/auth/api/legacy-handoff';
import { useLegacyLinkGuard } from '@/lib/hooks/use-legacy-link-guard';

/**
 * Mounted once by the shell layout: every link into Perfex on a Node page waits for this tab's
 * legacy session, handing off with `handoffToLegacy` when it never opened (quick 261009-lgn). It
 * lives in the auth feature because `src/lib` and `src/components` never import the handoff (FE-01).
 * Not on `/login`: its Perfex links (forgot password, directory sign-in) need no session.
 */
export function LegacyLinkGuard(): null {
  useLegacyLinkGuard(handoffToLegacy);
  return null;
}
