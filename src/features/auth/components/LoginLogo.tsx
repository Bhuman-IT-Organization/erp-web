import { BrandLogo, type Branding } from '@/features/branding';

interface LoginLogoProps {
  readonly branding: Branding;
}

/**
 * The login page's logo (`login_admin.php`'s `company-logo text-center`, the dark variant), or the
 * company name as text when none was uploaded.
 *
 * Any customer's logo — wide, square or tall — shows at its NATURAL size and aspect ratio, never
 * stretched and never blown up: both dimensions are `auto`, capped by the card's width and by a
 * height, so the sign-in form stays on screen (lead 2026-09-26; plan 03.2-15 fixed the sidebar's logo
 * the same way). `w-full` used to scale every logo up to the 448 px card: a 1:2 logo became
 * 448 × 896 and pushed the form off the page.
 */
export function LoginLogo({ branding }: LoginLogoProps) {
  return (
    <div className="text-center">
      <BrandLogo
        branding={branding}
        variant="dark"
        className="mx-auto inline-block h-auto max-h-32 w-auto max-w-full object-contain text-3xl font-bold text-neutral-800"
      />
    </div>
  );
}
