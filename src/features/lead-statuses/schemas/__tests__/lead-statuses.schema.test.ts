import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LEAD_STATUS_COLOR,
  EMPTY_LEAD_STATUSES_FORM,
  isLeadStatusProtected,
  leadStatusesFormSchema,
  leadStatusesSchema,
  toLeadStatusesForm,
} from '../lead-statuses.schema';

const status = {
  id: '1',
  name: 'Interested',
  color: '#28B8DA',
  statusorder: 1,
  isdefault: 0,
  isConfiguredDefault: false,
  usage: {
    leads: 0,
    lastLeadStatus: 0,
    emailIntegration: 0,
    webToLead: 0,
  },
};

describe('Lead Statuses Schema', () => {
  it('validates a valid lead status', () => {
    expect(leadStatusesSchema.safeParse(status).success).toBe(true);
  });

  it('requires a status name', () => {
    expect(
      leadStatusesFormSchema.safeParse({
        name: '',
        color: '#28B8DA',
      }).success,
    ).toBe(false);
  });

  it('rejects names longer than 50 characters', () => {
    expect(
      leadStatusesFormSchema.safeParse({
        name: 'A'.repeat(51),
        color: '#28B8DA',
      }).success,
    ).toBe(false);
  });

  it('rejects colors longer than 10 characters', () => {
    expect(
      leadStatusesFormSchema.safeParse({
        name: 'Interested',
        color: '12345678901',
      }).success,
    ).toBe(false);
  });

  it('rejects invalid order values', () => {
    expect(
      leadStatusesFormSchema.safeParse({
        name: 'Interested',
        color: '#28B8DA',
        statusorder: -1,
      }).success,
    ).toBe(false);
  });

  it('protects built-in statuses from deletion', () => {
    expect(isLeadStatusProtected({ ...status, isdefault: 1 })).toBe(true);
  });

  it('protects statuses used by leads', () => {
    expect(
      isLeadStatusProtected({
        ...status,
        usage: { leads: 2, lastLeadStatus: 0, emailIntegration: 0, webToLead: 0 },
      }),
    ).toBe(true);
  });

  it('converts API data to form values', () => {
    expect(toLeadStatusesForm(status)).toEqual({
      name: 'Interested',
      color: '#28B8DA',
      statusorder: 1,
    });
  });

  it('provides a default color', () => {
    expect(EMPTY_LEAD_STATUSES_FORM.color).toBe(DEFAULT_LEAD_STATUS_COLOR);
  });
});
