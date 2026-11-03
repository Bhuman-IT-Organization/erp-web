import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { KnowledgeBaseList } from './KnowledgeBaseList';

const meta = {
  title: 'Features/KnowledgeBase/KnowledgeBaseList',
  component: KnowledgeBaseList,
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: '/setup/knowledge-base' } },
  },
} satisfies Meta<typeof KnowledgeBaseList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {};
export const Empty: Story = {};
export const Error: Story = {};
export const Loaded: Story = {};
export const Rtl: Story = {
  globals: { locale: 'ar' },
};
