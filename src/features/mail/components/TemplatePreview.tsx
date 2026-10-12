'use client';

import { useTranslations } from 'next-intl';
import { useMemo, type ReactElement } from 'react';
import { InlineError } from '@/components/molecules/InlineError';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { TestSend } from '@/features/mail/components/TestSend';
import { useTemplatePreview, type MailDraft } from '@/features/mail/hooks/use-template-preview';
import { direction } from '@/i18n/direction';
import { toSupportedLocale } from '@/i18n/locales';
import { CLIENT_TIMINGS } from '@/lib/api/client-timings';
import { useSettledValue } from '@/lib/hooks/use-settled-value';

/** The English version: required, and what a locale without a version receives (D-04). */
const ENGLISH = 'en';
/** The frame: 400px high, 480px from `xl` (UI-SPEC § Spacing), one bordered box. */
const FRAME_BOX = 'h-100 w-full rounded-md border xl:h-120';

export interface TemplatePreviewProps {
  readonly templateId: string;
  /** The template's name in the interface language; it names the frame. */
  readonly templateName: string;
  /** The record's supported locales, English first: one Language radio each. */
  readonly locales: readonly string[];
  /** The previewed locale (`?preview=<locale>`). */
  readonly locale: string;
  readonly onLocaleChange: (locale: string) => void;
  /** The live, unsaved wording of each locale. */
  readonly draftOf: (locale: string) => { readonly subject: string; readonly message: string };
  /** The test send's facts from the record; `null` gives no test send (no edit code). */
  readonly test: { readonly configured: boolean; readonly recipient: string | null } | null;
  readonly canViewLog: boolean;
}

/** The email-shaped skeleton (D-39): a header block, three text bars, a footer bar, in the frame's box. */
function EmailSkeleton(): ReactElement {
  return (
    <div data-testid="preview-skeleton" className={`${FRAME_BOX} flex flex-col gap-4 p-6`}>
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-3.5 w-9/10" />
      <Skeleton className="h-3.5 w-3/4" />
      <Skeleton className="h-3.5 w-3/5" />
      <Skeleton className="mt-auto h-3 w-1/3" />
    </div>
  );
}

/**
 * The draft the preview shows: the chosen locale's, or English's when a non-English version is
 * left empty (its readers get English, D-04), in a fixed key order (the request's cache key).
 */
function shownDraft(
  locale: string,
  draftOf: TemplatePreviewProps['draftOf'],
): { readonly draft: MailDraft; readonly fallback: boolean } {
  const chosen = draftOf(locale);
  const fallback =
    locale !== ENGLISH && chosen.subject.trim() === '' && chosen.message.trim() === '';
  const shown = fallback ? draftOf(ENGLISH) : chosen;
  return {
    draft: { locale: fallback ? ENGLISH : locale, subject: shown.subject, message: shown.message },
    fallback,
  };
}

/**
 * The live preview (04.3 UI-SPEC § Preview; D-04, choice 3, B10): the heading, the Language radios
 * (following focus: the editor calls `onLocaleChange` when a version's field is focused), the
 * rendered subject line and the email exactly as the api renders it for sending, the sample-data
 * caption, and "Send a test to me" (`TestSend`).
 *
 * - **One renderer.** The api renders the SETTLED draft (300ms after typing stops,
 *   `useSettledValue`, keyed on the draft, never from an effect), so what is seen is what is sent.
 * - **Nothing runs (T-4.3-14).** The html goes into `<iframe srcDoc sandbox="">`: an empty sandbox
 *   grants no `allow-*` token, so no script, form, navigation, popup or same-origin access. The api
 *   escapes the wording and every value first (plan 05). The app itself never renders wording as
 *   markup (T-4.3-02): the subject line is React text in the version's direction.
 * - **States (D-39):** an empty message asks nothing and says what to write; the first load is the
 *   email-shaped skeleton; a failure is the kit's inline error with Retry in place of the frame; an
 *   update keeps the old frame, marks the card busy and announces "Updating preview…" politely.
 */
export function TemplatePreview({
  templateId,
  templateName,
  locales,
  locale,
  onLocaleChange,
  draftOf,
  test,
  canViewLog,
}: TemplatePreviewProps): ReactElement {
  const t = useTranslations('mail');
  const { draft, fallback } = shownDraft(locale, draftOf);
  // One object per distinct draft, so the settled value changes only when the words do.
  const live = useMemo<MailDraft>(
    () => ({ locale: draft.locale, subject: draft.subject, message: draft.message }),
    [draft.locale, draft.subject, draft.message],
  );
  const [settled] = useSettledValue(live, CLIENT_TIMINGS.list.searchDebounceMs);
  const empty = settled.message.trim() === '';
  const preview = useTemplatePreview(templateId, empty ? null : settled);
  const language = (one: string): string => t('locale_label', { locale: one });
  const updating = !empty && preview.data !== undefined && preview.isValidating;
  const wording = { dir: direction(toSupportedLocale(settled.locale)), lang: settled.locale };
  const groupId = `preview-language-${templateId}`;

  const body = ((): ReactElement => {
    if (empty) return <p className="text-sm text-muted-foreground">{t('preview_empty')}</p>;
    if (preview.error !== undefined) {
      return (
        <InlineError
          message={t('preview_failed')}
          busy={preview.isValidating}
          {...(preview.error.retryable
            ? {
                onRetry: () => {
                  void preview.mutate();
                },
              }
            : {})}
        />
      );
    }
    if (preview.data === undefined) {
      return (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-1/2" />
          <EmailSkeleton />
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm" dir={wording.dir} lang={wording.lang}>
          {t('preview_subject', { subject: preview.data.subject })}
        </p>
        <iframe
          srcDoc={preview.data.html}
          sandbox=""
          title={t('preview_frame_title', {
            name: templateName,
            language: language(settled.locale),
          })}
          className={FRAME_BOX}
        />
      </div>
    );
  })();

  return (
    <Card
      data-testid="template-preview"
      aria-busy={updating || undefined}
      className="flex flex-col gap-4 p-6"
    >
      <h2 className="text-lg font-semibold">{t('preview')}</h2>
      <div className="flex flex-col gap-2">
        <Label id={groupId}>{t('language')}</Label>
        <RadioGroup
          aria-labelledby={groupId}
          value={locale}
          onValueChange={onLocaleChange}
          className="flex flex-wrap gap-4"
        >
          {locales.map((one) => (
            <Label key={one} className="font-normal">
              <RadioGroupItem value={one} />
              {language(one)}
            </Label>
          ))}
        </RadioGroup>
      </div>
      {fallback ? (
        <p className="text-xs text-muted-foreground">
          {t('preview_fallback', { language: language(locale) })}
        </p>
      ) : null}
      {body}
      <p aria-live="polite" className="sr-only">
        {updating ? t('preview_updating') : null}
      </p>
      <p className="text-xs text-muted-foreground">{t('preview_sample_caption')}</p>
      {test === null ? null : (
        <TestSend
          mode="template"
          templateId={templateId}
          {...(empty ? {} : { draft: settled })}
          languageName={language(settled.locale)}
          configured={test.configured}
          recipient={test.recipient}
          variant="outline"
          canViewLog={canViewLog}
        />
      )}
    </Card>
  );
}
