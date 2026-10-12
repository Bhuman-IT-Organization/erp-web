'use client';

import { useState, type CSSProperties, type ReactElement } from 'react';
import { Icon } from '@/components/atoms/Icon';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { matchesSearch } from '@/lib/i18n/search-text';

export interface PermissionCapability {
  readonly code: string;
  /**
   * Its column: the ADR-0033 action id, `view`, `viewOwn`, `create`, `edit`, `delete`, or a named
   * special (`approve`, `assign`, `editOwn`, `deleteOwn`). The table aligns capabilities by it.
   */
  readonly action: string;
  readonly label: string;
}
export interface PermissionFeature {
  readonly id: string;
  readonly label: string;
  readonly capabilities: readonly PermissionCapability[];
}
export interface PermissionModule {
  readonly id: string;
  readonly label: string;
  readonly features: readonly PermissionFeature[];
}

/** Every word the picker shows, already translated by the feature (FE-01: the kit reads only `common`). */
export interface PermissionPickerLabels {
  /** "{role} grants {count} permissions in {modules} modules". */
  readonly summary: (count: number, modules: number) => string;
  /** "{granted} of {total} granted". */
  readonly moduleCount: (granted: number, total: number) => string;
  readonly customise: string;
  readonly search: string;
  readonly runningTotal: (count: number) => string;
  readonly selectAllIn: (module: string) => string;
  readonly resetToRole: string;
  /**
   * The behind-the-role line, from ONE diff (`permissionSetDiff(value, roleTemplate)`): `missing` =
   * the template codes the member lacks, `extra` = the codes the member holds outside the template.
   * Never a net number: re-applying the role adds exactly `missing` and removes exactly `extra`.
   */
  readonly behindRole: (missing: number, extra: number) => string;
  readonly reapplyRole: string;
  /** Omit it when the screen already states the refusal at the section top (staff form, UAT 12). */
  readonly readOnlyNotice?: string | undefined;
  /** The first column's header, over the resource names ("Feature"). */
  readonly featureColumn: string;
}

export interface PermissionPickerProps {
  readonly id: string;
  readonly catalogue: readonly PermissionModule[];
  readonly value: readonly string[];
  readonly onChange: (codes: string[]) => void;
  /** Staff form: `summary` (role-first); role form: `edit` (the role is the template). */
  readonly initialMode: 'summary' | 'edit';
  /** The selected role's codes (staff form): enables "Reset to role" and the behind-the-role line. */
  readonly roleTemplate?: readonly string[] | undefined;
  readonly onReapplyRole?: (() => void) | undefined;
  readonly readOnly?: boolean | undefined;
  readonly labels: PermissionPickerLabels;
}

/**
 * The primitive's indicator is a check glyph on an unfilled box for `indeterminate`, which reads as
 * "all granted"; a partly granted module is a filled box with a dash instead.
 */
const INDETERMINATE =
  "data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground data-[state=indeterminate]:[&_svg]:hidden data-[state=indeterminate]:before:h-0.5 data-[state=indeterminate]:before:w-2 data-[state=indeterminate]:before:rounded-full data-[state=indeterminate]:before:bg-current data-[state=indeterminate]:before:content-['']";

/**
 * The ONE diff between two permission sets: `added` = the codes in `to` and not in `from`, `removed`
 * = the codes in `from` and not in `to`, each sorted with `localeCompare` — the order erp-api's
 * `isGrantingChange` writes the audit rows in. The behind-the-role line, the re-apply confirmation
 * and the save summary all derive from it, so their counts and lines cannot disagree.
 */
export function permissionSetDiff(
  from: readonly string[],
  to: readonly string[],
): { readonly added: string[]; readonly removed: string[] } {
  const held = new Set(from);
  const wanted = new Set(to);
  const byCode = (a: string, b: string): number => a.localeCompare(b);
  return {
    added: [...wanted].filter((code) => !held.has(code)).sort(byCode),
    removed: [...held].filter((code) => !wanted.has(code)).sort(byCode),
  };
}

/** The fixed column order (lead, 2026-09-27); any other action follows, ordered by its id (localeCompare). */
const ACTION_ORDER: readonly string[] = ['view', 'viewOwn', 'create', 'edit', 'delete'];

/**
 * One grid for the header and every row, so a column sits at the same x in each: the resource name
 * takes the rest, and every action track is FIXED, so no cell's content (a longer translated header,
 * a wider label) can size a column differently in the header than in a row. Only from the card's
 * `@xl` (36rem, a container query; the lead wants the table even with the sidebar open) up; below
 * it (a phone) each resource stacks.
 */
