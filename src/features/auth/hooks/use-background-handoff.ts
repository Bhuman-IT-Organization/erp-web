import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { CLIENT_TIMINGS } from '@/lib/api/client-timings';
import { openLegacySession, type LegacyOpener } from '@/lib/auth/legacy-session';
import { getAccessToken } from '@/lib/auth/session';

/** One notice at a time: a second failure replaces the first. */
const HANDOFF_TOAST_ID = 'legacy-handoff-failed';

/**
 * Opens the Perfex session in the background while the member is already on a Node page (quick
 * 261009-lgn): the tab's one shared flight (`openLegacySession`), never awaited by the caller. A
 * failure blocks nothing and sends nobody back: it toasts `auth.handoff_failed` with Retry, which
 * hands off again with the session's current token. Without Retry, the next Perfex link clicked
 * hands off on its own (`useLegacyLinkGuard`).
 */
export function useBackgroundHandoff(handoff: LegacyOpener): (accessToken: string) => void {
  const t = useTranslations('auth');
  const tc = useTranslations('common');
  // Resolved now, not when the flight lands: by then this component has usually unmounted.
  const message = t('handoff_failed');
  const retry = tc('retry');

  function inBackground(accessToken: string): void {
    void openLegacySession(accessToken, handoff).then((opened) => {
      if (opened) return;
      toast.error(message, {
        id: HANDOFF_TOAST_ID,
        duration: CLIENT_TIMINGS.toast.durationMs,
        action: {
          label: retry,
          onClick: () => {
            const token = getAccessToken();
            if (token !== null) inBackground(token);
          },
        },
      });
    });
  }

  return inBackground;
}
