import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { AxiosHeaders } from 'axios';
import { SWRConfig } from 'swr';
import { expect, within } from 'storybook/test';
import { http } from '@/lib/api/http';
import { setSession } from '@/lib/auth/session';
import { ProtectedImage } from './ProtectedImage';

// The transport seam the tests use: a fake axios adapter on the shared instance, set by a decorator
// before the story renders, with a private SWR cache. The "image" is a synthetic 8 x 8 grey PNG
// written as bytes here (a neutral fixture, never a file or a customer asset).
const GREY_PNG = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 8, 0, 0, 0, 8, 8, 0, 0, 0,
  0, 225, 100, 225, 87, 0, 0, 0, 14, 73, 68, 65, 84, 120, 218, 99, 88, 0, 5, 12, 148, 49, 0, 160,
  147, 40, 1, 9, 237, 15, 220, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
]);
const HTTP_OK = 200;

/** `pending` never answers; `image` answers the grey PNG. */
function withApi(answer: 'pending' | 'image'): Decorator {
  return function ApiDecorator(Story) {
    setSession({ accessToken: 'story', csrfToken: 'story' });
    http.defaults.adapter = (config) =>
      answer === 'pending'
        ? new Promise<never>(() => undefined)
        : Promise.resolve({
            data: new Blob([GREY_PNG], { type: 'image/png' }),
            status: HTTP_OK,
            statusText: 'OK',
            headers: new AxiosHeaders({ 'content-type': 'image/png' }),
            config,
          });
    return (
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <div className="p-6">
          <Story />
        </div>
      </SWRConfig>
    );
  };
}

const meta = {
  title: 'Molecules/ProtectedImage',
  component: ProtectedImage,
  args: { path: '/api/v1/files/7/thumbnail', alt: 'Sample photo', className: 'size-24' },
  decorators: [withApi('image')],
} satisfies Meta<typeof ProtectedImage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The bytes are on their way: a skeleton of the image's size. */
export const Loading: Story = { decorators: [withApi('pending')] };

/** Read with the bearer and shown by an object URL. */
export const Loaded: Story = {
  play: async ({ canvasElement }) => {
    const image = await within(canvasElement).findByRole('img', { name: 'Sample photo' });
    await expect(image.getAttribute('src')).toMatch(/^blob:/);
  },
};

/** No image: the `image` glyph placeholder, no request. */
export const Missing: Story = { args: { path: null } };

/** Arabic: the same frame. */
export const Rtl: Story = { args: { alt: 'صورة تجريبية' }, globals: { locale: 'ar' } };
