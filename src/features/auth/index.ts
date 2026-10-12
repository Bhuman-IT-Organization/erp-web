/**
 * The auth feature's public surface for routes: `app/(shell)/layout.tsx` mounts `LegacyLinkGuard`,
 * so every shell page holds a Perfex link until the legacy session is open (quick 261009-lgn).
 */
export { LegacyLinkGuard } from './components/LegacyLinkGuard';
