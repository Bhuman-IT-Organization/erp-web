'use client';

import Link from 'next/link';
import { PrioritiesList } from '../components/PrioritiesList';
import { LABELS, ROUTES } from '../constants';

/**
 * Page layout for the ticket priorities list: heading, Create button and the table.
 */
export function TicketPrioritiesListPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{LABELS.title}</h1>
          <p className="text-sm text-gray-500 mt-1">{LABELS.subtitle}</p>
        </div>
        <Link
          href={ROUTES.create}
          className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
        >
          {LABELS.createButton}
        </Link>
      </div>

      <PrioritiesList />
    </div>
  );
}
