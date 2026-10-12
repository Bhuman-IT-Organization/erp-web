/**
 * The shell feature's public surface.
 *
 * The shell owns the chrome's *words*, not its components: `PageShell`, `Sidebar`, `Topbar`,
 * `Breadcrumbs` and `NavItemLink` live under `src/components/` because they are presentation
 * shared by every page, while this feature owns the `shell` message namespace and the README
 * that records the legacy parity and the deliberate drops.
 *
 * `app/(shell)/layout.tsx` imports `SHELL_MESSAGE_NAMESPACES` so the namespaces the client
 * provider receives are named once, here, rather than repeated as literals in the layout.
 */
export const SHELL_MESSAGE_NAMESPACES = ['common', 'shell'] as const;
