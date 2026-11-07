import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import type { ReactElement } from 'react';
import { GuardedTodosForm } from '@/features/todo/components/TodoForm';
import { SHELL_MESSAGE_NAMESPACES } from '@/features/shell';
import { pick } from '@/lib/i18n/pick';

interface TodosPageProps {
  readonly id: string | null;
}

export async function TodosPage({ id }: TodosPageProps): Promise<ReactElement> {
  const messages = await getMessages();
  return (
    <NextIntlClientProvider messages={pick(messages, [...SHELL_MESSAGE_NAMESPACES, 'todo'])}>
      <GuardedTodosForm id={id} />
    </NextIntlClientProvider>
  );
}
