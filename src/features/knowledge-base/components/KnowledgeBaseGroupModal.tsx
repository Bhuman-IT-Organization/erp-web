'use client';

import { useTranslations } from 'next-intl';
import {
  useCallback,
  useRef,
  useState,
  type MouseEvent,
  type ReactElement,
  type SyntheticEvent,
} from 'react';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import {
  useCreateKnowledgeBaseGroup,
  useUpdateKnowledgeBaseGroup,
} from '@/features/knowledge-base/hooks/use-knowledge-base';
import type { KnowledgeBaseGroupRow } from '@/features/knowledge-base/schemas/knowledge-base.schema';

const SHORT_HEX_LEN = 3;
const LONG_HEX_LEN = 6;
const COLOR_CHANNEL_MAX = 255;
const HEX_RADIX = 16;
const HEX_PAD_LEN = 2;
const PERCENT_100 = 100;
const HUE_CIRCLE_DEG = 360;
const HUE_STEP_60 = 60;
const HUE_STEP_120 = 120;
const HUE_STEP_180 = 180;
const HUE_STEP_240 = 240;
const HUE_STEP_300 = 300;
const HUE_DIVISOR_6 = 6;
const HUE_OFFSET_2 = 2;
const HUE_OFFSET_4 = 4;
const DEFAULT_HUE = 191;
const DEFAULT_SAT = 82;
const DEFAULT_VAL = 85;
const SUBSTRING_INDEX_2 = 2;
const SUBSTRING_INDEX_4 = 4;

export interface HsvColor {
  readonly h: number;
  readonly s: number;
  readonly v: number;
}

function expandShortHex(short: string): string {
  return short
    .split('')
    .map((x) => x + x)
    .join('');
}

function calcHue(r: number, g: number, b: number, max: number, diff: number): number {
  if (diff === 0) return 0;
  let h = 0;
  if (max === r) {
    h = (g - b) / diff + (g < b ? HUE_DIVISOR_6 : 0);
  } else if (max === g) {
    h = (b - r) / diff + HUE_OFFSET_2;
  } else {
    h = (r - g) / diff + HUE_OFFSET_4;
  }
  return h / HUE_DIVISOR_6;
}

/** Parses hex color string into HSV components. */
export function hexToHsv(rawHex: string): HsvColor {
  let c = rawHex.replace('#', '');
  if (c.length === SHORT_HEX_LEN) {
    c = expandShortHex(c);
  }
  if (c.length !== LONG_HEX_LEN) {
    return { h: DEFAULT_HUE, s: DEFAULT_SAT, v: DEFAULT_VAL };
  }
  const r = parseInt(c.substring(0, SUBSTRING_INDEX_2), HEX_RADIX) / COLOR_CHANNEL_MAX;
  const g =
    parseInt(c.substring(SUBSTRING_INDEX_2, SUBSTRING_INDEX_4), HEX_RADIX) / COLOR_CHANNEL_MAX;
  const b = parseInt(c.substring(SUBSTRING_INDEX_4, LONG_HEX_LEN), HEX_RADIX) / COLOR_CHANNEL_MAX;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const diff = max - min;
  const s = max === 0 ? 0 : diff / max;
  const h = calcHue(r, g, b, max, diff);

  return {
    h: Math.round(h * HUE_CIRCLE_DEG),
    s: Math.round(s * PERCENT_100),
    v: Math.round(max * PERCENT_100),
  };
}

function hsvSectorRgb(h: number, c: number, x: number): readonly [number, number, number] {
  if (h < HUE_STEP_60) return [c, x, 0];
  if (h < HUE_STEP_120) return [x, c, 0];
  if (h < HUE_STEP_180) return [0, c, x];
  if (h < HUE_STEP_240) return [0, x, c];
  if (h < HUE_STEP_300) return [x, 0, c];
  return [c, 0, x];
}

