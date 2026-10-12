import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { markReachable, markUnreachable } from '@/lib/api/api-status';
import { ApiUnreachableBanner } from './ApiUnreachableBanner';

const RETRY_AFTER_S = 30;

/**
 * The banner reads the external api-status store, so each story sets that store before the
 * component mounts (`useSyncExternalStore` reads the snapshot on mount). Each story sets its own
 * state, so nothing has to be undone when a story unmounts.
 */
function withApiStatus(retryAfterS: number | null | 'reachable'): Decorator {
  return function ApiStatusDecorator(Story) {
    if (retryAfterS === 'reachable') markReachable();
    else markUnreachable(retryAfterS);
    return <Story />;
  };
}

const meta = {
  title: 'Organisms/ApiUnreachableBanner',
  component: ApiUnreachableBanner,
} satisfies Meta<typeof ApiUnreachableBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Nothing renders while the api answers. */
export const Reachable: Story = {
  decorators: [withApiStatus('reachable')],
  // Renders nothing by design (the api is reachable); check:a11y asserts the empty root.
  parameters: { a11yRunner: { rendersNothing: true } },
};

/** A 503 with `Retry-After: 30` (breaker open). */
export const Unreachable: Story = {
  decorators: [withApiStatus(RETRY_AFTER_S)],
};

/** A timeout or network failure: no retry hint. */
export const UnreachableNoDelay: Story = {
  decorators: [withApiStatus(null)],
};

/** The same under `ar`: the toolbar decorator sets `dir="rtl"`. */
export const UnreachableRtl: Story = {
  decorators: [withApiStatus(RETRY_AFTER_S)],
  globals: { locale: 'ar' },
};
