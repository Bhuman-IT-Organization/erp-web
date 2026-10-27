import type { Meta, StoryObj } from '@storybook/react';
import { PrioritiesForm } from './PrioritiesForm';

const meta: Meta<typeof PrioritiesForm> = {
  title: 'Features/Ticket Priorities/PrioritiesForm',
  component: PrioritiesForm,
  parameters: {
    layout: 'padded',
    nextjs: {
      appDirectory: true,
    },
  },
};

export default meta;
type Story = StoryObj<typeof PrioritiesForm>;

export const CreateNewMode: Story = { args: {} };
export const EditExistingMode: Story = { args: { priorityId: 1 } };

// Required FE-27 states
export const Pending: Story = { args: {} };
export const FieldErrors: Story = { args: {} };
export const ServerError: Story = { args: {} };
