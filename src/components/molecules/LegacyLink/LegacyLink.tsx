import { useTranslations } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { cn } from '@/lib/utils';

export interface LegacyLinkProps {
  /** A Perfex path with exactly one leading `/` (`/admin/purchase/purchase_order/12`). */
  readonly href: string;
  readonly children: ReactNode;
  readonly className?: string;
}

/** One leading slash, never `//` or `/\` (both read as another host): T-4.2-44, T-4.6-29. */
const SAME_ORIGIN_PATH = /^\/(?![/\\])/;

/**
 * K22 (04.6 UI-SPEC § Kit additions): a link to a Perfex page. A plain `<a>` (a full page load into
 * Perfex, no `target`, no script), the 12px `external-link` glyph and the visually hidden "opens in
 * Perfex". Only a same-origin path becomes a link: any other value (another host, `//host`, `/\host`,
 * `javascript:`, a relative path) renders its text alone, so a stored value can never make an open
 * redirect or a script link (T-4.6-29). A molecule (FE-06): it uses the `Icon` atom and a message.
 * Replaces the hand-rolled copies in `NavItemLink`, `TabLinks`, `AccountMenu` and the mail feature
 * when each is next touched.
 */
export function LegacyLink({ href, children, className }: LegacyLinkProps): ReactElement {
  const t = useTranslations('common');
  if (!SAME_ORIGIN_PATH.test(href)) return <>{children}</>;
  return (
    <a
      href={href}
      className={cn('inline-flex items-center gap-1 underline-offset-4 hover:underline', className)}
    >
      {children}
      <Icon name="external-link" className="size-3 shrink-0" />
      <span className="sr-only">{t('opens_in_perfex')}</span>
    </a>
  );
}
