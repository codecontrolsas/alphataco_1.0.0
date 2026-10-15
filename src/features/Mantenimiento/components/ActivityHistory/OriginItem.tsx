import { Badge } from '@/components/ui/badge';
import type { MaintenanceRequestOrigin } from '@/features/Mantenimiento/Operaciones/actions/activity-log.server';
import { formatDateTime } from '@/features/Mantenimiento/utils/dateFormat';
import { Calendar, ClipboardCheck, FileText, GitBranch, Truck, User } from 'lucide-react';
import { formatOrderNumber, getStatusLabel } from './activity-config';


// Componente para mostrar OTs hermanas (más compacto)
export function SiblingWorkOrders({ siblings }: { siblings: { id: string; order_number: string; status: string }[] }) {
  if (siblings.length === 0) return null;

  return (
    <div className="mb-3 p-2 bg-muted/50 rounded-md">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <GitBranch className="h-3 w-3" />
          Otras OTs:
        </span>
        {siblings.map((wo) => (
          <Badge key={wo.id} variant="secondary" className="text-xs font-normal">
            {formatOrderNumber(wo.order_number)}
            <span className="ml-1 text-muted-foreground">• {getStatusLabel(wo.status, 'workOrder')}</span>
          </Badge>
        ))}
      </div>
    </div>
  );
}

// Componente para mostrar el origen de la solicitud (Paso 1)
export function OriginItem({ origin, hasMoreItems }: { origin: MaintenanceRequestOrigin; hasMoreItems: boolean }) {
  const isChecklist = origin.type === 'checklist';

  return (
    <div className="relative flex items-start gap-3 pl-1">
      {/* Línea conectora */}
      {hasMoreItems && <div className="absolute left-[15px] top-8 bottom-0 w-0.5 bg-muted" />}

      {/* Icono del timeline */}
      <div
        className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 ${
          isChecklist ? 'bg-blue-50 border-blue-600' : 'bg-orange-50 border-orange-600'
        }`}
      >
        {isChecklist ? (
          <ClipboardCheck className="h-4 w-4 text-blue-600" />
        ) : (
          <FileText className="h-4 w-4 text-orange-600" />
        )}
      </div>

      {/* Contenido */}
      <div className="flex-1 pt-0.5 pb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">
            {isChecklist ? 'Origen: Inspección de Checklist' : 'Origen: Pedido Manual'}
          </span>
          <Badge variant={isChecklist ? 'default' : 'secondary'} className="text-xs">
            {isChecklist ? 'Checklist' : 'Manual'}
          </Badge>
        </div>

        {isChecklist && origin.checklist ? (
          // Datos del checklist en dos columnas: al ensanchar el modal la lista apilada
          // dejaba mucho aire a la derecha y alargaba la tarjeta innecesariamente.
          <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-md text-sm grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {(origin.driverEmployee || origin.checklist?.chofer) && (
              <p className="flex items-center gap-1 text-blue-800 dark:text-blue-200">
                <User className="h-3 w-3" />
                <span className="font-medium">Chofer:</span>
                {origin.driverEmployee ? (
                  <>
                    {origin.driverEmployee.file && (
                      <span className="text-xs font-mono bg-blue-100 dark:bg-blue-900/50 px-1.5 py-0.5 rounded">
                        {origin.driverEmployee.file}
                      </span>
                    )}
                    <span>
                      {origin.driverEmployee.lastname} {origin.driverEmployee.firstname}
                    </span>
                  </>
                ) : (
                  <span>{origin.checklist?.chofer}</span>
                )}
              </p>
            )}
            {origin.checklist.fecha && (
              <p className="flex items-center gap-1 text-blue-800 dark:text-blue-200">
                <Calendar className="h-3 w-3" />
                <span className="font-medium">Fecha inspección:</span> {origin.checklist.fecha}
                {origin.checklist.hora && ` a las ${origin.checklist.hora}`}
              </p>
            )}
            {origin.checklist.kilometraje && (
              <p className="flex items-center gap-1 text-blue-800 dark:text-blue-200">
                <Truck className="h-3 w-3" />
                <span className="font-medium">Kilometraje:</span> {origin.checklist.kilometraje} km
              </p>
            )}
            {origin.checklist.respondedBy?.fullname && (
              <p className="text-xs text-blue-600 dark:text-blue-300 mt-1 sm:col-span-2">
                Registrado por: {origin.checklist.respondedBy.fullname}
              </p>
            )}
          </div>
        ) : (
          <div className="mt-2 p-3 bg-orange-50 dark:bg-orange-950/30 rounded-md text-sm">
            <p className="text-orange-800 dark:text-orange-200">
              Solicitud creada directamente desde el módulo de mantenimiento
            </p>
            {origin.manualCreator?.fullname && (
              <p className="text-xs text-orange-600 dark:text-orange-300 mt-1">
                Creado por: {origin.manualCreator.fullname}
              </p>
            )}
          </div>
        )}

        {/* Timestamp del origen */}
        {origin.createdAt && <p className="text-xs text-muted-foreground mt-2">{formatDateTime(origin.createdAt)}</p>}
      </div>
    </div>
  );
}

