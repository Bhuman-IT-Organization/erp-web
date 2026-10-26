// import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
// import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
// import { SWRConfig } from 'swr';
// import { expect, userEvent, waitFor, within } from 'storybook/test';
// import type {
//   ServicesRow,
// } from '@/features/services/schemas/services.schema';
// import type { ApiAdapter } from '@/lib/api/call-api';
// import { http } from '@/lib/api/http';
// import { setSession } from '@/lib/auth/session';
// import { ServicesList } from './ServiceList';

// // The transport seam the tests use: a fake axios adapter on the shared instance, set by a decorator
// // before the story renders, with a private SWR cache per story and the tab's session seeded (a
// // request is held until the session is known). Fixture data only (W0-05): never the live stack.
// const HTTP_OK = 200;
// const HTTP_NO_CONTENT = 204;
// const HTTP_CONFLICT = 409;
// const HTTP_SERVICE_UNAVAILABLE = 503;
// const TOTAL = 60;
// const PAGE = 25;
// const EXPORT_LIMIT = 10_000;
// const PRINT_LIMIT = 1_000;
// const IN_USE = 'ERP-SERVICES-0001';

// const NAMES = [
//   'Head office',
//   'Fuel < 50 km',
//   'Spare',
//   'Warehouse',
//   'Branch',
//   'Branch',
//   'Logistics',
//   'Projects',
//   'Maintenance',
//   'Sales',
// ];
// // const NO_USE: ServicesUsage = {
// //   purchaseRequests: 0,
// //   purchaseOrders: 0,
// //   purchaseQuotations: 0,
// //   shippingCharges: 0,
// //   expenses: 0,
// //   assets: 0,
// // };

// /**
//  * The ID descends, as the api orders it. "Head office" is used by 2 purchase orders and 1 asset; the
//  * rest by nothing. Every third row has no Date Created (a Perfex row stored without one, D-31); two
//  * rows share the name "Branch" (Perfex accepts it).
//  */
// const rows = (count: number): ServicesRow[] =>
//   Array.from({ length: count }, (_, i) => ({
//     id: String(TOTAL - i),
//     name: i < NAMES.length ? (NAMES[i] ?? 'Spare') : `Service ${String(TOTAL - i)}`,
//     // dateCreated:
//     //   i % 3 === 2 ? null : `2026-0${String((i % 9) + 1)}-1${String(i % 9)}T08:00:00.000Z`,
//     // usage: i === 0 ? { ...NO_USE, purchaseOrders: 2, assets: 1 } : NO_USE,
//   }));

// const listPage = (data: readonly ServicesRow[], total = data.length) => ({
//   data,
//   meta: {
//     nextCursor: data.length < total ? 'next' : null,
//     prevCursor: null,
//     total,
//     rangeStart: data.length === 0 ? 0 : 1,
//     exportLimit: EXPORT_LIMIT,
//     printLimit: PRINT_LIMIT,
//   },
// });

// const ADMIN = {
//   staffId: 99,
//   email: 'admin@example.invalid',
//   firstName: 'Admin',
//   lastName: 'Person',
//   isAdmin: true,
//   roleId: null,
//   permissions: [],
//   locale: null,
// };

// const problem = (status: number, code: string) => ({
//   type: 'about:blank',
//   status,
//   title: 'x',
//   code,
// });

// type Answer = { readonly status: number; readonly body?: unknown } | 'pending';

// function respond(config: InternalAxiosRequestConfig, answer: Answer) {
//   if (answer === 'pending') return new Promise<never>(() => undefined);
//   const response = {
//     data: answer.body,
//     status: answer.status,
//     statusText: String(answer.status),
//     headers: new AxiosHeaders(),
//     config,
//   };
//   if (answer.status < 300) return Promise.resolve(response);
//   return Promise.reject(new AxiosError('failed', 'ERR_BAD_RESPONSE', config, null, response));
// }

// /** `/me` answers an administrator; a DELETE answers `remove`; the list answers `list`. */
// function api(list: Answer, remove: Answer = { status: HTTP_NO_CONTENT }): ApiAdapter {
//   return (config) => {
//     const path = (config.url ?? '').split('?')[0] ?? '';
//     if (path === '/api/v1/auth/me') return respond(config, { status: HTTP_OK, body: ADMIN });
//     if ((config.method ?? 'get').toUpperCase() === 'DELETE') return respond(config, remove);
//     return respond(config, list);
//   };
// }