/** Converts HSV components to standard #rrggbb string. */
export function hsvToHex(h: number, s: number, v: number): string {
  const sNorm = s / PERCENT_100;
  const vNorm = v / PERCENT_100;
  const c = vNorm * sNorm;
  const x = c * (1 - Math.abs(((h / HUE_STEP_60) % SUBSTRING_INDEX_2) - 1));
  const m = vNorm - c;
  const [r, g, b] = hsvSectorRgb(h, c, x);

  const toHex = (n: number): string =>
    Math.round((n + m) * COLOR_CHANNEL_MAX)
      .toString(HEX_RADIX)
      .padStart(HEX_PAD_LEN, '0');

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export interface KnowledgeBaseGroupModalProps {
  readonly open: boolean;
  readonly group?: KnowledgeBaseGroupRow | null | undefined;
  readonly defaultOrder?: number | undefined;
  readonly onClose: () => void;
  readonly onSuccess?: ((action: 'created' | 'updated') => void) | undefined;
}

interface ColorPickerPopoverProps {
  readonly color: string;
  readonly onChange: (color: string) => void;
}

interface ColorPickerState {
  readonly open: boolean;
  readonly hsv: HsvColor;
}

function ColorPickerPopover({ color, onChange }: ColorPickerPopoverProps): ReactElement {
  const t = useTranslations('knowledge-base');
  const [pickerState, setPickerState] = useState<ColorPickerState>(() => ({
    open: false,
    // eslint-disable-next-line no-restricted-syntax -- fallback color in legacy view
    hsv: hexToHsv(color || '#28B8DA'),
  }));
  const satBoxRef = useRef<HTMLDivElement>(null);
  const hueBarRef = useRef<HTMLDivElement>(null);

  const updateColorFromHsv = useCallback(
    (h: number, s: number, v: number) => {
      setPickerState((prev) => ({ ...prev, hsv: { h, s, v } }));
      onChange(hsvToHex(h, s, v));
    },
    [onChange],
  );

  const handleColorTextChange = (value: string): void => {
    onChange(value);
    if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
      setPickerState((prev) => ({ ...prev, hsv: hexToHsv(value) }));
    }
  };

  const handleSatCoords = useCallback(
    (clientX: number, clientY: number) => {
      const rect = satBoxRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
      const y = Math.max(0, Math.min(clientY - rect.top, rect.height));
      const s = Math.round((x / rect.width) * PERCENT_100);
      const v = Math.round((1 - y / rect.height) * PERCENT_100);
      updateColorFromHsv(pickerState.hsv.h, s, v);
    },
    [pickerState.hsv.h, updateColorFromHsv],
  );

  const handleHueCoords = useCallback(
    (clientY: number) => {
      const rect = hueBarRef.current?.getBoundingClientRect();
      if (!rect) return;
      const y = Math.max(0, Math.min(clientY - rect.top, rect.height));
      const h = Math.round((y / rect.height) * HUE_CIRCLE_DEG);
      updateColorFromHsv(
        Math.min(HUE_CIRCLE_DEG, Math.max(0, h)),
        pickerState.hsv.s,
        pickerState.hsv.v,
      );
    },
    [pickerState.hsv.s, pickerState.hsv.v, updateColorFromHsv],
  );

  const handleSatMouseDown = (e: MouseEvent<HTMLDivElement>): void => {
    e.preventDefault();
    handleSatCoords(e.clientX, e.clientY);
    const onMouseMove = (moveEvent: globalThis.MouseEvent): void => {
      handleSatCoords(moveEvent.clientX, moveEvent.clientY);
    };
    const onMouseUp = (): void => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleHueMouseDown = (e: MouseEvent<HTMLDivElement>): void => {
    e.preventDefault();
    handleHueCoords(e.clientY);
    const onMouseMove = (moveEvent: globalThis.MouseEvent): void => {
      handleHueCoords(moveEvent.clientY);
    };
    const onMouseUp = (): void => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  return (
    <div className="flex items-stretch rounded-md border border-slate-300 bg-white overflow-hidden shadow-xs focus-within:ring-1 focus-within:ring-blue-500 focus-within:border-blue-500 h-9">
      <input
        id="kb-group-color"
        type="text"
        aria-label={t('color')}
        value={color}
        onChange={(e) => {
          handleColorTextChange(e.target.value);
        }}
        className="flex-1 min-w-0 px-3 text-sm text-slate-800 bg-transparent border-0 outline-none focus:outline-none"
      />
      <Popover
        open={pickerState.open}
        onOpenChange={(next) => {
          setPickerState((prev) => ({
            ...prev,
            open: next,
            // eslint-disable-next-line no-restricted-syntax -- fallback color in legacy view
            hsv: hexToHsv(color || '#28B8DA'),
          }));
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={t('color')}
            data-testid="color-picker-trigger"
            className="w-10 border-s border-slate-300 bg-slate-50/80 hover:bg-slate-100 flex items-center justify-center cursor-pointer transition-colors"
          >
            <span
              className="w-3.5 h-3.5 rounded-xs border border-slate-400/60 shadow-xs"
              style={{ backgroundColor: color || 'white' }}
            />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={6}
          className="w-[172px] p-2 bg-white border border-slate-200 shadow-xl rounded-md z-50 space-y-2 relative"
        >
          <div className="absolute -top-1.5 end-3.5 w-3 h-3 bg-white border-t border-s border-slate-200 rotate-45 pointer-events-none" />
          <div className="flex gap-1.5">
            <div
              ref={satBoxRef}
              role="slider"
              tabIndex={0}
              aria-label={t('color')}
              aria-valuenow={pickerState.hsv.s}
              onMouseDown={handleSatMouseDown}
              className="relative h-[96px] flex-1 rounded-xs cursor-crosshair border border-slate-300 select-none overflow-hidden"
              style={{
                backgroundColor: `hsl(${String(pickerState.hsv.h)}, 100%, 50%)`,
                backgroundImage:
                  'linear-gradient(to right, white, transparent), linear-gradient(to top, black, transparent)',
              }}
            >
              <div
                className="absolute w-2.5 h-2.5 rounded-full border border-black ring-1 ring-white shadow-xs -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                style={{
                  left: `${String(pickerState.hsv.s)}%`,
                  top: `${String(PERCENT_100 - pickerState.hsv.v)}%`,
                }}
              />
            </div>
            <div
              ref={hueBarRef}
              role="slider"
              tabIndex={0}
              aria-label={t('color')}
              aria-valuenow={pickerState.hsv.h}
              onMouseDown={handleHueMouseDown}
              className="relative w-4 h-[96px] rounded-xs cursor-pointer border border-slate-300 select-none overflow-hidden"
              style={{
                backgroundImage:
                  'linear-gradient(to bottom, hsl(0,100%,50%) 0%, hsl(60,100%,50%) 17%, hsl(120,100%,50%) 33%, hsl(180,100%,50%) 50%, hsl(240,100%,50%) 67%, hsl(300,100%,50%) 83%, hsl(360,100%,50%) 100%)',
              }}
            >
              <div
                className="absolute inset-x-0 h-1 bg-white border border-black shadow-xs -translate-y-1/2 pointer-events-none"
                style={{
                  top: `${String((pickerState.hsv.h / HUE_CIRCLE_DEG) * PERCENT_100)}%`,
                }}
              />
            </div>
          </div>
          <div
            className="h-2.5 w-full rounded-xs border border-slate-300 shadow-inner"
            style={{ backgroundColor: color || 'white' }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

interface FormState {
  name: string;
  slug: string;
  color: string;
  description: string;
  order: number;
  disabled: boolean;
  submitting: boolean;
  error: string;
}

function initialFormState(group?: KnowledgeBaseGroupRow | null, defaultOrder?: number): FormState {
  if (group) {
    return {
      name: group.name,
      slug: group.groupSlug ?? '',
      color: group.color ?? '',
      description: group.description ?? '',
      order: group.groupOrder,
      disabled: !group.active,
      submitting: false,
      error: '',
    };
  }
  return {
    name: '',
    slug: '',
    color: '',
    description: '',
    order: defaultOrder ?? 1,
    disabled: false,
    submitting: false,
    error: '',
  };
}

interface GroupFormFieldsProps {
  readonly form: FormState;
  readonly isEditing: boolean;
  readonly onChange: (updater: (prev: FormState) => FormState) => void;
}

function GroupFormFields({ form, isEditing, onChange }: GroupFormFieldsProps): ReactElement {
  const t = useTranslations('knowledge-base');

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="kb-group-name" className="text-sm font-semibold text-slate-700">
          <span className="text-destructive font-bold me-1">{t('required_star')}</span>
          {t('group_name')}
        </Label>
        <Input
          id="kb-group-name"
          value={form.name}
          onChange={(e) => {
            onChange((prev) => ({ ...prev, name: e.target.value, error: '' }));
          }}
          aria-invalid={form.error !== ''}
          className={cn(
            'w-full rounded-md h-9 transition-colors',
            form.error !== ''
              ? 'border-destructive ring-1 ring-destructive/20 focus-visible:border-destructive focus-visible:ring-destructive/20'
              : 'border-slate-300 focus-visible:border-blue-500 focus-visible:ring-1 focus-visible:ring-blue-500',
          )}
        />
        {form.error !== '' && <p className="text-xs text-destructive mt-1">{form.error}</p>}
      </div>

      {isEditing && (
        <div className="space-y-1.5">
          <Label htmlFor="kb-group-slug" className="text-sm font-semibold text-slate-700">
            {t('slug')}
          </Label>
          <Input
            id="kb-group-slug"
            value={form.slug}
            onChange={(e) => {
              onChange((prev) => ({ ...prev, slug: e.target.value }));
            }}
            className="w-full border-slate-300 rounded-md h-9 focus-visible:border-blue-500 focus-visible:ring-1 focus-visible:ring-blue-500"
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="kb-group-color" className="text-sm font-semibold text-slate-700">
          {t('color')}
        </Label>
        <ColorPickerPopover
          color={form.color}
          onChange={(c) => {
            onChange((prev) => ({ ...prev, color: c }));
          }}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="kb-group-description" className="text-sm font-semibold text-slate-700">
          {t('short_description')}
        </Label>
        <Textarea
          id="kb-group-description"
          value={form.description}
          onChange={(e) => {
            onChange((prev) => ({ ...prev, description: e.target.value }));
          }}
          rows={3}
          className="w-full border-slate-300 rounded-md resize-y focus-visible:border-blue-500 focus-visible:ring-1 focus-visible:ring-blue-500"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="kb-group-order" className="text-sm font-semibold text-slate-700">
          {t('order')}
        </Label>
        <Input
          id="kb-group-order"
          type="number"
          value={form.order}
          onChange={(e) => {
            onChange((prev) => ({ ...prev, order: parseInt(e.target.value, 10) || 0 }));
          }}
          className="w-full border-slate-300 rounded-md h-9 focus-visible:border-blue-500 focus-visible:ring-1 focus-visible:ring-blue-500"
        />
      </div>

      <div className="pt-1">
        <div className="flex items-center gap-2">
          <Checkbox
            id="kb-group-disabled"
            checked={form.disabled}
            onCheckedChange={(checked) => {
              onChange((prev) => ({ ...prev, disabled: checked === true }));
            }}
          />
          <Label
            htmlFor="kb-group-disabled"
            className="text-sm font-medium text-slate-700 cursor-pointer"
          >
            {t('disabled')}
          </Label>
        </div>
        <p className="text-xs text-slate-500 mt-1.5">{t('disabled_note')}</p>
      </div>
    </>
  );
}

export function KnowledgeBaseGroupModal({
  open,
  group,
  defaultOrder,
  onClose,
  onSuccess,
}: KnowledgeBaseGroupModalProps): ReactElement {
  const t = useTranslations('knowledge-base');
  const createGroup = useCreateKnowledgeBaseGroup();
  const updateGroup = useUpdateKnowledgeBaseGroup(group?.id ?? '0');

  const [form, setForm] = useState<FormState>(() => initialFormState(group, defaultOrder));

  const saveGroup = async (): Promise<{ ok: boolean; code?: string; issues?: unknown }> => {
    if (group) {
      return await updateGroup.trigger({
        name: form.name.trim(),
        groupSlug: form.slug.trim() || null,
        color: form.color || null,
        description: form.description || null,
        groupOrder: form.order,
        disabled: form.disabled,
        active: !form.disabled,
      });
    }
    return await createGroup.trigger({
      name: form.name.trim(),
      color: form.color || null,
      description: form.description || null,
      groupOrder: form.order,
      disabled: form.disabled,
    });
  };

  const handleSubmit = async (e: SyntheticEvent): Promise<void> => {
    e.preventDefault();
    if (!form.name.trim()) {
      setForm((prev) => ({ ...prev, error: t('enter_group_name') }));
      return;
    }

    setForm((prev) => ({ ...prev, submitting: true, error: '' }));
    const outcome = await saveGroup();

    if (outcome.ok) {
      onSuccess?.(group ? 'updated' : 'created');
      onClose();
    } else {
      setForm((prev) => ({
        ...prev,
        submitting: false,
        error: outcome.code === 'ERP-CORE-0004' ? t('errors.ERP-CORE-0004') : t('enter_group_name'),
      }));
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="sm:max-w-[560px] bg-white p-6 rounded-lg shadow-xl border border-slate-200">
        <DialogHeader className="border-b border-slate-200 pb-3">
          <DialogTitle className="text-xl font-bold text-slate-800">
            {group ? t('edit_kb_group') : t('new_group')}
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          className="space-y-4 pt-3"
        >
          <GroupFormFields
            form={form}
            isEditing={Boolean(group)}
            onChange={(updater) => {
              setForm(updater);
            }}
          />

          <DialogFooter className="pt-4 flex items-center justify-end gap-2 border-t border-slate-200">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={form.submitting}
              className="border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 rounded-md"
            >
              {t('close')}
            </Button>
            <Button
              type="submit"
              disabled={form.submitting}
              className="bg-slate-900 text-white hover:bg-slate-800 border border-slate-900 rounded-md"
            >
              {form.submitting ? t('saving') : t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
