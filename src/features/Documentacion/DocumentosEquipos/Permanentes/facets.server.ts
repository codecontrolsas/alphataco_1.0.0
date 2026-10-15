'use server';

import { Logger } from '@/lib/logger';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { emptyFacetOnError, listFacet } from '../../lists-shared/document-list-server';
import type { DocumentListFacet } from '../../lists-shared/document-list-types';
import { EQUIPMENT_PERMANENT_SPEC, loadEquipmentPermanentRows } from '../lib/permanent-list.server';

const logger = new Logger('DocumentosEquiposPermanentes/facets');

/** Opciones y counts de UN filtro facetado (lazy-load), con cross-filtering. */
export async function getEquipmentPermanentDocumentsSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams,
  equipmentId?: string
): Promise<DocumentListFacet> {
  try {
    return listFacet(
      await loadEquipmentPermanentRows(equipmentId),
      searchParams,
      EQUIPMENT_PERMANENT_SPEC,
      columnId,
      logger
    );
  } catch (error) {
    return emptyFacetOnError(error, logger, columnId);
  }
}
