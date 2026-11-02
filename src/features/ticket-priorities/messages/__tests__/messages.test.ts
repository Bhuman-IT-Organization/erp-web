import { describe, expect, it } from 'vitest';
import ar from '../ar.json';
import en from '../en.json';

/** Every key, `errors.<code>` included, as a dotted path. */
function paths(value: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, one]) =>
    typeof one === 'object' && one !== null
      ? paths(one as Record<string, unknown>, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

const PERFEX_KEYS = [
  'new_ticket_priority',
  'ticket_priority_add',
  'ticket_priority_edit',
  'ticket_priority_dt_name',
  'ticket_priority_add_edit_name',
  'no_ticket_priorities_found',
  'ticket_priority_lowercase',
] as const;

describe('ticket-priorities messages', () => {
  it('registers one namespace named after the feature folder, in both locales', () => {
    expect(Object.keys(en)).toEqual(['ticket-priorities']);
    expect(Object.keys(ar)).toEqual(['ticket-priorities']);
  });

  it("carries Perfex's six keys, none empty, in English and Arabic", () => {
    for (const key of PERFEX_KEYS) {
      expect(en['ticket-priorities'][key].length, `en.${key}`).toBeGreaterThan(0);
      expect(ar['ticket-priorities'][key].length, `ar.${key}`).toBeGreaterThan(0);
    }
  });

  it('English and Arabic hold the same key set', () => {
    expect(paths(ar).sort()).toEqual(paths(en).sort());
  });

  it('does not add a `ticket_priorities` key: the menu label stays shell.acs_ticket_priority_submenu', () => {
    expect(en['ticket-priorities']).not.toHaveProperty('ticket_priorities');
    expect(ar['ticket-priorities']).not.toHaveProperty('ticket_priorities');
  });

  it('keeps the placeholders the screens fill: {name}, {query} and {max}', () => {
    for (const pack of [en, ar]) {
      const p = pack['ticket-priorities'];
      expect(p.edit_action_named).toContain('{name}');
      expect(p.delete_action_named).toContain('{name}');
      expect(p.delete_title).toContain('{name}');
      expect(p.no_match_heading).toContain('{query}');
      expect(p.name_too_long).toContain('{max}');
    }
  });
});
