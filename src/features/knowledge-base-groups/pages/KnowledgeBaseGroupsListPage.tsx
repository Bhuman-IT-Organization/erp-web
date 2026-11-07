import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import type { ReactElement } from 'react';
import { GuardedKnowledgeBaseGroupsList } from '@/features/knowledge-base-groups/components/KnowledgeBaseGroupsList';
import { pick } from '@/lib/i18n/pick';

const SLICE = ['common', 'knowledge-base-groups'] as const;

export async function KnowledgeBaseGroupsListPage(): Promise<ReactElement> {
  const messages = pick(await getMessages(), [...SLICE]);
  return (
    <NextIntlClientProvider messages={messages}>
      <GuardedKnowledgeBaseGroupsList />
    </NextIntlClientProvider>
  );
}
