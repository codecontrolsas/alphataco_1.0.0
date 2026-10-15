import { ACTIONS } from '@/features/Permissions/permissions-map';
import {
  BadgeDollarSign,
  CircleCheck,
  CircleDot,
  Eye,
  EyeOff,
  PackageMinus,
  Pencil,
  Plus,
  Send,
  SlidersHorizontal,
  Tag,
  Trash2,
  Undo2,
  Upload,
  UserCog,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';

/**
 * Presentación de las acciones de permiso. El NOMBRE y la DESCRIPCIÓN vienen de los datos
 * (`actions` de la base + overrides del catálogo, ya resueltos por `getModulesWithTabsServer`);
 * acá solo hay ícono y color, con un fallback para cualquier acción nueva que no figure.
 */
const ACTION_ICONS: Record<string, LucideIcon> = {
  view: Eye,
  create: Plus,
  update: Pencil,
  delete: Trash2,
  approve: CircleCheck,
  view_prices: BadgeDollarSign,
  update_prices: Tag,
  view_all_requests: UsersRound,
  view_private: EyeOff,
  upload_private: Upload,
  assign_resources: UserCog,
  adjust: SlidersHorizontal,
  reverse: Undo2,
  direct_exit: PackageMinus,
  send: Send,
};

/** Color del ícono con tokens del tema (clases completas, nunca construidas en runtime). */
const ACTION_COLORS: Record<string, string> = {
  view: 'text-info',
  create: 'text-ok',
  update: 'text-warn',
  delete: 'text-danger',
  approve: 'text-ok',
  view_prices: 'text-brand-ink',
  update_prices: 'text-brand-ink',
  view_all_requests: 'text-cert',
  view_private: 'text-pending',
  upload_private: 'text-expired',
  assign_resources: 'text-cert',
  adjust: 'text-warn',
  reverse: 'text-danger',
  direct_exit: 'text-expired',
  send: 'text-info',
};

export function getActionIcon(slug: string): LucideIcon {
  return ACTION_ICONS[slug] ?? CircleDot;
}

export function getActionColor(slug: string): string {
  return ACTION_COLORS[slug] ?? 'text-muted-foreground';
}

/** Nombre de la acción: el que viene de los datos y, si falta, el del catálogo. */
export function getActionLabel(action: { slug: string; name: string | null }): string {
  return action.name || (ACTIONS as Record<string, { name: string } | undefined>)[action.slug]?.name || action.slug;
}
