'use client';

import { Direction as RadixDirection } from 'radix-ui';
import type { ReactElement, ReactNode } from 'react';
import type { Direction } from '@/i18n/direction';

// Mounted once in app/layout.tsx beside `<html dir>` (FE-20): Radix menus, selects and sub-menus
// read direction from context, not the DOM. A wrapper because app/ may import only `@/lib/...` (APP_IMPORT).
export function DirectionProvider({
  dir,
  children,
}: {
  readonly dir: Direction;
  readonly children: ReactNode;
}): ReactElement {
  return <RadixDirection.Provider dir={dir}>{children}</RadixDirection.Provider>;
}
