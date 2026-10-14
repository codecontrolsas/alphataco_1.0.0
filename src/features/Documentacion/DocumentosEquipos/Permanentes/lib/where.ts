import 'server-only';

import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import type { contract_type_vehicles_enum } from '@/generated/prisma/enums';
import {
  buildDateRangeFiltersWhere,
  buildFiltersWhere,
  NULL_FILTER_VALUE,
  parseSearchParams,
} from '@/shared/components/common/DataTable/helpers';

/**
 * WHERE, select y constantes compartidos por `queries.server.ts` (paginado/export) y
 * `facets.server.ts` (facets lazy). Módulo server-only: `buildWhereClause` no es un endpoint.
 */

// ============================================================================
// CONSTANTS
// ============================================================================

/** Campos de documents_equipment que se pueden ordenar server-side */
export const VALID_SORT_FIELDS = new Set([
  'created_at',
  'validity',
  'state',
  'policy_number',
  // FK columns (sorted via relation)
  'vehicle',
  'document_type',
  // Nuevos campos del equipo
  'vehicle_type',
  'vehicle_subtype',
  'vehicle_brand',
  'vehicle_year',
  'vehicle_owner',
  'vehicle_sector',
  'vehicle_chassis',
  'vehicle_engine',
  'vehicle_contract_type',
  'vehicle_contract_expiration',
]);

/** Mapeo de columnId → orderBy de Prisma para columnas FK */
export const FK_SORT_MAP: Record<string, (dir: 'asc' | 'desc') => Record<string, unknown>> = {
  vehicle: (dir) => ({ vehicles: { domain: dir } }),
  document_type: (dir) => ({ document_types: { name: dir } }),
  vehicle_type: (dir) => ({ vehicles: { type_vehicles_typeTotype: { name: dir } } }),
  vehicle_subtype: (dir) => ({ vehicles: { sub_type: { name: dir } } }),
  vehicle_brand: (dir) => ({ vehicles: { brand_vehicles: { name: dir } } }),
  vehicle_year: (dir) => ({ vehicles: { year: dir } }),
  vehicle_owner: (dir) => ({ vehicles: { equipment_owners: { name: dir } } }),
  vehicle_sector: (dir) => ({ vehicles: { hierarchy: { name: dir } } }),
  vehicle_chassis: (dir) => ({ vehicles: { chassis: dir } }),
  vehicle_engine: (dir) => ({ vehicles: { engine: dir } }),
  vehicle_contract_type: (dir) => ({ vehicles: { type_of_contract: dir } }),
  vehicle_contract_expiration: (dir) => ({ vehicles: { contract_expiration_date: dir } }),
};

/** Columnas con filtro de texto libre */
const TEXT_FILTER_COLUMNS: string[] = [
  'vehicle',
  'deny_reason',
  'serie',
  'policy_number',
  'vehicle_year',
  'vehicle_chassis',
  'vehicle_engine',
];

/** Columnas con filtro de rango de fechas (solo campos directos de documents_equipment) */
const DATE_RANGE_COLUMNS = ['created_at', 'validity'];

/** Mapping de columnId (URL) → campo real en Prisma */
const COLUMN_MAP: Record<string, string> = {
  state: 'state',
  document_type: 'id_document_types',
};

