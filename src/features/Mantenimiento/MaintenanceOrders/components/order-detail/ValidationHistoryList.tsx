'use client';

import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { AlertTriangle, CheckCircle2, ClipboardList, Clock, HardHat, History, XCircle } from 'lucide-react';
import moment from 'moment';
import type { ValidationHistoryData } from '../../actions/queries.server';

/**
 * Historial de validaciones de la orden, como línea de tiempo vertical.
 * Se extrajo del diálogo de detalle: no depende de su estado, sólo del historial.
 */
export function ValidationHistoryList({ history }: { history: ValidationHistoryData }) {
    if (history.length === 0) return null;

    // Action config: label describes the action, role identifies the performer type
    const actionConfig: Record<
      string,
      {
        label: string;
        icon: typeof CheckCircle2;
        color: string;
        dotColor: string;
        role: string;
        roleIcon: typeof HardHat;
      }
    > = {
      workshop_approved: {
        label: 'Aprobacion de Taller',
        icon: CheckCircle2,
        color: 'text-ok',
        dotColor: 'bg-ok',
        role: 'Jefe de Taller',
        roleIcon: HardHat,
      },
      operations_approved: {
        label: 'Aprobacion de Operaciones',
        icon: CheckCircle2,
        color: 'text-ok',
        dotColor: 'bg-ok',
        role: 'Operaciones',
        roleIcon: ClipboardList,
      },
      workshop_item_rejected: {
        label: 'Items rechazados',
        icon: XCircle,
        color: 'text-danger',
        dotColor: 'bg-danger',
        role: 'Jefe de Taller',
        roleIcon: HardHat,
      },
      operations_item_rejected: {
        label: 'Items rechazados',
        icon: XCircle,
        color: 'text-danger',
        dotColor: 'bg-danger',
        role: 'Operaciones',
        roleIcon: ClipboardList,
      },
      workshop_agreed_ops_rejection: {
        label: 'De acuerdo con rechazo',
        icon: AlertTriangle,
        color: 'text-warn',
        dotColor: 'bg-warn',
        role: 'Jefe de Taller',
        roleIcon: HardHat,
      },
      workshop_disagreed_ops_rejection: {
        label: 'En desacuerdo con rechazo',
        icon: AlertTriangle,
        color: 'text-warn',
        dotColor: 'bg-warn',
        role: 'Jefe de Taller',
        roleIcon: HardHat,
      },
      workshop_rejected_all_items: {
        label: 'Todos los items rechazados',
        icon: XCircle,
        color: 'text-danger',
        dotColor: 'bg-danger',
        role: 'Jefe de Taller',
        roleIcon: HardHat,
      },
      workshop_restored_from_rejected: {
        label: 'Orden restaurada',
        icon: CheckCircle2,
        color: 'text-ok',
        dotColor: 'bg-ok',
        role: 'Jefe de Taller',
        roleIcon: HardHat,
      },
      status_change: {
        label: 'Cambio de estado',
        icon: Clock,
        color: 'text-info',
        dotColor: 'bg-info',
        role: 'Sistema',
        roleIcon: Clock,
      },
    };

    const defaultConfig = {
      label: 'Evento',
      icon: Clock,
      color: 'text-muted-foreground',
      dotColor: 'bg-muted-foreground',
      role: 'Sistema',
      roleIcon: Clock as typeof HardHat,
    };

    return (
      <>
        <Separator />
        <div className="space-y-3">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <History className="h-4 w-4" />
            Historial de Validaciones
          </h4>
          {/* Timeline con línea conectora */}
          <div className="relative pl-6">
            {/* Línea vertical conectora */}
            <div className="absolute left-[9px] top-2 bottom-2 w-px bg-border" />

            <div className="space-y-0">
              {history.map((entry, index) => {
                const cfg = actionConfig[entry.action_type] || defaultConfig;
                const Icon = cfg.icon;
                const RoleIcon = cfg.roleIcon;
                const performer = entry.performed_by_profile as { fullname?: string | null } | null;
                const performerName = performer?.fullname || 'Sistema';
                const isLast = index === history.length - 1;

                const metadata = entry.metadata as {
                  rejected_items?: Array<{ repair_name: string; sector_name: string; comment: string }>;
                } | null;
                const rejectedItems = metadata?.rejected_items || [];

                return (
                  <div key={entry.id} className={`relative ${!isLast ? 'pb-4' : ''}`}>
                    {/* Dot en la línea */}
                    <div
                      className={`absolute -left-6 top-2.5 h-[18px] w-[18px] rounded-full border-2 border-background ${cfg.dotColor} flex items-center justify-center`}
                    >
                      <Icon className="h-2.5 w-2.5 text-white" />
                    </div>

                    {/* Contenido del evento */}
                    <div className="border rounded-md p-3 text-sm ml-1">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className={`font-medium ${cfg.color}`}>{cfg.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {moment(entry.performed_at).format('DD/MM/YYYY HH:mm')}
                        </span>
                      </div>

                      {/* Autor: [icono] Nombre [Badge Rol] */}
                      <div className="flex items-center gap-1.5 mt-1">
                        <RoleIcon className={`h-3 w-3 shrink-0 ${cfg.color}`} />
                        <span className="text-xs font-semibold">{performerName}</span>
                        <Badge variant="outline" className={`text-[9px] px-1 py-0 ${cfg.color} border-current/30`}>
                          {cfg.role}
                        </Badge>
                      </div>

                      {entry.notes && <p className="text-xs mt-1.5 text-muted-foreground italic">{entry.notes}</p>}

                      {rejectedItems.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {rejectedItems.map((item, idx) => (
                            <div
                              key={idx}
                              className="text-xs bg-destructive/5 border border-destructive/10 rounded px-2 py-1"
                            >
                              <span className="font-medium">{item.repair_name}</span>
                              <span className="text-muted-foreground"> ({item.sector_name})</span>
                              {item.comment && <span className="text-destructive/80"> &ndash; {item.comment}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </>
    );
  }
