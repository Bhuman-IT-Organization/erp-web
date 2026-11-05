import { describe, expect, it } from 'vitest';
import {
  EMPTY_TODOS_FORM,
  finishBodySchema,
  isTodosField,
  TODOS_MESSAGE_KEYS,
  todosFormSchema,
  todosPageSchema,
  todoSchema,
  toTodosForm,
  validationIssuesSchema,
} from '../todo.schema';

const TODO = {
  id: '7',
  description: 'Call Ali',
  finished: false,
  dateAdded: '2026-10-02T20:30:15.000Z',
  dateFinished: null,
};

describe('todoSchema', () => {
  it('parses the wire shape: the id as text, ISO instants or null', () => {
    expect(todoSchema.parse(TODO)).toEqual(TODO);
    const done = { ...TODO, finished: true, dateFinished: '2026-10-03T08:00:00.000Z' };
    expect(todoSchema.parse(done)).toEqual(done);
  });

  it('refuses a numeric id, a non-ISO date and a missing key', () => {
    expect(todoSchema.safeParse({ ...TODO, id: 7 }).success).toBe(false);
    expect(todoSchema.safeParse({ ...TODO, dateAdded: '02/10/2026' }).success).toBe(false);

    const rest = { ...TODO };
    delete (rest as Partial<typeof TODO>).finished;

    expect(todoSchema.safeParse(rest).success).toBe(false);
  });
});

describe('todoPageSchema', () => {
  it('parses { data, meta: { nextCursor, total } }', () => {
    const page = { data: [TODO], meta: { nextCursor: 'c1', total: 21 } };
    expect(todosPageSchema.parse(page)).toEqual(page);
    expect(todosPageSchema.parse({ data: [], meta: { nextCursor: null, total: 0 } }).data).toEqual(
      [],
    );
  });

  it('refuses a page whose meta lacks the total', () => {
    expect(todosPageSchema.safeParse({ data: [], meta: { nextCursor: null } }).success).toBe(false);
  });
});

describe('todoFormSchema', () => {
  it('trims the description', () => {
    expect(todosFormSchema.parse({ description: '  Call Ali  ' })).toEqual({
      description: 'Call Ali',
    });
  });

  it('refuses an empty or blank description with the message KEY, not text (FE-12)', () => {
    for (const description of ['', '   ']) {
      const parsed = todosFormSchema.safeParse({ description });
      expect(parsed.success).toBe(false);
      expect(parsed.error?.issues[0]?.message).toBe(TODOS_MESSAGE_KEYS.description);
    }
  });

  it('keeps markup as typed: it is shown as text', () => {
    expect(todosFormSchema.parse({ description: '<b>x</b>' }).description).toBe('<b>x</b>');
  });

  it('starts empty and reads a record as form values', () => {
    expect(EMPTY_TODOS_FORM).toEqual({ description: '' });
    expect(toTodosForm(todoSchema.parse(TODO))).toEqual({ description: 'Call Ali' });
  });
});

describe('finishBodySchema', () => {
  it('takes a boolean and nothing else', () => {
    expect(finishBodySchema.parse({ finished: true })).toEqual({ finished: true });
    expect(finishBodySchema.safeParse({ finished: 'yes' }).success).toBe(false);
  });
});

describe('the 400 issues the form maps', () => {
  it('knows the one field a 400 may point at', () => {
    expect(isTodosField('description')).toBe(true);
    expect(isTodosField('staffid')).toBe(false);
    expect(isTodosField(undefined)).toBe(false);
  });

  it('parses a zod issues array and refuses a malformed body (T-3-26)', () => {
    const issues = [{ path: ['description'], message: 'too small' }];
    expect(validationIssuesSchema.safeParse(issues).success).toBe(true);
    expect(validationIssuesSchema.safeParse('nope').success).toBe(false);
  });
});
