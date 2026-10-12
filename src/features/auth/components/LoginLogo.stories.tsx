import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FALLBACK_BRANDING } from '@/features/branding';
import { LoginLogo } from './LoginLogo';

/**
 * A neutral logo of a given shape, drawn inline (a `data:` URI, never a file). The circle makes a
 * distortion visible: stretched, it would read as an ellipse.
 */
function logo(width: number, height: number): string {
  const r = Math.min(width, height) / 2;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${String(width)}' height='${String(height)}'><rect width='100%' height='100%' fill='gray'/><circle cx='${String(r)}' cy='${String(height / 2)}' r='${String(r)}' fill='white'/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
const branding = (width: number, height: number) => ({
  ...FALLBACK_BRANDING,
  companyName: 'Example Company',
  logoDarkUrl: logo(width, height),
});

const meta = {
  title: 'Features/Auth/LoginLogo',
  component: LoginLogo,
  // The login page's column: `mx-auto max-w-md`, the 448 px the card sits in.
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-md pt-24">
        <Story />
      </div>
    ),
  ],
  args: { branding: branding(400, 100) },
} satisfies Meta<typeof LoginLogo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A wide logo (4:1) at its natural 400 × 100. */
export const WideLogo: Story = {};

/** A square logo (1:1) at its natural 100 × 100, never widened to the card. */
export const SquareLogo: Story = { args: { branding: branding(100, 100) } };

/** A tall logo (1:2) at its natural 60 × 120 — it was 448 × 896 before the fix. */
export const TallLogo: Story = { args: { branding: branding(60, 120) } };

/** A large wide logo (4:1, 1600 × 400) is capped by the card: 448 × 112. */
export const LargeWideLogo: Story = { args: { branding: branding(1600, 400) } };

/** A large tall logo (1:4, 200 × 800) is capped by the height: 32 × 128. */
export const LargeTallLogo: Story = { args: { branding: branding(200, 800) } };

/** No logo uploaded: the company name as text. */
export const NameOnly: Story = {
  args: { branding: { ...FALLBACK_BRANDING, companyName: 'Example Company' } },
};

/** Arabic: the logo stays centred. */
export const Rtl: Story = { globals: { locale: 'ar' } };
