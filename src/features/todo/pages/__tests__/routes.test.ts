import { describe, expect, it, vi } from 'vitest';
import { NOT_IDS, routeProps } from '@/test/route-props';
import { TodosListPage } from '../TodoListPage';
import { TodosPage } from '../TodoPage';

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

vi.mock('next-intl/server', () => ({
  getTranslations: (namespace: string) => Promise.resolve((key: string) => `${namespace}.${key}`),
  getMessages: () => ({
    common: { save: 'Save' },
    todo: { todos: 'Todos' },
    unrelated: { hidden: 'Hidden' },
  }),
}));

describe('/setup/todo', () => {
  it('renders the list page with the todos title', async () => {
    const page = await import('../../../../../app/(shell)/setup/todo/page');
    expect(page.default().type).toBe(TodosListPage);
    expect(await page.generateMetadata()).toEqual({ title: 'todo.todos' });
  });

  it('/new opens an empty form', async () => {
    const page = await import('../../../../../app/(shell)/setup/todo/new/page');
    expect(page.default().type).toBe(TodosPage);
    expect(page.default().props).toEqual({ id: null });
    expect(await page.generateMetadata()).toEqual({ title: 'todo.new_todo' });
  });

  it('[id] opens the normalized numeric todo record', async () => {
    const page = await import('../../../../../app/(shell)/setup/todo/[id]/page');
    const element = await page.default(routeProps({ id: '007' }));
    expect(element.type).toBe(TodosPage);
    expect(element.props).toEqual({ id: '7' });
    expect(await page.generateMetadata()).toEqual({ title: 'todo.edit_todo' });
  });

  it.each(NOT_IDS)('"%s" is not a todo record route', async (id) => {
    const page = await import('../../../../../app/(shell)/setup/todo/[id]/page');
    await expect(page.default(routeProps({ id }))).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
describe('todo page message namespaces', () => {
  it('provides only common and todo messages to the list page', async () => {
    const element = await TodosListPage();

    expect((element as { props: { messages: unknown } }).props.messages).toEqual({
      common: { save: 'Save' },
      todo: { todos: 'Todos' },
    });
  });

  it('provides only common and todo messages to the form page', async () => {
    const element = await TodosPage({ id: null });

    expect((element as { props: { messages: unknown } }).props.messages).toEqual({
      common: { save: 'Save' },
      todo: { todos: 'Todos' },
    });
  });
});
