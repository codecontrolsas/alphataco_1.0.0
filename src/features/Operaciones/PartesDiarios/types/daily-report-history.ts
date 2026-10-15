/**
 * Tipos del historial de una línea de parte diario (`dailyreportrows_history`).
 */

/** Valor escalar guardado en el historial (jsonb: texto, número, booleano o nulo). */
export type HistoryValue = string | number | boolean | null;

/** Fila cruda que devuelve `get_dailyreportrow_history`. */
export interface DailyReportRowHistoryRecord {
  id: string;
  action_type: 'CREATE' | 'UPDATE' | 'DELETE' | 'LINK' | 'UNLINK';
  created_at: string;
  changed_by: {
    id: string;
    email: string | null;
    raw_user_meta_data?: {
      full_name?: string | null;
    } | null;
  } | null;
  changed_fields?: Record<string, { old: HistoryValue; new: HistoryValue }> | null;
  related_table: string;
  related_id: string;
  changed_data?: Record<string, HistoryValue> | null;
  reassignment_reason?: string | null;
}

/**
 * Cambio ya procesado para la UI. Todos los campos son opcionales a propósito: una misma
 * lista mezcla cambios de campo, altas/bajas de relación y volcados completos del registro,
 * y la UI elige qué leer según `type`.
 */
export interface ProcessedHistoryChange {
  type?:
    | 'equipment_relation'
    | 'employee_relation'
    | 'other_equipment_relation'
    | 'vehicle_relation'
    | 'remit_relation'
    | 'remit_document_relation'
    | 'full_record';
  action?: 'added' | 'removed';
  field?: string;
  fieldName?: string;
  oldValue?: HistoryValue;
  newValue?: HistoryValue;
  oldValueDisplay?: HistoryValue;
  newValueDisplay?: HistoryValue;
  data?: Record<string, HistoryValue>;
  employee?: { id?: HistoryValue; name?: HistoryValue };
  equipment?: { id?: HistoryValue; name?: HistoryValue; identifier?: HistoryValue };
  vehicle?: { id?: HistoryValue; domain?: HistoryValue; internNumber?: HistoryValue };
  /** Remito de la línea (tabla `remitos`) y, para documentos, el archivo agregado o quitado. */
  remit?: { number?: HistoryValue; linked?: HistoryValue; documentName?: HistoryValue };
  otherEquipment?: {
    id?: HistoryValue;
    internNumber?: HistoryValue;
    serialNumber?: HistoryValue;
    typeName?: HistoryValue;
  };
}

/** Entrada del historial lista para renderizar. */
export interface ProcessedHistoryEntry {
  id: string;
  preparte: {
    id: string;
    numero_pedido: string | null;
  } | null;
  actionType: string;
  timestamp: string;
  user: {
    id: string;
    email: string | null;
    name: string | null;
  } | null;
  changes: ProcessedHistoryChange[];
  relatedTable: string;
  relatedId: string;
  message: string;
  reassignment_reason: string | null | undefined;
  displayTime: string;
}
