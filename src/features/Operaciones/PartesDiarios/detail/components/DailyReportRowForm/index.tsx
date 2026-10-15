'use client';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Logger } from '@/lib/logger';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { formatCalendarDate } from '@/shared/utils/calendar-date';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useDailyReportDetailFormStore } from '../../../store/dailyReportDetailFormStore';
import { DETAIL_QUERY_PREFIX } from '../../constants';
import {
  CustomerForForm,
  EmployeeForForm,
  OtherEquipmentItem,
  VehicleForForm,
} from '../../form-data.server';
import { getDailyReportRowForForm } from '../../form-data/row-form.server';
import { useRestoreFocus } from '../hooks/useRestoreFocus';
import { DailyReportRowFormBody } from './DailyReportRowFormBody';

const logger = new Logger('DailyReportRowForm');

interface DailyReportRowFormProps {
  dailyReportId: string;
  reportDate?: string;
  customers: CustomerForForm[];
  employees: EmployeeForForm[];
  vehicles: VehicleForForm[];
  otherEquipment: OtherEquipmentItem[];
  onSuccess?: () => void;
}

export function DailyReportRowForm({
  dailyReportId,
  reportDate,
  customers,
  employees,
  vehicles,
  otherEquipment,
  onSuccess,
}: DailyReportRowFormProps) {
  const { isOpen, editingRowId, mode, close } = useDailyReportDetailFormStore();
  const [isSaving, setIsSaving] = useState(false);
  const { onOpenAutoFocus, onCloseAutoFocus } = useRestoreFocus();

  // Modo "solo recursos": el supervisor de operaciones únicamente puede asignar
  // personal y equipos; el resto de los campos se muestra pero queda bloqueado.
  const resourcesOnly = mode === 'resources';
  const isEditMode = editingRowId != null;

  // Al editar se carga la fila guardada. La key cuelga del prefijo del detalle: `invalidateDetail()` la refresca.
  // Sin caché entre aperturas (`gcTime: 0`) para no mostrar nunca una versión vieja de la línea, y sin
  // volver a pedirla mientras se guarda.
  const rowQuery = useQuery({
    queryKey: [DETAIL_QUERY_PREFIX, dailyReportId, 'row-form', editingRowId],
    queryFn: async () => {
      try {
        return await getDailyReportRowForForm(editingRowId!);
      } catch (error) {
        logger.error('Error al cargar la fila para editar', { data: { error, editingRowId } });
        throw error;
      }
    },
    enabled: isOpen && editingRowId != null && !isSaving,
    gcTime: 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });

  // Mientras se guarda no se puede cerrar (Escape, clic afuera, X o Cancelar): se cerraría con el envío en curso.
  const requestClose = () => {
    if (isSaving) return;
    close();
  };

  const sheetTitle = resourcesOnly ? 'Asignar personal y equipos' : isEditMode ? 'Editar línea' : 'Nueva línea';

  const renderBody = () => {
    if (!isEditMode) {
      return (
        <DailyReportRowFormBody
          key="new"
          dailyReportId={dailyReportId}
          reportDate={reportDate}
          customers={customers}
          employees={employees}
          vehicles={vehicles}
          otherEquipment={otherEquipment}
          row={null}
          resourcesOnly={resourcesOnly}
          onClose={close}
          onSavingChange={setIsSaving}
          onSuccess={onSuccess}
        />
      );
    }

    if (rowQuery.isPending) {
      return (
        <div role="status" className="flex flex-1 flex-col items-center justify-center gap-3 py-20">
          <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" aria-hidden="true" />
          <p className="text-muted-foreground text-sm">Cargando datos de la línea...</p>
        </div>
      );
    }

    if (rowQuery.isError || !rowQuery.data) {
      return (
        <div className="flex flex-1 flex-col justify-center px-6 py-10">
          <StateBlock
            variant="error"
            title="No se pudo cargar la línea"
            description="Intentá de nuevo en unos segundos."
            action={
              <Button type="button" variant="outline" size="sm" onClick={() => void rowQuery.refetch()}>
                Reintentar
              </Button>
            }
          />
        </div>
      );
    }

    return (
      <DailyReportRowFormBody
        key={rowQuery.data.id}
        dailyReportId={dailyReportId}
        reportDate={reportDate}
        customers={customers}
        employees={employees}
        vehicles={vehicles}
        otherEquipment={otherEquipment}
        row={rowQuery.data}
        resourcesOnly={resourcesOnly}
        onClose={close}
        onSavingChange={setIsSaving}
        onSuccess={onSuccess}
      />
    );
  };

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) requestClose();
      }}
    >
      <SheetContent
        className="flex w-full flex-col gap-0 p-0 sm:max-w-screen-md"
        onOpenAutoFocus={onOpenAutoFocus}
        onCloseAutoFocus={onCloseAutoFocus}
        onEscapeKeyDown={(event) => {
          if (isSaving) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (isSaving) event.preventDefault();
        }}
      >
        <SheetHeader className="border-b px-6 py-4 text-left">
          {reportDate ? (
            <p className="text-muted-foreground text-xs font-medium tabular-nums">
              Parte del {formatCalendarDate(reportDate)}
            </p>
          ) : null}
          <SheetTitle>{sheetTitle}</SheetTitle>
          <SheetDescription className="sr-only">
            {resourcesOnly
              ? 'Asigne el personal y los equipos de esta línea. El resto de los campos no se puede modificar.'
              : isEditMode
                ? 'Actualice los campos necesarios para modificar la línea.'
                : 'Complete los campos para agregar una nueva línea al parte diario.'}
          </SheetDescription>
        </SheetHeader>

        {renderBody()}
      </SheetContent>
    </Sheet>
  );
}
