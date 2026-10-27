import 'server-only';

import { prisma } from '@/shared/lib/prisma';
import { UUID_RE, companyIdFromKey, isCompanyPrefixedBucket, type StorageBucket } from '@/shared/lib/storage-buckets';

/**
 * ¿De qué empresa es este archivo?
 *
 * Sin RLS, la ruta proxy (`/api/files/...`) es un lector de archivos por path: si no
 * resolviera el dueño, cualquier sesión podría leer el archivo de cualquier empresa
 * adivinando la ruta. Es el mismo agujero que P2 cerró en cada action, aplicado al storage.
 *
 * Tres estrategias según el bucket:
 *
 * 1. Buckets con prefijo de empresa (`<companyId>/...`): el dueño sale del path, sin base.
 * 2. `avatar`: el dueño es un PERFIL, no una empresa (ver `resolveStorageObjectOwner`).
 * 3. Buckets con paths heredados (documentos, remitos, contratos): el dueño se resuelve en
 *    la base por la fila que referencia ese path. Un archivo sin fila que lo referencie NO
 *    se sirve.
 *
 * Todo id que se extrae del path se valida contra `UUID_RE` antes de llegar a Prisma: las
 * columnas son `@db.Uuid` y un valor con otra forma hace que Prisma lance `P2023`, que la
 * ruta traduciría en un 500 en vez del 404 que promete.
 *
 * Devuelve `null` cuando no se puede probar la pertenencia: la ruta responde 404.
 */

/** Carpetas del bucket `document-files` que cuelgan de un equipamiento. */
const OTHER_EQUIPMENT_FOLDERS: Record<string, true> = {
  'other-equipment-pictures': true,
  'other-equipment-blueprints': true,
  'other-equipment-certifications': true,
};

/** Empresa de un archivo de equipamiento: `other-equipment-<tipo>/<equipoId>/<archivo>`. */
async function otherEquipmentCompany(path: string): Promise<string | null> {
  const [folder, equipmentId] = path.split('/');
  if (!folder || !OTHER_EQUIPMENT_FOLDERS[folder] || !equipmentId || !UUID_RE.test(equipmentId)) return null;
  const equipment = await prisma.other_equipment.findUnique({
    where: { id: equipmentId },
    select: { company_id: true },
  });
  return equipment?.company_id ?? null;
}

/** Empresa de un documento, buscando el `document_path` en las tres tablas de documentos. */
async function documentCompany(path: string): Promise<string | null> {
  const [employee, equipment, company] = await Promise.all([
    prisma.documents_employees.findFirst({
      where: { document_path: path },
      select: { employees: { select: { company_id: true } } },
    }),
    prisma.documents_equipment.findFirst({
      where: { document_path: path },
      select: { vehicles: { select: { company_id: true } } },
    }),
    prisma.documents_company.findFirst({ where: { document_path: path }, select: { applies: true } }),
  ]);
  return employee?.employees?.company_id ?? equipment?.vehicles?.company_id ?? company?.applies ?? null;
}

/** Empresa de un remito: la del parte diario del que cuelga su línea. */
async function remitDocumentCompany(path: string): Promise<string | null> {
  const document = await prisma.remito_documents.findFirst({
    where: { document_path: path },
    select: { remitos: { select: { dailyreportrows: { select: { dailyreport: { select: { company_id: true } } } } } } },
  });
  return document?.remitos?.dailyreportrows?.dailyreport?.company_id ?? null;
}

/**
 * Empresa del adjunto de un contrato, más el nombre con el que se cargó.
 *
 * Son dos consultas porque `documents_contracts.contract_id` es un `String` suelto, sin
 * relación declarada en el schema. Es el mismo camino que usa `findOwnedDocument()` en
 * `services.server.ts`.
 */
