import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { KnowledgeBaseGroupModal } from './KnowledgeBaseGroupModal';

const meta: Meta<typeof KnowledgeBaseGroupModal> = {
  title: 'Features/KnowledgeBase/KnowledgeBaseGroupModal',
  component: KnowledgeBaseGroupModal,
  args: {
    open: true,
    onClose: () => {
      // Storybook close action
    },
  },
};

export default meta;
type Story = StoryObj<typeof KnowledgeBaseGroupModal>;

export const NewGroup: Story = {
  args: {
    group: null,
  },
};

export const EditGroup: Story = {
  args: {
    group: {
      id: '1',
      name: 'Technical Support',
      groupSlug: 'technical-support',
      description: 'Technical troubleshooting documentation',
      active: true,
      color: '#4caf50',
      groupOrder: 3,
      totalArticles: 12,
    },
  },
};
