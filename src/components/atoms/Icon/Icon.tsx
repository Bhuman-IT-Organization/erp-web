import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  ArrowUpDown,
  Award,
  Banknote,
  Barcode,
  Bath,
  Book,
  Bookmark,
  Boxes,
  BriefcaseMedical,
  Calendar,
  CalendarMinus,
  ChartArea,
  ChartColumn,
  ChartGantt,
  ChartLine,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleDot,
  CirclePlus,
  CircleQuestionMark,
  CircleUserRound,
  CircleX,
  Clipboard,
  ClipboardList,
  Clock,
  ContactRound,
  Contrast,
  Copy,
  CreditCard,
  Crosshair,
  DollarSign,
  Download,
  EllipsisVertical,
  ExternalLink,
  Eye,
  EyeOff,
  Factory,
  File,
  FileChartColumn,
  FilePen,
  FileText,
  Gauge,
  Gavel,
  Gift,
  GraduationCap,
  Group,
  Handshake,
  House,
  IdCard,
  Image,
  Inbox,
  Landmark,
  Languages,
  LayoutList,
  LifeBuoy,
  List,
  ListChecks,
  ListFilter,
  ListIndentDecrease,
  ListIndentIncrease,
  ListOrdered,
  Lock,
  LogOut,
  Map,
  MapPin,
  MapPinned,
  Medal,
  Network,
  Newspaper,
  PanelLeft,
  Paperclip,
  Plus,
  Printer,
  Recycle,
  Repeat,
  ReplyAll,
  RotateCw,
  Rss,
  Scissors,
  Search,
  Send,
  Settings,
  Settings2,
  ShoppingBasket,
  ShoppingCart,
  Signpost,
  SlidersHorizontal,
  Snowflake,
  SquareCheck,
  SquarePen,
  StickyNote,
  Tags,
  Target,
  TextAlignJustify,
  Ticket,
  Trash2,
  TriangleAlert,
  Truck,
  Undo2,
  Ungroup,
  Upload,
  User,
  UserMinus,
  Users,
  Wand,
  Wrench,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { ReactElement } from 'react';
import registry from '@/assets/icons/registry.json';
import { cn } from '@/lib/utils';

/**
 * The ONLY file in erp-web allowed to import `lucide-react` or render an `<svg>` (FE-14, enforced by
 * `P_LUCIDE` and `S_SVG` in every other scope and by their absence from S9).
 *
 * Perfex names its glyphs as Font Awesome classes. `src/assets/icons/registry.json` maps each glyph
 * this application uses to a lucide component name; `navigation.ts` carries the Perfex name, so a
 * menu item never knows which icon set renders it and swapping the set is one file.
 *
 * Lucide exports are imported BY NAME, not through `import * as`, so the bundle carries only the
 * icons the registry declares. `COMPONENTS` is checked against the registry by
 * `__tests__/Icon.test.tsx`: a registry entry with no component here fails the suite rather than
 * rendering nothing at runtime.
 *
 * An unknown name renders the fallback and never throws — a menu item with a typo must not take the
 * shell down.
 *
 * Every registry key is its Perfex glyph name, with ONE exception: the fixed-equipment inventory
 * item's glyph is registered as `boxes-stacked`, the nearest neighbour, because its own Font Awesome
 * name contains the customer's company name as a substring and `check:brand` rightly refuses it
 * (W0-05 allows no customer name in code, in a comment as much as in a value). The original name is
 * not spelled out here, for the same reason.
 */
const COMPONENTS: Record<string, LucideIcon> = {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  ArrowUpDown,
  Award,
  Banknote,
  Barcode,
  Bath,
  Book,
  Bookmark,
  Boxes,
  BriefcaseMedical,
  Calendar,
  CalendarMinus,
  ChartArea,
  ChartColumn,
  ChartGantt,
  ChartLine,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleDot,
  CirclePlus,
  CircleQuestionMark,
  CircleUserRound,
  CircleX,
  Clipboard,
  ClipboardList,
  Clock,
  ContactRound,
  Contrast,
  Copy,
  CreditCard,
  Crosshair,
  DollarSign,
  Download,
  EllipsisVertical,
  ExternalLink,
  Eye,
  EyeOff,
  Factory,
  File,
  FileChartColumn,
  FilePen,
  FileText,
  Gauge,
  Gavel,
  Gift,
  GraduationCap,
  Group,
  Handshake,
  House,
  IdCard,
  Image,
  Inbox,
  Landmark,
  Languages,
  LayoutList,
  LifeBuoy,
  List,
  ListChecks,
  ListFilter,
  ListIndentDecrease,
  ListIndentIncrease,
  ListOrdered,
  Lock,
  LogOut,
  Map,
  MapPin,
  MapPinned,
  Medal,
  Network,
  Newspaper,
  PanelLeft,
  Paperclip,
  Plus,
  Printer,
  Recycle,
  Repeat,
  ReplyAll,
  RotateCw,
  Rss,
  Scissors,
  Search,
  Send,
  Settings,
  Settings2,
  ShoppingBasket,
  ShoppingCart,
  Signpost,
  SlidersHorizontal,
  Snowflake,
  SquareCheck,
  SquarePen,
  StickyNote,
  Tags,
  Target,
  TextAlignJustify,
  Ticket,
  Trash2,
  TriangleAlert,
  Truck,
  Undo2,
  Ungroup,
  Upload,
  User,
  UserMinus,
  Users,
  Wand,
  Wrench,
  X,
  Zap,
};

/** A key of `src/assets/icons/registry.json`. */
export type IconName = keyof typeof registry;

/** Every glyph the registry declares, for the stories grid and the tests. */
export const ICON_NAMES = Object.keys(registry) as readonly IconName[];

/** Rendered when a name is not in the registry, or the registry points at an icon we do not import. */
const FALLBACK: LucideIcon = CircleDot;

export interface IconProps {
  readonly name: IconName;
  readonly className?: string;
  /** Decorative by default: an icon beside a label adds nothing to the accessibility tree. */
  readonly 'aria-hidden'?: boolean;
}

export function Icon({
  name,
  className,
  'aria-hidden': ariaHidden = true,
}: IconProps): ReactElement {
  const Component = COMPONENTS[registry[name]] ?? FALLBACK;
  return (
    <Component
      className={cn('size-4 shrink-0', className)}
      aria-hidden={ariaHidden}
      data-icon-name={name}
    />
  );
}
