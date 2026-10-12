import type { ReactElement } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * `count` labelled field blocks in the form's two-column grid: a 14 × 96 px label bar over a 32 px
 * control bar. The form skeleton (`PageSkeleton form`) uses it for its section, and a section or a
 * `ChoiceField` whose data is still loading uses it on its own (UI-SPEC § Skeletons, D-35, D-39).
 * One block is one field: it fills the grid cell its field sits in, so it gets no second column.
 * It is a molecule, not part of the `PageSkeleton` organism, because `ChoiceField` (a molecule)
 * renders it and a layer imports only the layers below it (FE-06). The caller supplies the
 * `role="status"` region; this draws the shape only.
 */
export function FieldBlocksSkeleton({ count }: { readonly count: number }): ReactElement {
  return (
    <div className={cn('grid grid-cols-1 gap-x-6 gap-y-4', count > 1 && 'md:grid-cols-2')}>
      {Array.from({ length: Math.max(0, count) }, (_, index) => (
        <div
          // A fixed list of placeholders that never reorders: the index is its identity.
          key={index}
          className="flex flex-col gap-2"
          data-testid="skeleton-field"
        >
          <Skeleton className="h-3.5 w-24" data-testid="skeleton-field-label" />
          <Skeleton className="h-8 w-full" data-testid="skeleton-field-control" />
        </div>
      ))}
    </div>
  );
}
