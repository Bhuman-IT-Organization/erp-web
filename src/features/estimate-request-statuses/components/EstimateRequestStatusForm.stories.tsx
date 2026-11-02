import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { EstimateRequestStatusForm } from './EstimateRequestStatusForm';

const meta = {
  title: 'Features/Estimate Request Statuses/EstimateRequestStatusForm',
  component: EstimateRequestStatusForm,
  args: { id: null },
} satisfies Meta<typeof EstimateRequestStatusForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Pending: Story = {};
export const FieldErrors: Story = {};
export const ServerError: Story = {};
