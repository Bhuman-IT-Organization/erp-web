import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import { expect, screen, userEvent, within } from 'storybook/test';
import { TabLinks, type TabLink, type TabLinksProps } from './TabLinks';

const RECORD: readonly TabLink[] = [
  { id: 'detail', label: 'Detail', href: '/setup/cost-centers/7' },
  { id: 'in-use', label: 'In use', href: '/setup/cost-centers/7/in-use' },
  { id: 'change-log', label: 'Change log', href: '/setup/cost-centers/7/change-log' },
  { id: 'activity', label: 'Activity log', href: '/setup/cost-centers/7/activity' },
  { id: 'expenses', label: 'Expenses', href: '/setup/cost-centers/7/expenses' },
];

const legacy = (id: string, label: string): TabLink => ({
  id,
  label,
  href: `/admin/settings?group=${id}`,
  legacy: true,
});
const node = (id: string, label: string): TabLink => ({
  id,
  label,
  href: `/setup/${id}`,
});

/** The settings tabs (the Node lists) and, behind "More", the Perfex pages (UI-SPEC § Access). */
const SETTINGS: readonly TabLink[] = [
  node('staff', 'Staff'),
  node('roles', 'Roles'),
  node('taxes', 'Taxes'),
  node('currencies', 'Currencies'),
  node('payment-modes', 'Payment Modes'),
  node('expense-categories', 'Expense Categories'),
  node('email-templates', 'Email Templates'),
  node('sent-emails', 'Sent emails'),
];
const PERFEX: readonly TabLink[] = [
  legacy('general', 'General'),
  legacy('company', 'Company Information'),
  legacy('localization', 'Localization'),
  legacy('email', 'Email'),
  legacy('pdf', 'PDF'),
];

/** The nav's name is `common.record_sections` over the record's name, as the pages build it. */
function Named({
  name,
  ...props
}: Omit<TabLinksProps, 'label'> & { readonly name: string }): ReactElement {
  const t = useTranslations('common');
  return <TabLinks label={t('record_sections', { name })} {...props} />;
}

const meta = {
  title: 'Molecules/TabLinks',
  component: Named,
  args: { name: 'Main office', links: RECORD, currentHref: '/setup/cost-centers/7' },
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/setup/cost-centers/7' } } },
  decorators: [
    (Story) => (
      <div className="p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Named>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A cost center's record tabs, Detail current: weight 600 and the 2px foreground underline. */
export const Record: Story = {};

/** The In use tab is the current page. */
export const RecordInUseCurrent: Story = { args: { currentHref: '/setup/cost-centers/7/in-use' } };

const SETTINGS_ARGS = {
  name: 'Settings',
  links: SETTINGS,
  more: PERFEX,
  currentHref: '/setup/currencies',
};

/** The settings tabs: one horizontal row, then "More" at the inline end for the Perfex pages. */
export const SettingsNav: Story = { args: SETTINGS_ARGS };

/** "More" open: the Perfex pages in Perfex's order, each with the glyph and "opens in Perfex". */
export const SettingsMoreOpen: Story = {
  args: SETTINGS_ARGS,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'More' }));
    await expect(
      await screen.findByRole('menuitem', { name: /^Localization/ }),
    ).toBeInTheDocument();
  },
};

/** At 375: the tabs that fit, the current one always, the rest in "More" (never a scroll). */
export const SettingsNavMobile: Story = {
  args: SETTINGS_ARGS,
  parameters: {
    viewport: {
      options: {
        mobile375: { name: 'Mobile 375', styles: { width: '375px', height: '740px' } },
      },
    },
  },
  globals: { viewport: { value: 'mobile375', isRotated: false } },
};

/** Arabic: the row mirrors and the nav sits at the inline start. */
export const Rtl: Story = { globals: { locale: 'ar' } };