// function withApi(adapter: ApiAdapter): Decorator {
//   return function ApiDecorator(Story) {
//     setSession({ accessToken: 'story', csrfToken: 'story' });
//     http.defaults.adapter = adapter;
//     return (
//       <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
//         <Story />
//       </SWRConfig>
//     );
//   };
// }

// const LOADED: Answer = { status: HTTP_OK, body: listPage(rows(PAGE), TOTAL) };

// /** The dialog portals to `<body>`, outside the story canvas. */
// const page = (canvasElement: HTMLElement) => within(canvasElement.ownerDocument.body);

// /** Radix disables pointer events on <body> while the modal mounts: click once the dialog takes input. */
// async function clickWhenReady(element: HTMLElement): Promise<void> {
//   await waitFor(async () => {
//     await expect(getComputedStyle(element).pointerEvents).not.toBe('none');
//   });
//   await userEvent.click(element);
// }

// /** The inline Delete exists from `md`; a story that clicks it declares a desktop width. */
// const DESKTOP = {
//   parameters: {
//     viewport: {
//       options: {
//         desktop1280: { name: 'Desktop 1280', styles: { width: '1280px', height: '800px' } },
//       },
//     },
//   },
//   globals: { viewport: { value: 'desktop1280', isRotated: false } },
// } as const;

// const MOBILE = {
//   parameters: {
//     viewport: {
//       options: {
//         mobile375: { name: 'Mobile 375', styles: { width: '375px', height: '740px' } },
//       },
//     },
//   },
//   globals: { viewport: { value: 'mobile375', isRotated: false } },
// } as const;

// /** "Spare" is used by nothing; "Head office" by 2 purchase orders and 1 asset. */
// const UNUSED_NAME = 'Spare';
// const USED_NAME = 'Head office';

// const openDelete = async (canvasElement: HTMLElement, name = UNUSED_NAME): Promise<HTMLElement> => {
//   const canvas = within(canvasElement);
//   await userEvent.click(await canvas.findByRole('button', { name: `Delete service ${name}` }));
//   return page(canvasElement).findByTestId('confirm-dialog');
// };

// const meta = {
//   title: 'Features/Services/ServicesList',
//   component: ServicesList,
//   // Expanded on purpose (Prettier keeps it): a long generated name or --prefix still fits.
//   parameters: {
//     nextjs: { appDirectory: true, navigation: { pathname: '/setup/services' } },
//   },
//   decorators: [withApi(api(LOADED))],
// } satisfies Meta<typeof ServicesList>;

// export default meta;
// type Story = StoryObj<typeof meta>;

// /** FE-27 `Loading`: the first answer is unknown: the list skeleton, and no message (D-39). */
// export const Loading: Story = { decorators: [withApi(api('pending'))] };

// /** FE-27 `Empty`: nothing yet and no search: the heading, the body and Add Service (D-30). */
// export const Empty: Story = { decorators: [withApi(api({ status: HTTP_OK, body: listPage([]) }))] };

// /** A search that matches nothing: the query named, and Clear search (D-30). */
// export const NoResults: Story = {
//   decorators: [withApi(api({ status: HTTP_OK, body: listPage([]) }))],
//   parameters: { nuqs: { searchParams: '?q=zz' } },
// };

// /** FE-27 `Error`: a retryable failure in plain language where the table goes, with Retry (D-31, D-32). */
// export const Error: Story = {
//   decorators: [
//     withApi(
//       api({
//         status: HTTP_SERVICE_UNAVAILABLE,
//         body: problem(HTTP_SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001'),
//       }),
//     ),
//   ],
// };

// /**
//  * FE-27 `Loaded`: 25 of 60, the ID descending: ID, Service Name (the link) and Date Created (empty
//  * for a row Perfex stored without one); no checkbox; two rows named "Branch".
//  */
// export const Loaded: Story = {};

// /** A service nothing uses: "Delete service Spare?", Keep / Delete in red. */
// export const DeleteConfirm: Story = {
//   ...DESKTOP,
//   play: async ({ canvasElement }) => {
//     const dialog = await openDelete(canvasElement);
//     await waitFor(async () => {
//       await expect(within(dialog).getByRole('heading')).toHaveTextContent(
//         'Delete service Spare?',
//       );
//     });
//     await expect(within(dialog).getByTestId('confirm-dialog-confirm')).toBeEnabled();
//   },
// };

