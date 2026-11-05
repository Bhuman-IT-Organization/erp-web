import { describe, expect, it } from 'vitest';
import ar from '../ar.json';
import en from '../en.json';

function paths(value: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, child]) =>
    typeof child === 'object' && child !== null
      ? paths(child as Record<string, unknown>, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

describe('estimate-request-statuses messages', () => {
  it('registers the feature namespace in both locales', () => {
    expect(Object.keys(en)).toEqual(['estimate-request-statuses']);
    expect(Object.keys(ar)).toEqual(['estimate-request-statuses']);
  });

  it('keeps the same message keys in English and Arabic', () => {
    expect(paths(ar).sort()).toEqual(paths(en).sort());
  });

  it('keeps ICU plural placeholders and record placeholders in both locales', () => {
    for (const pack of [en, ar]) {
      const messages = pack['estimate-request-statuses'];
      expect(messages.name_too_long).toContain('{max, plural,');
      expect(messages.name_too_long).toContain('{maxN}');
      expect(messages.edit_action_named).toContain('{name}');
      expect(messages.delete_title).toContain('{name}');
    }
  });

  it('describes referenced and uncountable estimate request statuses for both consumers', () => {
    for (const pack of [en, ar]) {
      expect(
        pack['estimate-request-statuses'].errors['ERP-ESTIMATEREQUESTSTATUSES-0001'],
      ).toBeTruthy();
    }
  });

  it('does not retain unused or misspelled field messages', () => {
    for (const pack of [en, ar]) {
      expect(pack['estimate-request-statuses']).not.toHaveProperty('save');
      expect(pack['estimate-request-statuses']).not.toHaveProperty('enter_colour');
      expect(pack['estimate-request-statuses']).toHaveProperty('enter_color');
    }
  });
});
