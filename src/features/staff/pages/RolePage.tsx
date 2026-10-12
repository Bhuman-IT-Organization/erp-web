import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { GuardedRoleForm } from '@/features/staff/components/RoleForm';
import { pick } from '@/lib/i18n/pick';

/** The namespaces the client subtree needs: a nested provider REPLACES the messages above it. */
const SLICE = ['common', 'shell', 'staff'] as const;

interface RolePageProps {
  readonly mode: 'create' | 'edit';
  /** The role's id, from `app/(shell)/setup/roles/[id]/page.tsx`; absent on the create route. */
  readonly id?: number;
}

/**
 * The `/setup/roles/new` and `/setup/roles/:id` composition (a Server Component): the form under its own message
 * slice, behind its guards. The role is read in the browser, where the form renders its own title
 * (the role's name, or "New Role"). No `<main>` — `PageShell` owns the one main landmark.
 */
export async function RolePage({ mode, id }: RolePageProps) {
  const messages = pick(await getMessages(), [...SLICE]);
  return (
    <div className="pb-16">
      <NextIntlClientProvider messages={messages}>
        <GuardedRoleForm mode={mode} {...(id === undefined ? {} : { id })} />
      </NextIntlClientProvider>
    </div>
  );
}
