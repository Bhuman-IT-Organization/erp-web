/**
 * The modules a deployment can switch off (ADR-0042, Phase 4.2 P-01): the mirror of erp-api's
 * `MODULE_NAMES` (`src/shared/config/env.schema.ts`, re-exported by `src/shared/config/modules.ts`).
 * `/api/v1/auth/me` names the switched-off ones in `disabledModules` (`usePermissions`). None of
 * this copy's modules is switchable, so the list is empty; a later module appends its name here and
 * on the api in the same change, with whatever menu and page handling it needs.
 */
export const MODULE_NAMES = [] as const satisfies readonly string[];

export type ModuleName = (typeof MODULE_NAMES)[number];
