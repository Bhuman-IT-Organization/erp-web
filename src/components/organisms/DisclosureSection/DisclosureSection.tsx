'use client';

import { useState, type ReactElement, type ReactNode } from 'react';
import { Icon } from '@/components/atoms/Icon';

export interface DisclosureSectionProps {
  /** Already translated, and names the contents: "Social profiles", never "More" (finding 7). */
  readonly title: string;
  /** A field inside has a value or an error: open, and the member cannot close it over the error. */
  readonly forceOpen: boolean;
  readonly children: ReactNode;
}

/**
 * The one place per section for rare fields (ui-kit-decisions §3): a native `<details>`/`<summary>`,
 * so the keyboard, the disclosure role and the expanded state come from the browser. It is closed by
 * default and open whenever a field inside has a value or an error (UI-SPEC choice 19) — the reason
 * tabs were rejected is that an error in a closed tab is invisible, and a closed disclosure holding
 * an error would repeat it. `open = forceOpen || the member's own toggle`.
 */
export function DisclosureSection({
  title,
  forceOpen,
  children,
}: DisclosureSectionProps): ReactElement {
  const [userOpen, setUserOpen] = useState(false);
  const open = forceOpen || userOpen;
  return (
    <details
      open={open}
      onToggle={(event) => {
        const node = event.currentTarget;
        // Forced open: an error or a value inside must stay visible. The summary's preventDefault
        // stops the toggle in a browser; this catches any toggle that still gets through.
        if (forceOpen && !node.open) node.open = true;
        else setUserOpen(node.open);
      }}
    >
      <summary
        className="flex h-8 cursor-pointer list-none items-center gap-2 text-sm font-semibold [&::-webkit-details-marker]:hidden"
        onClick={(event) => {
          if (forceOpen) event.preventDefault();
        }}
      >
        <Icon
          name="chevron-right"
          className={open ? 'size-4 rotate-90' : 'size-4 rtl:rotate-180'}
        />
        {title}
      </summary>
      <div className="pt-4">{children}</div>
    </details>
  );
}
