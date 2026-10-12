import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const nextConfig: NextConfig = {
  // The web image (erp-infra) is built from .next/standalone.
  output: 'standalone',
};

// Resolves the request config at the default path, `./src/i18n/request.ts` (no i18n routing).
const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
