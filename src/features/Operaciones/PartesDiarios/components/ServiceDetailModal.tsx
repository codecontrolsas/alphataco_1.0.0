'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { getCertificationRowPersonalDetail } from '@/features/Operaciones/Certificacion/actions/detail.server';
import type { CertificationRow } from '@/features/Operaciones/Certificacion/actions/queries.server';
import { CERTIFICATION_DETAIL_QUERY_KEY } from '@/features/Operaciones/Certificacion/list/constants';
import { DetailField, EmptyValue } from '@/features/Operaciones/shared/components/DetailField';
import { formatLongDateAr } from '@/shared/lib/argentina-time';
import {
  dailyReportRowStatusLabels,
  dailyReportRowStatusTones,
  dailyReportTypeServiceLabels,
} from '@/shared/utils/mappers';
import { IdCardIcon } from '@radix-ui/react-icons';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Building2,
  Calendar,
  Clock,
  ExternalLinkIcon,
  EyeIcon,
  FileText,
  Mail,
  Phone,
  User,
  Wrench,
} from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';
import { formatRowTime } from '../detail/columns/helpers';

/**
 * Datos de la línea que muestra el modal: campos de la fila del tablero (`CertificationRow`). Los datos
 * personales de empleados y equipos NO vienen en la fila: se piden al abrir el modal.
 */
export type ServiceDetailData = Pick<
  CertificationRow,
  | 'status'
  | 'type_service'
  | 'start_time'
  | 'end_time'
  | 'working_day'
  | 'description'
  | 'remit_number'
  | 'customer'
  | 'services'
  | 'item'
  | 'item_description'
  | 'sector'
  | 'area'
  | 'preparte'
>;

interface ServiceDetailModalProps {
  /** Id de la línea: con él se piden los empleados y equipos al abrir el modal. */
  rowId: string;
  serviceData: ServiceDetailData;
  /** Fecha del parte: `DD-MM-YYYY` (como la arma la consulta) o `YYYY-MM-DD`. */
  reportDate: string;
}

/** Fecha larga en español; si no se puede interpretar, se muestra tal como viene. */
function formatReportDate(reportDate: string): string {
  const parsed = moment.utc(reportDate, ['DD-MM-YYYY', 'YYYY-MM-DD'], true);
  return parsed.isValid() ? formatLongDateAr(parsed.format('YYYY-MM-DD')) : reportDate;
}

/**
 * Hora `HH:mm`. La consulta ya entrega la columna `Time` como texto `HH:mm:ss` (leída en UTC);
 * si llegara una fecha cruda se lee igual en UTC con el helper de la tabla.
 */
function formatTimeValue(value: string | null | undefined): string | null {
  if (!value) return null;
  return /^\d{2}:\d{2}/.test(value) ? value.slice(0, 5) : formatRowTime(value);
}

