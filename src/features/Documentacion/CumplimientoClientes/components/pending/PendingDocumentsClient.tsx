'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { DocumentRowActions } from '@/features/Documentacion/shared/components/DocumentCells';
import { RequirementUpload } from '@/features/Documentacion/shared/components/RequirementUpload';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { useDeferredValue, useId, useMemo, useState } from 'react';
import type { DocumentItem, PendingDocuments, Urgency } from '../../lib/pending.server';
import { formatIsoDay } from '../../utils/issue-text';
import { resourceHref } from './resource-link';

const PAGE_SIZE = 50;
const ALL = 'all';

const URGENCY_UI: Record<Urgency, { label: string; variant: 'destructive' | 'warning' | 'secondary' }> = {
  expired: { label: 'Vencido', variant: 'destructive' },
  rejected: { label: 'Rechazado', variant: 'destructive' },
  missing: { label: 'Falta cargar', variant: 'secondary' },
  expiring: { label: 'Por vencer', variant: 'warning' },
};

function detailText(item: DocumentItem, today: string): string {
  const days = item.validity
    ? Math.round((Date.parse(`${item.validity}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000)
    : null;
  if (item.urgency === 'expired') {
    return item.validity ? `Venció el ${formatIsoDay(item.validity)} (hace ${Math.abs(days ?? 0)} días)` : 'Vencido';
  }
  if (item.urgency === 'rejected')
    return item.denyReason ? `Motivo: ${item.denyReason}` : 'Rechazado sin motivo cargado';
  if (item.urgency === 'expiring' && item.validity) {
    return days === 0 ? 'Vence hoy' : `Vence el ${formatIsoDay(item.validity)} (en ${days} días)`;
  }
  return item.period ? `Período ${item.period}` : 'Obligatorio y sin cargar';
}

function ItemActions({ item }: { item: DocumentItem }) {
  return (
    <DocumentRowActions
      documentId={item.id}
      documentName={item.typeName}
      state={item.state}
      expiringSoon={item.urgency === 'expiring'}
      resource={item.kind}
      viewTab={item.tab}
      upload={{
        tab: item.isPrivate ? item.parentTab : item.tab,
        action: item.isPrivate ? 'upload_private' : 'update',
        render: (close) => (
          <RequirementUpload
            kind={item.kind === 'Persona' ? 'employee' : 'vehicle'}
            resourceId={item.resourceId}
            documentTypeId={item.typeId}
            period={item.period}
            close={close}
          />
        ),
      }}
    />
  );
}

/**
 * «Mis pendientes»: lo que pide acción, de lo más urgente a lo menos (vencido, rechazado, faltante, por vencer), con
 * la acción al lado: subir lo que falta, renovar lo vencido o por vencer, volver a subir lo rechazado.
 */
export function PendingDocumentsClient({ data }: { data: PendingDocuments }) {
  const searchId = useId();
  const [urgency, setUrgency] = useState<Urgency | typeof ALL>(ALL);
  const [kind, setKind] = useState<'Persona' | 'Equipos' | typeof ALL>(ALL);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const counts = useMemo(() => {
    const result: Record<Urgency, number> = { expired: 0, rejected: 0, missing: 0, expiring: 0 };
    for (const item of data.pending) if (kind === ALL || item.kind === kind) result[item.urgency!] += 1;
    return result;
  }, [data.pending, kind]);

  const filtered = useMemo(() => {
    const term = deferredSearch.trim().toLowerCase();
    return data.pending.filter(
      (item) =>
        (urgency === ALL || item.urgency === urgency) &&
        (kind === ALL || item.kind === kind) &&
        (!term || item.resourceLabel.toLowerCase().includes(term) || item.typeName.toLowerCase().includes(term))
    );
  }, [data.pending, urgency, kind, deferredSearch]);

  const shown = filtered.slice(0, visibleCount);
  const kinds = [...new Set(data.pending.map((i) => i.kind))];

  if (data.pending.length === 0) {
    return (
      <StateBlock
        variant="empty"
        title="No hay pendientes"
        description="Toda la documentación obligatoria que podés ver está cargada, vigente y sin vencer en los próximos 30 días."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Filtrar por urgencia">
        {(Object.keys(URGENCY_UI) as Urgency[]).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={urgency === key}
            onClick={() => {
              setUrgency(urgency === key ? ALL : key);
              setVisibleCount(PAGE_SIZE);
            }}
            className="bg-card hover:bg-muted focus-visible:ring-ring aria-pressed:border-brand aria-pressed:bg-brand-subtle rounded-lg border p-3 text-left outline-none focus-visible:ring-2"
          >
            <span className="text-muted-foreground block text-xs">{URGENCY_UI[key].label}</span>
            <span className="font-mono text-2xl font-semibold tabular-nums">{counts[key]}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {kinds.length > 1 && (
          <ToggleGroup
            type="single"
            variant="outline"
            value={kind}
            onValueChange={(value) => {
              if (!value) return;
              setKind(value as typeof kind);
              setVisibleCount(PAGE_SIZE);
            }}
            aria-label="Tipo de recurso"
          >
            <ToggleGroupItem value={ALL} className="px-4">
              Todos
            </ToggleGroupItem>
            <ToggleGroupItem value="Persona" className="px-4">
              Personal
            </ToggleGroupItem>
            <ToggleGroupItem value="Equipos" className="px-4">
              Equipos
            </ToggleGroupItem>
          </ToggleGroup>
        )}
        <div className="min-w-56 flex-1 space-y-1">
          <Label htmlFor={searchId} className="text-xs">
            Buscar
          </Label>
          <div className="relative">
            <Search
              className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
              aria-hidden="true"
            />
            <Input
              id={searchId}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setVisibleCount(PAGE_SIZE);
              }}
              placeholder="Buscar por legajo, nombre, dominio o documento"
              className="pl-8"
            />
          </div>
        </div>
      </div>

      <p role="status" className="text-muted-foreground text-sm tabular-nums">
        {filtered.length} {filtered.length === 1 ? 'pendiente' : 'pendientes'}
        {urgency !== ALL ? ` · ${URGENCY_UI[urgency].label.toLowerCase()}` : ''}
      </p>

      {filtered.length === 0 ? (
        <StateBlock
          variant="empty"
          title="Ningún pendiente con estos filtros"
          description="Probá con otra urgencia o búsqueda."
        />
      ) : (
        <ul className="divide-y rounded-md border">
          {shown.map((item) => (
            <li key={`${item.tab}-${item.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <Badge variant={URGENCY_UI[item.urgency!].variant} className="w-24 justify-center">
                {URGENCY_UI[item.urgency!].label}
              </Badge>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{item.typeName}</p>
                <p className="text-muted-foreground truncate text-sm">
                  <Link href={resourceHref(item.kind, item.resourceId)} className="hover:underline">
                    {item.resourceLabel}
                  </Link>
                  {' · '}
                  {detailText(item, data.today)}
                </p>
              </div>
              <ItemActions item={item} />
            </li>
          ))}
        </ul>
      )}

      {filtered.length > shown.length && (
        <div className="flex items-center justify-center gap-3">
          <span className="text-muted-foreground text-sm tabular-nums">
            Mostrando {shown.length} de {filtered.length}
          </span>
          <Button type="button" variant="outline" size="sm" onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}>
            Mostrar más
          </Button>
        </div>
      )}
    </div>
  );
}
