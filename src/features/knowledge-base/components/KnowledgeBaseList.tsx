'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import { withAuth } from '@/hocs/withAuth';
import { withPermission } from '@/hocs/withPermission';

export function KnowledgeBaseList(): ReactElement {
  const t = useTranslations('knowledge-base');

  return (
    <div className="p-6 space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {t('knowledge_base')}
        </h1>
        <div className="flex items-center gap-3 text-sm">
          <Link
            href="/setup/knowledge-base/groups"
            className="text-blue-600 hover:underline font-medium inline-flex items-center gap-1"
          >
            {t('groups_link')}
          </Link>
          <span className="text-muted-foreground">{t('view_kanban')}</span>
        </div>
      </div>
    </div>
  );
}

export const GuardedKnowledgeBaseList = withAuth(
  withPermission(KnowledgeBaseList, { skeleton: 'list' }),
  { skeleton: 'list' },
);