// /**
//  * A service the row says is used (2 purchase orders, 1 asset): one line per group, the refusal
//  * from the start and Delete disabled; no request is sent (D-07, D-28).
//  */
// export const DeleteInUse: Story = {
//   ...DESKTOP,
//   play: async ({ canvasElement }) => {
//     const dialog = await openDelete(canvasElement, USED_NAME);
//     await waitFor(async () => {
//       await expect(within(dialog).getByTestId('confirm-dialog-error')).toBeVisible();
//     });
//     await expect(dialog).toHaveTextContent('2 purchase orders use this service.');
//     await expect(dialog).toHaveTextContent('1 asset uses this service.');
//     await expect(within(dialog).getByTestId('confirm-dialog-confirm')).toBeDisabled();
//   },
// };

// /**
//  * The race: the list said nothing used the service, the api answers 409. The reason stays inside,
//  * Delete is disabled, and the list pages ask again (UAT 7, UI-SPEC G8).
//  */
// export const DeleteRefused: Story = {
//   ...DESKTOP,
//   decorators: [
//     withApi(api(LOADED, { status: HTTP_CONFLICT, body: problem(HTTP_CONFLICT, IN_USE) })),
//   ],
//   play: async ({ canvasElement }) => {
//     const dialog = await openDelete(canvasElement);
//     await clickWhenReady(within(dialog).getByTestId('confirm-dialog-confirm'));
//     // The dialog fades in over 100 ms; the answer can land while it is still translucent.
//     await waitFor(async () => {
//       await expect(within(dialog).getByTestId('confirm-dialog-error')).toBeVisible();
//     });
//     await expect(within(dialog).getByTestId('confirm-dialog-confirm')).toBeDisabled();
//   },
// };

// /** A network failure: the human message inside the dialog, Delete still enabled to retry (D-29). */
// export const DeleteRetryable: Story = {
//   ...DESKTOP,
//   decorators: [
//     withApi(
//       api(LOADED, {
//         status: HTTP_SERVICE_UNAVAILABLE,
//         body: problem(HTTP_SERVICE_UNAVAILABLE, 'ERP-NETWORK-0001'),
//       }),
//     ),
//   ],
//   play: async ({ canvasElement }) => {
//     const dialog = await openDelete(canvasElement);
//     await clickWhenReady(within(dialog).getByTestId('confirm-dialog-confirm'));
//     await waitFor(async () => {
//       await expect(within(dialog).getByTestId('confirm-dialog-error')).toBeVisible();
//     });
//     await expect(within(dialog).getByTestId('confirm-dialog-confirm')).toBeEnabled();
//   },
// };

// /** At 375 px: ID, Service Name and the "Actions for …" kebab (Date Created hidden); the toolbar wraps. */
// export const Mobile: Story = { ...MOBILE };

// /** Arabic: the page mirrors; the actions stay main first, destructive last; the ID keeps its digits. */
// export const Rtl: Story = { globals: { locale: 'ar' } };

import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { SWRConfig } from 'swr';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { ApiAdapter } from '@/lib/api/call-api';
import { http } from '@/lib/api/http';
import { setSession } from '@/lib/auth/session';
import en from '../messages/en.json';
import { ServicesList } from './ServiceList';

// The transport seam the tests use: a fake axios adapter on the shared instance, set by a decorator
// before the story renders, a private SWR cache per story and the tab's session seeded. A GET
// answers `list`; a DELETE answers `remove`. Fixture data only (W0-05).
const HTTP_OK = 200;
const HTTP_NO_CONTENT = 204;
const HTTP_CONFLICT = 409;
const HTTP_SERVICE_UNAVAILABLE = 503;

const ROWS = [
  { id: '3', name: 'Gold Support' },
  { id: '2', name: 'Billing' },
  { id: '1', name: 'Onboarding' },
];

const page = (rows: readonly { id: string; name: string }[]) => ({
  data: rows,
  meta: {
    nextCursor: null,
    prevCursor: null,
    total: rows.length,
    rangeStart: rows.length === 0 ? 0 : 1,
    exportLimit: 10_000,
    printLimit: 1_000,
  },
});

type Answer = { readonly status: number; readonly body?: unknown } | 'pending';

const problem = (status: number, code: string): Answer => ({
  status,
  body: { type: 'about:blank', status, title: code, code },
});

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

