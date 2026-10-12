'use client';

import { useTranslations } from 'next-intl';
import { useRef, useState, type PointerEvent, type ReactElement } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface SignaturePadProps {
  /** The pad's id; its parts' ids derive from it. */
  readonly id: string;
  /** The drawing as a PNG after each stroke or typed change; `null` when the pad is empty. */
  readonly onChange: (png: Blob | null) => void;
  readonly disabled?: boolean;
}

/** The canvas's drawing height (UI-SPEC § Spacing Scale: 512 x 160 at sm+, full width below). */
const HEIGHT = 160;
const FALLBACK_WIDTH = 512;
const STROKE = 2;
const PNG = 'image/png';

/** The 2D context of the pad, or `null` (a browser without canvas, happy-dom): nothing is drawn then. */
const context2d = (canvas: HTMLCanvasElement | null): CanvasRenderingContext2D | null =>
  canvas?.getContext('2d') ?? null;

/** Canvases already sized: a ref callback may attach the same canvas again. */
const fitted = new WeakSet<HTMLCanvasElement>();

/**
 * Sizes a canvas's bitmap to its box at the device pixel ratio, once: assigning a size clears the
 * drawing, so a second attach (before layout, then after) must not wipe a signature.
 */
function fit(canvas: HTMLCanvasElement): void {
  if (fitted.has(canvas)) return;
  fitted.add(canvas);
  const ratio = Math.max(1, window.devicePixelRatio);
  canvas.width = (canvas.clientWidth > 0 ? canvas.clientWidth : FALLBACK_WIDTH) * ratio;
  canvas.height = HEIGHT * ratio;
}

/** The canvas's drawing size in CSS pixels: its box, or the bitmap's when it has no layout yet. */
const boxOf = (canvas: HTMLCanvasElement): { readonly width: number; readonly height: number } => ({
  width: canvas.clientWidth > 0 ? canvas.clientWidth : canvas.width,
  height: canvas.clientHeight > 0 ? canvas.clientHeight : canvas.height,
});

/**
 * The pen, set up at each use so nothing depends on the context keeping its state: scaled to the
 * device ratio, in the canvas's own colour, and its computed font for a typed name (built from the
 * longhands: the computed shorthand carries a line height the canvas parser refuses).
 */
function pen(canvas: HTMLCanvasElement | null): CanvasRenderingContext2D | null {
  const ctx = context2d(canvas);
  if (canvas === null || ctx === null) return null;
  // CSS pixels to bitmap pixels from the actual sizes, so a stroke lands under the pointer even
  // when the box changed after the bitmap was sized.
  const box = boxOf(canvas);
  ctx.setTransform(canvas.width / box.width, 0, 0, canvas.height / box.height, 0, 0);
  const style = getComputedStyle(canvas);
  ctx.lineWidth = STROKE;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = style.color;
  ctx.fillStyle = style.color;
  ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  return ctx;
}

/** A pointer's place on the canvas, in its CSS pixels (the context is scaled to the device ratio). */
function pointOf(event: PointerEvent<HTMLCanvasElement>): {
  readonly x: number;
  readonly y: number;
} {
  const box = event.currentTarget.getBoundingClientRect();
  return { x: event.clientX - box.x, y: event.clientY - box.y };
}

/** The ref callback: size the canvas once it is in the page (nothing to undo, so no cleanup). */
function fitCanvas(canvas: HTMLCanvasElement | null): void {
  if (canvas !== null && context2d(canvas) !== null) fit(canvas);
}

/**
 * This pad's canvas, found from the control that was used: no ref is held, so a ref detached and
 * re-attached around a render can never leave a handler without its canvas.
 */
const padCanvas = (from: Element): HTMLCanvasElement | null =>
  from.closest('[data-signature-pad]')?.querySelector('canvas') ?? null;

/** Empties the pad. */
function wipe(canvas: HTMLCanvasElement | null): void {
  const ctx = context2d(canvas);
  if (canvas === null || ctx === null) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

/**
 * K18 (04.6 UI-SPEC § Kit additions, § Approvals): a signature drawn on a native
 * `<canvas>` with pointer events (no library), "Clear", and the keyboard alternative "Type your name
 * to sign", which draws the typed name on the same canvas, so the output is always the canvas image
 * (`toBlob('image/png')` handed to `onChange`; an empty pad hands `null`).
 *
 * The canvas is sized to the device pixel ratio by its ref callback, never an effect (FE-04, the
 * ScannerDialog rule), once; each handler finds its canvas from the event, never from a held ref: 512 x 160 from `sm`, the full width below. A stroke captures its pointer so
 * it continues outside the box. The canvas never mirrors under RTL (a signature is drawn as written);
 * its buttons do. A typed name is centred, so an Arabic name sits the same as a Latin one. Without
 * a 2D context nothing is drawn and nothing throws. A molecule (FE-06): `ui/`, the `Icon` atom.
 * The pad only produces a PNG; the server decides whether the caller may sign (T-4.6-31).
 */
export function SignaturePad({ id, onChange, disabled = false }: SignaturePadProps): ReactElement {
  const t = useTranslations('common');
  const drawing = useRef(false);
  const [typed, setTyped] = useState('');

  const emit = (canvas: HTMLCanvasElement): void => {
    canvas.toBlob((png) => {
      onChange(png);
    }, PNG);
  };

  const down = (event: PointerEvent<HTMLCanvasElement>): void => {
    const ctx = pen(event.currentTarget);
    if (disabled || ctx === null) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    const { x, y } = pointOf(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const move = (event: PointerEvent<HTMLCanvasElement>): void => {
    const ctx = context2d(event.currentTarget);
    if (!drawing.current || ctx === null) return;
    const { x, y } = pointOf(event);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const up = (event: PointerEvent<HTMLCanvasElement>): void => {
    if (!drawing.current) return;
    drawing.current = false;
    emit(event.currentTarget);
  };

  const type = (from: Element, name: string): void => {
    setTyped(name);
    const canvas = padCanvas(from);
    wipe(canvas);
    const ctx = pen(canvas);
    if (canvas === null || ctx === null || name.trim() === '') {
      onChange(null);
      return;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const box = boxOf(canvas);
    ctx.fillText(name, box.width / 2, box.height / 2);
    emit(canvas);
  };

  const labelId = `${id}-label`;
  return (
    <div data-signature-pad="" className="flex w-full flex-col gap-2 sm:w-[32rem]">
      <div className="flex items-center justify-between gap-2">
        <p id={labelId} className="text-sm font-semibold">
          {t('signature')}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={(event) => {
            wipe(padCanvas(event.currentTarget));
            setTyped('');
            onChange(null);
          }}
        >
          <Icon name="xmark" />
          {t('clear')}
        </Button>
      </div>
      <canvas
        ref={fitCanvas}
        id={id}
        role="img"
        aria-labelledby={labelId}
        // The typed name takes this font; touch-none keeps a stroke from scrolling the page.
        className="border-input bg-background h-40 w-full touch-none rounded-md border text-3xl"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      />
      <Label htmlFor={`${id}-typed`}>{t('type_name_to_sign')}</Label>
      <Input
        id={`${id}-typed`}
        autoComplete="name"
        disabled={disabled}
        value={typed}
        onChange={(event) => {
          type(event.currentTarget, event.target.value);
        }}
      />
    </div>
  );
}
