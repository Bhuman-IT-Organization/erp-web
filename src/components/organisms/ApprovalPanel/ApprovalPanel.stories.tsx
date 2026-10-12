import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { AxiosHeaders } from 'axios';
import { SWRConfig } from 'swr';
import { Button } from '@/components/ui/button';
import { http } from '@/lib/api/http';
import { setSession } from '@/lib/auth/session';
import { ApprovalPanel, type ApprovalStep } from './ApprovalPanel';

// The signature image is read through the api: a fake adapter answers a synthetic 8 x 8 grey PNG
// written as bytes (ProtectedImage's stories' fixture, never a file or a customer asset). Made-up
// names, one Arabic.
const GREY_PNG = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 8, 0, 0, 0, 8, 8, 0, 0, 0,
  0, 225, 100, 225, 87, 0, 0, 0, 14, 73, 68, 65, 84, 120, 218, 99, 88, 0, 5, 12, 148, 49, 0, 160,
  147, 40, 1, 9, 237, 15, 220, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
]);
const HTTP_OK = 200;

const withApi: Decorator = function ApiDecorator(Story) {
  setSession({ accessToken: 'story', csrfToken: 'story' });
  http.defaults.adapter = (config) =>
    Promise.resolve({
      data: new Blob([GREY_PNG], { type: 'image/png' }),
      status: HTTP_OK,
      statusText: 'OK',
      headers: new AxiosHeaders({ 'content-type': 'image/png' }),
      config,
    });
  return (
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
      <div className="max-w-xs p-6">
        <Story />
      </div>
    </SWRConfig>
  );
};

const PENDING: readonly ApprovalStep[] = [
  {
    key: '1',
    order: 1,
    approverName: 'Sample Signer',
    action: 'sign',
    status: 'pending',
    decidedAt: null,
    note: null,
    signaturePath: null,
  },
  {
    key: '2',
    order: 2,
    approverName: 'سارة المنصوري',
    action: 'approve',
    status: 'pending',
    decidedAt: null,
    note: null,
    signaturePath: null,
  },
];

const DECIDED: readonly ApprovalStep[] = [
  {
    key: '1',
    order: 1,
    approverName: 'Sample Signer',
    action: 'sign',
    status: 'approved',
    decidedAt: '2026-10-04T08:00:00Z',
    note: null,
    signaturePath: '/api/v1/demo/documents/7/signature/1',
  },
  {
    key: '2',
    order: 2,
    approverName: 'سارة المنصوري',
    action: 'approve',
    status: 'approved',
    decidedAt: '2026-10-05T10:00:00Z',
    note: 'Counted twice, all present.',
    signaturePath: null,
  },
  {
    key: '3',
    order: 3,
    approverName: 'Third Person',
    action: 'approve',
    status: 'rejected',
    decidedAt: '2026-10-05T11:30:00Z',
    note: 'Two cartons were damaged in transit; return them to the vendor before approving.',
    signaturePath: null,
  },
];

/** K17: the approver list, the trail and the viewer's one action (UI-SPEC § Approvals). */
const meta = {
  title: 'Organisms/ApprovalPanel',
  component: ApprovalPanel,
  args: {
    heading: 'Approval information',
    listHeading: 'Approver list',
    steps: PENDING,
    statusLabels: { approved: 'Approved', pending: 'Not yet approved', rejected: 'Rejected' },
    signedCaption: '(Sign, full name)',
    reasonLabel: 'Reason',
  },
  decorators: [withApi],
} satisfies Meta<typeof ApprovalPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** D-39: bars while the approvals load, no empty text. */
export const Loading: Story = { args: { steps: undefined } };

/** No approval setting for this document type. */
export const Empty: Story = { args: { steps: [] } };

export const Loaded: Story = {};

/** Decided steps: a signature, an approval with its reason, a rejection with its reason. */
export const Trail: Story = { args: { steps: DECIDED } };

/** The viewer is the current approver: one primary action, last. */
export const WithAction: Story = {
  args: { action: <Button type="button">Approve</Button> },
};

export const Rtl: Story = { args: { steps: DECIDED }, globals: { locale: 'ar' } };
