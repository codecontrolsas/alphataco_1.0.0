'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarIcon, CheckCircle2, Info, Loader2 } from 'lucide-react';
import moment from 'moment';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { bulkUpdateRowStatus } from '../mutations.server';
import type { DailyReportDetailRow } from '../types';

// ============================================================================
// CONSTANTS
// ============================================================================

const BASE_OPTIONS = [
  { value: 'ejecutado', label: 'Ejecutado' },
  { value: 'cancelado', label: 'Cancelado' },
  { value: 'reprogramado', label: 'Reprogramado' },
];

const OPT_DIURNO = { value: 'completar_diurno', label: 'Completar Diurno' };
const OPT_NOCTURNO = { value: 'completar_nocturno', label: 'Completar Nocturno' };

type SectionKey = '24hs' | 'completar-diurno' | 'completar-nocturno' | 'otras';

interface SectionState {
  status: string;
  cancelReason: string;
  rescheduleDate: Date | undefined;
}

const EMPTY_SECTION: SectionState = {
  status: '',
  cancelReason: '',
  rescheduleDate: undefined,
};

// ============================================================================
// PROPS
// ============================================================================

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedRows: DailyReportDetailRow[];
  dailyReportId: string;
  onSuccess: () => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function BulkEditModal({ open, onOpenChange, selectedRows, dailyReportId, onSuccess }: Props) {
  const queryClient = useQueryClient();

  // Snapshot de las filas al abrir el modal — independiente del parent.
  // Sin esto, cuando el parent limpia selectedRows tras un save (para
  // deseleccionar la tabla), el modal se queda sin filas y cierra
  // prematuramente, impidiendo procesar secciones restantes.
  const [snapshotRows, setSnapshotRows] = useState<DailyReportDetailRow[]>([]);

  // ── Segmentación del snapshot por jornada/turno (replicado de prod) ──────
  const groups = useMemo(() => {
    const is24h = (r: DailyReportDetailRow) => r.working_day?.toLowerCase() === 'jornada 24 horas';

    return {
      jornadas24hs: snapshotRows.filter((r) => is24h(r) && r.completed_day !== true && r.completed_night !== true),
      completarDiurno: snapshotRows.filter((r) => is24h(r) && r.completed_night === true && r.completed_day !== true),
      completarNocturno: snapshotRows.filter((r) => is24h(r) && r.completed_day === true && r.completed_night !== true),
      otrasJornadas: snapshotRows.filter((r) => !is24h(r)),
    };
  }, [snapshotRows]);

  const otrasTipos = useMemo(
    () => [...new Set(groups.otrasJornadas.map((r) => r.working_day).filter((w): w is string => Boolean(w)))],
    [groups.otrasJornadas]
  );

  // ── Estado por sección ────────────────────────────────────────────────────
  const [section24h, setSection24h] = useState<SectionState>(EMPTY_SECTION);
  const [sectionDiurno, setSectionDiurno] = useState<SectionState>(EMPTY_SECTION);
  const [sectionNocturno, setSectionNocturno] = useState<SectionState>(EMPTY_SECTION);
  const [sectionOtras, setSectionOtras] = useState<SectionState>(EMPTY_SECTION);
  const [savingSection, setSavingSection] = useState<SectionKey | null>(null);
  const [processedSections, setProcessedSections] = useState<Set<SectionKey>>(new Set());
  const [completedFlash, setCompletedFlash] = useState<SectionKey | null>(null);

  // Snapshot al abrir / reset al cerrar
  useEffect(() => {
    if (open) {
      setSnapshotRows(selectedRows);
    } else {
      setSnapshotRows([]);
      setSection24h(EMPTY_SECTION);
      setSectionDiurno(EMPTY_SECTION);
      setSectionNocturno(EMPTY_SECTION);
      setSectionOtras(EMPTY_SECTION);
      setSavingSection(null);
      setProcessedSections(new Set());
      setCompletedFlash(null);
    }
    // selectedRows se snapshotea SOLO al abrir el modal — cambios posteriores
    // del parent (ej. clearing tras save) se ignoran para mantener la UI estable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const minRescheduleDate = useMemo(() => moment().startOf('day').toDate(), []);

  // ── Mutación genérica que recibe sección + payload ───────────────────────
  const mutation = useMutation({
    mutationFn: async (params: {
      section: SectionKey;
      rowIds: string[];
      status: string;
      cancelReason?: string;
      rescheduleDate?: Date;
    }) => {
      const { rowIds, status } = params;

      // Pseudo-estados de jornada 24h
      if (status === 'completar_diurno') {
        return bulkUpdateRowStatus(rowIds, { completar_diurno: true });
      }
      if (status === 'completar_nocturno') {
        return bulkUpdateRowStatus(rowIds, { completar_nocturno: true });
      }

      return bulkUpdateRowStatus(rowIds, {
        status,
        ...(status === 'cancelado' && params.cancelReason ? { cancel_reason: params.cancelReason } : {}),
        ...(status === 'reprogramado' && params.rescheduleDate
          ? { reschedule_date: moment(params.rescheduleDate).format('YYYY-MM-DD') }
          : {}),
      });
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['daily-report-detail', dailyReportId] });
      queryClient.invalidateQueries({ queryKey: ['datatable-facet'] });
      queryClient.invalidateQueries({ queryKey: ['daily-report-deviations'] });

      setProcessedSections((prev) => new Set(prev).add(variables.section));
      setCompletedFlash(variables.section);
      setTimeout(() => setCompletedFlash(null), 3000);

      toast.success(
        `Se actualizó el estado de ${result.count} registro${result.count !== 1 ? 's' : ''} a "${variables.status}"`
      );
      onSuccess();

      // Si no quedan secciones activas pendientes, cerrar el modal
      const stillPending = activeSections.filter((s) => s !== variables.section && !processedSections.has(s));
      if (stillPending.length === 0) {
        onOpenChange(false);
      }
    },
    onError: () => {
      toast.error('Ocurrió un error al actualizar los registros');
    },
    onSettled: () => {
      setSavingSection(null);
    },
  });

  // ── Validación por sección ────────────────────────────────────────────────
  const isValid = (section: SectionState) => {
    if (!section.status) return false;
    if (section.status === 'cancelado' && !section.cancelReason.trim()) return false;
    if (section.status === 'reprogramado' && !section.rescheduleDate) return false;
    return true;
  };

  // ── Handler de guardado por sección ──────────────────────────────────────
  const handleSave = (section: SectionKey, state: SectionState, rows: DailyReportDetailRow[]) => {
    if (!isValid(state) || rows.length === 0) return;
    setSavingSection(section);
    mutation.mutate({
      section,
      rowIds: rows.map((r) => r.id),
      status: state.status,
      cancelReason: state.cancelReason,
      rescheduleDate: state.rescheduleDate,
    });
  };

  // ── Secciones activas (con filas) ─────────────────────────────────────────
  const activeSections: SectionKey[] = [
    ...(groups.jornadas24hs.length > 0 ? (['24hs'] as const) : []),
    ...(groups.completarDiurno.length > 0 ? (['completar-diurno'] as const) : []),
    ...(groups.completarNocturno.length > 0 ? (['completar-nocturno'] as const) : []),
    ...(groups.otrasJornadas.length > 0 ? (['otras'] as const) : []),
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden gap-4">
        <DialogHeader>
          <DialogTitle>Edición masiva por estado</DialogTitle>
          <DialogDescription>
            <strong className="text-foreground font-mono tabular-nums">{snapshotRows.length}</strong> registro
            {snapshotRows.length !== 1 ? 's' : ''} seleccionado{snapshotRows.length !== 1 ? 's' : ''}, agrupados por
            jornada. Cada grupo se guarda por separado.
          </DialogDescription>
        </DialogHeader>

        <Separator />

        {/* ── Sección: Jornadas 24hs sin completar ──────────────────────── */}
        {groups.jornadas24hs.length > 0 && (
          <SectionBlock
            title={`Jornadas 24hs (${groups.jornadas24hs.length})`}
            description="Filas de jornada 24h sin turnos completados. Podés ejecutar, cancelar, reprogramar o marcar diurno/nocturno como completo."
            rows={groups.jornadas24hs}
            options={[...BASE_OPTIONS, OPT_DIURNO, OPT_NOCTURNO]}
            state={section24h}
            setState={setSection24h}
            isProcessed={processedSections.has('24hs')}
            isFlashing={completedFlash === '24hs'}
            isSaving={savingSection === '24hs'}
            isValid={isValid(section24h)}
            minRescheduleDate={minRescheduleDate}
            onSave={() => handleSave('24hs', section24h, groups.jornadas24hs)}
          />
        )}

        {/* ── Sub-sección: Completar Diurno (noche ya completa) ────────── */}
        {groups.completarDiurno.length > 0 && (
          <SectionBlock
            title={`Completar Diurno (${groups.completarDiurno.length})`}
            description="Filas 24h donde el turno nocturno ya está completo. Solo falta cerrar el diurno."
            rows={groups.completarDiurno}
            options={[...BASE_OPTIONS, OPT_DIURNO]}
            state={sectionDiurno}
            setState={setSectionDiurno}
            isProcessed={processedSections.has('completar-diurno')}
            isFlashing={completedFlash === 'completar-diurno'}
            isSaving={savingSection === 'completar-diurno'}
            isValid={isValid(sectionDiurno)}
            minRescheduleDate={minRescheduleDate}
            onSave={() => handleSave('completar-diurno', sectionDiurno, groups.completarDiurno)}
          />
        )}

        {/* ── Sub-sección: Completar Nocturno (día ya completo) ────────── */}
        {groups.completarNocturno.length > 0 && (
          <SectionBlock
            title={`Completar Nocturno (${groups.completarNocturno.length})`}
            description="Filas 24h donde el turno diurno ya está completo. Solo falta cerrar el nocturno."
            rows={groups.completarNocturno}
            options={[...BASE_OPTIONS, OPT_NOCTURNO]}
            state={sectionNocturno}
            setState={setSectionNocturno}
            isProcessed={processedSections.has('completar-nocturno')}
            isFlashing={completedFlash === 'completar-nocturno'}
            isSaving={savingSection === 'completar-nocturno'}
            isValid={isValid(sectionNocturno)}
            minRescheduleDate={minRescheduleDate}
            onSave={() => handleSave('completar-nocturno', sectionNocturno, groups.completarNocturno)}
          />
        )}

        {/* ── Sección: Otras Jornadas ──────────────────────────────────── */}
        {groups.otrasJornadas.length > 0 && (
          <SectionBlock
            title={`Otras Jornadas (${groups.otrasJornadas.length})${otrasTipos.length ? ` — ${otrasTipos.join(', ')}` : ''}`}
            description="Filas con jornadas distintas a 24h. Sin opciones de completar diurno/nocturno."
            rows={groups.otrasJornadas}
            options={BASE_OPTIONS}
            state={sectionOtras}
            setState={setSectionOtras}
            isProcessed={processedSections.has('otras')}
            isFlashing={completedFlash === 'otras'}
            isSaving={savingSection === 'otras'}
            isValid={isValid(sectionOtras)}
            minRescheduleDate={minRescheduleDate}
            onSave={() => handleSave('otras', sectionOtras, groups.otrasJornadas)}
          />
        )}

        <DialogFooter className="pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// SECTION BLOCK COMPONENT
// ============================================================================

interface SectionBlockProps {
  title: string;
  description: string;
  rows: DailyReportDetailRow[];
  options: { value: string; label: string }[];
  state: SectionState;
  setState: (next: SectionState) => void;
  isProcessed: boolean;
  isFlashing: boolean;
  isSaving: boolean;
  isValid: boolean;
  minRescheduleDate: Date;
  onSave: () => void;
}

function SectionBlock({
  title,
  description,
  rows,
  options,
  state,
  setState,
  isProcessed,
  isFlashing,
  isSaving,
  isValid,
  minRescheduleDate,
  onSave,
}: SectionBlockProps) {
  return (
    <div
      className={cn(
        'w-full min-w-0 space-y-3 rounded-xl border p-4 transition-colors',
        isProcessed && 'border-ok/40 bg-ok-subtle/40',
        isFlashing && 'ring-ok/40 ring-[3px]'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">{title}</h3>
            {isProcessed && (
              <Badge variant="success">
                <CheckCircle2 aria-hidden="true" />
                Guardado
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>

      {/* Lista compacta de filas — clip vertical con scroll interno; sin scroll horizontal */}
      <div
        className={cn(
          'w-full min-w-0 rounded border bg-muted/30 overflow-y-auto overflow-x-hidden',
          rows.length > 4 ? 'max-h-32' : ''
        )}
      >
        <ul className="w-full min-w-0 px-2.5 py-2 space-y-1">
          {rows.map((row) => {
            const completedLabel =
              row.completed_day && row.completed_night
                ? 'Ambos turnos'
                : row.completed_day
                  ? 'Diurno OK'
                  : row.completed_night
                    ? 'Nocturno OK'
                    : null;

            return (
              <li key={row.id} className="flex w-full min-w-0 items-center gap-2 text-xs">
                <span className="block min-w-0 flex-1 truncate font-medium text-foreground">
                  {row.customers?.name ?? '-'}
                </span>
                <span className="shrink-0 text-muted-foreground/60">→</span>
                <span className="block min-w-0 flex-1 truncate text-muted-foreground">
                  {row.customer_services?.service_name ?? '-'}
                </span>
                {completedLabel && (
                  <span className="shrink-0 text-[10px] italic text-muted-foreground">{completedLabel}</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Form de la sección — deshabilitado si ya fue procesada */}
      <fieldset disabled={isProcessed} className={cn('space-y-3', isProcessed && 'opacity-50')}>
        {/* Estado */}
        <div className="space-y-1.5">
          <Label className="text-xs">Nuevo estado</Label>
          <Select
            value={state.status}
            onValueChange={(val) => setState({ ...state, status: val, cancelReason: '', rescheduleDate: undefined })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar estado..." />
            </SelectTrigger>
            <SelectContent>
              {options.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Motivo de cancelación */}
        {state.status === 'cancelado' && (
          <div className="space-y-1.5">
            <Label className="text-xs">
              Motivo de cancelación <span className="text-destructive">*</span>
            </Label>
            <Input
              value={state.cancelReason}
              onChange={(e) => setState({ ...state, cancelReason: e.target.value })}
              placeholder="Ingrese el motivo de cancelación"
            />
          </div>
        )}

        {/* Fecha de reprogramación */}
        {state.status === 'reprogramado' && (
          <div className="space-y-1.5">
            <Label className="text-xs">
              Fecha de reprogramación <span className="text-destructive">*</span>
            </Label>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <AlertTriangle className="h-3 w-3" />
              <span>La fecha debe ser hoy o posterior</span>
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn('w-full justify-start font-normal', !state.rescheduleDate && 'text-muted-foreground')}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {state.rescheduleDate ? moment(state.rescheduleDate).format('DD/MM/YYYY') : 'Seleccionar fecha'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={state.rescheduleDate}
                  onSelect={(d) => setState({ ...state, rescheduleDate: d ?? undefined })}
                  disabled={(date) => date < minRescheduleDate}
                  captionLayout="dropdown"
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        )}

        {/* Botón guardar de la sección */}
        <div className="flex justify-end pt-1">
          <Button
            type="button"
            variant="brand"
            size="sm"
            onClick={onSave}
            disabled={!isValid || isSaving || isProcessed}
            aria-busy={isSaving}
          >
            {isSaving && <Loader2 className="mr-2 size-3.5 animate-spin" />}
            {isProcessed ? (
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5" />
                Guardado
              </span>
            ) : (
              <>
                Guardar este grupo <span className="font-mono tabular-nums">({rows.length})</span>
              </>
            )}
          </Button>
        </div>
      </fieldset>

      {/* Nota informativa cuando no hay opciones de completar */}
      {options.every((o) => o.value !== 'completar_diurno' && o.value !== 'completar_nocturno') && (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Info className="h-3 w-3" />
          <span>Las opciones de completar diurno/nocturno no aplican a este grupo.</span>
        </div>
      )}
    </div>
  );
}
