import { getTranslations } from 'next-intl/server';

export default async function Page() {
  const t = await getTranslations('common');
  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">{t('scaffold_title')}</h1>
      <p>{t('scaffold_hint')}</p>
    </main>
  );
}
