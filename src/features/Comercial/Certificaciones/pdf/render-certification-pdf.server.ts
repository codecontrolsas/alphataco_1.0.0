import 'server-only';

import { timestampToLocalDateOnly, toDateOnly } from '@/shared/lib/date-only';
import { COMPANY_SELECT, companySource, loadCompanyLogo, loadReactPdf } from '@/shared/lib/pdf/react-pdf.server';
import type { RenderedPdf } from '@/shared/lib/pdf/types';
import { prisma } from '@/shared/lib/prisma';
import { CertificationPdfDocument } from './CertificationPdfDocument';
import { buildCertificationPdfData } from './certification-pdf-data';

/**
 * PDF de una certificación en cualquier estado (borrador y anulada con marca de agua). Se arma
 * en el momento y no se guarda: una emitida ya tiene los precios congelados en sus líneas, así
 * que reimprimirla da siempre el mismo documento.
 *
 * `includePrices = false` deja afuera unitario, importe y total: el PDF respeta el mismo permiso
 * (`view_prices`) que la pantalla. Devuelve `null` si la certificación no es de la empresa.
 */
export async function renderCertificationPdf(
  id: string,
  companyId: string,
  includePrices: boolean
): Promise<RenderedPdf | null> {
  const cert = await prisma.certifications.findFirst({
    where: { id, company_id: companyId },
    select: {
      number: true,
      status: true,
      period_from: true,
      period_to: true,
      currency: true,
      total: true,
      notes: true,
      created_at: true,
      issued_at: true,
      voided_at: true,
      voided_reason: true,
      company: { select: COMPANY_SELECT },
      customers: { select: { name: true, cuit: true, address: true } },
      customer_services: { select: { service_name: true, contract_number: true } },
      lines: {
        select: {
          description: true,
          quantity: true,
          unit_price: true,
          amount: true,
          service_items: { select: { item_name: true, code_item: true, measure_units: { select: { simbol: true } } } },
        },
        orderBy: { created_at: 'asc' },
      },
    },
  });
  if (!cert) return null;

  const data = buildCertificationPdfData({
    number: cert.number,
    status: cert.status,
    periodFrom: toDateOnly(cert.period_from) ?? '',
    periodTo: toDateOnly(cert.period_to) ?? '',
    date: timestampToLocalDateOnly(cert.issued_at ?? cert.created_at),
    currency: cert.currency,
    total: includePrices ? cert.total.toString() : null,
    notes: cert.notes,
    voidedAt: cert.voided_at ? timestampToLocalDateOnly(cert.voided_at) : null,
    voidedReason: cert.voided_reason,
    company: companySource(cert.company),
    customer: { name: cert.customers.name, cuit: cert.customers.cuit.toString(), address: cert.customers.address },
    contract: { name: cert.customer_services.service_name, number: cert.customer_services.contract_number },
    lines: cert.lines.map((line) => ({
      code: line.service_items.code_item,
      name: line.service_items.item_name,
      description: line.description,
      quantity: line.quantity.toString(),
      unitSymbol: line.service_items.measure_units.simbol,
      unitPrice: includePrices ? line.unit_price.toString() : null,
      amount: includePrices ? line.amount.toString() : null,
    })),
  });

  const [rp, logo] = await Promise.all([loadReactPdf(), loadCompanyLogo(cert.company.company_logo)]);
  const buffer = await rp.renderToBuffer(CertificationPdfDocument(rp, data, logo));
  return { filename: `${cert.number}.pdf`, content: new Uint8Array(buffer) };
}
