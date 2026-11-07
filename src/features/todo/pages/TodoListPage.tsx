import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import type { ReactElement } from 'react';
import { GuardedTodosList } from '@/features/todo/components/TodoList';
import { SHELL_MESSAGE_NAMESPACES } from '@/features/shell';
import { pick } from '@/lib/i18n/pick';

export async function TodosListPage(): Promise<ReactElement> {
  const messages = await getMessages();
  return (
    <NextIntlClientProvider messages={pick(messages, [...SHELL_MESSAGE_NAMESPACES, 'todo'])}>
      <GuardedTodosList />
    </NextIntlClientProvider>
  );
}
