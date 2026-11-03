import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SWRConfig } from 'swr';
import { KnowledgeBaseGroups } from './KnowledgeBaseGroups';
import type { KnowledgeBaseGroupRow } from '@/features/knowledge-base/schemas/knowledge-base.schema';

const SEED_GROUPS: KnowledgeBaseGroupRow[] = [
  {
    id: '1',
    name: 'General',
    groupSlug: 'general',
    description: 'General knowledge base articles',
    active: true,
    color: '#03a9f4',
    groupOrder: 1,
    totalArticles: 5,
  },
  {
    id: '2',
    name: 'Billing & Invoicing',
    groupSlug: 'billing-invoicing',
    description: 'Billing guides and FAQs',
    active: false,
    color: '#e91e63',
    groupOrder: 2,
    totalArticles: 0,
  },
];

const meta: Meta<typeof KnowledgeBaseGroups> = {
  title: 'Features/KnowledgeBase/KnowledgeBaseGroups',
  component: KnowledgeBaseGroups,
  decorators: [
    (Story) => (
      <SWRConfig
        value={{
          provider: () => new Map(),
          fallback: {
            '/api/v1/knowledge-base/groups': {
              data: SEED_GROUPS,
              meta: { total: SEED_GROUPS.length, nextCursor: null, prevCursor: null },
            },
          },
        }}
      >
        <Story />
      </SWRConfig>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof KnowledgeBaseGroups>;

export const Default: Story = {};

export const Empty: Story = {
  decorators: [
    (Story) => (
      <SWRConfig
        value={{
          provider: () => new Map(),
          fallback: {
            '/api/v1/knowledge-base/groups': {
              data: [],
              meta: { total: 0, nextCursor: null, prevCursor: null },
            },
          },
        }}
      >
        <Story />
      </SWRConfig>
    ),
  ],
};
