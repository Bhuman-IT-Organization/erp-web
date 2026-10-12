import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, within } from 'storybook/test';
import { InlineError } from './InlineError';

/** A failed request in the area that failed (D-31). The message is `useErrorText()`'s answer. */
const meta = {
  title: 'Molecules/InlineError',
  component: InlineError,
  args: { message: 'We couldn’t load staff members. Try again in a moment.' },
} satisfies Meta<typeof InlineError>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A 5xx, a timeout or a network failure: Retry is offered. */
export const Retryable: Story = { args: { onRetry: fn() } };

/** A retry is in flight: the error stays, and Retry reads "Retrying…" and is disabled. */
export const Retrying: Story = { args: { onRetry: fn(), busy: true } };

/** A 4xx: retrying would give the same answer, so there is no Retry (FE-27). */
export const Refused: Story = { args: { message: 'Some fields need your attention.' } };

const BACK = { href: '/setup/staff?q=ada', label: 'Back to list' } as const;
const DETAIL_PAGE = { nextjs: { appDirectory: true, navigation: { pathname: '/setup/staff/4' } } };

/** A record that cannot be loaded (a 4xx): no Retry, and "Back to list" to the list it came from. */
export const WithBack: Story = {
  args: { message: 'That staff member no longer exists', back: BACK },
  parameters: DETAIL_PAGE,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const link = canvas.getByRole('link', { name: BACK.label });
    await expect(link).toHaveAttribute('href', BACK.href);
    await expect(canvas.queryByRole('button')).toBeNull();
  },
};

/** A record whose read failed retryably: Retry first, then "Back to list". */
export const WithRetryAndBack: Story = {
  args: { onRetry: fn(), back: BACK },
  parameters: DETAIL_PAGE,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const retry = canvas.getByRole('button');
    const link = canvas.getByRole('link', { name: BACK.label });
    await expect(link).toHaveAttribute('href', BACK.href);
    await expect(retry.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(
      0,
    );
  },
};

export const Rtl: Story = {
  args: { onRetry: fn(), back: BACK },
  parameters: DETAIL_PAGE,
  globals: { locale: 'ar' },
};