/** Select común con todas las relaciones resueltas */
export const DOCS_EQUIPMENT_PERMANENTES_SELECT = {
  id: true,
  created_at: true,
  validity: true,
  state: true,
  is_active: true,
  archived_at: true,
  deny_reason: true,
  policy_number: true,
  document_path: true,
  applies: true,
  id_document_types: true,
  vehicles: {
    select: {
      id: true,
      domain: true,
      serie: true,
      intern_number: true,
      is_active: true,
      // Nuevos campos escalares del equipo
      year: true,
      chassis: true,
      engine: true,
      type_of_contract: true,
      contract_expiration_date: true,
      // FKs del equipo (para filterFn client-side)
      type: true,
      subType: true,
      brand: true,
      owner_id: true,
      sector: true,
      // Relaciones del equipo resueltas para las columnas
      type_vehicles_typeTotype: {
        select: { id: true, name: true },
      },
      sub_type: {
        select: { id: true, name: true },
      },
      brand_vehicles: {
        select: { id: true, name: true },
      },
      model_vehicles: {
        select: { id: true, name: true },
      },
      equipment_owners: {
        select: { id: true, name: true },
      },
      hierarchy: {
        select: { id: true, name: true },
      },
      contractor_equipment: {
        select: {
          id: true,
          customers: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  },
  document_types: {
    select: {
      id: true,
      name: true,
      mandatory: true,
      multiresource: true,
      explired: true,
      is_it_montlhy: true,
      private: true,
    },
  },
  documents_equipment_logs: {
    select: {
      updated_at: true,
    },
    orderBy: { updated_at: 'desc' as const },
    take: 1,
  },
} as const;

// ============================================================================
// WHERE CLAUSE BUILDER
// ============================================================================

export async function buildWhereClause(
  companyId: string,
  state: ReturnType<typeof parseSearchParams>,
  equipmentId?: string,
  includeArchived = false
) {
  // En la vista de detalle de un equipo (equipmentId presente) se incluyen los
  // documentos archivados como historial; en la tabla general del módulo se ocultan.
  const showArchived = includeArchived || !!equipmentId;
  const canViewPrivate = await checkPermissionServer('documentacion', 'documentos-de-equipos', 'view_private');
  const filtersWhere = buildFiltersWhere(state.filters, COLUMN_MAP, {
    exclude: [
      ...TEXT_FILTER_COLUMNS, // includes 'policy_number', 'serie', 'vehicle', 'deny_reason', etc.
      ...DATE_RANGE_COLUMNS.flatMap((c) => [`${c}_from`, `${c}_to`]),
      'mandatory',
      'multiresource',
      'contractor',
      // Nuevos filtros de vehicles (manejados explícitamente abajo)
      'vehicle_type',
      'vehicle_subtype',
      'vehicle_brand',
      'vehicle_owner',
      'vehicle_sector',
      'vehicle_contract_type',
      'vehicle_contract_expiration_from',
      'vehicle_contract_expiration_to',
    ],
  });

  const dateFiltersWhere = buildDateRangeFiltersWhere(state.filters, DATE_RANGE_COLUMNS);

  // Filtros de document_types (mandatory y multiresource son campos de document_types)
  const documentTypesConditions: Record<string, unknown> = {
    is_it_montlhy: false,
    is_active: true,
    ...(!canViewPrivate && { private: { not: true } }),
  };

  const mandatoryValues = state.filters['mandatory'];
  if (mandatoryValues?.length) {
    const hasNullM = mandatoryValues.includes(NULL_FILTER_VALUE);
    const realM = mandatoryValues.filter((v) => v !== NULL_FILTER_VALUE);
    if (!hasNullM) {
      documentTypesConditions.mandatory = { in: realM.map((v) => v === 'true') };
    }
    // hasNull o mixto → manejado en andConditions extra
  }

  const multiresourceValues = state.filters['multiresource'];
  if (multiresourceValues?.length) {
    const hasNullMr = multiresourceValues.includes(NULL_FILTER_VALUE);
    const realMr = multiresourceValues.filter((v) => v !== NULL_FILTER_VALUE);
    if (!hasNullMr) {
      documentTypesConditions.multiresource = { in: realMr.map((v) => v === 'true') };
    }
    // hasNull o mixto → manejado en andConditions extra
  }

  // ─── Filtro contractor (afectación M:M a través de vehicles) ──────────────
  const contractorValues = state.filters['contractor'];
  let contractorCondition: Record<string, unknown> | null = null;
  if (contractorValues?.length) {
    const hasNull = contractorValues.includes(NULL_FILTER_VALUE);
    const realValues = contractorValues.filter((v) => v !== NULL_FILTER_VALUE);
    if (hasNull && realValues.length > 0) {
      contractorCondition = {
        OR: [
          { vehicles: { contractor_equipment: { some: { customers: { id: { in: realValues } } } } } },
          { vehicles: { contractor_equipment: { none: {} } } },
        ],
      };
    } else if (hasNull) {
      contractorCondition = { vehicles: { contractor_equipment: { none: {} } } };
    } else {
      contractorCondition = {
        vehicles: { contractor_equipment: { some: { customers: { id: { in: realValues } } } } },
      };
    }
  }

  // Búsqueda global: busca en dominio, serie y N° interno del vehículo
  const searchConditions: Record<string, unknown>[] = [];
  if (state.search) {
    searchConditions.push({
      OR: [
        { vehicles: { domain: { contains: state.search, mode: 'insensitive' } } },
        { vehicles: { serie: { contains: state.search, mode: 'insensitive' } } },
        { vehicles: { intern_number: { contains: state.search, mode: 'insensitive' } } },
        { document_types: { name: { contains: state.search, mode: 'insensitive' } } },
      ],
    });
  }

  // Filtro texto de equipo (busca por dominio, serie o N° interno)
  const vehicleTextVal = state.filters['vehicle']?.[0];
  if (vehicleTextVal) {
    searchConditions.push({
      OR: [
        { vehicles: { domain: { contains: vehicleTextVal, mode: 'insensitive' } } },
        { vehicles: { serie: { contains: vehicleTextVal, mode: 'insensitive' } } },
        { vehicles: { intern_number: { contains: vehicleTextVal, mode: 'insensitive' } } },
      ],
    });
  }

  // Filtro texto de serie / N° de póliza (campo directo del vehículo)
  const serieTextVal = state.filters['serie']?.[0];
  if (serieTextVal) {
    searchConditions.push({
      vehicles: { serie: { contains: serieTextVal, mode: 'insensitive' } },
    });
  }

  // Filtro texto de motivo de rechazo (campo directo en documents_equipment)
  const denyReasonTextVal = state.filters['deny_reason']?.[0];
  if (denyReasonTextVal) {
    searchConditions.push({
      deny_reason: { contains: denyReasonTextVal, mode: 'insensitive' },
    });
  }

  // Filtro texto de N° de póliza (campo directo en documents_equipment)
  const policyNumberTextVal = state.filters['policy_number']?.[0];
  if (policyNumberTextVal) {
    searchConditions.push({
      policy_number: { contains: policyNumberTextVal, mode: 'insensitive' },
    });
  }

  // Filtro texto de año del equipo (campo directo en vehicles)
  const yearTextVal = state.filters['vehicle_year']?.[0];
  if (yearTextVal) {
    searchConditions.push({
      vehicles: { year: { contains: yearTextVal, mode: 'insensitive' } },
    });
  }

  // Filtro texto de chasis del equipo
  const chassisTextVal = state.filters['vehicle_chassis']?.[0];
  if (chassisTextVal) {
    searchConditions.push({
      vehicles: { chassis: { contains: chassisTextVal, mode: 'insensitive' } },
    });
  }

  // Filtro texto de motor del equipo
  const engineTextVal = state.filters['vehicle_engine']?.[0];
  if (engineTextVal) {
    searchConditions.push({
      vehicles: { engine: { contains: engineTextVal, mode: 'insensitive' } },
    });
  }

  const andConditions: Record<string, unknown>[] = [
    ...(searchConditions.length > 0 ? searchConditions : []),
    ...(contractorCondition ? [contractorCondition] : []),
  ];

  // ─── Condiciones para NULL en mandatory/multiresource ─────────────────────
  if (mandatoryValues?.length) {
    const hasNullM = mandatoryValues.includes(NULL_FILTER_VALUE);
    const realM = mandatoryValues.filter((v) => v !== NULL_FILTER_VALUE);
    if (hasNullM && realM.length > 0) {
      // Mixto: null + valores reales → usar OR
      andConditions.push({
        OR: [
          { document_types: { mandatory: { in: realM.map((v) => v === 'true') } } },
          { document_types: { mandatory: null } },
        ],
      });
    } else if (hasNullM) {
      andConditions.push({ document_types: { mandatory: null } });
    }
  }

  if (multiresourceValues?.length) {
    const hasNullMr = multiresourceValues.includes(NULL_FILTER_VALUE);
    const realMr = multiresourceValues.filter((v) => v !== NULL_FILTER_VALUE);
    if (hasNullMr && realMr.length > 0) {
      andConditions.push({
        OR: [
          { document_types: { multiresource: { in: realMr.map((v) => v === 'true') } } },
          { document_types: { multiresource: null } },
        ],
      });
    } else if (hasNullMr) {
      andConditions.push({ document_types: { multiresource: null } });
    }
  }

  // ─── Filtros facetados de vehicles (FK/enum que apuntan a la relación) ─────

  // Tipo (vehicles.type → UUID NOT NULL, vehicles tiene type como campo obligatorio)
  const vehicleTypeValues = state.filters['vehicle_type'];
  if (vehicleTypeValues?.length) {
    const hasNull = vehicleTypeValues.includes(NULL_FILTER_VALUE);
    const realValues = vehicleTypeValues.filter((v) => v !== NULL_FILTER_VALUE);
    if (hasNull && realValues.length > 0) {
      andConditions.push({ OR: [{ vehicles: { type: { in: realValues } } }] });
    } else if (!hasNull) {
      andConditions.push({ vehicles: { type: { in: realValues } } });
    }
    // solo NULL: no aplica (type es NOT NULL en vehicles)
  }

  // Subtipo (vehicles.subType → UUID nullable)
  const vehicleSubtypeValues = state.filters['vehicle_subtype'];
  if (vehicleSubtypeValues?.length) {
    const hasNull = vehicleSubtypeValues.includes(NULL_FILTER_VALUE);
    const realValues = vehicleSubtypeValues.filter((v) => v !== NULL_FILTER_VALUE);
    if (hasNull && realValues.length > 0) {
      andConditions.push({ OR: [{ vehicles: { subType: { in: realValues } } }, { vehicles: { subType: null } }] });
    } else if (hasNull) {
      andConditions.push({ vehicles: { subType: null } });
    } else {
      andConditions.push({ vehicles: { subType: { in: realValues } } });
    }
  }

  // Marca (vehicles.brand → Int nullable, los valores en el filtro son strings del id)
  const vehicleBrandValues = state.filters['vehicle_brand'];
  if (vehicleBrandValues?.length) {
    const hasNull = vehicleBrandValues.includes(NULL_FILTER_VALUE);
    const realValues = vehicleBrandValues
      .filter((v) => v !== NULL_FILTER_VALUE)
      .map(Number)
      .filter((n) => !isNaN(n));
    if (hasNull && realValues.length > 0) {
      andConditions.push({ OR: [{ vehicles: { brand: { in: realValues } } }, { vehicles: { brand: null } }] });
    } else if (hasNull) {
      andConditions.push({ vehicles: { brand: null } });
    } else if (realValues.length > 0) {
      andConditions.push({ vehicles: { brand: { in: realValues } } });
    }
  }

  // Propietario (vehicles.owner_id → UUID nullable)
  const vehicleOwnerValues = state.filters['vehicle_owner'];
  if (vehicleOwnerValues?.length) {
    const hasNull = vehicleOwnerValues.includes(NULL_FILTER_VALUE);
    const realValues = vehicleOwnerValues.filter((v) => v !== NULL_FILTER_VALUE);
    if (hasNull && realValues.length > 0) {
      andConditions.push({ OR: [{ vehicles: { owner_id: { in: realValues } } }, { vehicles: { owner_id: null } }] });
    } else if (hasNull) {
      andConditions.push({ vehicles: { owner_id: null } });
    } else {
      andConditions.push({ vehicles: { owner_id: { in: realValues } } });
    }
  }

  // Sector (vehicles.sector → UUID nullable)
  const vehicleSectorValues = state.filters['vehicle_sector'];
  if (vehicleSectorValues?.length) {
    const hasNull = vehicleSectorValues.includes(NULL_FILTER_VALUE);
    const realValues = vehicleSectorValues.filter((v) => v !== NULL_FILTER_VALUE);
    if (hasNull && realValues.length > 0) {
      andConditions.push({ OR: [{ vehicles: { sector: { in: realValues } } }, { vehicles: { sector: null } }] });
    } else if (hasNull) {
      andConditions.push({ vehicles: { sector: null } });
    } else {
      andConditions.push({ vehicles: { sector: { in: realValues } } });
    }
  }

  // Tipo de contrato (vehicles.type_of_contract → enum nullable)
  const vehicleContractTypeValues = state.filters['vehicle_contract_type'];
  if (vehicleContractTypeValues?.length) {
    const hasNull = vehicleContractTypeValues.includes(NULL_FILTER_VALUE);
    const realValues = vehicleContractTypeValues.filter((v) => v !== NULL_FILTER_VALUE);
    if (hasNull && realValues.length > 0) {
      andConditions.push({
        OR: [
          { vehicles: { type_of_contract: { in: realValues as contract_type_vehicles_enum[] } } },
          { vehicles: { type_of_contract: null } },
        ],
      });
    } else if (hasNull) {
      andConditions.push({ vehicles: { type_of_contract: null } });
    } else {
      andConditions.push({
        vehicles: { type_of_contract: { in: realValues as contract_type_vehicles_enum[] } },
      });
    }
  }

  // Vencimiento de contrato (vehicles.contract_expiration_date → Date nullable, rango manual)
  const contractExpirationFrom = state.filters['vehicle_contract_expiration_from']?.[0];
  const contractExpirationTo = state.filters['vehicle_contract_expiration_to']?.[0];
  if (contractExpirationFrom || contractExpirationTo) {
    const dateCondition: Record<string, unknown> = {};
    if (contractExpirationFrom) dateCondition.gte = new Date(contractExpirationFrom);
    if (contractExpirationTo) dateCondition.lte = new Date(contractExpirationTo);
    andConditions.push({ vehicles: { contract_expiration_date: dateCondition } });
  }

  return {
    // Solo documentos de equipos activos de la compañía
    ...(equipmentId ? { applies: equipmentId } : {}),
    // Excluir documentos archivados (historial / no vigente) salvo en la vista de detalle
    ...(showArchived ? {} : { archived_at: null }),
    vehicles: {
      company_id: companyId,
      is_active: true,
    },
    document_types: documentTypesConditions,
    ...filtersWhere,
    ...dateFiltersWhere,
    ...(andConditions.length > 0 ? { AND: andConditions } : {}),
  };
}

/**
 * WHERE base sin filtros de tabla (facets sin estado): equipos activos de la empresa, tipos
 * permanentes activos, sin archivados salvo en el detalle de un equipo.
 */
export async function buildBaseWhereClause(companyId: string, equipmentId?: string) {
  const canViewPrivate = await checkPermissionServer('documentacion', 'documentos-de-equipos', 'view_private');
  return {
    ...(equipmentId ? { applies: equipmentId } : {}),
    ...(equipmentId ? {} : { archived_at: null }),
    vehicles: { company_id: companyId, is_active: true },
    document_types: { is_it_montlhy: false, is_active: true, ...(!canViewPrivate && { private: { not: true } }) },
  };
}
