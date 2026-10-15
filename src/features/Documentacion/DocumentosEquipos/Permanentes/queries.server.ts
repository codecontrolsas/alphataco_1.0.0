'use server';

import { Logger } from '@/lib/logger';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { applyTableState, paginate } from '@/shared/lib/in-memory-table';
import { parseListState, toExportFailure, toExportResult } from '../../lists-shared/document-list-server';
import { attachEquipmentDocumentLogs } from '../lib/equipment-document-rows.server';
import { EQUIPMENT_PERMANENT_SPEC as SPEC, loadEquipmentPermanentRows } from '../lib/permanent-list.server';

const logger = new Logger('DocumentosEquiposPermanentes/queries');

export async function getEquipmentPermanentDocumentsPaginated(
  searchParams: DataTableSearchParams,
  equipmentId?: string
) {
  try {
    const state = parseListState(searchParams);
    const filtered = applyTableState(await loadEquipmentPermanentRows(equipmentId), state, SPEC);
    const data = await attachEquipmentDocumentLogs(paginate(filtered, state));
    return { data, total: filtered.length };
  } catch (error) {
    logger.error('Error al obtener documentos permanentes de equipos paginados', { data: { error } });
    throw new Error('Error al obtener los documentos permanentes de equipos');
  }
}

export type EquipmentPermanentDocumentListItem = Awaited<
  ReturnType<typeof getEquipmentPermanentDocumentsPaginated>
>['data'][number];

/** Export sin paginar y con tope de filas: el resultado trae el mensaje si se pasa o falla (`ExportResult`). */
export async function getAllEquipmentPermanentDocumentsForExport(
  searchParams: DataTableSearchParams,
  equipmentId?: string
) {
  try {
    const state = parseListState(searchParams);
    return toExportResult(applyTableState(await loadEquipmentPermanentRows(equipmentId), state, SPEC));
  } catch (error) {
    return toExportFailure(error, logger, 'los documentos permanentes de equipos');
  }
}
