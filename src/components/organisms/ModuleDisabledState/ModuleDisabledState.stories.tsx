import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ModuleDisabledState } from './ModuleDisabledState';

/**
 * What a switched-off module's page renders once `/me` has answered (K12, P-01). The texts arrive
 * translated, as a screen passes them (literal fixture words here, as in StatusBadge's stories).
 */
const meta = {
  title: 'Organisms/ModuleDisabledState',
  component: ModuleDisabledState,
  args: {
    heading: 'The sample module is disabled',
    body: 'The sample module is switched off for this system. Contact your administrator.',
  },
  decorators: [
    (Story) => (
      <div className="p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ModuleDisabledState>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Any member: the lock, the heading, the body and "Go to the dashboard". */
export const Default: Story = {};

/** An administrator, when the switch recorded it: who switched it off and when. */
export const Administrator: Story = {
  args: {
    details: [
      { term: 'Switched off by', description: 'Sample admin' },
      { term: 'Switched off on', description: '2026-10-01 09:30' },
    ],
  },
};

/** Arabic: start-aligned on the right; the date keeps Western digits. */
export const Rtl: Story = {
  args: {
    heading: 'وحدة المستودع معطلة',
    body: 'وحدة المستودع متوقفة في هذا النظام. تواصل مع المسؤول.',
    details: [
      { term: 'أوقفها', description: 'مسؤول تجريبي' },
      { term: 'أوقفت في', description: '2026-10-01 09:30' },
    ],
  },
  globals: { locale: 'ar' },
};
