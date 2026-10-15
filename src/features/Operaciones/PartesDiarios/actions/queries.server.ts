'use server';

import { Logger } from '@/lib/logger';
import type {
  DailyReportRowHistoryRecord,
  HistoryValue,
  ProcessedHistoryEntry,
} from '@/features/Operaciones/PartesDiarios/types/daily-report-history';
import { prisma } from '@/shared/lib/prisma';
import { callFunction } from '@/shared/lib/sql';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import moment from 'moment';
import { z } from 'zod';

const logger = new Logger('features/Operaciones/PartesDiarios/queries');

/** `dailyreport.date` es `date` en Postgres: la UI espera siempre `YYYY-MM-DD`. */
function toIsoDate(value: Date): string {
  return moment.utc(value).format('YYYY-MM-DD');
}

// ============================================================================
// LISTADOS DE PARTES DIARIOS
// ============================================================================

const DAILY_REPORT_SELECT = {
  id: true,
  date: true,
  creation_date: true,
  created_at: true,
  updated_at: true,
  company_id: true,
  is_active: true,
  status: true,
  dailyreportrows: { select: { status: true } },
} as const;

type DailyReportRow = {
  date: Date;
  creation_date: Date | null;
};

function serializeDailyReport<T extends DailyReportRow>(report: T) {
  return {
    ...report,
    date: toIsoDate(report.date),
    creation_date: report.creation_date ? toIsoDate(report.creation_date) : null,
  };
}

/**
 * Partes diarios de la empresa activa, con filtro opcional de rango de fechas y estado.
 */
export async function fetchDailyReportsWithFilters({
  fromDate,
  toDate,
  status,
}: {
  fromDate?: string;
  toDate?: string;
  status?: string[] | null;
}) {
  try {
    const companyId = await getActiveCompanyId();

    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (fromDate) dateFilter.gte = moment.utc(fromDate, 'YYYY-MM-DD').toDate();
    if (toDate) dateFilter.lte = moment.utc(toDate, 'YYYY-MM-DD').toDate();

    const reports = await prisma.dailyreport.findMany({
      where: {
        company_id: companyId,
        ...(fromDate || toDate ? { date: dateFilter } : {}),
        ...(status && status.length > 0
          ? { status: { in: status as ('abierto' | 'cerrado' | 'cerrado_incompleto')[] } }
          : {}),
      },
      select: DAILY_REPORT_SELECT,
      orderBy: { date: 'desc' },
    });

    return reports.map(serializeDailyReport);
  } catch (error) {
    logger.error('Error al obtener los partes diarios', { data: { error } });
    throw error;
  }
}

/** Partes diarios del mes en curso (empresa activa). */
export async function getDailyReportsForCurrentMonth() {
  try {
    const companyId = await getActiveCompanyId();

    const reports = await prisma.dailyreport.findMany({
      where: {
        company_id: companyId,
        date: {
          gte: moment().startOf('month').utc(true).startOf('day').toDate(),
          lte: moment().endOf('month').utc(true).startOf('day').toDate(),
        },
      },
      select: DAILY_REPORT_SELECT,
      orderBy: { date: 'desc' },
    });

    return reports.map(serializeDailyReport);
  } catch (error) {
    logger.error('Error al obtener los partes diarios del mes', { data: { error } });
    return [];
  }
}

/** Partes diarios ya existentes para las fechas dadas (empresa activa). */
export async function checkDailyReportExists(dates: string[]) {
  if (!dates.length) return [];

  try {
    const companyId = await getActiveCompanyId();

    const reports = await prisma.dailyreport.findMany({
      where: {
        company_id: companyId,
        date: { in: dates.map((date) => moment.utc(date, 'YYYY-MM-DD').toDate()) },
      },
      select: DAILY_REPORT_SELECT,
    });

    return reports.map(serializeDailyReport);
  } catch (error) {
    logger.error('Error al verificar los partes diarios existentes', { data: { error, dates } });
    return [];
  }
}

