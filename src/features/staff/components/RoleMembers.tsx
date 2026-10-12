'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useId, useState, type ReactElement } from 'react';
import { Pager } from '@/components/molecules/Pager';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { RoleMember } from '@/features/staff/schemas/staff.schema';
import { useFormat } from '@/lib/i18n/format';

/** One page of the card (lead 2026-09-27: past 10 holders, the pager). */
const MEMBERS_PER_PAGE = 10;
const memberRoute = (staffId: number): string => `/setup/staff/${String(staffId)}`;
const fullName = (member: RoleMember): string => `${member.firstName} ${member.lastName}`;

export interface RoleMembersProps {
  /** The role's holders; `undefined` while the role loads (the card's skeleton, D-39). */
  readonly members: readonly RoleMember[] | undefined;
}

/** The loading card: the real heading stays above it; bars shaped like the count, search and rows. */
function MembersSkeleton(): ReactElement {
  const tc = useTranslations('common');
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-4">
      <span className="sr-only">{tc('loading')}</span>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-8 w-full" />
      <div className="flex flex-col">
        <div className="flex h-10 items-center border-b px-2">
          <Skeleton className="h-3.5 w-20" />
        </div>
        {[0, 1, 2].map((row) => (
          <div key={row} className="flex h-9 items-center border-b px-2 last:border-0">
            <Skeleton className="h-3.5 w-32" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The role's holders in their own card, legacy's `col-md-5` panel of `roles/role.php`: one "Full
 * Name" column where each name links to the member, a search by name as it is typed, "Total Users:
 * N", and 10 per page with the kit Pager. No photo and no Export (README `## Dropped on purpose`).
 * While the role loads, the card's own skeleton under its real heading, with no message (D-39).
 */
export function RoleMembers({ members }: RoleMembersProps): ReactElement {
  const t = useTranslations('staff');
  const tc = useTranslations('common');
  const f = useFormat();
  const headingId = useId();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);

  const needle = query.trim().toLocaleLowerCase();
  const shown = (members ?? []).filter((member) =>
    fullName(member).toLocaleLowerCase().includes(needle),
  );
  const last = Math.max(0, Math.ceil(shown.length / MEMBERS_PER_PAGE) - 1);
  const current = Math.min(page, last);
  const rows = shown.slice(current * MEMBERS_PER_PAGE, (current + 1) * MEMBERS_PER_PAGE);

  return (
    <Card className="gap-0 py-0">
      <section aria-labelledby={headingId} className="flex flex-col gap-4 p-6">
        <div className="flex flex-col gap-1">
          <h2 id={headingId} className="text-lg font-semibold">
            {t('staff_which_are_using_role')}
          </h2>
          {members !== undefined && members.length > 0 ? (
            <p className="text-muted-foreground text-xs">
              {t('roles_total_users')}
              {f.number(members.length)}
            </p>
          ) : null}
        </div>
        {members === undefined ? (
          <MembersSkeleton />
        ) : members.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('role_has_no_members')}</p>
        ) : (
          <>
            <Input
              type="search"
              aria-label={tc('search')}
              placeholder={tc('search')}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
            />
            {shown.length === 0 ? (
              <p className="text-muted-foreground text-sm">{tc('no_matches')}</p>
            ) : (
              <Table data-testid="role-members">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('staff_dt_name')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((member) => (
                    <TableRow key={member.staffId}>
                      <TableCell className="break-words whitespace-normal">
                        <Link
                          href={memberRoute(member.staffId)}
                          className="underline-offset-4 hover:underline"
                        >
                          {fullName(member)}
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {shown.length > MEMBERS_PER_PAGE ? (
              // The Pager reads a cursor only as null / not null, so a client-side page passes a marker.
              <Pager
                meta={{
                  prevCursor: current > 0 ? 'previous' : null,
                  nextCursor: current < last ? 'next' : null,
                  total: shown.length,
                  rangeStart: current * MEMBERS_PER_PAGE + 1,
                }}
                rowsOnPage={rows.length}
                onPrevious={() => {
                  setPage(current - 1);
                }}
                onNext={() => {
                  setPage(current + 1);
                }}
              />
            ) : null}
          </>
        )}
      </section>
    </Card>
  );
}
