import { useTranslations } from 'next-intl';
import { isValidElement, type ReactNode } from 'react';

/** The text a cell shows: a string or number, or the one string inside an element such as <bdi>. */
export const textOf = (value: ReactNode): string | null => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (isValidElement<{ readonly children?: ReactNode }>(value)) return textOf(value.props.children);
  return null;
};

export interface EmptyAsNoneProps {
  readonly value: ReactNode;
}

/**
 * A list cell's read value; an empty one reads "None", never a blank cell (UI-SPEC), on every list
 * (EditableTable and ListPageTemplate both render through it). On a ticked row (a muted fill) the
 * muted word would fail AA contrast, so it reads as the row's text there.
 *
 * Moved to a molecule in plan 04.6-04 so molecules can use it (`RecordSummary`, K16); a molecule
 * imports only `ui/`, atoms and `lib/` (FE-06). `templates/EditableTable` re-exports it under the
 * same name, so no caller changed.
 */
export function EmptyAsNone({ value }: EmptyAsNoneProps): ReactNode {
  const t = useTranslations('common');
  if (textOf(value) !== '') return value;
  return (
    <span className="text-muted-foreground in-data-[state=selected]:text-foreground">
      {t('none')}
    </span>
  );
}
