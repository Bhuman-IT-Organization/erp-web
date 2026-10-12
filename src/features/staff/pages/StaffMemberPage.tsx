import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { GuardedStaffMemberForm } from '@/features/staff/components/StaffMemberForm';
import { pick } from '@/lib/i18n/pick';

/** The namespaces the client subtree needs: a nested provider REPLACES the messages above it. */
const SLICE = ['common', 'shell', 'staff'] as const;

interface StaffMemberPageProps {
  readonly mode: 'create' | 'edit';
  /** The member's staff id, from `app/(shell)/setup/staff/[id]/page.tsx`; absent on the create route. */
  readonly id?: number;
}

/**
 * The `/setup/staff/new` and `/setup/staff/:id` composition (a Server Component): the form under its own message
 * slice, behind its guards. The member is read in the browser, where the form renders its own title
 * row (the name and the status badge, or "New Staff Member"). No `<main>` — `PageShell` owns it.
 */
export async function StaffMemberPage({ mode, id }: StaffMemberPageProps) {
  const messages = pick(await getMessages(), [...SLICE]);
  return (
    <div className="pb-16">
      <NextIntlClientProvider messages={messages}>
        <GuardedStaffMemberForm mode={mode} {...(id === undefined ? {} : { id })} />
      </NextIntlClientProvider>
    </div>
  );
}
