import type { Meta, StoryObj } from '@storybook/react';
import { PrioritiesList } from './PrioritiesList';

const meta: Meta<typeof PrioritiesList> = {
  title: 'Features/Ticket Priorities/PrioritiesList',
  component: PrioritiesList,
  parameters: {
    layout: 'padded',
    nextjs: {
      appDirectory: true,
    },
  },
};

export default meta;
type Story = StoryObj<typeof PrioritiesList>;

export const Default: Story = {};

// Required List states
export const Loading: Story = { args: {} };
export const Empty: Story = { args: {} };
export const Error: Story = { args: {} };
export const Loaded: Story = { args: {} };
