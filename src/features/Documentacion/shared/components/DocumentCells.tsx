'use client';

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getExpiryInfo } from '@/features/Documentacion/shared/lib/document-expiry';
import { PermissionGuard } from '@/features/Permissions/components/PermissionGuard';
import type { ActionSlug, AllTabSlugs } from '@/features/Permissions/permissions-map';
import { documentStateBadges, documentStateLabels } from '@/shared/utils/mappers';
import type { LucideIcon } from 'lucide-react';
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  MoreHorizontal,
  Upload,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';

// ============================================================================
// ICONOS DE ESTADO (los mismos de los filtros de estado de las tablas)
// ============================================================================

export const documentStateIcons: Record<string, LucideIcon> = {
  presentado: FileText,
  aprobado: CheckCircle2,
  rechazado: XCircle,
  vencido: AlertCircle,
  pendiente: Clock,
};

/**
 * Etiquetas de estado de las listas de documentos. `pendiente` es el valor que conserva la fila SIN
 * documento (la fila faltante que arma el motor de cumplimiento): se muestra como "Faltante".
 * (El mapper global `documentStateLabels` no cambia: lo usan otras pantallas.)
 */
export const documentListStateLabels: Record<string, string> = {
  ...documentStateLabels,
  pendiente: 'Faltante',
};

/** `YYYY-MM` -> `MM/YYYY`. Cualquier otro formato se muestra tal cual. */
export function formatDocumentPeriod(period: string | null | undefined): string | null {
  if (!period) return null;
  const match = /^(\d{4})-(\d{2})/.exec(period);
  return match ? `${match[2]}/${match[1]}` : period;
}

// ============================================================================
// CELDAS
// ============================================================================

/** Pill de estado. El documento archivado se muestra como "Ya no aplica" (historial). */
export function DocumentStatePill({
  state,
  archived = false,
}: {
  state: string | null | undefined;
  archived?: boolean;
}) {
  if (archived) {
    return (
      <Badge variant="secondary">
        <Archive />
        Ya no aplica
      </Badge>
    );
  }
  if (!state) return <Badge variant="outline">Sin estado</Badge>;

  const Icon = documentStateIcons[state];
  return (
    <Badge variant={documentStateBadges[state] ?? 'default'}>
      {Icon && <Icon />}
      {documentListStateLabels[state] ?? state}
    </Badge>
  );
}

interface DocumentNameCellProps {
  name: string | null | undefined;
  /** `null`/`undefined` omite el rótulo Obligatorio/Opcional. */
  mandatory?: boolean | null;
  period?: string | null;
  /** Se muestra en rojo solo si el documento está rechazado. */
  denyReason?: string | null;
  state?: string | null;
  /** Criterio por el que se pide ("Puesto = Operador"). Sólo en la ficha del recurso. */
  requestedBy?: string | null;
  /** "Ya no aplica": el criterio se muestra como el que lo exigía. */
  archived?: boolean;
}

/** Nombre del documento en negrita y debajo: obligatoriedad, período, motivo de rechazo y por qué se pide. */
export function DocumentNameCell({
  name,
  mandatory,
  period,
  denyReason,
  state,
  requestedBy,
  archived = false,
}: DocumentNameCellProps) {
  const formattedPeriod = formatDocumentPeriod(period);
  const reason = state === 'rechazado' ? denyReason : null;
  const meta = [
    mandatory == null ? null : mandatory ? 'Obligatorio' : 'Opcional',
    formattedPeriod ? `Período ${formattedPeriod}` : null,
  ].filter(Boolean);

  return (
    <div className="min-w-0">
      <div className="font-semibold text-foreground">{name ?? '-'}</div>
      {(meta.length > 0 || reason) && (
        <div className="text-sm text-muted-foreground">
          {meta.join(' · ')}
          {reason && (
            <>
              {meta.length > 0 && ' · '}
              <span className="text-destructive">{reason}</span>
            </>
          )}
        </div>
      )}
      {requestedBy && (
        <div className="text-sm text-muted-foreground">
          <span className="font-medium">{archived ? 'Se pedía por:' : 'Se pide por:'}</span> {requestedBy}
        </div>
      )}
    </div>
  );
}

interface DocumentEquipmentCellProps {
  brand?: string | null;
  model?: string | null;
  type?: string | null;
  /** Nombres de los clientes a los que está afectado el equipo. */
  contractors: string[];
}

/** "Marca Modelo" en negrita y debajo "tipo · afectado a". */
export function DocumentEquipmentCell({ brand, model, type, contractors }: DocumentEquipmentCellProps) {
  const title = [brand, model].filter(Boolean).join(' ');
  const [first, ...rest] = contractors;
  const assigned = first ? `${first}${rest.length > 0 ? ` +${rest.length}` : ''}` : 'Sin afectar';
  const details = [type, assigned].filter(Boolean).join(' · ');

  return (
    <div className="min-w-0">
      <div className="font-semibold text-foreground">{title || '-'}</div>
      <div className="truncate text-sm text-muted-foreground">{details}</div>
    </div>
  );
}

