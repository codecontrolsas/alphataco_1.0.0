import { Badge } from '@/components/ui/badge';
import { formatDateOnly, formatDateTime } from '@/features/Mantenimiento/utils/dateFormat';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { ArrowRight, Calendar, Clock, GitBranch, Truck, User } from 'lucide-react';
import {
  actionConfig,
  BORDER_BY_TEXT_COLOR,
  getPerformerName,
  getStatusLabel,
  formatOrderNumber,
  type PerformerType,
} from './activity-config';

/** La fecha programada se guarda como `YYYY-MM-DD` o como ISO con hora: siempre se muestra en hora argentina. */
function formatScheduledDate(value: string): string {
  if (Number.isNaN(Date.parse(value))) return value;
  return value.length === 10 ? formatDateOnly(value) : formatArgentinaDay(value);
}

// Componente para renderizar un item del timeline
export function TimelineItem({
  entry,
  isLast,
  showSource,
}: {
  entry: {
    id: string;
    action_type: string;
    performed_at: string | Date;
    performer?: PerformerType;
    notes?: string | null;
    rejection_reason?: string | null;
    new_status?: string | null;
    previous_status?: string | null;
    metadata?: Record<string, unknown> | null;
    source?: 'order' | 'work_order';
    sourceLabel?: string;
  };
  isLast: boolean;
  showSource?: boolean;
}) {
  const config = actionConfig[entry.action_type] || {
    label: entry.action_type,
    icon: Clock,
    color: 'text-gray-600',
    bgColor: 'bg-gray-50',
  };
  const Icon = config.icon;
  const performerName = getPerformerName(entry.performer ?? null);

  // Extraer datos del metadata si existen
  const metadata = entry.metadata as Record<string, unknown> | null;
  const pauseReason = metadata?.pause_reason as string | undefined;
  const totalPausedTime = metadata?.total_paused_time as string | undefined;
  const scheduledDate = metadata?.scheduled_date as string | undefined;
  const kilometerAtEntry = metadata?.kilometer_at_entry as string | undefined;
  const engineHoursAtEntry = metadata?.engine_hours_at_entry as number | undefined;
  const workOrderNumber = metadata?.work_order_number as string | undefined;
  const workOrderSectorName = metadata?.sector_name as string | undefined;

  return (
    <div className="relative flex items-start gap-3 pl-1">
      {/* Línea conectora */}
      {!isLast && <div className="absolute left-[15px] top-8 bottom-0 w-0.5 bg-muted" />}

      {/* Icono del timeline.
          El borde sale del mapa y NO de `config.color.replace('text-','border-')`:
          Tailwind v4 escanea el código como texto, así que una clase armada en
          runtime nunca se emite. De las 11 familias de `actionConfig`, cinco
          (red, purple, indigo, cyan, emerald) no aparecían literalmente en `src/`
          y esos círculos quedaban sin color de borde. */}
      <div
        className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 ${config.bgColor} ${BORDER_BY_TEXT_COLOR[config.color] ?? 'border-gray-600'}`}
      >
        <Icon className={`h-4 w-4 ${config.color}`} />
      </div>

      {/* Contenido */}
      <div className="flex-1 pt-0.5 pb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{config.label}</span>

          {/* Badge de source si se muestra */}
          {showSource && entry.sourceLabel && (
            <Badge variant={entry.source === 'order' ? 'secondary' : 'default'} className="text-xs">
              {entry.source === 'order' ? 'Pedido' : 'OT'}
            </Badge>
          )}

          {/* Badge de estado en español: si hubo transicion se muestra "anterior → nuevo" */}
          {entry.new_status && (
            <Badge variant="outline" className="text-xs inline-flex items-center gap-1">
              {entry.previous_status && entry.previous_status !== entry.new_status && (
                <>
                  <span className="text-muted-foreground">{getStatusLabel(entry.previous_status)}</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                </>
              )}
              {getStatusLabel(entry.new_status)}
            </Badge>
          )}
        </div>

        {/* Usuario que realizó la acción */}
        {performerName && (
          <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
            <User className="h-3 w-3" />
            {performerName}
          </p>
        )}

        {/* Notas */}
        {entry.notes && entry.notes !== config.label && (
          <p className="text-sm text-muted-foreground mt-1 italic">&ldquo;{entry.notes}&rdquo;</p>
        )}

        {/* Motivo de rechazo */}
        {entry.rejection_reason && (
          <div className="mt-1 p-2 bg-red-50 dark:bg-red-950/30 rounded text-sm text-red-700 dark:text-red-300">
            <span className="font-medium">Motivo:</span> {entry.rejection_reason}
          </div>
        )}

        {/* Motivo de pausa - solo mostrar en acción paused, sin el tiempo (aún no se calculó) */}
        {pauseReason && entry.action_type === 'paused' && (
          <div className="mt-1 p-2 bg-yellow-50 dark:bg-yellow-950/30 rounded text-sm text-yellow-700 dark:text-yellow-300">
            <span className="font-medium">Motivo de pausa:</span> {pauseReason}
          </div>
        )}

        {/* Metadatos del evento + timestamp en una sola fila que envuelve.
            Antes cada dato ocupaba su propio renglon y estiraba el timeline en vertical;
            al ensanchar el modal entran todos juntos y el historial se lee de un vistazo. */}
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {/* Tiempo total pausado - solo mostrar en resumed/completed cuando hay tiempo real (no 00:00:00) */}
          {totalPausedTime && totalPausedTime !== '00:00:00' && entry.action_type !== 'paused' && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Tiempo total pausado: {totalPausedTime}
            </span>
          )}

          {/* Fecha programada (se guarda en ISO, se muestra en formato local) */}
          {scheduledDate && entry.action_type === 'scheduled' && (
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Fecha: {formatScheduledDate(scheduledDate)}
            </span>
          )}

          {/* OT finalizada: de que orden de trabajo y sector se trata */}
          {entry.action_type === 'work_order_completed' && (workOrderNumber || workOrderSectorName) && (
            <span className="inline-flex items-center gap-1">
              <GitBranch className="h-3 w-3" />
              {workOrderNumber ? formatOrderNumber(workOrderNumber) : 'Orden de trabajo'}
              {workOrderSectorName ? ` · ${workOrderSectorName}` : ''}
            </span>
          )}

          {/* Kilometraje al ingresar */}
          {kilometerAtEntry && (
            <span className="inline-flex items-center gap-1">
              <Truck className="h-3 w-3" />
              Kilometraje: {kilometerAtEntry} km
            </span>
          )}

          {/* Horómetro al ingresar */}
          {engineHoursAtEntry != null && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Horómetro: {engineHoursAtEntry} hs
            </span>
          )}

          {/* Timestamp */}
          <span>{formatDateTime(entry.performed_at)}</span>
        </div>
      </div>
    </div>
  );
}