// ============================================================================
// HISTORIAL DE UNA LÍNEA
// ============================================================================

/** Valor escalar del jsonb del historial; cualquier otra cosa se ignora (`null`). */
const historyValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]).catch(null);

const historyRowSchema = z.object({
  id: z.string(),
  // `dailyreportrows_history` es tabla histórica e inmutable: un `action_type` fuera de este
  // enum (dato viejo, o el enum de la función SQL se amplía sin actualizar este schema) no
  // puede tirar la lista entera. `.catch('UPDATE')` cae al branch que ya maneja con más
  // gracia un action_type desconocido (si no hay `changed_fields` no arma mensaje, pero el
  // registro se sigue mostrando) en vez de que `z.array(historyRowSchema).parse(...)` reviente
  // TODO el historial por una sola fila rara.
  action_type: z.enum(['CREATE', 'UPDATE', 'DELETE', 'LINK', 'UNLINK']).catch('UPDATE'),
  changed_fields: z.record(z.string(), z.object({ old: historyValueSchema, new: historyValueSchema })).nullable(),
  changed_data: z.record(z.string(), historyValueSchema).nullable(),
  changed_by: z
    .object({
      id: z.string(),
      email: z.string().nullable(),
      raw_user_meta_data: z.object({ full_name: z.string().nullable() }).nullable(),
    })
    .nullable(),
  created_at: z.coerce.date(),
  related_table: z.string().nullable(),
  related_id: z.string().nullable(),
  metadata: z.unknown().nullable(),
  reassignment_reason: z.string().nullable(),
});

/**
 * Historial de una línea del parte diario, ya traducido a mensajes en español.
 *
 * Perímetro: la línea tiene que pertenecer a un parte de la empresa activa.
 */
