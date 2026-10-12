import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, screen, userEvent, within } from 'storybook/test';
import { DocumentPdfMenu } from './DocumentPdfMenu';

/** K21: View, New Tab, Download and Print over one api PDF, read as a Blob (D-28). */
const meta = {
  title: 'Organisms/DocumentPdfMenu',
  component: DocumentPdfMenu,
  args: {
    path: '/api/v1/demo/documents/7/pdf',
    fileName: 'GR-0007.pdf',
    onError: fn(),
  },
  decorators: [
    (Story) => (
      <div className="flex justify-end p-6 pb-48">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DocumentPdfMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** The menu open: the four items in Perfex's order. */
export const Open: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'PDF' }));
    await expect(await screen.findByRole('menuitem', { name: 'Print' })).toBeInTheDocument();
  },
};

/** Offered under ar too (the PDF is the deployment's language); the menu aligns to the inline end. */
export const Rtl: Story = {
  globals: { locale: 'ar' },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'PDF' }));
    await expect(await screen.findByRole('menuitem', { name: 'Print' })).toBeInTheDocument();
  },
};
