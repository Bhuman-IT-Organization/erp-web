// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import staffEn from '@/features/staff/messages/en.json';
import commonEn from '@/messages/common/en.json';
import { renderWithProviders, screen } from '@/test/render';
import type { FeatureErrorCodes } from '../error-messages';
import { useErrorText } from '../use-error-text';

interface ProbeProps {
  readonly code: string;
  readonly retryAfterS: number | null;
  readonly feature?: FeatureErrorCodes;
}

function Probe({ code, retryAfterS, feature }: ProbeProps): React.JSX.Element {
  const errorText = useErrorText(feature);
  return <p data-testid="error-text">{errorText({ code, retryAfterS })}</p>;
}

/** The hook's text, rendered under the same providers `app/layout.tsx` mounts. */
function errorText(props: ProbeProps): string {
  renderWithProviders(<Probe {...props} />);
  const text = screen.getByTestId('error-text').textContent;
  return text;
}

describe('useErrorText', () => {
  it('renders the upstream copy with the Retry-After seconds', () => {
    expect(errorText({ code: 'ERP-UPSTREAM-0001', retryAfterS: 5 })).toBe(
      "A service we rely on isn't responding. Try again in 5 seconds.",
    );
  });

  it('renders "in a moment" without a Retry-After', () => {
    expect(errorText({ code: 'ERP-UPSTREAM-0001', retryAfterS: null })).toBe(
      "A service we rely on isn't responding. Try again in a moment.",
    );
  });

  it('renders an unknown code as the plain unknown copy, with no code in it (D-32)', () => {
    const text = errorText({ code: 'ERP-NOPE-0001', retryAfterS: null });
    expect(text).toBe('Something went wrong on our side. Try again in a moment.');
    expect(text).not.toContain('ERP-');
  });

  it("prefers the feature's own message for its code", () => {
    expect(
      errorText({
        code: 'ERP-IDENTITY-0002',
        retryAfterS: null,
        feature: { namespace: 'staff', codes: ['ERP-IDENTITY-0002'] },
      }),
    ).toBe(staffEn.staff.errors['ERP-IDENTITY-0002']);
  });
});

describe('common.api_unreachable', () => {
  it('carries the D-32 banner copy', () => {
    expect(commonEn.common.api_unreachable).toBe(
      "We can't reach the server right now. Check your connection. We'll keep trying.",
    );
    expect(commonEn.common.api_unreachable_in).toBe(
      "We can't reach the server right now. We'll try again in {seconds} seconds.",
    );
  });
});