export function ServiceDetailModal({ rowId, serviceData, reportDate }: ServiceDetailModalProps) {
  const [open, setOpen] = useState(false);
  const { data: personal, isLoading: isLoadingPersonal } = useQuery({
    queryKey: [CERTIFICATION_DETAIL_QUERY_KEY, rowId],
    queryFn: () => getCertificationRowPersonalDetail(rowId),
    enabled: open,
    staleTime: 30_000,
  });

  if (!serviceData) return null;

  const statusLabel = serviceData.status
    ? (dailyReportRowStatusLabels[serviceData.status] ?? serviceData.status.replaceAll('_', ' '))
    : null;
  const typeServiceLabel = serviceData.type_service
    ? (dailyReportTypeServiceLabels[serviceData.type_service] ?? serviceData.type_service.replaceAll('_', ' '))
    : null;
  const startTime = formatTimeValue(serviceData.start_time);
  const endTime = formatTimeValue(serviceData.end_time);
  const employees = personal?.employees ?? [];
  const equipment = personal?.equipment ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" className="h-8 w-8 p-0" aria-label="Ver detalle del servicio">
          <EyeIcon className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <FileText className="h-5 w-5" />
            Detalle del Servicio
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Header Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>{formatReportDate(reportDate)}</span>
              </div>
              <div className="flex items-center gap-2">
                {statusLabel && (
                  <Badge variant={dailyReportRowStatusTones[serviceData.status] ?? 'default'}>{statusLabel}</Badge>
                )}
                {typeServiceLabel && <Badge variant="secondary">{typeServiceLabel}</Badge>}
              </div>
              {serviceData.preparte?.confirmed_by && (
                <div className="flex items-center gap-2 text-sm text-warn-subtle-foreground">
                  <span className="font-medium">Confirmado por:</span>
                  <Badge variant="warning">{serviceData.preparte.confirmed_by}</Badge>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Building2 className="h-4 w-4" />
                <span className="font-medium">{serviceData.customer || 'No especificado'}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>{serviceData.working_day}</span>
              </div>
            </div>
          </div>

          {/* Preparte Info - Solo se muestra si existe */}
          {serviceData.preparte && (
            <>
              <div className="bg-warn-subtle text-warn-subtle-foreground border border-warn/40 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="h-5 w-5" />
                  <h3 className="font-semibold">Registro desde Preparte</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium">Número de Pedido:</span>
                    <Link href="/dashboard/operations?tab=preparte" target="_blank" rel="noopener noreferrer">
                      <Badge variant="warning" className="cursor-pointer transition-colors">
                        {serviceData.preparte.numero_pedido || 'Sin número'}
                        <ExternalLinkIcon className="h-3 w-3 ml-1 inline" />
                      </Badge>
                    </Link>
                  </div>
                </div>
              </div>
              <Separator />
            </>
          )}

          <Separator />

          {/* Employees Section */}
          <div className="space-y-3">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <User className="h-5 w-5 text-brand-ink" />
              Empleados Asignados{isLoadingPersonal ? '' : ` (${employees.length})`}
            </h3>
            {isLoadingPersonal ? (
              <p className="text-sm text-muted-foreground">Cargando empleados...</p>
            ) : employees.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay empleados asignados</p>
            ) : (
              <div className="grid gap-4">
                {employees.map((employee) => (
                  <div
                    key={employee.id}
                    className="bg-brand-subtle text-brand-subtle-foreground border border-brand/20 rounded-lg p-4"
                  >
                    <div className="font-semibold text-lg mb-3">
                      <Link
                        href={`/dashboard/employee/action?action=view&employee_id=${employee.id}`}
                        className="w-fit flex items-center hover:underline"
                        target="_blank"
                      >
                        {employee.firstname && employee.lastname
                          ? `${employee.lastname} ${employee.firstname}`
                          : 'Nombre no disponible'}
                        <ExternalLinkIcon className="h-4 w-4 ml-2 inline" />
                      </Link>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div className="space-y-1">
                        {employee.document_number && (
                          <div className="flex items-center gap-2">
                            <IdCardIcon className="h-4 w-4" />
                            <span>DNI: {employee.document_number}</span>
                          </div>
                        )}
                        {employee.email && (
                          <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4" />
                            <span>{employee.email}</span>
                          </div>
                        )}
                      </div>
                      <div className="space-y-1">
                        {employee.company_positions?.name && (
                          <div className="font-medium">Posición: {employee.company_positions.name}</div>
                        )}
                        {employee.phone && (
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4" />
                            <span>{employee.phone}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator />

          {/* Equipment Section */}
          <div className="space-y-3">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Wrench className="h-5 w-5 text-ok" />
              Equipos Asignados{isLoadingPersonal ? '' : ` (${equipment.length})`}
            </h3>
            {isLoadingPersonal ? (
              <p className="text-sm text-muted-foreground">Cargando equipos...</p>
            ) : equipment.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay equipos asignados</p>
            ) : (
              <div className="grid gap-4">
                {equipment.map((vehicle) => (
                  <div
                    key={vehicle.id}
                    className="bg-ok-subtle text-ok-subtle-foreground border border-ok/20 rounded-lg p-4"
                  >
                    <div className="font-semibold text-lg mb-3">
                      <Link
                        href={`/dashboard/equipment/action?action=view&id=${vehicle.id}`}
                        className="w-fit flex items-center hover:underline"
                        target="_blank"
                      >
                        {vehicle.domain || vehicle.intern_number || `Equipo ${vehicle.id.slice(-6)}`}
                        <ExternalLinkIcon className="h-4 w-4 ml-2 inline" />
                      </Link>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div className="space-y-1">
                        {vehicle.domain && (
                          <div className="flex items-center gap-2">
                            <span className="font-medium">Dominio:</span>
                            <span className="font-mono bg-background/60 px-2 py-1 rounded">{vehicle.domain}</span>
                          </div>
                        )}
                        {vehicle.type_vehicles_typeTotype?.name && (
                          <div className="flex items-center gap-2">
                            <span className="font-medium">Tipo:</span>
                            <span>{vehicle.type_vehicles_typeTotype.name}</span>
                          </div>
                        )}
                        {vehicle.year && (
                          <div className="flex items-center gap-2">
                            <span className="font-medium">Año:</span>
                            <span>{vehicle.year}</span>
                          </div>
                        )}
                      </div>
                      <div className="space-y-1">
                        {vehicle.brand_vehicles && (
                          <div className="flex items-center gap-2">
                            <span className="font-medium">Marca:</span>
                            <Badge variant="outline" className="text-xs">
                              {vehicle.brand_vehicles.name}
                            </Badge>
                          </div>
                        )}
                        {vehicle.sub_type?.name && (
                          <div className="flex items-center gap-2">
                            <span className="font-medium">Sub-tipo:</span>
                            <span>{vehicle.sub_type.name}</span>
                          </div>
                        )}
                        {vehicle.model_vehicles?.name && (
                          <div className="flex items-center gap-2">
                            <span className="font-medium">Modelo:</span>
                            <span>{vehicle.model_vehicles.name}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator />

          {/* Service Details */}
          <div className="space-y-3">
            <h3 className="font-semibold text-lg">Detalles del Servicio</h3>
            <div className="grid gap-3">
              <div className="bg-muted rounded-lg p-3">
                <DetailField label="Servicio">{serviceData.services || <EmptyValue />}</DetailField>
              </div>
              <div className="bg-muted rounded-lg p-3">
                <DetailField label="Item">{serviceData.item || <EmptyValue />}</DetailField>
              </div>
              {serviceData.item_description && (
                <div className="bg-muted rounded-lg p-3">
                  <DetailField label="Descripción del Item">
                    <p className="whitespace-pre-wrap">{serviceData.item_description}</p>
                  </DetailField>
                </div>
              )}
              {serviceData.description && (
                <div className="bg-muted rounded-lg p-3">
                  <DetailField label="Descripción">
                    <p className="whitespace-pre-wrap">{serviceData.description}</p>
                  </DetailField>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Location Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-muted rounded-lg p-3">
              <DetailField label="Sector">{serviceData.sector || <EmptyValue />}</DetailField>
            </div>
            <div className="bg-muted rounded-lg p-3">
              <DetailField label="Área">{serviceData.area || <EmptyValue />}</DetailField>
            </div>
          </div>

          {/* Time Info */}
          {(startTime || endTime) && (
            <>
              <Separator />
              <div className="space-y-3">
                <h3 className="font-semibold text-lg">Horarios</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {startTime && (
                    <div className="bg-muted rounded-lg p-3">
                      <DetailField label="Hora de Inicio">{startTime}</DetailField>
                    </div>
                  )}
                  {endTime && (
                    <div className="bg-muted rounded-lg p-3">
                      <DetailField label="Hora de Fin">{endTime}</DetailField>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Additional Info */}
          {serviceData.remit_number && (
            <div className="text-xs text-muted-foreground bg-muted rounded-lg p-3">
              <div className="font-mono">Número de Remito: {serviceData.remit_number}</div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
