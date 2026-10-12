import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { useState, type ReactElement } from 'react';
import { SWRConfig } from 'swr';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { ApiAdapter } from '@/lib/api/call-api';
import { http } from '@/lib/api/http';
import { setSession } from '@/lib/auth/session';
import { TemplatePreview } from './TemplatePreview';

// A fake axios adapter on the shared instance; a synthetic rendered email (W0-05), shaped as the
// api's renderer builds it: the brand rule, the company name, the message, the footer.
const email = (dir: 'ltr' | 'rtl', lang: string, text: string): string =>
  `<!doctype html><html dir="${dir}" lang="${lang}"><body style="margin:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif"><div style="height:4px;background:#171717"></div><div style="max-width:600px;margin:0 auto;padding:24px"><div style="font-size:20px;font-weight:600;color:#171717">Company 1</div><p style="margin:24px 0;font-size:16px;line-height:24px;color:#171717">${text}</p><p style="margin:0 0 24px;font-size:16px;line-height:24px;color:#171717"><a href="https://example.test/x" style="color:#171717;text-decoration:underline">https://example.test/x</a></p><hr style="border:0;border-top:1px solid #e5e5e5"><div style="font-size:12px;color:#737373">Company 1</div></div></body></html>`;
const EN = { subject: 'Template 1 for Staff name', html: email('ltr', 'en', 'Hello Staff name,') };
const AR = { subject: 'Template 1 ar', html: email('rtl', 'ar', 'Hello ar Staff name,') };

type Answer = { readonly status: number; readonly body?: unknown } | 'pending';

function respond(config: InternalAxiosRequestConfig, answer: Answer) {
  if (answer === 'pending') return new Promise<never>(() => undefined);
  const response = {
    data: answer.body,
    status: answer.status,
    statusText: String(answer.status),
    headers: new AxiosHeaders(),
    config,
  };
  if (answer.status < 300) return Promise.resolve(response);
  return Promise.reject(new AxiosError('failed', 'ERR_BAD_RESPONSE', config, null, response));
}

/** Answers the previews in order; the last answer repeats. */
function withApi(...answers: Answer[]): Decorator {
  return function ApiDecorator(Story) {
    setSession({ accessToken: 'story', csrfToken: 'story' });
    const queue = [...answers];
    const adapter: ApiAdapter = (config) =>
      respond(config, (queue.length > 1 ? queue.shift() : queue[0]) ?? 'pending');
    http.defaults.adapter = adapter;
    return (
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <Story />
      </SWRConfig>
    );
  };
}

type Versions = Readonly<Record<string, { readonly subject: string; readonly message: string }>>;
const VERSIONS: Versions = {
  en: { subject: 'Template 1 for {staff_name}', message: 'Hello {staff_name},\n\n{link}' },
  ar: { subject: 'Template 1 ar', message: 'Hello ar {staff_name},' },
};

/** The preview beside a stand-in message box, as the editor feeds it: the live draft of each locale. */
function Preview({
  versions = VERSIONS,
  initial = 'en',
}: {
  readonly versions?: Versions;
  readonly initial?: string;
}): ReactElement {
  const [locale, setLocale] = useState(initial);
  return (
    <div className="max-w-xl">
      <TemplatePreview
        templateId="7"
        templateName="Template 1"
        locales={['en', 'ar']}
        locale={locale}
        onLocaleChange={setLocale}
        draftOf={(one) => versions[one] ?? { subject: '', message: '' }}
        test={{ configured: true, recipient: 'user@example.test' }}
        canViewLog
      />
    </div>
  );
}

const meta = {
  title: 'Features/Mail/TemplatePreview',
  component: Preview,
  decorators: [
    withApi({ status: 200, body: EN }),
    (Story) => (
      <div className="p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Preview>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The first load: the email-shaped skeleton in the frame area, no message (D-39). */
export const Loading: Story = { decorators: [withApi('pending')] };

/** The preview failed: the kit's inline error with Retry, in place of the frame. */
export const Error: Story = {
  decorators: [
    withApi({
      status: 503,
      body: { type: 'about:blank', status: 503, title: 'x', code: 'ERP-UPSTREAM-0001' },
    }),
  ],
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText("We couldn't show the preview. Try again."),
    ).toBeInTheDocument();
  },
};

/** The api's rendering in a frame that can run nothing (`sandbox=""`). */
export const Loaded: Story = {
  play: async ({ canvasElement }) => {
    const frame = await within(canvasElement).findByTitle('Preview of Template 1 in English');
    await expect(frame.getAttribute('sandbox')).toBe('');
  },
};

/** A new draft is on its way: the old frame stays and the card is busy. */
export const Updating: Story = {
  decorators: [withApi({ status: 200, body: EN }, 'pending')],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByTitle('Preview of Template 1 in English');
    await userEvent.click(canvas.getByRole('radio', { name: 'Arabic' }));
    await waitFor(async () => {
      await expect(canvas.getByTestId('template-preview').getAttribute('aria-busy')).toBe('true');
    });
  },
};

/** No English message yet: nothing is asked, the card says what to do. */
export const Empty: Story = {
  args: { versions: { en: { subject: 'Template 1', message: '' } } },
};

/** The Arabic version is empty: English is previewed, and the caption says Arabic readers get it. */
export const FallbackToEnglish: Story = {
  args: { versions: { en: VERSIONS.en ?? { subject: '', message: '' } }, initial: 'ar' },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText('Recipients who use Arabic get the English version.'),
    ).toBeInTheDocument();
  },
};

/** The Arabic version: the subject line and the email read right to left. */
export const Arabic: Story = {
  args: { initial: 'ar' },
  decorators: [withApi({ status: 200, body: AR })],
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByTitle('Preview of Template 1 in Arabic');
  },
};

/** The Arabic interface: the card mirrors; the English email keeps its own direction. */
export const Rtl: Story = { globals: { locale: 'ar' } };
