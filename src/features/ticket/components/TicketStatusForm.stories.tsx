import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TicketStatusesForm } from './TicketStatusForm';

const meta = {
  title: 'Features/Ticket/TicketStatusForm',
  component: TicketStatusesForm,
  args: { id: null },
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: '/setup/ticket-statuses/new' } },
  },
} satisfies Meta<typeof TicketStatusesForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Pending: Story = {};
export const FieldErrors: Story = {};
export const ServerError: Story = {};