async function contractDocumentOwner(path: string): Promise<{ companyId: string; downloadName: string } | null> {
  const document = await prisma.documents_contracts.findFirst({
    where: { path },
    select: { contract_id: true, name: true },
  });
  if (!document?.contract_id || !UUID_RE.test(document.contract_id)) return null;
  const service = await prisma.customer_services.findUnique({
    where: { id: document.contract_id },
    select: { customers: { select: { company_id: true } } },
  });
  const companyId = service?.customers?.company_id;
  return companyId ? { companyId, downloadName: document.name } : null;
}

/**
 * Dueño de `bucket/path`:
 * - `{ kind: 'company' }` → el archivo es de esa empresa.
 * - `{ kind: 'profile' }` → el archivo es de ese perfil (avatares).
 * - `null` → no se puede probar; la ruta responde 404.
 *
 * `path` ya tiene que venir validado con `isSafeStorageKey`.
 *
 * `document-files-expired` no está: es un archivo histórico que no se sirve por URL, sólo
 * se escribe al renovar un documento. El default es negar.
 */
export type StorageObjectOwner = ({ kind: 'company'; companyId: string } | { kind: 'profile'; profileId: string }) & {
  /**
   * Nombre con el que ofrecer el archivo al descargar, cuando la base guarda uno distinto
   * del de la key. Sale SIEMPRE de la fila, nunca del pedido: si viniera del querystring,
   * cualquiera podría elegir con qué nombre se guarda un archivo ajeno.
   */
  downloadName?: string;
};

export async function resolveStorageObjectOwner(
  bucket: StorageBucket,
  path: string
): Promise<StorageObjectOwner | null> {
  if (bucket === 'avatar') {
    // `<profileId>.<ext>`: el avatar es de la persona, no de una empresa. Si colgara de la
    // empresa, el mismo usuario en dos empresas tendría un avatar por empresa y los
    // compañeros de la otra recibirían 404.
    const profileId = path.split('/')[0]?.split('.')[0];
    return profileId && UUID_RE.test(profileId) ? { kind: 'profile', profileId } : null;
  }

  if (bucket === 'hse-files') {
    // El prefijo de empresa NO alcanza: dentro de la empresa hay borradores y documentos que no le aplican a cada
    // empleado. El dueño sale de la fila de la versión leída con el cliente contextual: la RLS de
    // `hse_document_versions` deja verla solo con el permiso de HSE o, al empleado del portal, si es la versión
    // vigente y publicada de un documento que le aplica. Sin fila visible no hay archivo.
    const version = await prisma.hse_document_versions.findFirst({
      where: { file_path: path },
      select: { company_id: true, file_name: true },
    });
    if (version) return { kind: 'company', companyId: version.company_id, downloadName: version.file_name };
    // Material de capacitación: misma idea con `hse_training_materials` (al empleado, solo el de una capacitación
    // publicada que le aplica: compuerta `hse_employee_can_read_training`).
    const material = await prisma.hse_training_materials.findFirst({
      where: { file_path: path },
      select: { company_id: true, file_name: true },
    });
    return material
      ? { kind: 'company', companyId: material.company_id, downloadName: material.file_name ?? undefined }
      : null;
  }

  if (isCompanyPrefixedBucket(bucket)) {
    const companyId = companyIdFromKey(path);
    return companyId ? { kind: 'company', companyId } : null;
  }

  if (bucket === 'contract-documents') {
    const owner = await contractDocumentOwner(path);
    // La key lleva un `<timestamp>_` que el usuario no debería ver en su carpeta de
    // descargas: el nombre bueno es el que se guardó al subir el archivo.
    return owner ? { kind: 'company', companyId: owner.companyId, downloadName: owner.downloadName } : null;
  }

  const companyId = await (async () => {
    switch (bucket) {
      case 'document-files':
        return (await otherEquipmentCompany(path)) ?? (await documentCompany(path));
      case 'daily-reports':
        return remitDocumentCompany(path);
      default:
        return null;
    }
  })();

  return companyId ? { kind: 'company', companyId } : null;
}