const GRID =
  '@xl:grid @xl:grid-cols-[minmax(10rem,1fr)_repeat(var(--permission-columns),5.5rem)] @xl:items-center @xl:gap-x-2';

/**
 * The resource-name column stays at the inline start while a table wider than its card scrolls
 * sideways (lead 2026-09-27), so a scrolled row never loses its name: sticky on a solid background
 * (the row's hover is a translucent tint, so the pinned cell mixes the same colour itself), stretched
 * over the row's padding, and a divider on its inline end only while the wrapper is scrolled
 * (`data-scrolled`, set by the wrapper's own scroll handler). Logical properties, so RTL pins it
 * on the right.
 */
const PINNED =
  '@xl:sticky @xl:start-0 @xl:z-10 @xl:-my-2 @xl:self-stretch @xl:bg-card @xl:py-2 @xl:group-data-[scrolled]/scroll:border-e';

/**
 * A module's columns: one per action ANY of its features has (all features, not only those a search
 * shows, so the columns never jump while typing), labelled by the first capability carrying it.
 */
function columnsOf(
  group: PermissionModule,
): readonly { readonly action: string; readonly label: string }[] {
  const labels = new Map<string, string>();
  for (const feature of group.features) {
    for (const capability of feature.capabilities) {
      if (!labels.has(capability.action)) labels.set(capability.action, capability.label);
    }
  }
  const rank = (action: string): number => {
    const index = ACTION_ORDER.indexOf(action);
    return index === -1 ? ACTION_ORDER.length : index;
  };
  return [...labels]
    .map(([action, label]) => ({ action, label }))
    .sort((a, b) => rank(a.action) - rank(b.action) || a.action.localeCompare(b.action));
}

function codesOf(group: PermissionModule): string[] {
  return group.features.flatMap((feature) => feature.capabilities.map((c) => c.code));
}

/** The features a search shows: all of a module whose label matches, else those whose label does. */
function featuresMatching(group: PermissionModule, query: string): readonly PermissionFeature[] {
  if (query === '' || matchesSearch(group.label, query)) return group.features;
  return group.features.filter((feature) => matchesSearch(feature.label, query));
}

/**
 * The role-first permission picker (ui-kit-decisions §1, UI-SPEC § PermissionPicker). On the staff
 * form choosing a role is the whole interaction for the common case: a summary line and the modules
 * as a collapsed, read-only accordion; "Customise these permissions" turns that same accordion into
 * the editable one (there is no separate grid — the accordion IS the customise surface). The role
 * form opens straight into it, because a role is the template.
 *
 * Editing: a running total, a search across every feature (`matchesSearch`: normalised `includes`,
 * never a RegExp from the input, T-3.2-48) that opens the modules it matches, "Reset to role", and
 * per module a select-all checkbox BESIDE its trigger (a control inside the trigger button would be
 * invalid), indeterminate when partly granted. A member behind their role (Perfex copies the
 * template at save time and never propagates, §1) gets a line saying so with "Re-apply role".
 *
 * **Read-only is display, not authority.** A non-administrator can still review the set: every
 * permission checkbox stays focusable, announced and at full contrast with `aria-readonly`, and
 * ignores Space and clicks; search and expand work. Customise, select-all, Reset and Re-apply are
 * not rendered at all. The refusal is stated once — only when the
 * screen passes `readOnlyNotice` (UAT 12: the staff form states it at the section top instead). The
 * api refuses every granting write from a non-administrator regardless (ADR-0034 d.2).
 *
 * **An opened module is a table in its own card** (lead, 2026-09-27; not Perfex's bordered
 * two-column "Features | Capabilities" table with every capability in one cell): a header row of the
 * module's actions in the fixed order View, View (own), Create, Edit, Delete, then any other in id
 * order; one row per resource, headed by its name and a "Select all in <module>: <resource>" toggle;
 * each capability in its action's column, chosen by `capability.action` and never by position, with
 * an empty cell where the resource lacks that action; light row lines and a hover highlight. The
 * layout follows the CARD's width (a container query, `@xl`, 36rem), not the viewport's: narrower than
 * that each resource is a block with its checkboxes wrapped and labelled; at or above it the table,
 * which scrolls sideways in its own wrapper when wider than the card, so nothing is ever clipped,
 * with the resource-name column pinned at the inline start.
 * The staff form's summary mode keeps its granted-only list.
 *
 * Props only (FE-01): the staff feature maps its catalogue into `PermissionModule[]` and passes
 * every word as a string. A closed module's rows are not mounted (Radix unmounts closed content),
 * so a 507-code catalogue paints its 25 headers only.
 */
