import { formatQuantityWithUnit } from '@/features/Purchases/lib/quantity-format';
import type { certification_status } from '@/generated/prisma/enums';
import { joinAddress, pdfDateText, unitAmountText } from '@/shared/lib/pdf/pdf-text';
import type { PdfCompanySource } from '@/shared/lib/pdf/types';
import { formatAmountText } from '@/shared/utils/amount-text';
import { formatCuitText } from '@/shared/utils/cuit-text';
import { CERTIFICATION_STATUS_LABELS } from '../lib/state-machine';

/**
 * View-model del PDF de la certificación. Puro, sin Prisma ni directiva: recibe los datos ya
 * leídos y devuelve todo como texto formateado, así el layout no calcula nada (mismo criterio
 * que `purchase-pdf-data.ts`).
 *
 * Los importes viajan como TEXTO desde la base y se formatean como texto (ver
 * `formatAmountText`). Sin permiso de ver precios no llegan: el layout oculta las columnas.
 */

export type CertificationPdfSource = {
  number: string;
  status: certification_status;
  /** Fechas `YYYY-MM-DD`. */
  periodFrom: string;
  periodTo: string;
  /** Emisión (o creación, si es borrador), `YYYY-MM-DD`. */
  date: string;
  currency: string;
  /** Null cuando el usuario no tiene permiso de ver precios. */
  total: string | null;
  notes: string | null;
  voidedAt: string | null;
  voidedReason: string | null;
  company: PdfCompanySource;
  customer: { name: string; cuit: string; address: string | null };
  contract: { name: string | null; number: string | null };
  lines: {
    code: string | null;
    name: string;
    description: string;
    quantity: string;
    unitSymbol: string | null;
    /** Null sin permiso de ver precios. */
    unitPrice: string | null;
    amount: string | null;
  }[];
};

/** La marca de agua dice lo que el documento todavía no es (borrador) o ya no es (anulada). */
function watermark(status: certification_status): string | null {
  if (status === 'borrador') return 'BORRADOR';
  if (status === 'anulada') return 'ANULADA';
  return null;
}

export function buildCertificationPdfData(src: CertificationPdfSource) {
  const showPrices = src.total !== null;
  return {
    title: 'CERTIFICACIÓN DE SERVICIOS',
    number: src.number,
    date: pdfDateText(src.date),
    dateLabel: src.status === 'borrador' ? 'Fecha de creación' : 'Fecha de emisión',
    status: CERTIFICATION_STATUS_LABELS[src.status],
    watermark: watermark(src.status),
    draftNotice:
      src.status === 'borrador'
        ? `Documento en borrador: ${showPrices ? 'las líneas y los importes son provisorios' : 'las líneas son provisorias'} y pueden cambiar hasta que se emita.`
        : null,
    voided:
      src.status === 'anulada'
        ? { date: src.voidedAt ? pdfDateText(src.voidedAt) : null, reason: src.voidedReason?.trim() || null }
        : null,
    showPrices,
    company: {
      name: src.company.name,
      cuit: formatCuitText(src.company.cuit),
      address: joinAddress([src.company.address, src.company.city, src.company.province]),
    },
    customer: {
      name: src.customer.name,
      cuit: formatCuitText(src.customer.cuit),
      address: src.customer.address?.trim() || null,
    },
    contract: {
      name: src.contract.name?.trim() || 'Sin nombre',
      number: src.contract.number?.trim() || null,
    },
    period: `${pdfDateText(src.periodFrom)} al ${pdfDateText(src.periodTo)}`,
    currency: src.currency,
    lines: src.lines.map((line, index) => ({
      position: String(index + 1),
      item: line.code ? `[${line.code}] ${line.name}` : line.name,
      description: line.description,
      quantity: formatQuantityWithUnit(line.quantity, line.unitSymbol),
      // Sin moneda en la celda: va en el encabezado de la columna, así el unitario a 4
      // decimales no parte la fila en dos renglones.
      unitPrice: line.unitPrice !== null ? unitAmountText(line.unitPrice) : null,
      amount: line.amount !== null ? formatAmountText(line.amount) : null,
    })),
    total: src.total !== null ? `${src.currency} ${formatAmountText(src.total)}` : null,
    notes: src.notes?.trim() || null,
  };
}

export type CertificationPdfData = ReturnType<typeof buildCertificationPdfData>;
