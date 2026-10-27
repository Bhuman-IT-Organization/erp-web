import { getRequestConfig } from 'next-intl/server';
import { notFound } from 'next/navigation';

const locales = ['en'];

export default getRequestConfig(async ({ locale }) => {
  const resolvedLocale = locale ?? 'en';
  
  if (!locales.includes(resolvedLocale as any)) notFound();

  return {
    locale: resolvedLocale,
    messages: (await import(`./messages/${resolvedLocale}.json`)).default
  };
});