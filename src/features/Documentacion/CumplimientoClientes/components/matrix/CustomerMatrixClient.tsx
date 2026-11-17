'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Logger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { Download, Loader2, Search } from 'lucide-react';
import { useCallback, useDeferredValue, useId, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { CustomerMatrix, MatrixRow } from '../../lib/customer-compliance.server';
import type { CustomerFitStatus, FitResourceKind } from '../../lib/customer-fit';
import { cellText, formatIsoDay } from '../../utils/issue-text';
import { FitCellDetail } from '../FitCellDetail';

const logger = new Logger('CustomerMatrixClient');

const PAGE_SIZE = 50;
const ALL = 'all';

const KIND_LABEL: Record<FitResourceKind, { tab: string; noun: string; column: string; search: string }> = {
  Persona: { tab: 'Personal', noun: 'personas', column: 'Persona', search: 'Buscar por legajo, nombre o puesto' },
  Equipos: { tab: 'Equipos', noun: 'equipos', column: 'Equipo', search: 'Buscar por interno, dominio o tipo' },
};

const STATUS_FILTERS: { value: CustomerFitStatus | typeof ALL; label: string }[] = [
  { value: ALL, label: 'Todos los estados' },
  { value: 'blocked', label: 'No cumple' },
  { value: 'expiring', label: 'Por vencer' },
  { value: 'ok', label: 'Cumple' },
];

interface Props {
  matrix: CustomerMatrix;
  kinds: FitResourceKind[];
  initialCustomerId: string | null;
}

/**
 * Matriz recursos × clientes: una fila por persona o equipo afectado a algún cliente y una columna por cliente. Filtra
 * en memoria (los datos ya vienen calculados del servidor) y exporta lo filtrado a Excel.
 */
export function CustomerMatrixClient({ matrix, kinds, initialCustomerId }: Props) {
  const searchId = useId();
  const [kind, setKind] = useState<FitResourceKind>(kinds[0]);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const validInitial = matrix.customers.some((c) => c.id === initialCustomerId) ? initialCustomerId : null;
  const [customerId, setCustomerId] = useState<string>(validInitial ?? ALL);
  const [status, setStatus] = useState<CustomerFitStatus | typeof ALL>(ALL);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [exporting, setExporting] = useState(false);

  const ofKind = useMemo(() => matrix.rows.filter((r) => r.kind === kind), [matrix.rows, kind]);
  const unassignedCount = matrix.unassigned[kind];

  const cellsOf = useCallback(
    (row: MatrixRow) =>
      customerId === ALL ? Object.values(row.cells) : row.cells[customerId] ? [row.cells[customerId]] : [],
    [customerId]
  );

  const filtered = useMemo(() => {
    const term = deferredSearch.trim().toLowerCase();
    return ofKind.filter((row) => {
      const cells = cellsOf(row);
      if (cells.length === 0) return false;
      if (status !== ALL && !cells.some((c) => c.s === status)) return false;
      if (!term) return true;
      return row.label.toLowerCase().includes(term) || (row.role ?? '').toLowerCase().includes(term);
    });
  }, [ofKind, deferredSearch, cellsOf, status]);

  // Columnas: el cliente elegido, o los que tienen al menos un recurso de este tipo afectado.
  const columns = useMemo(() => {
    if (customerId !== ALL) return matrix.customers.filter((c) => c.id === customerId);
    const used = new Set(ofKind.flatMap((r) => Object.keys(r.cells)));
    return matrix.customers.filter((c) => used.has(c.id));
  }, [matrix.customers, ofKind, customerId]);

  const blockedCount = useMemo(
    () => filtered.filter((r) => cellsOf(r).some((c) => c.s === 'blocked')).length,
    [filtered, cellsOf]
  );
  const shown = filtered.slice(0, visibleCount);

  // Con un cliente elegido: cuántos recursos tienen cada documento faltante, rechazado, vencido o por vencer.
  const byType = useMemo(() => {
    if (customerId === ALL) return [];
    const counts = new Map<string, { missing: number; rejected: number; expired: number; expiring: number }>();
    const bump = (typeId: string, key: 'missing' | 'rejected' | 'expired' | 'expiring') => {
      const entry = counts.get(typeId) ?? { missing: 0, rejected: 0, expired: 0, expiring: 0 };
      entry[key] += 1;
      counts.set(typeId, entry);
    };
    for (const row of ofKind) {
      const cell = row.cells[customerId];
      if (!cell) continue;
      for (const issue of cell.b)
        bump(issue.t, issue.s === 'faltante' ? 'missing' : issue.s === 'rechazado' ? 'rejected' : 'expired');
      for (const issue of cell.e) bump(issue.t, 'expiring');
    }
    return [...counts.entries()]
      .map(([typeId, c]) => ({ typeId, name: matrix.typeNames[typeId] ?? 'Documento', ...c }))
      .sort(
        (a, b) =>
          b.missing + b.rejected + b.expired - (a.missing + a.rejected + a.expired) ||
          a.name.localeCompare(b.name, 'es')
      );
  }, [customerId, ofKind, matrix.typeNames]);
  const labels = KIND_LABEL[kind];

  const resetPaging = () => setVisibleCount(PAGE_SIZE);

  const handleExport = async () => {
    setExporting(true);
    try {
      const { exportToExcel } = await import('@/shared/lib/excel-export');
      const data = filtered.map((row) => ({
        resource: row.label,
        role: row.role ?? '',
        ...Object.fromEntries(
          columns.map((c) => [c.id, row.cells[c.id] ? cellText(row.cells[c.id], matrix.typeNames) : 'No afectado'])
        ),
      }));
      await exportToExcel(
        data,
        [
          { key: 'resource', title: labels.column, width: 36 },
          { key: 'role', title: kind === 'Persona' ? 'Puesto' : 'Tipo', width: 24 },
          ...columns.map((c) => ({ key: c.id, title: c.name, width: 48 })),
        ],
        {
          filename: `cumplimiento-por-cliente-${labels.noun}-${matrix.today}`,
          sheetName: labels.tab,
          title: `Cumplimiento por cliente — ${labels.tab} (${formatIsoDay(matrix.today)})`,
        }
      );
    } catch (error) {
      logger.error('Error al exportar la matriz', { data: { error } });
      toast.error('No se pudo generar el Excel');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        {kinds.length > 1 && (
          <ToggleGroup
            type="single"
            variant="outline"
            value={kind}
            onValueChange={(value) => {
              if (!value) return;
              setKind(value as FitResourceKind);
              resetPaging();
            }}
            aria-label="Tipo de recurso"
          >
            {kinds.map((k) => (
              <ToggleGroupItem key={k} value={k} className="px-4">
                {KIND_LABEL[k].tab}
              </ToggleGroupItem>
            ))}
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
                resetPaging();
              }}
              placeholder={labels.search}
              className="pl-8"
            />
          </div>
        </div>
        <div className="space-y-1">
          <span className="text-xs font-medium">Cliente</span>
          <Select
            value={customerId}
            onValueChange={(value) => {
              setCustomerId(value);
              resetPaging();
            }}
          >
            <SelectTrigger className="w-56" aria-label="Cliente">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos los clientes</SelectItem>
              {matrix.customers.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <span className="text-xs font-medium">Estado</span>
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value as CustomerFitStatus | typeof ALL);
              resetPaging();
            }}
          >
            <SelectTrigger className="w-44" aria-label="Estado">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" variant="outline" onClick={handleExport} disabled={exporting || filtered.length === 0}>
          {exporting ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Download aria-hidden="true" />}
          Exportar Excel
        </Button>
      </div>

      <p role="status" className="text-muted-foreground text-sm tabular-nums">
        {filtered.length} {labels.noun} · {blockedCount} no cumplen{' '}
        {customerId === ALL ? 'para algún cliente' : 'para este cliente'}
        {unassignedCount > 0 ? ` · ${unassignedCount} sin afectar a ningún cliente (no se listan)` : ''}
      </p>

      {byType.length > 0 && (
        <details className="rounded-md border" open>
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
            Por tipo de documento: qué falta para {matrix.customers.find((c) => c.id === customerId)?.name}
          </summary>
          <div className="overflow-x-auto border-t">
            <table className="w-full text-sm">
              <caption className="sr-only">
                Recursos con cada documento faltante, rechazado, vencido o por vencer
              </caption>
              <thead className="text-muted-foreground text-xs">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Documento
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Falta cargar
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Rechazado
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Vencido
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Por vencer
                  </th>
                </tr>
              </thead>
              <tbody>
                {byType.map((t) => (
                  <tr key={t.typeId} className="border-t">
                    <th scope="row" className="px-3 py-2 text-left font-normal">
                      {t.name}
                    </th>
                    {(['missing', 'rejected', 'expired', 'expiring'] as const).map((k) => (
                      <td
                        key={k}
                        className={cn(
                          'px-3 py-2 text-right font-mono tabular-nums',
                          t[k] === 0 && 'text-muted-foreground'
                        )}
                      >
                        {t[k]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {filtered.length === 0 ? (
        <StateBlock
          variant="empty"
          title={
            ofKind.length === 0 ? `No hay ${labels.noun} afectados a clientes` : 'Ningún resultado con estos filtros'
          }
          description={
            ofKind.length === 0
              ? 'Afectalos desde Comercial → Clientes para ver si cumplen lo que pide cada uno.'
              : 'Probá con otro cliente, estado o búsqueda.'
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-max text-sm">
            <caption className="sr-only">
              Cumplimiento de la documentación de {labels.noun} por cliente al {formatIsoDay(matrix.today)}
            </caption>
            <thead className="bg-muted/50">
              <tr>
                <th scope="col" className="bg-muted sticky left-0 z-10 px-3 py-2 text-left font-medium">
                  {labels.column}
                </th>
                {columns.map((c) => (
                  <th key={c.id} scope="col" className="max-w-48 px-3 py-2 text-left font-medium">
                    <span className="line-clamp-2">{c.name}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.id} className="border-t">
                  <th scope="row" className="bg-background sticky left-0 z-10 max-w-72 px-3 py-2 text-left font-normal">
                    <span className="block truncate font-medium">{row.label}</span>
                    {row.role && <span className="text-muted-foreground block truncate text-xs">{row.role}</span>}
                  </th>
                  {columns.map((c) => {
                    const cell = row.cells[c.id];
                    return (
                      <td key={c.id} className="px-3 py-2">
                        {cell ? (
                          <FitCellDetail cell={cell} typeNames={matrix.typeNames} label={`${row.label} · ${c.name}`} />
                        ) : (
                          <span className="text-muted-foreground" title="No está afectado a este cliente">
                            <span aria-hidden="true">—</span>
                            <span className="sr-only">No afectado</span>
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filtered.length > shown.length && (
        <div className="flex items-center justify-center gap-3">
          <span className="text-muted-foreground text-sm tabular-nums">
            Mostrando {shown.length} de {filtered.length} {labels.noun}
          </span>
          <Button type="button" variant="outline" size="sm" onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}>
            Mostrar más
          </Button>
        </div>
      )}
    </div>
  );
}
