'use server';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { prisma } from '@/shared/lib/prisma';
import { buildStorageFileUrl } from '@/shared/lib/storage-url';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { isUuid } from '@/shared/lib/uuid';
import { formatCuitText } from '@/shared/utils/cuit-text';
import { SUPPLIER_FILES_BUCKET } from '../lib/storage-files';

const DOCUMENTS_BUCKET = SUPPLIER_FILES_BUCKET;

// ── Lecturas ────────────────────────────────────────────────────────────────

/** Ficha del proveedor: datos, contactos, rubros y documentos (vigentes e historial). */
export async function getSupplierDetail(id: string) {
  if (!(await checkPermissionServer('compras', 'proveedores', 'view'))) return null;
  if (!isUuid(id)) return null;
  const companyId = await getActiveCompanyId();
  const supplier = await prisma.suppliers.findFirst({
    where: { id, company_id: companyId },
    select: {
      id: true,
      name: true,
      trade_name: true,
      cuit: true,
      vat_condition_id: true,
      street: true,
      city: true,
      province: true,
      postal_code: true,
      payment_term_days: true,
      bank_cbu: true,
      bank_alias: true,
      notes: true,
      is_active: true,
      updated_at: true,
      contacts: {
        select: { id: true, name: true, email: true, phone: true, role: true, is_primary: true },
        orderBy: [{ is_primary: 'desc' }, { name: 'asc' }],
      },
      category_links: { select: { category: { select: { id: true, name: true } } } },
      documents: {
        select: {
          id: true,
          name: true,
          file_path: true,
          file_name: true,
          expires_at: true,
          replaced_by_id: true,
          created_at: true,
          uploader: { select: { fullname: true, email: true } },
        },
        orderBy: { created_at: 'desc' },
      },
    },
  });
  if (!supplier) return null;
  const { cuit, contacts, category_links, documents, updated_at, ...rest } = supplier;
  return {
    ...rest,
    updatedAt: updated_at.toISOString(),
    cuit: cuit.toString(),
    contacts,
    categories: category_links.map((l) => l.category),
    documents: documents.map(({ file_path, expires_at, uploader, created_at, ...d }) => ({
      ...d,
      url: buildStorageFileUrl(DOCUMENTS_BUCKET, file_path),
      expiresAt: expires_at ? expires_at.toISOString().slice(0, 10) : null,
      uploadedAt: created_at.toISOString(),
      uploadedBy: uploader.fullname ?? uploader.email ?? 'Usuario',
    })),
  };
}

export type SupplierDetail = NonNullable<Awaited<ReturnType<typeof getSupplierDetail>>>;

/** Rubros activos para el formulario del proveedor. */
export async function getSupplierFormLookups() {
  if (!(await checkPermissionServer('compras', 'proveedores', 'view'))) return { categories: [] };
  const companyId = await getActiveCompanyId();
  const categories = await prisma.supplier_categories.findMany({
    where: { company_id: companyId, is_active: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  return { categories };
}

/** Nombres de documento ya usados en la empresa, como sugerencias. */
export async function getSupplierDocumentNameSuggestions() {
  if (!(await checkPermissionServer('compras', 'proveedores', 'view'))) return [];
  const companyId = await getActiveCompanyId();
  const rows = await prisma.supplier_documents.findMany({
    where: { supplier: { company_id: companyId } },
    select: { name: true },
    distinct: ['name'],
    orderBy: { name: 'asc' },
    take: 50,
  });
  return rows.map((r) => r.name);
}

/**
 * Proveedores activos para el "proveedor sugerido" de una solicitud. Lo usa quien arma la
 * solicitud, asi que el permiso es el de crear solicitudes, no el de ver proveedores. Busca por
 * razon social, nombre de fantasia o el comienzo del CUIT.
 */
export async function searchSupplierOptions(query: string) {
  // Lo usan la solicitud (proveedor sugerido), el pedido de cotizacion, la orden de compra, la factura y la orden de pago.
  const allowed = await Promise.all([
    checkPermissionServer('compras', 'solicitudes', 'create'),
    checkPermissionServer('compras', 'cotizaciones', 'create'),
    checkPermissionServer('compras', 'ordenes', 'create'),
    checkPermissionServer('compras', 'facturas', 'create'),
    checkPermissionServer('compras', 'pagos', 'create'),
  ]);
  if (!allowed.some(Boolean)) return { items: [], total: 0 };
  const companyId = await getActiveCompanyId();
  const term = query.trim();
  const digits = term.replace(/\D/g, '');
  const where = {
    company_id: companyId,
    is_active: true,
    ...(term
      ? {
          OR: [
            { name: { contains: term, mode: 'insensitive' as const } },
            { trade_name: { contains: term, mode: 'insensitive' as const } },
            ...(digits.length >= 3 && digits.length <= 11
              ? [{ cuit: { gte: BigInt(digits.padEnd(11, '0')), lte: BigInt(digits.padEnd(11, '9')) } }]
              : []),
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.suppliers.findMany({
      where,
      select: { id: true, name: true, trade_name: true, cuit: true },
      orderBy: { name: 'asc' },
      take: 30,
    }),
    prisma.suppliers.count({ where }),
  ]);
  return {
    items: rows.map((r) => ({
      id: r.id,
      label: r.trade_name ? `${r.name} (${r.trade_name})` : r.name,
      cuit: formatCuitText(r.cuit),
    })),
    total,
  };
}
