import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FALLBACK_BRANDING } from '@/features/branding/api/branding.fetch';
import { BrandLogo } from './BrandLogo';

// Neutral fixture data only (W0-05): the paths are same-origin ones the api would serve; in
// Storybook they 404 and BrandLogo falls back to the company name.
const NAME = 'Acme';
const LOGO = '/uploads/company/logo.png';
const LOGO_DARK = '/uploads/company/logo-dark.png';

const meta = {
  title: 'Features/Branding/BrandLogo',
  component: BrandLogo,
  args: { className: 'text-3xl font-bold' },
} satisfies Meta<typeof BrandLogo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The customer uploaded a logo: an `<img>` with the company name as `alt`. */
export const WithLogo: Story = {
  args: { branding: { ...FALLBACK_BRANDING, companyName: NAME, logoUrl: LOGO } },
};

/** No logo uploaded: the company name as text. */
export const NameOnly: Story = {
  args: { branding: { ...FALLBACK_BRANDING, companyName: NAME } },
};

/** The login page's variant: the dark logo when there is one, else the light one. */
export const Dark: Story = {
  args: {
    variant: 'dark',
    branding: {
      ...FALLBACK_BRANDING,
      companyName: NAME,
      logoUrl: LOGO,
      logoDarkUrl: LOGO_DARK,
    },
  },
};
