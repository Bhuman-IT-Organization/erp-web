import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { GuardedKnowledgeBaseForm } from '@/features/knowledge-base/components/KnowledgeBaseForm';
import { pick } from '@/lib/i18n/pick';

/** The namespaces the client subtree needs: a nested provider REPLACES the messages above it. */
const SLICE = ['common', 'knowledge-base'] as const;

interface KnowledgeBasePageProps {
  /** The record's id from `app/(shell)/setup/knowledge-base/[id]/page.tsx`; `null` on the create route. */
  readonly id: string | null;
}

/**
 * The `/setup/knowledge-base/new` and `/setup/knowledge-base/:id` composition (a Server Component): the form under
 * its own message slice, behind its guards. The record is read in the browser, where the form
 * renders its own title. No `<main>`: the shell's `PageShell` owns it.
 */
export async function KnowledgeBasePage({ id }: KnowledgeBasePageProps) {
  const messages = pick(await getMessages(), [...SLICE]);
  return (
    <NextIntlClientProvider messages={messages}>
      <GuardedKnowledgeBaseForm id={id} />
    </NextIntlClientProvider>
  );
}
