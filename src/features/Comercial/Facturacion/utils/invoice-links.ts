/**
 * Rutas de Facturación. Módulo puro: lo usan Server y Client Components por igual.
 */

/** La subtab Facturación dentro de Comercial (`SectionManagerServer` en los dos niveles: `?tab=comerce&subtab=`). */
export const INVOICING_TAB_HREF = '/dashboard/comercial?tab=comerce&subtab=facturacion';

export const CERTIFICATIONS_TAB_HREF = '/dashboard/comercial?tab=comerce&subtab=certificaciones';

export const FISCAL_DATA_HREF = '/dashboard/configuration?tab=general&subtab=datos-fiscales';

export const NEW_INVOICE_HREF = '/dashboard/comercial/facturacion/nueva';

export function invoiceHref(id: string, result?: string): string {
  return result
    ? `/dashboard/comercial/facturacion/${id}?resultado=${result}`
    : `/dashboard/comercial/facturacion/${id}`;
}

/** Ficha del cliente, donde se cargan sus datos fiscales. */
export function customerHref(id: string): string {
  return `/dashboard/configuration/customers/action?action=view&id=${id}`;
}

export { formatCuitText } from '@/shared/utils/cuit-text';

/** Plural armado entero: `countLabel(3, 'certificación', 'certificaciones')` → "3 certificaciones". */
export function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
