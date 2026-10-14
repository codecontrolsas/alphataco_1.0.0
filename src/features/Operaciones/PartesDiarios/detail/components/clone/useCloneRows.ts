import { useMutation, useQuery } from '@tanstack/react-query';
import moment from 'moment';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { DETAIL_QUERY_PREFIX } from '../../constants';
import type { CloneConflictsByDate } from '../../clone.server';
import { cloneDailyReportRows, getCloneConflicts, getDailyReportTypeServiceSummary } from '../../clone.server';
import { useDailyReportDetailInvalidation } from '../../hooks/useDailyReportDetail';
import type { DailyReportDetailRow } from '../../types';

type TypeService = 'mensual' | 'adicional' | 'adicional_permanente';

/** Elección explícita del usuario por tipo; sin elección, el default es "incluir si hay filas de ese tipo". */
type TypeOverrides = Partial<Record<TypeService, boolean>>;

interface UseCloneRowsParams {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 'selected' = clonar solo las filas seleccionadas; 'all' = clonar todo el parte */
  mode: 'selected' | 'all';
  selectedRows: DailyReportDetailRow[];
  dailyReportId: string;
  onSuccess: () => void;
}

/** Estado, consultas y mutaciones del diálogo de clonado. La UI vive en las vistas de selección y de conflictos. */
export function useCloneRows({
  open,
  onOpenChange,
  mode,
  selectedRows,
  dailyReportId,
  onSuccess,
}: UseCloneRowsParams) {
  const router = useRouter();
  const { invalidateDetail } = useDailyReportDetailInvalidation();
  const isAllMode = mode === 'all';

  const [selectedDates, setSelectedDates] = useState<Date[]>([]);
  // Recursos a trasladar (opt-in, default OFF como en legacy)
  const [includeEmployees, setIncludeEmployees] = useState(false);
  const [includeEquipment, setIncludeEquipment] = useState(false);
  const [navigateAfterClone, setNavigateAfterClone] = useState(true);
  const [typeOverrides, setTypeOverrides] = useState<TypeOverrides>({});
  // Conflictos calculados para una selección concreta (firma): si la selección cambia, dejan de valer.
  const [conflictsResult, setConflictsResult] = useState<{ signature: string; data: CloneConflictsByDate } | null>(
    null
  );
  const [showConflicts, setShowConflicts] = useState(false);

  // "Ir a registros" solo aplica con una única fecha destino
  const effectiveNavigate = navigateAfterClone && selectedDates.length <= 1;

  // ── Tipos de servicio (solo en modo 'all') ─────────────────────────────────
  const { data: typeServiceSummary } = useQuery({
    queryKey: [DETAIL_QUERY_PREFIX, dailyReportId, 'type-summary'],
    queryFn: () => getDailyReportTypeServiceSummary(dailyReportId),
    enabled: open && isAllMode,
    staleTime: 30_000,
  });

  const typeExists: Record<TypeService, boolean> = {
    mensual: (typeServiceSummary?.['mensual'] ?? 0) > 0,
    adicional: (typeServiceSummary?.['adicional'] ?? 0) > 0,
    adicional_permanente: (typeServiceSummary?.['adicional_permanente'] ?? 0) > 0,
  };

  // Tipos incluidos en el clonado (solo modo 'all'): la elección del usuario o, por defecto, los que existen
  const includeType: Record<TypeService, boolean> = {
    mensual: isAllMode && (typeOverrides.mensual ?? typeExists.mensual),
    adicional: isAllMode && (typeOverrides.adicional ?? typeExists.adicional),
    adicional_permanente: isAllMode && (typeOverrides.adicional_permanente ?? typeExists.adicional_permanente),
  };
  const setIncludeType = (type: TypeService, checked: boolean) =>
    setTypeOverrides((prev) => ({ ...prev, [type]: checked }));

  // Tipos de las filas seleccionadas (modo 'selected'): solo informativos
  const selectedTypes: Record<TypeService, boolean> = {
    mensual: selectedRows.some((r) => r.type_service === 'mensual'),
    adicional: selectedRows.some((r) => r.type_service === 'adicional'),
    adicional_permanente: selectedRows.some((r) => r.type_service === 'adicional_permanente'),
  };

  const typeFilter: TypeService[] = (['mensual', 'adicional', 'adicional_permanente'] as const).filter(
    (type) => includeType[type]
  );

  // Firma de la selección: los conflictos calculados solo valen para esta combinación
  const selectionSignature = [
    [...selectedDates]
      .map((d) => d.toDateString())
      .sort()
      .join('|'),
    typeFilter.join(','),
    isAllMode
      ? ''
      : [...selectedRows]
          .map((r) => r.id)
          .sort()
          .join(','),
  ].join('::');

  const conflicts = conflictsResult?.signature === selectionSignature ? conflictsResult.data : null;
  const view: 'select' | 'conflicts' = showConflicts && conflicts ? 'conflicts' : 'select';

  // ── Handlers ───────────────────────────────────────────────────────────────
  function handleClose() {
    onOpenChange(false);
    setSelectedDates([]);
    setIncludeEmployees(false);
    setIncludeEquipment(false);
    setNavigateAfterClone(true);
    setTypeOverrides({});
    setShowConflicts(false);
    setConflictsResult(null);
  }

  // ── Mutación de clone ──────────────────────────────────────────────────────
  const { mutate: cloneMutate, isPending: isCloning } = useMutation({
    mutationFn: (skipRowIdsByDate: Record<string, string[]> | undefined) => {
      const targetDates = selectedDates.map((d) => moment(d).format('YYYY-MM-DD'));

      if (isAllMode) {
        return cloneDailyReportRows([], targetDates, {
          includeEmployees,
          includeEquipment,
          cloneAllFromReportId: dailyReportId,
          ...(typeFilter.length > 0 ? { typeServiceFilter: typeFilter } : {}),
          ...(skipRowIdsByDate ? { skipRowIdsByDate } : {}),
        });
      }

      return cloneDailyReportRows(
        selectedRows.map((r) => r.id),
        targetDates,
        {
          includeEmployees,
          includeEquipment,
          ...(skipRowIdsByDate ? { skipRowIdsByDate } : {}),
        }
      );
    },
    onSuccess: (result) => {
      const dateCount = selectedDates.length;

      if (result.clonedRowCount === 0) {
        toast.warning('No quedaron registros para clonar después de excluir los duplicados');
      } else {
        toast.success(
          `Se clonaron ${result.clonedRowCount} registros en ${dateCount} ${dateCount === 1 ? 'fecha' : 'fechas'}`
        );
      }

      const reportIds = result.allReportIds ?? [];
      const navigateToId =
        effectiveNavigate && selectedDates.length === 1 && reportIds.length > 0 && result.clonedRowCount > 0
          ? reportIds[0]
          : null;

      invalidateDetail();
      handleClose();
      onSuccess();

      if (navigateToId) {
        setTimeout(() => {
          router.push(`/dashboard/operations/${navigateToId}`);
        }, 300);
      }
    },
    onError: (error: Error) => {
      toast.error(error.message ?? 'Ocurrió un error al clonar los registros');
    },
  });

  // ── Mutación de verificación de conflictos ─────────────────────────────────
  const { mutate: checkConflicts, isPending: isCheckingConflicts } = useMutation({
    mutationFn: () => {
      const targetDates = selectedDates.map((d) => moment(d).format('YYYY-MM-DD'));

      if (isAllMode) {
        return getCloneConflicts([], targetDates, dailyReportId, typeFilter.length ? typeFilter : undefined);
      }

      return getCloneConflicts(
        selectedRows.map((r) => r.id),
        targetDates
      );
    },
    onSuccess: (result) => {
      if (result.totalCount === 0) {
        setConflictsResult(null);
        cloneMutate(undefined);
        return;
      }
      setConflictsResult({ signature: selectionSignature, data: result });
      setShowConflicts(true);
    },
    onError: (error: Error) => {
      toast.error(error.message ?? 'No se pudieron verificar los registros existentes');
    },
  });

  function removeDate(date: Date) {
    setSelectedDates((prev) => prev.filter((d) => d.toDateString() !== date.toDateString()));
  }

  function handleSubmit() {
    if (selectedDates.length === 0) {
      toast.error('Debes seleccionar al menos una fecha para clonar los registros');
      return;
    }

    if (isAllMode && typeFilter.length === 0) {
      toast.error('Debes seleccionar al menos un tipo de registro a clonar');
      return;
    }

    // Si ya teníamos conflictos calculados para la misma selección, ir directo a la vista de conflictos
    if (conflicts && conflicts.totalCount > 0) {
      setShowConflicts(true);
      return;
    }

    checkConflicts();
  }

  const isBusy = isCheckingConflicts || isCloning;
  const canSubmit = selectedDates.length > 0 && !isBusy;

  // Líneas que se van a crear (filas de origen × fechas destino), para el conteo del botón
  const sourceRowCount = isAllMode
    ? typeServiceSummary
      ? (includeType.mensual ? (typeServiceSummary['mensual'] ?? 0) : 0) +
        (includeType.adicional ? (typeServiceSummary['adicional'] ?? 0) : 0) +
        (includeType.adicional_permanente ? (typeServiceSummary['adicional_permanente'] ?? 0) : 0)
      : null
    : selectedRows.length;
  const plannedCount = sourceRowCount == null ? undefined : sourceRowCount * selectedDates.length;

  return {
    isAllMode,
    rowCount: selectedRows.length,
    view,
    conflicts,
    selectedDates,
    setSelectedDates,
    removeDate,
    includeEmployees,
    setIncludeEmployees,
    includeEquipment,
    setIncludeEquipment,
    navigateAfterClone,
    setNavigateAfterClone,
    typeExists,
    includeType,
    setIncludeType,
    selectedTypes,
    plannedCount,
    isCheckingConflicts,
    isCloning,
    isBusy,
    canSubmit,
    handleClose,
    handleSubmit,
    backToSelection: () => setShowConflicts(false),
    cloneSkippingDuplicates: () => {
      if (isCloning || !conflicts) return;
      cloneMutate(conflicts.skipMap);
    },
    cloneAnyway: () => {
      if (isCloning) return;
      cloneMutate(undefined);
    },
  };
}

export type CloneRowsController = ReturnType<typeof useCloneRows>;