export async function getDailyReportRowHistory(dailyReportId: string): Promise<ProcessedHistoryEntry[]> {
  try {
    const companyId = await getActiveCompanyId();

    const row = await prisma.dailyreportrows.findFirst({
      where: { id: dailyReportId, dailyreport: { company_id: companyId } },
      select: { preparte: { select: { id: true, numero_pedido: true } } },
    });

    if (!row) {
      logger.warn('Línea de parte diario inexistente o de otra empresa', { data: { dailyReportId } });
      return [];
    }

    const rawHistory = await callFunction(
      'get_dailyreportrow_history',
      [{ uuid: dailyReportId }],
      z.array(historyRowSchema)
    );

    const preparteData = row.preparte ? [{ preparte: row.preparte }] : [];

    const history: DailyReportRowHistoryRecord[] = rawHistory.map((record) => ({
      id: record.id,
      action_type: record.action_type,
      created_at: record.created_at.toISOString(),
      changed_by: record.changed_by,
      changed_fields: record.changed_fields,
      related_table: record.related_table ?? '',
      related_id: record.related_id ?? '',
      changed_data: record.changed_data,
      reassignment_reason: record.reassignment_reason,
    }));

  const processedHistory = history?.map((record) => {
    const entry: ProcessedHistoryEntry = {
      id: record.id,
      preparte: preparteData?.[0]?.preparte,
      actionType: record.action_type,
      timestamp: record.created_at,
      user: record.changed_by
        ? {
            id: record.changed_by.id,
            email: record.changed_by.email,
            name: record.changed_by.raw_user_meta_data?.full_name || record.changed_by.email,
          }
        : null,
      changes: [],
      relatedTable: record.related_table,
      relatedId: record.related_id,
      message: '',
      displayTime: new Date(record.created_at).toLocaleString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      reassignment_reason: record.reassignment_reason,
    };

    // Get user info for message - asignar "Sistema" si no hay usuario
    const userName = entry.user?.name || 'El Sistema';

    if (record.action_type === 'UPDATE' && record.changed_fields) {
      const changedFieldMessages: string[] = [];

      Object.entries(record.changed_fields).forEach(([field, change]) => {
        // Add Spanish field names for known fields
        let fieldName = field;
        let oldValueDisplay = change.old;
        let newValueDisplay = change.new;

        // Translate field names
        switch (field) {
          case 'customer_id':
            fieldName = 'Cliente';
            break;
          case 'service_id':
            fieldName = 'Servicio';
            break;
          case 'item_id':
            fieldName = 'Item';
            break;
          case 'working_day':
            fieldName = 'Jornada';
            break;
          case 'remit_number':
            fieldName = 'Remito';
            // Special format for remit number - just show the new value
            changedFieldMessages.push(`${fieldName}: "${newValueDisplay || 'Sin valor'}"`);
            // Skip the default format
            entry.changes.push({
              field,
              fieldName,
              oldValue: change.old,
              newValue: change.new,
              oldValueDisplay,
              newValueDisplay,
            });
            return; // Skip the default message for this field
          case 'start_time':
            fieldName = 'Hora inicio';
            break;
          case 'end_time':
            fieldName = 'Hora fin';
            break;
          case 'description':
            fieldName = 'Descripción';
            break;
          case 'cancel_reason':
            fieldName = 'Razón';
            // Special format for cancel reason - just show the new value
            changedFieldMessages.push(`${fieldName}: "${newValueDisplay || 'Sin valor'}"`);
            // Skip the default format
            entry.changes.push({
              field,
              fieldName,
              oldValue: change.old,
              newValue: change.new,
              oldValueDisplay,
              newValueDisplay,
            });
            return; // Skip the default message for this field
          case 'status':
            fieldName = 'Estado';
            // Translate status values
            if (oldValueDisplay === 'pendiente') oldValueDisplay = 'Pendiente';
            if (oldValueDisplay === 'ejecutado') oldValueDisplay = 'Ejecutado';
            if (oldValueDisplay === 'cancelado') oldValueDisplay = 'Cancelado';
            if (oldValueDisplay === 'reprogramado') oldValueDisplay = 'Reprogramado';
            if (oldValueDisplay === 'sin_recursos_asignados') oldValueDisplay = 'Sin recursos asignados';

            if (newValueDisplay === 'pendiente') newValueDisplay = 'Pendiente';
            if (newValueDisplay === 'ejecutado') newValueDisplay = 'Ejecutado';
            if (newValueDisplay === 'cancelado') newValueDisplay = 'Cancelado';
            if (newValueDisplay === 'reprogramado') newValueDisplay = 'Reprogramado';
            if (newValueDisplay === 'sin_recursos_asignados') newValueDisplay = 'Sin recursos asignados';
            break;
          case 'type_service':
            fieldName = 'Tipo de servicio';
            // Translate type_service values
            if (oldValueDisplay === 'mensual') oldValueDisplay = 'Mensual';
            if (oldValueDisplay === 'adicional') oldValueDisplay = 'Adicional';

            if (newValueDisplay === 'mensual') newValueDisplay = 'Mensual';
            if (newValueDisplay === 'adicional') newValueDisplay = 'Adicional';
            break;
          default:
            fieldName = field.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
            break;
        }

        // Add the change message showing old and new values
        changedFieldMessages.push(
          `${fieldName} de "${oldValueDisplay || 'Sin valor'}" a "${newValueDisplay || 'Sin valor'}"`
        );

        entry.changes.push({
          field,
          fieldName,
          oldValue: change.old,
          newValue: change.new,
          oldValueDisplay,
          newValueDisplay,
        });
      });

      // Create Spanish message with detailed changes
      entry.message = `${userName} modificó: ${changedFieldMessages.join(', ')}`;
    } else if (record.action_type === 'LINK' || record.action_type === 'UNLINK') {
      const relationType = record.related_table;
      const relationData = record.changed_data;
      const action = record.action_type === 'LINK' ? 'agregó' : 'eliminó';

      if (relationType === 'dailyreport_customer_equipment_relations') {
        const equipmentName = relationData?.equipo_nombre || 'Equipo desconocido';

        entry.changes.push({
          type: 'equipment_relation',
          action: record.action_type === 'LINK' ? 'added' : 'removed',
          equipment: {
            id: relationData?.equipo_id,
            name: equipmentName,
            identifier: relationData?.equipo_identificador,
          },
        });

        entry.message = `${userName} ${action} el equipo del cliente: ${equipmentName}`;
      } else if (relationType === 'dailyreportemployeerelations') {
        const employeeName = relationData?.empleado_nombre || 'Empleado desconocido';

        entry.changes.push({
          type: 'employee_relation',
          action: record.action_type === 'LINK' ? 'added' : 'removed',
          employee: {
            id: relationData?.empleado_id,
            name: employeeName,
          },
        });

        entry.message = `${userName} ${action} el empleado: ${employeeName}`;
      } else if (relationType === 'dailyreportequipmentrelations') {
        const isOtherEquipment = relationData?.tipo_equipo === 'other_equipment';

        if (isOtherEquipment) {
          const equipmentName =
            relationData?.otro_equipo_numero_interno || relationData?.otro_equipo_tipo || 'Otro equipo desconocido';

          entry.changes.push({
            type: 'other_equipment_relation',
            action: record.action_type === 'LINK' ? 'added' : 'removed',
            otherEquipment: {
              id: relationData?.otro_equipo_id,
              internNumber: relationData?.otro_equipo_numero_interno,
              serialNumber: relationData?.otro_equipo_numero_serie,
              typeName: relationData?.otro_equipo_tipo,
            },
          });

          entry.message = `${userName} ${action} el otro equipo: ${equipmentName}`;
        } else {
          const vehicleName = relationData?.vehiculo_dominio || 'Vehículo desconocido';

          entry.changes.push({
            type: 'vehicle_relation',
            action: record.action_type === 'LINK' ? 'added' : 'removed',
            vehicle: {
              id: relationData?.vehiculo_id,
              domain: relationData?.vehiculo_dominio,
              internNumber: relationData?.vehiculo_numero_interno,
            },
          });

          entry.message = `${userName} ${action} el vehículo: ${vehicleName}`;
        }
      } else if (relationType === 'remitos') {
        const remitNumber = relationData?.remito_numero || 'sin número';

        entry.changes.push({
          type: 'remit_relation',
          action: record.action_type === 'LINK' ? 'added' : 'removed',
          remit: { number: relationData?.remito_numero, linked: relationData?.vinculado },
        });

        entry.message = `${userName} ${action} el remito: ${remitNumber}`;
      } else if (relationType === 'remito_documents') {
        const documentName = relationData?.documento_nombre || 'Documento';

        entry.changes.push({
          type: 'remit_document_relation',
          action: record.action_type === 'LINK' ? 'added' : 'removed',
          remit: { number: relationData?.remito_numero, documentName: relationData?.documento_nombre },
        });

        entry.message = `${userName} ${action} el documento ${documentName} del remito ${relationData?.remito_numero ?? ''}`.trim();
      }
    } else if (record.action_type === 'CREATE') {
      // Traducir los nombres de los campos para los registros CREATE
      const translatedData: Record<string, HistoryValue> = {};

      if (record.changed_data) {
        Object.entries(record.changed_data).forEach(([key, value]) => {
          // Traducir nombres de campos
          switch (key) {
            case 'status':
              translatedData['Estado'] =
                value === 'pendiente'
                  ? 'Pendiente'
                  : value === 'ejecutado'
                    ? 'Ejecutado'
                    : value === 'cancelado'
                      ? 'Cancelado'
                      : value === 'reprogramado'
                        ? 'Reprogramado'
                        : value === 'sin_recursos_asignados'
                          ? 'Sin recursos asignados'
                          : value;
              break;
            case 'item_name':
              translatedData['Item'] = value;
              break;
            case 'working_day':
              translatedData['Jornada'] = value;
              break;
            case 'service_name':
              translatedData['Servicio'] = value;
              break;
            case 'type_service':
              translatedData['Tipo de servicio'] =
                value === 'mensual' ? 'Mensual' : value === 'adicional' ? 'Adicional' : value;
              break;
            case 'customer_name':
              translatedData['Cliente'] = value;
              break;
            case 'description':
              translatedData['Descripción'] = value;
              break;
            case 'remit_number':
              translatedData['Remito'] = value;
              break;
            case 'start_time':
              translatedData['Hora inicio'] = value;
              break;
            case 'end_time':
              translatedData['Hora fin'] = value;
              break;
            case 'cancel_reason':
              translatedData['Razón de cancelación'] = value;
              break;
            default:
              // Para campos no especificados, convertir de snake_case a formato título
              const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
              translatedData[formattedKey] = value;
          }
        });
      }

      entry.changes.push({
        type: 'full_record',
        data: translatedData,
      });

      // Create Spanish message for new record
      const customerName = record.changed_data?.customer_name || '';
      const serviceName = record.changed_data?.service_name || '';
      const itemName = record.changed_data?.item_name || '';

      entry.message = `${userName} creó un nuevo registro para ${customerName} - ${serviceName} - ${itemName}`;
    } else if (record.action_type === 'DELETE') {
      // Traducir los nombres de los campos para los registros DELETE (misma lógica que para CREATE)
      const translatedData: Record<string, HistoryValue> = {};

      if (record.changed_data) {
        Object.entries(record.changed_data).forEach(([key, value]) => {
          // Traducir nombres de campos
          switch (key) {
            case 'status':
              translatedData['Estado'] =
                value === 'pendiente'
                  ? 'Pendiente'
                  : value === 'ejecutado'
                    ? 'Ejecutado'
                    : value === 'cancelado'
                      ? 'Cancelado'
                      : value === 'reprogramado'
                        ? 'Reprogramado'
                        : value === 'sin_recursos_asignados'
                          ? 'Sin recursos asignados'
                          : value;
              break;
            case 'item_name':
              translatedData['Item'] = value;
              break;
            case 'working_day':
              translatedData['Jornada'] = value;
              break;
            case 'service_name':
              translatedData['Servicio'] = value;
              break;
            case 'type_service':
              translatedData['Tipo de servicio'] =
                value === 'mensual' ? 'Mensual' : value === 'adicional' ? 'Adicional' : value;
              break;
            case 'customer_name':
              translatedData['Cliente'] = value;
              break;
            case 'description':
              translatedData['Descripción'] = value;
              break;
            case 'remit_number':
              translatedData['Remito'] = value;
              break;
            case 'start_time':
              translatedData['Hora inicio'] = value;
              break;
            case 'end_time':
              translatedData['Hora fin'] = value;
              break;
            case 'cancel_reason':
              translatedData['Razón de cancelación'] = value;
              break;
            default:
              // Para campos no especificados, convertir de snake_case a formato título
              const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
              translatedData[formattedKey] = value;
          }
        });
      }

      entry.changes.push({
        type: 'full_record',
        data: translatedData,
      });

      // Create Spanish message for deleted record
      const customerName = record.changed_data?.customer_name || '';
      const serviceName = record.changed_data?.service_name || '';
      const itemName = record.changed_data?.item_name || '';

      entry.message = `${userName} eliminó el registro para ${customerName} - ${serviceName} - ${itemName}`;
    }

    return entry;
  });

  // Sort by timestamp, newest first
  const sortedHistory = processedHistory?.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return sortedHistory || [];
  } catch (error) {
    logger.error('Error al obtener el historial de la línea', { data: { error, dailyReportId } });
    return [];
  }
}
