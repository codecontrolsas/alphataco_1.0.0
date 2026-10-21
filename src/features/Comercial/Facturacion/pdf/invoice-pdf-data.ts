import { CBTE_TYPES, VAT_RATE_LABELS, isCbteTypeId, isVatRateId } from '@/shared/lib/arca/catalogs';
import { buildArcaQrUrl } from '@/shared/lib/arca/qr';
import { formatAmountText } from '@/shared/utils/amount-text';
import { formatCuitText } from '@/shared/utils/cuit-text';
import moment from 'moment';
import { formatSalesPoint, formatVoucherLabel } from '../lib/invoice-type';
import { formatAddress, type IssuerSnapshot, type ReceiverSnapshot } from '../lib/snapshots';

/**
 * View-model del PDF fiscal. Puro (sin Prisma ni directiva): recibe los datos ya leídos y devuelve
 * TODO como texto ya formateado, así el layout no calcula nada.
 */

/** Bucket de RustFS de los PDF fiscales (`<companyId>/<invoiceId>.pdf`). */
export const INVOICE_PDF_BUCKET = 'invoice-pdfs';

const TITLES = { invoice: 'FACTURA', credit_note: 'NOTA DE CRÉDITO', debit_note: 'NOTA DE DÉBITO' } as const;

export const TAX_CONDITION_PRINT: Record<IssuerSnapshot['taxCondition'], string> = {
  responsable_inscripto: 'IVA Responsable Inscripto',
  monotributo: 'Responsable Monotributo',
  exento: 'IVA Sujeto Exento',
};

const GROSS_INCOME_PRINT: Record<NonNullable<IssuerSnapshot['grossIncomeRegime']>, string> = {
  local: 'Local',
  convenio_multilateral: 'Conv. Multilateral',
  exento: 'Exento',
};

export type InvoicePdfSource = {
  cbteType: number;
  salesPoint: number;
  number: number;
  issueDate: string;
  concept: number;
  serviceFrom: string | null;
  serviceTo: string | null;
  paymentDueDate: string | null;
  currency: string;
  arcaCurrencyId: string;
  exchangeRate: string;
  netTaxed: string;
  vatTotal: string;
  otherTaxes: string;
  total: string;
  vatBreakdown: { vatRateId: number; base: string; amount: string }[];
  lines: { description: string; quantity: string; unitPrice: string; netAmount: string; vatRateId: number | null }[];
  issuer: IssuerSnapshot;
  receiver: ReceiverSnapshot;
  receiverDocType: number;
  receiverDocNumber: string;
  associated: { label: string; issueDate: string } | null;
  notes: string | null;
  cae: string;
  caeDueDate: string;
  environment: 'homologacion' | 'produccion';
  simulated: boolean;
};

const date = (d: string | null) => (d ? moment.utc(d).format('DD/MM/YYYY') : '—');
const cuit = formatCuitText;
/** Cantidad sin ceros de más ("12.5000" → "12,5"). */
const quantity = (q: string) => formatAmountText(q, 4).replace(/,?0+$/, '');

export function buildInvoicePdfData(src: InvoicePdfSource) {
  const info = isCbteTypeId(src.cbteType) ? CBTE_TYPES[src.cbteType] : null;
  const letter = info?.letter ?? 'C';
  const kind = info?.kind ?? 'invoice';
  const symbol = src.currency === 'ARS' ? '$' : src.currency;
  const money = (v: string) => `${symbol} ${formatAmountText(v)}`;
  const discriminatesVat = letter === 'A';

  return {
    title: TITLES[kind],
    letter,
    code: String(src.cbteType).padStart(2, '0'),
    voucherLabel: formatVoucherLabel(src.cbteType, src.salesPoint, src.number),
    salesPoint: formatSalesPoint(src.salesPoint),
    number: String(src.number).padStart(8, '0'),
    issueDate: date(src.issueDate),
    watermark: src.simulated
      ? 'SIMULADO – SIN VALIDEZ FISCAL'
      : src.environment === 'homologacion'
        ? 'SIN VALIDEZ FISCAL – HOMOLOGACIÓN'
        : null,
    issuer: {
      name: src.issuer.name,
      address: formatAddress(src.issuer),
      taxCondition: TAX_CONDITION_PRINT[src.issuer.taxCondition],
      cuit: cuit(src.issuer.cuit),
      grossIncome: src.issuer.grossIncomeNumber
        ? `${src.issuer.grossIncomeNumber}${src.issuer.grossIncomeRegime ? ` (${GROSS_INCOME_PRINT[src.issuer.grossIncomeRegime]})` : ''}`
        : src.issuer.grossIncomeRegime
          ? GROSS_INCOME_PRINT[src.issuer.grossIncomeRegime]
          : '—',
      activityStart: date(src.issuer.activityStartDate),
    },
    period:
      src.concept !== 1
        ? { from: date(src.serviceFrom), to: date(src.serviceTo), due: date(src.paymentDueDate) }
        : null,
    receiver: {
      name: src.receiver.name,
      cuit: src.receiverDocType === 80 ? cuit(src.receiverDocNumber) : src.receiverDocNumber,
      taxCondition: src.receiver.vatConditionLabel,
      address: formatAddress(src.receiver) || '—',
    },
    associated: src.associated ? `${src.associated.label} del ${date(src.associated.issueDate)}` : null,
    discriminatesVat,
    lines: src.lines.map((l) => ({
      description: l.description,
      quantity: quantity(l.quantity),
      unitPrice: formatAmountText(l.unitPrice, 2),
      subtotal: formatAmountText(l.netAmount),
      vat: discriminatesVat && l.vatRateId !== null && isVatRateId(l.vatRateId) ? VAT_RATE_LABELS[l.vatRateId] : null,
    })),
    totals: [
      ...(discriminatesVat
        ? [
            { label: 'Importe neto gravado', value: money(src.netTaxed) },
            ...src.vatBreakdown.map((v) => ({
              label: `IVA ${isVatRateId(v.vatRateId) ? VAT_RATE_LABELS[v.vatRateId] : v.vatRateId}`,
              value: money(v.amount),
            })),
            { label: 'Importe otros tributos', value: money(src.otherTaxes) },
          ]
        : letter === 'B'
          ? [
              // Las líneas van netas y el IVA se suma acá: así la cuenta del papel cierra exacta
              // con lo que se informó a ARCA (el IVA se redondea por alícuota, no por línea).
              { label: 'Subtotal', value: money(src.netTaxed) },
              { label: 'IVA', value: money(src.vatTotal) },
            ]
          : []),
    ],
    total: money(src.total),
    // Ley 27.743 (transparencia fiscal): en B se informa el IVA contenido.
    vatContained: letter === 'B' ? money(src.vatTotal) : null,
    exchange:
      src.currency !== 'ARS'
        ? `Moneda: ${src.currency} · Tipo de cambio ${formatAmountText(src.exchangeRate, 6).replace(/0{1,4}$/, '')} (ARCA, ${date(src.issueDate)})`
        : null,
    notes: src.notes,
    cae: src.cae,
    caeDueDate: date(src.caeDueDate),
    qrUrl: buildArcaQrUrl({
      issueDate: src.issueDate,
      issuerCuit: src.issuer.cuit,
      salesPoint: src.salesPoint,
      cbteType: src.cbteType,
      number: src.number,
      total: src.total,
      currencyId: src.arcaCurrencyId,
      exchangeRate: src.exchangeRate,
      receiverDocType: src.receiverDocType,
      receiverDocNumber: src.receiverDocNumber,
      cae: src.cae,
    }),
  };
}

export type InvoicePdfData = ReturnType<typeof buildInvoicePdfData>;
