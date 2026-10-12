// @vitest-environment happy-dom
import { fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import commonEn from '@/messages/common/en.json';
import { physicalClassesIn, renderWithProviders, screen, userEvent } from '@/test/render';
import { SignaturePad } from '../SignaturePad';

/**
 * K18 (04.6 UI-SPEC § Approvals): happy-dom has no canvas, so the 2D context and
 * `toBlob` are stubbed; one case removes the context to prove the pad never throws without it.
 */
const COMMON = commonEn.common;
const PNG = new Blob(['png'], { type: 'image/png' });

const context = {
  scale: vi.fn(),
  setTransform: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  clearRect: vi.fn(),
  fillText: vi.fn(),
  lineWidth: 0,
  lineCap: 'butt',
  lineJoin: 'miter',
  strokeStyle: '',
  fillStyle: '',
  font: '',
  textAlign: 'start',
  textBaseline: 'alphabetic',
};

const proto = HTMLCanvasElement.prototype as unknown as Record<string, unknown>;
const original = {
  getContext: proto.getContext,
  toBlob: proto.toBlob,
  setPointerCapture: (Element.prototype as unknown as Record<string, unknown>).setPointerCapture,
};

beforeEach(() => {
  vi.clearAllMocks();
  proto.getContext = vi.fn(() => context);
  proto.toBlob = vi.fn((done: (blob: Blob | null) => void) => {
    done(PNG);
  });
  proto.setPointerCapture = vi.fn();
});
afterEach(() => {
  proto.getContext = original.getContext;
  proto.toBlob = original.toBlob;
  proto.setPointerCapture = original.setPointerCapture;
});

const canvas = () => screen.getByRole('img', { name: COMMON.signature });

describe('SignaturePad', () => {
  it('Drawn: pointer down, move and up draw a line and hand the PNG to onChange', () => {
    const onChange = vi.fn();
    renderWithProviders(<SignaturePad id="sig" onChange={onChange} />);
    const pad = canvas();
    fireEvent.pointerDown(pad, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(pad, { pointerId: 1, clientX: 40, clientY: 30 });
    fireEvent.pointerUp(pad, { pointerId: 1, clientX: 40, clientY: 30 });
    expect(context.lineTo).toHaveBeenCalled();
    expect(context.stroke).toHaveBeenCalled();
    expect(onChange).toHaveBeenLastCalledWith(PNG);
    expect(proto.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png');
  });

  it('a move without a press draws nothing', () => {
    renderWithProviders(<SignaturePad id="sig" onChange={vi.fn()} />);
    fireEvent.pointerMove(canvas(), { pointerId: 1, clientX: 40, clientY: 30 });
    expect(context.lineTo).not.toHaveBeenCalled();
  });

  it('Clear empties the pad and calls onChange(null)', async () => {
    const onChange = vi.fn();
    renderWithProviders(<SignaturePad id="sig" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: COMMON.clear }));
    expect(context.clearRect).toHaveBeenCalled();
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('Typed: typing a name draws it on the canvas and hands the PNG; an emptied input calls onChange(null)', async () => {
    const onChange = vi.fn();
    renderWithProviders(<SignaturePad id="sig" onChange={onChange} />);
    const input = screen.getByRole('textbox', { name: COMMON.type_name_to_sign });
    await userEvent.type(input, 'A. Name');
    expect(context.fillText).toHaveBeenLastCalledWith(
      'A. Name',
      expect.any(Number),
      expect.any(Number),
    );
    expect(onChange).toHaveBeenLastCalledWith(PNG);
    await userEvent.clear(input);
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('disabled: the input and Clear are disabled and a stroke draws nothing', () => {
    const onChange = vi.fn();
    renderWithProviders(<SignaturePad id="sig" onChange={onChange} disabled />);
    expect(screen.getByRole('textbox', { name: COMMON.type_name_to_sign })).toHaveProperty(
      'disabled',
      true,
    );
    expect(screen.getByRole('button', { name: COMMON.clear })).toHaveProperty('disabled', true);
    fireEvent.pointerDown(canvas(), { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(canvas(), { pointerId: 1, clientX: 10, clientY: 10 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('with no 2D context (happy-dom as is) nothing throws and nothing is drawn', async () => {
    proto.getContext = vi.fn(() => null);
    const onChange = vi.fn();
    renderWithProviders(<SignaturePad id="sig" onChange={onChange} />);
    fireEvent.pointerDown(canvas(), { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(canvas(), { pointerId: 1, clientX: 20, clientY: 20 });
    fireEvent.pointerUp(canvas(), { pointerId: 1, clientX: 20, clientY: 20 });
    await userEvent.type(screen.getByRole('textbox', { name: COMMON.type_name_to_sign }), 'A');
    await userEvent.click(screen.getByRole('button', { name: COMMON.clear }));
    expect(context.lineTo).not.toHaveBeenCalled();
  });

  it('Rtl: the canvas carries no mirroring class and no physical-direction class is used', () => {
    const { container } = renderWithProviders(<SignaturePad id="sig" onChange={vi.fn()} />, {
      locale: 'ar',
    });
    expect(canvas().className).not.toMatch(/scale-x|-scale/);
    expect(physicalClassesIn(container)).toEqual([]);
  });
});
