import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import type { ReactElement } from 'react';
import { GuardedKnowledgeBaseGroupsForm } from '@/features/knowledge-base-groups/components/KnowledgeBaseGroupsForm';
import { pick } from '@/lib/i18n/pick';

const SLICE = ['common', 'knowledge-base-groups'] as const;

interface KnowledgeBaseGroupsPageProps {
  readonly id: string | null;
}

export async function KnowledgeBaseGroupsPage({
  id,
}: KnowledgeBaseGroupsPageProps): Promise<ReactElement> {
  const messages = pick(await getMessages(), [...SLICE]);
  return (
    <NextIntlClientProvider messages={messages}>
      <GuardedKnowledgeBaseGroupsForm id={id} />
    </NextIntlClientProvider>
  );
}
