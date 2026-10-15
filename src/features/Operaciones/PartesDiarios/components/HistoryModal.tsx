'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Computer,
  ExternalLink,
  History,
  Info,
  LinkIcon,
  PlusCircle,
  RotateCcw,
  UserCircle,
  Wrench,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { HistoryValue } from '../types/daily-report-history';
import { getDailyReportRowHistory } from '../actions/queries.server';
import { HistorySkeleton } from './HistorySkeleton';

interface HistoryModalProps {
  dailyReportRowId: string;
  title?: string;
  onlyIcon?: boolean;
}

export default function HistoryModal({
  dailyReportRowId,
  onlyIcon,
  title = 'Historial de Cambios',
}: HistoryModalProps) {
  const [open, setOpen] = useState(false);
  const [historyData, setHistoryData] = useState<Awaited<ReturnType<typeof getDailyReportRowHistory>>>([]);
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);

  const fetchHistory = async () => {
    try {
      setIsLoading(true);
      const data = await getDailyReportRowHistory(dailyReportRowId);
      setHistoryData(data || []);
    } catch (error) {
      logger.error('Error fetching history', { data: { error } });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open && historyData.length === 0) {
      fetchHistory();
    }
  }, [open, dailyReportRowId]);

  // Ordenar el historial por fecha (más reciente primero)
  const sortedHistory = [...historyData].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  // Función para alternar la expansión de un item
  const toggleExpand = (id: string) => {
    setExpandedItems((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Función para obtener el icono según el tipo de acción
  const getActionIcon = (actionType: string) => {
    switch (actionType) {
      case 'UPDATE':
        return <RotateCcw className="h-5 w-5" />;
      case 'LINK':
        return <LinkIcon className="h-5 w-5" />;
      case 'CREATE':
        return <PlusCircle className="h-5 w-5" />;
      default:
        return <Info className="h-5 w-5" />;
    }
  };

  // Función para obtener el color de fondo según el tipo de acción
  const getActionColor = (actionType: string) => {
    switch (actionType) {
      case 'UPDATE':
        return 'bg-blue-600 dark:bg-blue-700 text-white';
      case 'LINK':
        return 'bg-purple-600 dark:bg-purple-700 text-white';
      case 'CREATE':
        return 'bg-emerald-600 dark:bg-emerald-700 text-white';
      default:
        return 'bg-slate-600 dark:bg-slate-700 text-white';
    }
  };

  // Función para formatear la fecha
  const formatDate = (dateString: string) => {
    try {
      const date = parseISO(dateString);
      return format(date, 'dd MMM yyyy, HH:mm', { locale: es });
    } catch (error) {
      return dateString;
    }
  };

  // Función para obtener el nombre de la acción
  const getActionName = (actionType: string) => {
    switch (actionType) {
      case 'UPDATE':
        return 'Actualización';
      case 'LINK':
        return 'Vinculación';
      case 'UNLINK':
        return 'Desvinculación';
      case 'CREATE':
        return 'Creación';
      default:
        return actionType;
    }
  };

  // Función para traducir nombres de campos al español
  const getFieldDisplayName = (fieldName: string, field: string) => {
    // Traducciones de campos
    const fieldTranslations: Record<string, string> = {
      completed_night: 'Completado Nocturno',
      completed_day: 'Completado Diurno',
      status: 'Estado',
      description: 'Descripción',
      start_time: 'Hora de Inicio',
      end_time: 'Hora de Fin',
      service_type: 'Tipo de Servicio',
      working_day: 'Jornada Laboral',
      customer: 'Cliente',
      service: 'Servicio',
      item: 'Item',
      sin_recursos_asignados: 'Sin Recursos Asignados',
    };

    // Priorizar traducciones locales sobre el fieldName del backend
    return fieldTranslations[field] || fieldName || field;
  };

  // Función para formatear valores de display
  const getValueDisplay = (value: HistoryValue, field: string) => {
    if (value === null || value === undefined) {
      return 'Sin valor';
    }

    // Formateo específico por campo
    switch (field) {
      case 'completed_night':
      case 'completed_day':
        return value === true ? 'Completado' : value === false ? 'No completado' : value;
      default:
        return String(value).replaceAll('_', ' ');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size={onlyIcon ? 'icon' : 'default'}
          variant={'ghost'}
          className={cn('flex items-center gap-2', onlyIcon && 'gap-0')}
        >
          {<History className="h-4 w-4 text-black dark:text-white" />}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[850px] max-h-[90vh] flex flex-col p-0 overflow-hidden bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5" />
              {title}
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 py-4 max-h-[70vh] overflow-y-auto">
          {isLoading ? (
            <HistorySkeleton />
          ) : sortedHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-slate-700 dark:text-slate-300">
              <Info className="h-12 w-12 mb-2 text-slate-400 dark:text-slate-500" />
              <p>No hay registros de cambios para este ítem.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {sortedHistory.map((item, index) => (
                <div key={item.id} className="relative">
                  {/* Línea vertical de la línea de tiempo */}
                  {index !== sortedHistory.length - 1 && (
                    <div className="absolute left-[22px] top-12 bottom-0 w-1 bg-slate-200 dark:bg-slate-700 rounded-full" />
                  )}

                  <div className="flex gap-4">
                    {/* Nodo de la línea de tiempo */}
                    <div
                      className={cn(
                        'w-11 h-11 rounded-full flex items-center justify-center shrink-0 z-10',
                        getActionColor(item.actionType)
                      )}
                    >
                      {getActionIcon(item.actionType)}
                    </div>

                    <div className="flex-1">
                      {/* Encabezado del evento */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-slate-900 dark:text-slate-100">
                            {getActionName(item.actionType)}
                          </h3>
                          <Badge variant="outline" className="font-normal">
                            {item.actionType === 'UPDATE' &&
                              `${item.changes.length} cambio${item.changes.length > 1 ? 's' : ''}`}
                            {(item.actionType === 'LINK' || item.actionType === 'UNLINK') &&
                              item.changes[0]?.type === 'vehicle_relation' &&
                              'Vehículo'}
                            {(item.actionType === 'LINK' || item.actionType === 'UNLINK') &&
                              item.changes[0]?.type === 'employee_relation' &&
                              'Empleado'}
                            {(item.actionType === 'LINK' || item.actionType === 'UNLINK') &&
                              item.changes[0]?.type === 'other_equipment_relation' &&
                              'Otro Equipo'}
                            {item.actionType === 'CREATE' && 'Nuevo registro'}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-sm ">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {formatDate(item.timestamp)}
                          </span>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800">
                                  {item?.user?.name ? (
                                    <>
                                      <UserCircle className="h-3.5 w-3.5 text-slate-600 dark:text-slate-400" />
                                      <span className="text-slate-700 dark:text-slate-300">{item.user.name}</span>
                                      {item.user.id && (
                                        <a
                                          href={`/dashboard/configuration?tab=general&subtab=users`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex ml-1"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <ExternalLink className="h-3 w-3 text-slate-500 hover:text-blue-500" />
                                        </a>
                                      )}
                                    </>
                                  ) : (
                                    <>
                                      <Computer className="h-3.5 w-3.5 text-orange-600 dark:text-orange-500" />
                                      <span className="truncate max-w-[120px] text-slate-700 dark:text-slate-300">
                                        El Sistema
                                      </span>
                                    </>
                                  )}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                {item?.user ? <p>{item.user.email}</p> : <p>Cambio realizado automáticamente</p>}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </div>

                      {/* Botón para expandir/colapsar */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-between mb-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700"
                        onClick={() => toggleExpand(item.id)}
                      >
                        <span className="font-medium">
                          {expandedItems[item.id] ? 'Ocultar detalles' : 'Ver detalles'}
                        </span>
                        {expandedItems[item.id] ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>

                      {/* Contenido del evento (expandible) */}
                      <AnimatePresence>
                        {expandedItems[item.id] && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                          >
                            {item.actionType === 'CREATE' && item.changes[0]?.type === 'full_record' && (
                              <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                                <h4 className="font-medium text-sm mb-3 text-slate-700 dark:text-slate-300">
                                  Detalles del registro creado:
                                </h4>

                                {/* Información de preparte si existe */}
                                {item.preparte && (
                                  <div className="mb-4 p-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
                                    <div className="flex items-center gap-2 mb-2">
                                      <Computer className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                                      <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
                                        Origen del registro
                                      </span>
                                      <Badge
                                        variant="outline"
                                        className="text-xs border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300"
                                      >
                                        Preparte
                                      </Badge>
                                    </div>
                                    <p className="text-sm text-amber-700 dark:text-amber-300">
                                      <strong>Número de pedido:</strong> {item.preparte?.numero_pedido}
                                    </p>
                                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                                      Creado por el sistema desde preparte
                                    </p>
                                  </div>
                                )}

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  {Object.entries(item.changes[0].data || {}).map(([key, value]) => (
                                    <div
                                      key={key}
                                      className="bg-white dark:bg-slate-900 p-3 rounded-md border border-slate-200 dark:border-slate-700"
                                    >
                                      <span className="text-xs text-slate-500 dark:text-slate-400 block mb-1">
                                        {key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                                      </span>
                                      <span className="font-medium text-slate-900 dark:text-slate-200">
                                        {value as string}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {(item.actionType === 'LINK' || item.actionType === 'UNLINK') &&
                              item.changes[0]?.type === 'vehicle_relation' && (
                                <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                                  <h4 className="font-medium text-sm mb-3 text-slate-700 dark:text-slate-300">
                                    {item.actionType === 'LINK' ? 'Vehículo vinculado:' : 'Vehículo desvinculado:'}
                                  </h4>
                                  {item.reassignment_reason && (
                                    <div className="mb-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-2 rounded-md">
                                      <p className="text-sm text-amber-800 dark:text-amber-300 flex items-start gap-1">
                                        <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                        <span>
                                          <strong className="font-medium">Motivo:</strong> {item.reassignment_reason}
                                        </span>
                                      </p>
                                    </div>
                                  )}
                                  <div className="bg-white dark:bg-slate-900 p-3 rounded-md border border-slate-200 dark:border-slate-700 flex flex-col gap-2">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-slate-500 dark:text-slate-400">Dominio:</span>
                                      <a
                                        href={`/dashboard/equipment/action?action=view&id=${item.changes[0].vehicle?.id}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 no-underline"
                                      >
                                        <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100 flex items-center gap-1">
                                          <span>{item.changes[0].vehicle?.domain}</span>
                                          <ExternalLink className="h-3 w-3 text-purple-600" />
                                        </Badge>
                                      </a>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-slate-500 dark:text-slate-400">
                                        Número interno:
                                      </span>
                                      <span className="font-medium">{item.changes[0].vehicle?.internNumber}</span>
                                    </div>
                                  </div>
                                </div>
                              )}

                            {(item.actionType === 'LINK' || item.actionType === 'UNLINK') &&
                              item.changes[0]?.type === 'other_equipment_relation' && (
                                <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                                  <h4 className="font-medium text-sm mb-3 text-slate-700 dark:text-slate-300">
                                    {item.actionType === 'LINK'
                                      ? 'Otro equipo vinculado:'
                                      : 'Otro equipo desvinculado:'}
                                  </h4>
                                  {item.reassignment_reason && (
                                    <div className="mb-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-2 rounded-md">
                                      <p className="text-sm text-amber-800 dark:text-amber-300 flex items-start gap-1">
                                        <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                        <span>
                                          <strong className="font-medium">Motivo:</strong> {item.reassignment_reason}
                                        </span>
                                      </p>
                                    </div>
                                  )}
                                  <div className="bg-white dark:bg-slate-900 p-3 rounded-md border border-slate-200 dark:border-slate-700 flex flex-col gap-2">
                                    {item.changes[0].otherEquipment?.typeName && (
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs text-slate-500 dark:text-slate-400">Tipo:</span>
                                        <Badge className="bg-teal-100 text-teal-800 hover:bg-teal-100 flex items-center gap-1">
                                          <Wrench className="h-3 w-3" />
                                          <span>{item.changes[0].otherEquipment.typeName}</span>
                                        </Badge>
                                      </div>
                                    )}
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-slate-500 dark:text-slate-400">
                                        Número interno:
                                      </span>
                                      <span className="font-medium">
                                        {item.changes[0].otherEquipment?.internNumber || '-'}
                                      </span>
                                    </div>
                                    {item.changes[0].otherEquipment?.serialNumber && (
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs text-slate-500 dark:text-slate-400">
                                          Número de serie:
                                        </span>
                                        <span className="font-medium">
                                          {item.changes[0].otherEquipment.serialNumber}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}

                            {(item.actionType === 'LINK' || item.actionType === 'UNLINK') &&
                              item.changes[0]?.type === 'employee_relation' && (
                                <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                                  <h4 className="font-medium text-sm mb-3 text-slate-700 dark:text-slate-300">
                                    {item.actionType === 'LINK' ? 'Empleado vinculado:' : 'Empleado desvinculado:'}
                                  </h4>
                                  {item.reassignment_reason && (
                                    <div className="mb-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-2 rounded-md">
                                      <p className="text-sm text-amber-800 dark:text-amber-300 flex items-start gap-1">
                                        <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                        <span>
                                          <strong className="font-medium">Motivo:</strong> {item.reassignment_reason}
                                        </span>
                                      </p>
                                    </div>
                                  )}
                                  <div className="bg-white dark:bg-slate-900 p-3 rounded-md border border-slate-200 dark:border-slate-700 flex flex-col gap-2">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-slate-500 dark:text-slate-400">Nombre:</span>
                                      <a
                                        href={`/dashboard/employee/action?action=view&employee_id=${item.changes[0].employee?.id}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 no-underline"
                                      >
                                        <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 flex items-center gap-1">
                                          <span>{item.changes[0].employee?.name}</span>
                                          <ExternalLink className="h-3 w-3 text-blue-600" />
                                        </Badge>
                                      </a>
                                    </div>
                                  </div>
                                </div>
                              )}

                            {(item.actionType === 'LINK' || item.actionType === 'UNLINK') &&
                              (item.changes[0]?.type === 'remit_relation' ||
                                item.changes[0]?.type === 'remit_document_relation') && (
                                <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                                  <h4 className="font-medium text-sm mb-3 text-slate-700 dark:text-slate-300">
                                    {item.changes[0].type === 'remit_relation'
                                      ? item.actionType === 'LINK'
                                        ? 'Remito cargado:'
                                        : 'Remito quitado:'
                                      : item.actionType === 'LINK'
                                        ? 'Documento agregado al remito:'
                                        : 'Documento quitado del remito:'}
                                  </h4>
                                  <div className="bg-white dark:bg-slate-900 p-3 rounded-md border border-slate-200 dark:border-slate-700 flex flex-col gap-1">
                                    {item.changes[0].type === 'remit_document_relation' && (
                                      <span className="font-medium text-sm">
                                        {String(item.changes[0].remit?.documentName ?? 'Documento')}
                                      </span>
                                    )}
                                    <span className="text-sm">
                                      Remito{' '}
                                      <span className="font-mono tabular-nums">
                                        {String(item.changes[0].remit?.number ?? '-')}
                                      </span>
                                    </span>
                                  </div>
                                </div>
                              )}

                            {item.actionType === 'UPDATE' && (
                              <div className="space-y-3">
                                {item.changes.map((change, changeIndex) => (
                                  <div
                                    key={changeIndex}
                                    className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                                  >
                                    <h4 className="font-medium text-sm mb-3 text-slate-700 dark:text-slate-300">
                                      {getFieldDisplayName(change.fieldName ?? '', change.field ?? '')}
                                    </h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                      <div className="bg-white dark:bg-slate-900 p-3 rounded-md border border-slate-200 dark:border-slate-700 relative overflow-hidden">
                                        <div className="absolute top-0 left-0 w-1 h-full bg-red-400 dark:bg-red-600"></div>
                                        <span className="text-xs text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1 capitalize">
                                          <X className="h-3 w-3 text-red-500" />
                                          Valor anterior
                                        </span>
                                        <span className="font-medium text-slate-900 dark:text-slate-200 capitalize">
                                          {getValueDisplay(change.oldValue ?? null, change.field ?? '') || (
                                            <span className="text-slate-400 dark:text-slate-500 italic">Sin valor</span>
                                          )}
                                        </span>
                                      </div>
                                      <div className="bg-white dark:bg-slate-900 p-3 rounded-md border border-slate-200 dark:border-slate-700 relative overflow-hidden">
                                        <div className="absolute top-0 left-0 w-1 h-full bg-green-400 dark:bg-green-600"></div>
                                        <span className="text-xs text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
                                          <CheckCircle2 className="h-3 w-3 text-green-500" />
                                          Valor nuevo
                                        </span>
                                        <span className="font-medium text-slate-900 dark:text-slate-200">
                                          {getValueDisplay(change.newValue ?? null, change.field ?? '') || (
                                            <span className="text-slate-400 dark:text-slate-500 italic">Sin valor</span>
                                          )}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
