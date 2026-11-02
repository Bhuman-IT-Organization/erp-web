import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { EstimateRequestStatusesList } from './EstimateRequestStatusesList';

const meta = {
  title: 'Features/Estimate Request Statuses/EstimateRequestStatusesList',
  component: EstimateRequestStatusesList,
} satisfies Meta<typeof EstimateRequestStatusesList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {};
export const Empty: Story = {};
export const Error: Story = {};
export const Loaded: Story = {};
