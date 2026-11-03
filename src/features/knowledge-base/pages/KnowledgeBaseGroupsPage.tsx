import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { GuardedKnowledgeBaseGroups } from '@/features/knowledge-base/components/KnowledgeBaseGroups';
import { pick } from '@/lib/i18n/pick';

const SLICE = ['common', 'knowledge-base'] as const;

export async function KnowledgeBaseGroupsPage() {
  const messages = pick(await getMessages(), [...SLICE]);
  return (
    <NextIntlClientProvider messages={messages}>
      <GuardedKnowledgeBaseGroups />
    </NextIntlClientProvider>
  );
}