interface DocumentExpiryCellProps {
  /** Fecha ya normalizada (Date o ISO). Las fechas `DD/MM/YYYY` de empresa se convierten antes. */
  validity: Date | string | null | undefined;
  state: string | null | undefined;
  archived?: boolean;
  /** Fila faltante: todavía no hay documento, así que no hay vencimiento que mostrar. */
  missing?: boolean;
}

/** Fecha de vencimiento en monoespaciada y debajo la ayuda ("Vence en 7 días"). */
export function DocumentExpiryCell({ validity, state, archived = false, missing = false }: DocumentExpiryCellProps) {
  if (archived || missing) return <span className="text-muted-foreground">-</span>;

  const info = getExpiryInfo(validity, state);
  if (!info.date) return <span className="text-muted-foreground">Sin vencimiento</span>;

  return (
    <div>
      <div className="font-mono tabular-nums">{info.date}</div>
      {info.hint && (
        <div
          className={
            info.tone === 'warn' ? 'text-sm font-semibold text-warn-subtle-foreground' : 'text-sm text-muted-foreground'
          }
        >
          {info.hint}
        </div>
      )}
    </div>
  );
}

/** `DD/MM/YYYY` (así guarda la fecha `documents_company.validity`) -> Date al mediodía UTC. */
export function parseCompanyValidity(validity: string | null | undefined): Date | null {
  if (!validity) return null;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(validity.trim());
  if (match) return new Date(`${match[3]}-${match[2]}-${match[1]}T12:00:00Z`);
  const iso = new Date(validity);
  return Number.isNaN(iso.getTime()) ? null : iso;
}

// ============================================================================
// ACCIONES POR FILA
// ============================================================================

type DocumentationTab = AllTabSlugs<'documentacion'>;

interface DocumentRowActionsProps {
  documentId: string;
  documentName: string | null | undefined;
  state: string | null | undefined;
  archived?: boolean;
  /** Valor de `?resource=` del detalle del documento. */
  resource: 'Persona' | 'Equipos' | 'Empresa';
  /** Tab que otorga el permiso `view` para abrir el detalle. */
  viewTab: DocumentationTab;
  /** Solo para filas pendientes: permiso y contenido del modal de subida. */
  upload?: {
    tab: DocumentationTab;
    action: ActionSlug;
    render: (close: () => void) => ReactNode;
  };
}

/**
 * Botón contextual según el estado más un menú "…":
 * pendiente -> "Subir", vencido -> "Renovar", rechazado -> "Volver a subir", el resto -> ícono "Ver".
 * Renovar, reemplazar y eliminar viven en la pestaña "Actualizar" del detalle del documento, así que
 * el botón contextual y el menú llevan ahí (con sus permisos).
 */
export function DocumentRowActions({
  documentId,
  documentName,
  state,
  archived = false,
  resource,
  viewTab,
  upload,
}: DocumentRowActionsProps) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const detailHref = `/dashboard/document/${documentId}?resource=${resource}`;
  const label = documentName ?? 'documento';

  if (state === 'pendiente' && !archived) {
    if (!upload) return null;
    return (
      <div className="flex items-center justify-end">
        <PermissionGuard module="documentacion" tab={upload.tab} action={upload.action}>
          <AlertDialog open={uploadOpen} onOpenChange={setUploadOpen}>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="outline" size="sm" aria-label={`Subir ${label}`}>
                <Upload className="size-4" />
                Subir
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                {/* El formulario de subida no trae título propio: sin esto el diálogo no tiene nombre accesible. */}
                <AlertDialogTitle className="sr-only">Subir {label}</AlertDialogTitle>
                <AlertDialogDescription className="sr-only">
                  Elegí el archivo y completá los datos del documento.
                </AlertDialogDescription>
                <div className="max-h-[90vh] overflow-y-auto">{upload.render(() => setUploadOpen(false))}</div>
              </AlertDialogHeader>
            </AlertDialogContent>
          </AlertDialog>
        </PermissionGuard>
      </div>
    );
  }

  const contextualLabel = archived
    ? null
    : state === 'vencido'
      ? 'Renovar'
      : state === 'rechazado'
        ? 'Volver a subir'
        : null;

  return (
    <div className="flex items-center justify-end gap-1">
      <PermissionGuard module="documentacion" tab={viewTab} action="view">
        {contextualLabel ? (
          <Button asChild variant="outline" size="sm">
            <Link href={detailHref} aria-label={`${contextualLabel}: ${label}`}>
              <Upload className="size-4" />
              {contextualLabel}
            </Link>
          </Button>
        ) : (
          <Button asChild variant="ghost" size="icon-sm">
            <Link href={detailHref} aria-label={`Ver ${label}`}>
              <Eye className="size-4" />
            </Link>
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`Más acciones para ${label}`}>
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={detailHref}>Ver documento</Link>
            </DropdownMenuItem>
            <PermissionGuard module="documentacion" tab="detalle-de-documento" action="update">
              <DropdownMenuItem asChild>
                <Link href={detailHref}>Renovar, reemplazar o eliminar</Link>
              </DropdownMenuItem>
            </PermissionGuard>
          </DropdownMenuContent>
        </DropdownMenu>
      </PermissionGuard>
    </div>
  );
}
