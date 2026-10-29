import type { Branding } from '@/features/branding/api/branding.fetch';

interface BrandLogoProps {
  readonly branding: Branding;
  /** The login screen shows the dark variant when the customer uploaded one (as Perfex does). */
  readonly variant?: 'light' | 'dark';
  readonly className?: string;
}

/**
 * The customer's logo, or their company name as text when none is uploaded. A plain `<img>` on
 * purpose: the file is customer data served from the API origin (`/uploads/company/...`), not a
 * build asset, so Next's image optimiser (remote allow-list, build-time sizing) does not apply.
 */
export function BrandLogo({ branding, variant = 'light', className }: BrandLogoProps) {
  const src =
    variant === 'dark'
      ? (branding.logoDarkUrl ?? branding.logoUrl)
      : (branding.logoUrl ?? branding.logoDarkUrl);
  if (src === null) {
    return (
      <span data-testid="brand-name" className={className}>
        {branding.companyName}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- customer-uploaded file, see above
    <img src={src} alt={branding.companyName} className={className} data-testid="brand-logo" />
  );
}
