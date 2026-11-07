import { describe, expect, it } from 'vitest';
import {
  NOT_FOUND_CODE,
  TODOS_ENDPOINTS,
  TODOS_ERRORS,
  TODOS_PAGE_SIZE,
  TODOS_PATH,
  todoFinishedPath,
  todosListPath,
  todosPath,
  VALIDATION_CODE,
} from '../todo.endpoints';

describe('todo endpoints', () => {
  it('declares exactly the six calls the api module serves, method and path', () => {
    expect(TODOS_ENDPOINTS).toEqual({
      list: { method: 'GET', path: '/api/v1/todo' },
      detail: { method: 'GET', path: '/api/v1/todo/:id' },
      create: { method: 'POST', path: '/api/v1/todo' },
      update: { method: 'PATCH', path: '/api/v1/todo/:id' },
      finish: { method: 'PATCH', path: '/api/v1/todo/:id/finished' },
      remove: { method: 'DELETE', path: '/api/v1/todo/:id' },
    });
  });

  it('derives the list path and a record path, the id encoded', () => {
    expect(TODOS_PATH).toBe(TODOS_ENDPOINTS.list.path);
    expect(todosPath('7')).toBe('/api/v1/todo/7');
    expect(todosPath('a b')).toBe('/api/v1/todo/a%20b');
    expect(todosPath('a/1')).toBe('/api/v1/todo/a%2F1');
    expect(todoFinishedPath('7')).toBe('/api/v1/todo/7/finished');
  });

  it('pages 20 at a time, as Perfex does', () => {
    expect(TODOS_PAGE_SIZE).toBe(20);
  });

  it('builds a panel page path: the status and the limit, and no cursor on the first page', () => {
    const url = new URL(todosListPath('unfinished', null), 'http://erp.invalid');
    expect(url.pathname).toBe('/api/v1/todo');
    expect(url.searchParams.get('status')).toBe('unfinished');
    expect(url.searchParams.get('limit')).toBe(String(TODOS_PAGE_SIZE));
    expect(url.searchParams.has('cursor')).toBe(false);
  });

  it('carries the previous page cursor, encoded, so the next page asks for the right rows', () => {
    const url = new URL(todosListPath('finished', 'a b/c='), 'http://erp.invalid');
    expect(url.searchParams.get('status')).toBe('finished');
    expect(url.searchParams.get('cursor')).toBe('a b/c=');
  });

  it("names the feature's own codes: a to do that is not there or not the caller's", () => {
    expect(NOT_FOUND_CODE).toBe('ERP-CORE-0004');
    expect(VALIDATION_CODE).toBe('ERP-VALIDATION-0001');
    expect(TODOS_ERRORS).toEqual({ namespace: 'todo', codes: ['ERP-CORE-0004'] });
  });
});
