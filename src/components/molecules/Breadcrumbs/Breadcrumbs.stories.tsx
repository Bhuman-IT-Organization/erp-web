import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, waitFor } from 'storybook/test';
import { Breadcrumbs } from './Breadcrumbs';

/**
 * The trail comes from `usePathname()`, so each story sets the pathname through the Next
 * navigation mock the `@storybook/nextjs-vite` framework provides.
 */
const meta = {
  title: 'Molecules/Breadcrumbs',
  component: Breadcrumbs,
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/setup/staff' } } },
} satisfies Meta<typeof Breadcrumbs>;

export default meta;
type Story = StoryObj<typeof meta>;

/** One crumb: the leaf, `aria-current="page"` and not a link. */
export const Single: Story = {};

export const WithNewLeaf: Story = {
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/setup/staff/new' } } },
};

/** The record's name has not arrived: a fixed-width skeleton holds the space. */
export const RecordPending: Story = {
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/setup/staff/12' } } },
};

export const RecordLoaded: Story = {
  args: { recordLabel: 'Example Person' },
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/setup/staff/12' } } },
};

/** The page could not load the record (`null`): the leaf reads the record placeholder, no skeleton. */
export const RecordUnavailable: Story = {
  args: { recordLabel: null },
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/setup/staff/12' } } },
  play: async ({ canvasElement }) => {
    await waitFor(async () => {
      await expect(canvasElement.querySelector('[data-testid="breadcrumb-skeleton"]')).toBeNull();
      await expect(
        canvasElement.querySelector('[aria-current="page"]')?.textContent.trim(),
      ).toBeTruthy();
    });
  },
};

export const Rtl: Story = {
  globals: { locale: 'ar' },
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/setup/staff/new' } } },
};
