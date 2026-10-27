/* eslint-disable react/jsx-no-literals -- text strings not yet extracted to i18n */
'use client';

import Link from 'next/link';
import { PrioritiesList } from '../components/PrioritiesList';

export function TicketPrioritiesListPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Ticket Priorities</h1>
          <p className="text-sm text-gray-500 mt-1">Manage priority levels for support tickets.</p>
        </div>
        <Link
          href="/setup/ticket-priorities/new"
          className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
        >
          Create Priority
        </Link>
      </div>

      <PrioritiesList />
    </div>
  );
}
