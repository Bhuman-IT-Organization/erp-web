import type { AbstractIntlMessages } from 'next-intl';
// registry start: imports
import authAr from '@/features/auth/messages/ar.json';
import authEn from '@/features/auth/messages/en.json';
import costCentersAr from '@/features/cost-centers/messages/ar.json';
import costCentersEn from '@/features/cost-centers/messages/en.json';
import currenciesAr from '@/features/currencies/messages/ar.json';
import currenciesEn from '@/features/currencies/messages/en.json';
import customerGroupsAr from '@/features/customer-groups/messages/ar.json';
import customerGroupsEn from '@/features/customer-groups/messages/en.json';
import expenseCategoriesAr from '@/features/expense-categories/messages/ar.json';
import expenseCategoriesEn from '@/features/expense-categories/messages/en.json';
import mailAr from '@/features/mail/messages/ar.json';
import mailEn from '@/features/mail/messages/en.json';
import paymentModesAr from '@/features/payment-modes/messages/ar.json';
import paymentModesEn from '@/features/payment-modes/messages/en.json';
import shellAr from '@/features/shell/messages/ar.json';
import shellEn from '@/features/shell/messages/en.json';
import staffAr from '@/features/staff/messages/ar.json';
import staffEn from '@/features/staff/messages/en.json';
import statusEn from '@/features/status/messages/en.json';
import taxesAr from '@/features/taxes/messages/ar.json';
import taxesEn from '@/features/taxes/messages/en.json';
import servicesAr from '@/features/services/messages/ar.json';
import servicesEn from '@/features/services/messages/en.json';
import leadsourcesAr from '@/features/lead-sources/messages/ar.json';
import leadsourcesEn from '@/features/lead-sources/messages/en.json';
import ticketStatusesAr from '@/features/ticket-statuses/messages/ar.json';
import ticketStatusesEn from '@/features/ticket-statuses/messages/en.json';

import '@/features/ticket-priorities/messages/en.json';
// registry end: imports
import type { Locale } from '@/i18n/locales';
import commonAr from './common/ar.json';
import commonEn from './common/en.json';

/**
 * The static registry of message packs (FE-08). Turbopack has no `import.meta.glob`, so every
 * feature's `messages/<locale>.json` is imported here by hand — a new feature adds its import
 * lines and entries between the `registry` markers (imports, namespaces, en, ar). One top-level
 * namespace per file = the feature's folder name.
 */
export const NAMESPACES = [
  'common',
  // registry start: namespaces
  'services',
  'auth',
  'shell',
  'status',
  'staff',
  'expense-categories',
  'taxes',
  'cost-centers',
  'mail',
  'payment-modes',
  'currencies',
  'lead-sources',
  'ticket-statuses',
  'customer-groups',
  // registry end: namespaces
] as const;
export type Namespace = (typeof NAMESPACES)[number];

// `status` has no Arabic file yet: its keys render the English text under `ar` (the fallback).
const PACKS: Record<Locale, readonly AbstractIntlMessages[]> = {
  en: [
    commonEn,
    // registry start: en
    authEn,
    shellEn,
    statusEn,
    staffEn,
    expenseCategoriesEn,
    taxesEn,
    costCentersEn,
    mailEn,
    paymentModesEn,
    currenciesEn,
    servicesEn,
    leadsourcesEn,
    ticketStatusesEn,
    customerGroupsEn,
    // registry end: en
  ],
  ar: [
    commonAr,
    // registry start: ar
    authAr,
    shellAr,
    staffAr,
    expenseCategoriesAr,
    taxesAr,
    costCentersAr,
    mailAr,
    paymentModesAr,
    currenciesAr,
    servicesAr,
    leadsourcesAr,
    ticketStatusesAr,
    customerGroupsAr,
    // registry end: ar
  ],
};

function isMessages(value: unknown): value is AbstractIntlMessages {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Deep-merges plain objects (message files hold no arrays); never mutates its inputs. */
function deepMerge(base: AbstractIntlMessages, over: AbstractIntlMessages): AbstractIntlMessages {
  const out: AbstractIntlMessages = { ...base };
  for (const [key, value] of Object.entries(over)) {
    const existing = out[key];
    out[key] = isMessages(existing) && isMessages(value) ? deepMerge(existing, value) : value;
  }
  return out;
}

/**
 * The merged pack of a locale: English first, the locale's files over it, so an untranslated key
 * renders the English text rather than the key name (T-3-01).
 */
export function messagesFor(locale: Locale): AbstractIntlMessages {
  const layers = locale === 'en' ? PACKS.en : [...PACKS.en, ...PACKS[locale]];
  return layers.reduce<AbstractIntlMessages>((acc, pack) => deepMerge(acc, pack), {});
}