function withApi(
  list: Answer = { status: HTTP_OK, body: page(ROWS) },
  remove: Answer = { status: HTTP_NO_CONTENT },
): Decorator {
  return function ApiDecorator(Story) {
    setSession({ accessToken: 'story', csrfToken: 'story' });
    const adapter: ApiAdapter = (config) =>
      respond(config, (config.method ?? 'get').toUpperCase() === 'DELETE' ? remove : list);
    http.defaults.adapter = adapter;
    return (
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <Story />
      </SWRConfig>
    );
  };
}

const meta = {
  title: 'Features/Services/ServiceList',
  component: ServicesList,
  // Expanded on purpose (Prettier keeps it): a long generated name or --prefix still fits.
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: '/setup/services' } },
  },
  decorators: [
    (Story) => (
      <div className="p-4 md:p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ServicesList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** FE-27 `Loading`: the list skeleton while the first answer is unknown; no empty or error text. */
export const Loading: Story = {
  decorators: [withApi('pending')],
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByTestId('list-loading')).toBeVisible();
  },
};

/** FE-27 `Empty`: no services yet, with the add action. */
export const Empty: Story = {
  decorators: [withApi({ status: HTTP_OK, body: page([]) })],
  play: async ({ canvasElement }) => {
    const empty = await within(canvasElement).findByTestId('list-empty');
    await expect(empty).toHaveTextContent(en.services.empty_heading);
  },
};

/** FE-27 `Error`: a 503 says the list could not load, in plain words, with Retry. */
export const Error: Story = {
  decorators: [withApi(problem(HTTP_SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001'))],
  play: async ({ canvasElement }) => {
    const error = await within(canvasElement).findByTestId('list-error');
    await expect(within(error).getByRole('button', { name: 'Retry' })).toBeVisible();
  },
};

/** FE-27 `Loaded`: ID and Service Name; the name is the link; Edit and Delete on every row. */
export const Loaded: Story = {
  decorators: [withApi()],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('link', { name: 'Gold Support' })).toBeVisible();
    await expect(canvas.getByTestId('list-table')).toBeVisible();
  },
};

/** The delete confirmation: "Delete Gold Support?" with Keep and Delete, nothing sent until Delete. */
export const DeleteConfirm: Story = {
  decorators: [withApi()],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const row = (await canvas.findByRole('link', { name: 'Gold Support' })).closest('tr');
    if (row === null) throw new globalThis.Error('no row');
    const actions = within(within(row).getByTestId('row-actions-inline'));
    await userEvent.click(
      actions.getByRole('button', {
        name: en.services.delete_action_named.replace('{name}', 'Gold Support'),
      }),
    );
    const dialog = await within(document.body).findByTestId('confirm-dialog');
    await waitFor(async () => {
      await expect(dialog).toBeVisible();
    });
    await expect(within(dialog).getByTestId('confirm-dialog-confirm')).toBeEnabled();
  },
};

/** A delete a ticket still uses (409): the refusal reads inside the dialog and Delete is disabled. */
export const DeleteRefused: Story = {
  decorators: [withApi(undefined, problem(HTTP_CONFLICT, 'ERP-SERVICES-0001'))],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const row = (await canvas.findByRole('link', { name: 'Gold Support' })).closest('tr');
    if (row === null) throw new globalThis.Error('no row');
    await userEvent.click(
      within(within(row).getByTestId('row-actions-inline')).getByRole('button', {
        name: en.services.delete_action_named.replace('{name}', 'Gold Support'),
      }),
    );
    const dialog = await within(document.body).findByTestId('confirm-dialog');
    const confirm = within(dialog).getByTestId('confirm-dialog-confirm');
    await waitFor(async () => {
      await expect(getComputedStyle(confirm).pointerEvents).not.toBe('none');
    });
    await userEvent.click(confirm);
    const error = await within(dialog).findByTestId('confirm-dialog-error');
    await expect(error.textContent).toBe(en.services.errors['ERP-SERVICES-0001']);
  },
};

/** At 375 px: the actions fold into the kebab; no horizontal overflow. */
export const Mobile: Story = {
  decorators: [withApi()],
  parameters: {
    viewport: {
      options: {
        mobile375: { name: 'Mobile 375', styles: { width: '375px', height: '740px' } },
      },
    },
  },
  globals: { viewport: { value: 'mobile375', isRotated: false } },
};

/** Arabic: the list mirrors under RTL. */
export const Rtl: Story = { decorators: [withApi()], globals: { locale: 'ar' } };