export function PermissionPicker({
  id,
  catalogue,
  value,
  onChange,
  initialMode,
  roleTemplate,
  onReapplyRole,
  readOnly = false,
  labels,
}: PermissionPickerProps): ReactElement {
  const [mode, setMode] = useState(initialMode);
  const [search, setSearch] = useState('');
  const [openIds, setOpenIds] = useState<string[]>([]);

  const granted = new Set(value);
  const editing = mode === 'edit';
  const query = search.trim();
  const countIn = (codes: readonly string[]): number => codes.filter((c) => granted.has(c)).length;
  const grantedCount = countIn(catalogue.flatMap(codesOf));
  const modulesWithGrants = catalogue.filter((group) => countIn(codesOf(group)) > 0).length;
  const behind = roleTemplate === undefined ? null : permissionSetDiff(value, roleTemplate);
  const visible = catalogue
    .map((group) => ({ group, features: featuresMatching(group, query) }))
    .filter((entry) => entry.features.length > 0);

  function add(codes: readonly string[]): void {
    onChange([...value, ...codes.filter((code) => !granted.has(code))]);
  }
  function remove(codes: readonly string[]): void {
    onChange(value.filter((code) => !codes.includes(code)));
  }
  function searchFor(text: string): void {
    setSearch(text);
    const next = text.trim();
    if (next === '') return;
    // A search opens what it matches and never closes what the member opened, so clearing it
    // leaves them where they were.
    const matched = catalogue
      .filter((group) => featuresMatching(group, next).length > 0)
      .map((group) => group.id);
    setOpenIds((open) => [...new Set([...open, ...matched])]);
  }

  return (
    <div data-testid="permission-picker" className="flex flex-col gap-3">
      {readOnly && labels.readOnlyNotice !== undefined ? (
        <Alert role="status" data-testid="permission-picker-readonly">
          <AlertDescription className="text-foreground">{labels.readOnlyNotice}</AlertDescription>
        </Alert>
      ) : null}

      {behind !== null && behind.added.length > 0 ? (
        <Alert role="status" data-testid="permission-picker-behind">
          <Icon name="triangle-exclamation" />
          <AlertDescription className="text-foreground">
            {labels.behindRole(behind.added.length, behind.removed.length)}
          </AlertDescription>
          {readOnly || onReapplyRole === undefined ? null : (
            <div className="col-start-2 mt-2">
              <Button type="button" variant="outline" size="default" onClick={onReapplyRole}>
                {labels.reapplyRole}
              </Button>
            </div>
          )}
        </Alert>
      ) : null}

      {editing ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="me-auto text-sm font-semibold">{labels.runningTotal(grantedCount)}</p>
          <Input
            type="search"
            className="h-8 w-full sm:w-64"
            aria-label={labels.search}
            placeholder={labels.search}
            value={search}
            onChange={(event) => {
              searchFor(event.target.value);
            }}
          />
          {roleTemplate === undefined || readOnly ? null : (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                onChange([...roleTemplate]);
              }}
            >
              <Icon name="undo" />
              {labels.resetToRole}
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <p className="me-auto text-sm">{labels.summary(grantedCount, modulesWithGrants)}</p>
          {readOnly ? null : (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setMode('edit');
              }}
            >
              {labels.customise}
            </Button>
          )}
        </div>
      )}

      <Accordion
        type="multiple"
        value={openIds}
        onValueChange={setOpenIds}
        className="flex flex-col gap-2"
      >
        {visible.map(({ group, features }) => {
          const codes = codesOf(group);
          const held = countIn(codes);
          const all = held === codes.length && held > 0;
          const columns = columnsOf(group);
          return (
            <AccordionItem key={group.id} value={group.id} className="bg-card rounded-lg border">
              <div className="flex items-center gap-3 px-3">
                {editing && !readOnly ? (
                  <Checkbox
                    className={INDETERMINATE}
                    aria-label={labels.selectAllIn(group.label)}
                    checked={all ? true : held > 0 ? 'indeterminate' : false}
                    onCheckedChange={(next) => {
                      if (next === true) add(codes);
                      else remove(codes);
                    }}
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <AccordionTrigger>
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span>{group.label}</span>
                      <span className="text-xs font-normal text-muted-foreground">
                        {labels.moduleCount(held, codes.length)}
                      </span>
                    </span>
                  </AccordionTrigger>
                </div>
              </div>
              {/* `h-auto` replaces the primitive's fixed height, which Radix measures once when the
                  module opens: a card that later narrows (the table stacking) would clip its rows. */}
              <AccordionContent className="h-auto px-3">
                {editing ? (
                  <div className="@container">
                    <div
                      className="group/scroll overflow-x-auto p-1"
                      data-slot="permission-table-scroll"
                      onScroll={(event) => {
                        const wrapper = event.currentTarget;
                        wrapper.toggleAttribute('data-scrolled', wrapper.scrollLeft !== 0);
                      }}
                    >
                      <div
                        role="table"
                        aria-label={group.label}
                        className="isolate @xl:w-max @xl:min-w-full"
                        style={{ '--permission-columns': String(columns.length) } as CSSProperties}
                      >
                        <div
                          role="row"
                          className={`hidden border-b py-2 text-xs font-medium text-muted-foreground ${GRID}`}
                        >
                          <div
                            role="columnheader"
                            className={`@xl:flex @xl:items-center ${PINNED}`}
                          >
                            {labels.featureColumn}
                          </div>
                          {columns.map((column) => (
                            <div
                              key={column.action}
                              role="columnheader"
                              className="text-center text-balance"
                            >
                              {column.label}
                            </div>
                          ))}
                        </div>
                        {features.map((feature) => {
                          const labelId = `${id}-${feature.id}`;
                          const featureCodes = feature.capabilities.map((c) => c.code);
                          const heldHere = countIn(featureCodes);
                          const allHere = heldHere === featureCodes.length && heldHere > 0;
                          return (
                            <div
                              key={feature.id}
                              role="row"
                              className={`group/row flex flex-wrap items-center gap-x-4 gap-y-2 border-b py-2 last:border-b-0 hover:bg-muted/50 ${GRID}`}
                            >
                              <div
                                role="rowheader"
                                className={`flex basis-full items-center gap-2 font-medium @xl:basis-auto @xl:group-hover/row:bg-[color-mix(in_srgb,var(--muted)_50%,var(--card))] ${PINNED}`}
                              >
                                {readOnly ? null : (
                                  <Checkbox
                                    className={INDETERMINATE}
                                    aria-label={labels.selectAllIn(
                                      `${group.label}: ${feature.label}`,
                                    )}
                                    checked={
                                      allHere ? true : heldHere > 0 ? 'indeterminate' : false
                                    }
                                    onCheckedChange={(next) => {
                                      if (next === true) add(featureCodes);
                                      else remove(featureCodes);
                                    }}
                                  />
                                )}
                                <span id={labelId}>{feature.label}</span>
                              </div>
                              {columns.map((column) => {
                                const capability = feature.capabilities.find(
                                  (c) => c.action === column.action,
                                );
                                if (capability === undefined) {
                                  return (
                                    <div
                                      key={column.action}
                                      role="cell"
                                      className="hidden @xl:block"
                                    />
                                  );
                                }
                                const boxId = `${id}-${capability.code}`;
                                return (
                                  <div
                                    key={column.action}
                                    role="cell"
                                    className="flex items-center justify-start gap-2 @xl:justify-center"
                                  >
                                    <Checkbox
                                      id={boxId}
                                      aria-labelledby={`${labelId} ${boxId}-label`}
                                      checked={granted.has(capability.code)}
                                      aria-readonly={readOnly || undefined}
                                      // Read-only keeps the box focusable, announced and at full
                                      // contrast, with NO change handler: Space and a click leave it
                                      // as it is (the 3.1 PermissionGrid pattern). `disabled` would
                                      // drop it out of the tab order and grey it out.
                                      {...(readOnly
                                        ? {}
                                        : {
                                            onCheckedChange: (next: boolean | 'indeterminate') => {
                                              if (next === true) add([capability.code]);
                                              else remove([capability.code]);
                                            },
                                          })}
                                    />
                                    <Label
                                      id={`${boxId}-label`}
                                      htmlFor={boxId}
                                      className="@xl:sr-only"
                                    >
                                      {capability.label}
                                    </Label>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : (
                  <ul className="flex flex-col divide-y">
                    {features.map((feature) => {
                      const shown = feature.capabilities.filter((c) => granted.has(c.code));
                      if (shown.length === 0) return null;
                      return (
                        <li
                          key={feature.id}
                          className="flex flex-col gap-2 py-2 sm:flex-row sm:items-start sm:gap-4"
                        >
                          <span className="text-sm font-medium sm:w-48 sm:shrink-0">
                            {feature.label}
                          </span>
                          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                            {shown.map((capability) => (
                              <li key={capability.code}>{capability.label}</li>
                            ))}
                          </ul>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
