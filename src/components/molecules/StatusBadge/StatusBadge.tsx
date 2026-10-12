import type { ReactElement } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { Badge } from '@/components/ui/badge';

export interface StatusBadgeProps {
  readonly status: 'active' | 'inactive' | 'alert' | 'done' | 'pending' | 'rejected' | 'returned';
  /** Already translated: the label is always rendered, so colour is never the only channel. */
  readonly label: string;
}

/**
 * A record's status. Active is the fixed `--success` pair, a meaning colour no brand can change
 * (D-06, UI-SPEC § Color "Status colours are fixed"); Inactive is the neutral secondary badge. The
 * text label carries the meaning; the colour only repeats it.
 *
 * `alert` (K10, 4.2 UI-SPEC § Color): an outline badge in the
 * foreground colour with a 12px `triangle-exclamation` before the word. Never red: red stays for
 * destructive actions and errors, and the icon plus the word carry the meaning.
 *
 * `done` and `pending` (M1, 4.3 UI-SPEC § Color): a finished state (Sent, Configured) is the
 * secondary fill with a 12px `check`; a waiting one (Queued, Retrying) is outline with a 12px
 * `clock-o`. Both keep the word, so the icon is decoration (`aria-hidden`).
 *
 * `rejected` and `returned` (K20, 04.6 UI-SPEC § Color): a rejected document is outline with a 12px
 * `circle-xmark`, never red (red stays for destructive actions); a returned one is the secondary
 * fill with a 12px `undo`, shown instead of the approval badge.
 */
export function StatusBadge({ status, label }: StatusBadgeProps): ReactElement {
  switch (status) {
    case 'alert':
      return (
        <Badge variant="outline" data-status="alert">
          <Icon name="triangle-exclamation" className="size-3" />
          {label}
        </Badge>
      );
    case 'done':
      return (
        <Badge variant="secondary" data-status="done">
          <Icon name="check" className="size-3" />
          {label}
        </Badge>
      );
    case 'pending':
      return (
        <Badge variant="outline" data-status="pending">
          <Icon name="clock-o" className="size-3" />
          {label}
        </Badge>
      );
    case 'rejected':
      return (
        <Badge variant="outline" data-status="rejected">
          <Icon name="circle-xmark" className="size-3" />
          {label}
        </Badge>
      );
    case 'returned':
      return (
        <Badge variant="secondary" data-status="returned">
          <Icon name="undo" className="size-3" />
          {label}
        </Badge>
      );
    case 'active':
      return (
        <Badge className="bg-success text-success-foreground" data-status="active">
          {label}
        </Badge>
      );
    case 'inactive':
      return (
        <Badge variant="secondary" data-status="inactive">
          {label}
        </Badge>
      );
  }
}
