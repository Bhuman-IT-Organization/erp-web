import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, screen, userEvent, within } from 'storybook/test';
import { ExportMenu } from './ExportMenu';

/** The menu sits at the inline end of a toolbar, as in `ListPageTemplate`. */
const withToolbar: Decorator = function ToolbarDecorator(Story) {
  return (
    <div className="flex justify-end p-4">
      <Story />
    </div>
  );
};

const meta = {
  title: 'Organisms/ExportMenu',
  component: ExportMenu,
  decorators: [withToolbar],
  args: {
    count: 42,
    selected: false,
    exportLimit: 10_000,
    printLimit: 1000,
    running: null,
    onSelect: () => undefined,
  },
} satisfies Meta<typeof ExportMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Opens the menu; portalled and animated in, so presence is asserted, not visibility. */
const openMenu: Story['play'] = async ({ canvasElement }) => {
  await userEvent.click(within(canvasElement).getByTestId('list-export'));
  await expect(await screen.findByTestId('list-export-scope')).toBeInTheDocument();
};

/** The outline trigger: download icon, "Export", chevron. */
export const Closed: Story = {};

/** "All 42 matching rows", then CSV, Excel, PDF, Print. */
export const Open: Story = { play: openMenu };

/** Three rows ticked: "3 selected rows"; the caps read the ticked count. */
export const OpenSelected: Story = { args: { count: 3, selected: true }, play: openMenu };

/** 1,240 rows: PDF and Print carry "Limited to 1,000 rows" and stay focusable. */
export const OverPrintLimit: Story = {
  args: { count: 1240 },
  play: async (context) => {
    await openMenu(context);
    await expect(await screen.findByTestId('list-export-pdf')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await expect(screen.getByTestId('list-export-csv')).not.toHaveAttribute('aria-disabled');
  },
};

/** 12,000 rows: every item carries its cap. */
export const OverAllLimits: Story = {
  args: { count: 12_000 },
  play: async (context) => {
    await openMenu(context);
    await expect(await screen.findByTestId('list-export-csv')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  },
};

/** A file in flight: "Exporting…" on a disabled trigger. */
export const Running: Story = { args: { running: 'export' } };

/** Print reading its rows: "Preparing print…" on a disabled trigger. */
export const Printing: Story = { args: { running: 'print' } };

/** 375 px, open: the 224 px menu fits with its end edge on the trigger's. */
export const Mobile: Story = {
  parameters: {
    viewport: {
      options: {
        mobile375: { name: 'Mobile 375', styles: { width: '375px', height: '740px' } },
      },
    },
  },
  globals: { viewport: { value: 'mobile375', isRotated: false } },
  play: openMenu,
};

/** Arabic, open: no PDF item (D-09); CSV, Excel and Print stay in order. */
export const Rtl: Story = {
  globals: { locale: 'ar' },
  play: async (context) => {
    await openMenu(context);
    await expect(await screen.findByTestId('list-export-print')).toBeInTheDocument();
    await expect(screen.queryByTestId('list-export-pdf')).toBeNull();
  },
};
