'use client';

import { useTranslations } from 'next-intl';
import { useState, type ReactElement } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { Button } from '@/components/ui/button';
import { useFormat } from '@/lib/i18n/format';

/** How many removed permissions are shown before "Show N more". */
const REMOVED_SHOWN = 10;

export interface PermissionChangesProps {
  /** The base of the two lists' ids (`${id}-removed-rest`, `${id}-added`), which the buttons' `aria-controls` name. */
  readonly id: string;
  /** One line per removed permission, already worded by the feature ("Sales · invoices · Delete"). */
  readonly removed: readonly string[];
  /** One line per added permission, worded the same way. */
  readonly added: readonly string[];
}

interface DisclosureProps {
  readonly open: boolean;
  readonly controls: string;
  readonly label: string;
  readonly onToggle: () => void;
}

/** A real disclosure button: `aria-expanded`, `aria-controls`, and a chevron that turns when open. */
function Disclosure({ open, controls, label, onToggle }: DisclosureProps): ReactElement {
  return (
    <Button
      type="button"
      variant="ghost"
      size="default"
      className="-ms-2 self-start"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
    >
      <Icon name="chevron-right" className={open ? 'rotate-90' : 'rtl:rotate-180'} />
      {label}
    </Button>
  );
}

/**
 * What a permission change does, read the same in every dialog (lead 2026-09-26: "removals open,
 * additions collapsed"). The save summary is its one user since re-apply confirms at save.
 *
 * - **Removed** permissions are listed openly under their label: losing access is the risky
 *   direction. The first 10 show at once; the rest are one "Show N more" away, in place, so no
 *   removal can be confirmed unseen.
 * - **Added** permissions sit behind "Show N added". The count is in the caller's sentence, so
 *   nothing is lost while it is closed.
 * - Both are real disclosure buttons (`aria-expanded`, `aria-controls`); the lists they control stay
 *   in the DOM, `hidden` while closed, so `aria-controls` always names an element.
 * - A side with nothing in it renders nothing: no empty "Removed", no "Show 0 added".
 *
 * The lines are the caller's (the feature words them); the component reads only `common`.
 */
export function PermissionChanges({ id, removed, added }: PermissionChangesProps): ReactElement {
  const t = useTranslations('common');
  const f = useFormat();
  const [open, setOpen] = useState({ removed: false, added: false });
  const rest = removed.slice(REMOVED_SHOWN);
  const restId = `${id}-removed-rest`;
  const addedId = `${id}-added`;
  return (
    <div className="flex flex-col gap-2 text-sm" data-testid="permission-changes">
      {removed.length === 0 ? null : (
        <div data-testid="permission-changes-removed" className="flex flex-col gap-1">
          <p className="font-semibold">{t('permissions_removed_heading')}</p>
          <ul className="flex list-disc flex-col gap-0.5 ps-5">
            {removed.slice(0, REMOVED_SHOWN).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {rest.length === 0 ? null : (
            <>
              <ul
                id={restId}
                hidden={!open.removed}
                className="flex list-disc flex-col gap-0.5 ps-5"
              >
                {rest.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <Disclosure
                open={open.removed}
                controls={restId}
                label={
                  open.removed
                    ? t('show_fewer')
                    : t('show_more_count', { count: rest.length, n: f.number(rest.length) })
                }
                onToggle={() => {
                  setOpen({ ...open, removed: !open.removed });
                }}
              />
            </>
          )}
        </div>
      )}
      {added.length === 0 ? null : (
        <div className="flex flex-col gap-1">
          <Disclosure
            open={open.added}
            controls={addedId}
            label={
              open.added
                ? t('hide_added_permissions')
                : t('show_added_permissions', { count: added.length, n: f.number(added.length) })
            }
            onToggle={() => {
              setOpen({ ...open, added: !open.added });
            }}
          />
          <ul id={addedId} hidden={!open.added} className="flex list-disc flex-col gap-0.5 ps-5">
            {added.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
