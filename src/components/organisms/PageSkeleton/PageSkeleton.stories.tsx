import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PageSkeleton } from './PageSkeleton';

/** The page-level loading shapes (UI-SPEC § Skeletons): one story per variant, plus `Rtl`. */
const meta = {
  title: 'Organisms/PageSkeleton',
  component: PageSkeleton,
  args: { variant: 'list' },
} satisfies Meta<typeof PageSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A list page: title, toolbar, header row, 10 rows (the cap), pager. */
export const List: Story = {};

/** A list with an image column: a 40 px square leads every row. */
export const ListWithImage: Story = { args: { hasImage: true } };

/** A form page: title, one section of six labelled field blocks, the 68 px save bar. */
export const Form: Story = { args: { variant: 'form' } };

/** A record's form page before the record arrives: the detail header's badge after the title. */
export const FormWithBadge: Story = { args: { variant: 'form', withBadge: true } };

/** K13: a record page before it arrives: title and badge, two tab bars, the form. */
export const Record: Story = { args: { variant: 'record' } };

/** K13: a record's list tab: five tab bars, then the rows. */
export const RecordList: Story = {
  args: { variant: 'record', tabs: 5, recordBody: 'list', rows: 6 },
};

/** K13: a settings page: one tab row of 96px bars and a compact 8-row table at the full width. */
export const Settings: Story = { args: { variant: 'settings' } };

/** 375 px: the same tab row, clipped where it does not fit, above the table. */
export const SettingsMobile: Story = {
  args: { variant: 'settings' },
  parameters: {
    viewport: {
      options: {
        mobile375: { name: 'Mobile 375', styles: { width: '375px', height: '740px' } },
      },
    },
  },
  globals: { viewport: { value: 'mobile375', isRotated: false } },
};

export const Rtl: Story = { args: { hasImage: true }, globals: { locale: 'ar' } };
