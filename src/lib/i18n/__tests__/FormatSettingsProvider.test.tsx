// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { renderWithProviders, screen } from '@/test/render';
import { DEFAULT_FORMAT_SETTINGS, useFormat, type FormatSettings } from '../format';
import { FormatSettingsProvider, useFormatSettings } from '../FormatSettingsProvider';

const CUSTOMER: FormatSettings = {
  ...DEFAULT_FORMAT_SETTINGS,
  dateFormat: 'd-m-Y',
  timeZone: 'Asia/Dubai',
  currency: {
    code: 'AED',
    symbol: 'AED',
    placement: 'before',
    thousandSeparator: ',',
    decimalSeparator: '.',
  },
};

function Probe(): React.JSX.Element {
  const f = useFormat();
  const settings = useFormatSettings();
  return (
    <>
      <span data-testid="date">{f.date('2026-09-25T10:00:00Z')}</span>
      <span data-testid="money">{f.money(1240)}</span>
      <span data-testid="format">{settings.dateFormat}</span>
    </>
  );
}

describe('FormatSettingsProvider', () => {
  it("gives useFormat the customer's settings", () => {
    renderWithProviders(
      <FormatSettingsProvider settings={CUSTOMER}>
        <Probe />
      </FormatSettingsProvider>,
    );
    expect(screen.getByTestId('date').textContent).toBe('25-09-2026');
    expect(screen.getByTestId('money').textContent).toBe('AED1,240.00');
    expect(screen.getByTestId('format').textContent).toBe('d-m-Y');
  });

  it('without a provider, useFormatSettings is DEFAULT_FORMAT_SETTINGS', () => {
    renderWithProviders(<Probe />);
    expect(screen.getByTestId('format').textContent).toBe(DEFAULT_FORMAT_SETTINGS.dateFormat);
    expect(screen.getByTestId('money').textContent).toBe('1,240.00');
  });
});
