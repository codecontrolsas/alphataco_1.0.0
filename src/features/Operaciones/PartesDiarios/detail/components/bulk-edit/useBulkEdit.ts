import { useMutation } from '@tanstack/react-query';
import moment from 'moment';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useDailyReportDetailInvalidation } from '../../hooks/useDailyReportDetail';
import { bulkUpdateRowStatus } from '../../mutations.server';
import type { DailyReportDetailRow } from '../../types';
import {
  BASE_OPTIONS,
  EMPTY_SECTION,
  OPT_DIURNO,
  OPT_NOCTURNO,
  isSectionValid,
  type SectionKey,
  type SectionState,
  type StatusOption,
} from './types';

/** Clave de mutación: el modal la usa para saber si hay un guardado en curso y bloquear el cierre. */
export const BULK_EDIT_MUTATION_KEY = ['daily-report-bulk-edit'] as const;

export interface BulkEditSection {
  key: SectionKey;
  title: string;
  description: string;
  rows: DailyReportDetailRow[];
  options: StatusOption[];
}

interface SaveParams {
  section: SectionKey;
  rowIds: string[];
  status: string;
  cancelReason?: string;
  rescheduleDate?: Date;
}

const INITIAL_SECTION_STATES: Record<SectionKey, SectionState> = {
  '24hs': EMPTY_SECTION,
  'completar-diurno': EMPTY_SECTION,
  'completar-nocturno': EMPTY_SECTION,
  otras: EMPTY_SECTION,
};

/**
 * Estado y guardado de la edición masiva. `snapshotRows` son las filas al abrir el modal, independientes del
 * padre: cuando el padre limpia la selección tras guardar, el modal conserva las filas y puede seguir
 * procesando las secciones que faltan.
 */
export function useBulkEdit(
  snapshotRows: DailyReportDetailRow[],
  { onSuccess, onClose }: { onSuccess: () => void; onClose: () => void }
) {
  const { invalidateDetail } = useDailyReportDetailInvalidation();

  const [sectionStates, setSectionStates] = useState(INITIAL_SECTION_STATES);
  const [savingSection, setSavingSection] = useState<SectionKey | null>(null);
  const [processedSections, setProcessedSections] = useState<Set<SectionKey>>(new Set());
  const [completedFlash, setCompletedFlash] = useState<SectionKey | null>(null);

  // Segmentación por jornada/turno (replicado de prod)
  const sections = useMemo<BulkEditSection[]>(() => {
    const is24h = (r: DailyReportDetailRow) => r.working_day?.toLowerCase() === 'jornada 24 horas';

    const jornadas24hs = snapshotRows.filter((r) => is24h(r) && r.completed_day !== true && r.completed_night !== true);
    const completarDiurno = snapshotRows.filter(
      (r) => is24h(r) && r.completed_night === true && r.completed_day !== true
    );
    const completarNocturno = snapshotRows.filter(
      (r) => is24h(r) && r.completed_day === true && r.completed_night !== true
    );
    const otrasJornadas = snapshotRows.filter((r) => !is24h(r));
    const otrasTipos = [
      ...new Set(otrasJornadas.map((r) => r.working_day).filter((w): w is string => Boolean(w))),
    ];

    const all: BulkEditSection[] = [
      {
        key: '24hs',
        title: `Jornadas 24hs (${jornadas24hs.length})`,
        description:
          'Filas de jornada 24h sin turnos completados. Podés ejecutar, cancelar, reprogramar o marcar diurno/nocturno como completo.',
        rows: jornadas24hs,
        options: [...BASE_OPTIONS, OPT_DIURNO, OPT_NOCTURNO],
      },
      {
        key: 'completar-diurno',
        title: `Completar Diurno (${completarDiurno.length})`,
        description: 'Filas 24h donde el turno nocturno ya está completo. Solo falta cerrar el diurno.',
        rows: completarDiurno,
        options: [...BASE_OPTIONS, OPT_DIURNO],
      },
      {
        key: 'completar-nocturno',
        title: `Completar Nocturno (${completarNocturno.length})`,
        description: 'Filas 24h donde el turno diurno ya está completo. Solo falta cerrar el nocturno.',
        rows: completarNocturno,
        options: [...BASE_OPTIONS, OPT_NOCTURNO],
      },
      {
        key: 'otras',
        title: `Otras Jornadas (${otrasJornadas.length})${otrasTipos.length ? ` — ${otrasTipos.join(', ')}` : ''}`,
        description: 'Filas con jornadas distintas a 24h. Sin opciones de completar diurno/nocturno.',
        rows: otrasJornadas,
        options: BASE_OPTIONS,
      },
    ];
    return all.filter((section) => section.rows.length > 0);
  }, [snapshotRows]);

  const mutation = useMutation({
    mutationKey: BULK_EDIT_MUTATION_KEY,
    mutationFn: async (params: SaveParams) => {
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
      invalidateDetail();

      setProcessedSections((prev) => new Set(prev).add(variables.section));
      setCompletedFlash(variables.section);
      setTimeout(() => setCompletedFlash(null), 3000);

      toast.success(
        `Se actualizó el estado de ${result.count} registro${result.count !== 1 ? 's' : ''} a "${variables.status}"`
      );
      onSuccess();

      // Si no quedan secciones activas pendientes, cerrar el modal
      const stillPending = sections.filter((s) => s.key !== variables.section && !processedSections.has(s.key));
      if (stillPending.length === 0) {
        onClose();
      }
    },
    onError: () => {
      toast.error('Ocurrió un error al actualizar los registros');
    },
    onSettled: () => {
      setSavingSection(null);
    },
  });

  const setSectionState = (key: SectionKey, next: SectionState) =>
    setSectionStates((prev) => ({ ...prev, [key]: next }));

  const save = (section: BulkEditSection) => {
    const state = sectionStates[section.key];
    if (!isSectionValid(state) || section.rows.length === 0 || mutation.isPending) return;
    setSavingSection(section.key);
    mutation.mutate({
      section: section.key,
      rowIds: section.rows.map((r) => r.id),
      status: state.status,
      cancelReason: state.cancelReason,
      rescheduleDate: state.rescheduleDate,
    });
  };

  return { sections, sectionStates, setSectionState, savingSection, processedSections, completedFlash, save };
}
