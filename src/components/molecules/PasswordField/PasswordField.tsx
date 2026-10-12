'use client';

import { useTranslations } from 'next-intl';
import { useState, type ComponentProps, type ReactElement } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface PasswordFieldProps extends Omit<ComponentProps<'input'>, 'type'> {
  readonly id: string;
}

/**
 * A password input with a reveal control (UI review finding 9: "no eye icon"). The reveal is a
 * 32 px ghost button inside the input at the inline end, so it mirrors under `ar`. Its accessible
 * NAME is "Show password" / "Hide password" — never an icon alone — with `aria-pressed` for the
 * state and `aria-controls` naming the input. `autoComplete` defaults to `new-password`, so the
 * browser never fills the member's own password into a staff record (T-3.2-39); a sign-in form
 * passes `current-password`. Every other input prop (`aria-invalid`, `aria-required`,
 * `aria-describedby`, `disabled`, the form field's `value`/`onChange`) is forwarded to the input.
 */
export function PasswordField({
  id,
  className,
  autoComplete = 'new-password',
  disabled,
  ...rest
}: PasswordFieldProps): ReactElement {
  const t = useTranslations('common');
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="relative">
      <Input
        {...rest}
        id={id}
        type={revealed ? 'text' : 'password'}
        autoComplete={autoComplete}
        disabled={disabled}
        className={cn('pe-10', className)}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute end-0 top-0"
        aria-label={revealed ? t('hide_password') : t('show_password')}
        aria-pressed={revealed}
        aria-controls={id}
        disabled={disabled}
        onClick={() => {
          setRevealed((was) => !was);
        }}
      >
        <Icon name={revealed ? 'eye-slash' : 'eye'} />
      </Button>
    </div>
  );
}
