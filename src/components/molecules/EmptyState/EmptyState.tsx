import type { ReactElement, ReactNode } from 'react';

export interface EmptyStateProps {
  /** Already translated: the feature names its own noun ("No staff members yet"). */
  readonly heading: string;
  readonly body: string;
  /** The next step: the create button for "nothing yet", Clear search for "no results" (D-30). */
  readonly action?: ReactNode;
  readonly testId?: string;
}

/**
 * An empty list: a message plus the next action, no illustration (D-30). Start-aligned in the table
 * area with 64 px block padding, an 18/600 heading, a 14 px muted body and the action 16 px below
 * (UI-SPEC § Empty states). The caller renders it only after the list request has RETURNED empty,
 * never while it loads (D-39); the heading and the action tell "nothing yet" from "no results".
 */
export function EmptyState({
  heading,
  body,
  action,
  testId = 'list-empty',
}: EmptyStateProps): ReactElement {
  return (
    <div data-testid={testId} className="flex flex-col items-start gap-1 py-16">
      <h2 className="text-lg font-semibold">{heading}</h2>
      <p className="text-muted-foreground text-sm">{body}</p>
      {action === undefined ? null : <div className="mt-4">{action}</div>}
    </div>
  );
}
