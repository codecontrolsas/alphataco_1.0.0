import { argentinaDate } from '@/shared/lib/argentina-time';
import 'server-only';
import type { SupplierInvoiceStatus } from './invoice-status';

import { Prisma } from '@/generated/prisma/client';
import { isUuid } from '@/shared/lib/uuid';
import type { SupplierInvoiceInput } from '../schemas/invoices';
import { controlSupplierInvoice } from './invoice-control';
import { expectedSupplierLetter } from './invoice-letter';
import { computeInvoiceLine, computeSupplierInvoiceTotals, vatBreakdown, vatDifferences } from './invoice-totals';
import { loadOrderLinesForControl, supplierInvoiceLabel, voucherInfo } from './invoices';
import { PurchaseError } from './purchase-errors';

const RELATED_INVALID = 'La nota tiene que vincularse a una factura vigente del mismo proveedor y la misma letra';

const decimal = (value: string) => new Prisma.Decimal(value);
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

type WriteTx = Prisma.TransactionClient;

/**
 * Valida, controla y escribe el comprobante (alta o edicion) dentro de la transaccion. Las OC ya
 * estan lockeadas por el llamador. Devuelve los datos a guardar y el resultado del control.
 */
export async function buildInvoice(
  tx: WriteTx,
  companyId: string,
  input: SupplierInvoiceInput,
  options: { invoiceId?: string; supplierChanged: boolean }
) {
  const supplier = await tx.suppliers.findFirst({
    where: { id: input.supplierId, company_id: companyId },
    select: { id: true, name: true, is_active: true, vat_condition_id: true },
  });
  if (!supplier) throw new PurchaseError('El proveedor no existe');
  if (!supplier.is_active && options.supplierChanged)
    throw new PurchaseError(`El proveedor ${supplier.name} está inactivo`);

  if (input.issueDate > argentinaDate()) throw new PurchaseError('La fecha de emisión no puede ser futura');
  const { letter, kind } = voucherInfo(input.cbteType);
  const label = supplierInvoiceLabel({
    cbte_type: input.cbteType,
    sales_point: input.salesPoint,
    number: input.number,
  });

  const duplicate = await tx.supplier_invoices.findFirst({
    where: {
      company_id: companyId,
      supplier_id: supplier.id,
      cbte_type: input.cbteType,
      sales_point: input.salesPoint,
      number: BigInt(input.number),
      status: { not: 'CANCELLED' },
      ...(options.invoiceId ? { id: { not: options.invoiceId } } : {}),
    },
    select: { id: true },
  });
  if (duplicate) throw new PurchaseError(`Ya está cargada la ${label} de ${supplier.name}`);

  if (input.relatedInvoiceId) {
    if (!isUuid(input.relatedInvoiceId)) throw new PurchaseError(RELATED_INVALID);
    const related = await tx.supplier_invoices.findFirst({
      where: {
        id: input.relatedInvoiceId,
        company_id: companyId,
        supplier_id: supplier.id,
        status: { not: 'CANCELLED' },
      },
      select: { cbte_type: true },
    });
    const info = related ? voucherInfo(related.cbte_type) : null;
    if (!info || info.kind !== 'invoice' || info.letter !== letter || input.relatedInvoiceId === options.invoiceId) {
      throw new PurchaseError(RELATED_INVALID);
    }
  }

  const categoryIds = [...new Set(input.lines.flatMap((l) => (l.kind === 'expense' ? [l.expenseCategoryId] : [])))];
  if (categoryIds.some((id) => !isUuid(id))) throw new PurchaseError('El concepto de gasto no existe');
  if (categoryIds.length > 0) {
    const found = await tx.purchase_expense_categories.count({
      where: { id: { in: categoryIds }, company_id: companyId },
    });
    if (found !== categoryIds.length) throw new PurchaseError('El concepto de gasto no existe');
  }
  const provinceIds = [...new Set(input.taxes.flatMap((t) => (t.provinceId ? [t.provinceId] : [])))];
  if (provinceIds.some((id) => !/^\d+$/.test(id))) throw new PurchaseError('La provincia no existe');
  if (provinceIds.length > 0) {
    const found = await tx.provinces.count({ where: { id: { in: provinceIds.map(BigInt) } } });
    if (found !== provinceIds.length) throw new PurchaseError('La provincia no existe');
  }

  const amounts = input.lines.map((line, i) => {
    const computed =
      line.kind === 'order'
        ? computeInvoiceLine({ letter, quantity: line.quantity, unitPrice: line.unitPrice, vatRateId: line.vatRateId })
        : computeInvoiceLine({ letter, net: line.net, vatRateId: line.vatRateId });
    if (!computed) throw new PurchaseError(`Línea ${i + 1}: revisá la cantidad, el importe y la alícuota`);
    return { ...computed, vatRateId: letter === 'C' ? null : line.vatRateId };
  });

  // Bases desde las lineas; el IVA de cada alicuota es el informado (si vino) o el calculado.
  const vat = vatBreakdown(amounts, letter).map((computed) => {
    const informed = input.vat.find((v) => v.vatRateId === computed.vatRateId);
    return { ...computed, amount: informed?.amount ?? computed.amount };
  });

  const fiscal = await tx.company_fiscal_profiles.findUnique({
    where: { company_id: companyId },
    select: { tax_condition: true },
  });
  const controlLines = await loadOrderLinesForControl(tx, companyId, supplier.id, input, {
    excludeInvoiceId: options.invoiceId,
  });
  const control = controlSupplierInvoice({
    kind,
    letter,
    expectedLetter: expectedSupplierLetter({
      supplierVatConditionId: supplier.vat_condition_id,
      supplierName: supplier.name,
      companyTaxCondition: fiscal?.tax_condition ?? null,
    }),
    vatDifferences: vatDifferences(vat),
    lines: controlLines,
  });
  if (control.errors.length > 0) throw new PurchaseError(control.errors.join('; '));

  const totals = computeSupplierInvoiceTotals({
    lines: amounts,
    vat,
    untaxed: input.untaxed,
    exempt: input.exempt,
    taxes: input.taxes,
  });

  const status: SupplierInvoiceStatus = control.observations.length > 0 ? 'OBSERVED' : 'CONFORMING';
  const header = {
    supplier_id: supplier.id,
    cbte_type: input.cbteType,
    sales_point: input.salesPoint,
    number: BigInt(input.number),
    issue_date: day(input.issueDate),
    due_date: input.dueDate ? day(input.dueDate) : null,
    vat_period: input.vatPeriod,
    cae: input.cae,
    cae_due_date: input.caeDueDate ? day(input.caeDueDate) : null,
    net_taxed: decimal(totals.netTaxed),
    net_untaxed: decimal(totals.netUntaxed),
    exempt: decimal(totals.exempt),
    vat_total: decimal(totals.vatTotal),
    vat_perceptions: decimal(totals.vatPerceptions),
    gross_income_perceptions: decimal(totals.grossIncomePerceptions),
    other_taxes: decimal(totals.otherTaxes),
    total: decimal(totals.total),
    related_invoice_id: input.relatedInvoiceId,
    status,
    observations: control.observations as Prisma.InputJsonValue,
    notes: input.notes,
  };
  const children = {
    lines: input.lines.map((line, i) => ({
      position: i + 1,
      order_line_id: line.kind === 'order' ? line.orderLineId : null,
      quantity: line.kind === 'order' ? decimal(line.quantity) : null,
      unit_price: line.kind === 'order' ? decimal(line.unitPrice) : null,
      expense_category_id: line.kind === 'expense' ? line.expenseCategoryId : null,
      description: line.kind === 'expense' ? line.description : null,
      vat_rate_id: amounts[i]!.vatRateId,
      net_total: decimal(amounts[i]!.netTotal),
      vat_amount: decimal(amounts[i]!.vatAmount),
    })),
    vat: vat.map((v) => ({ vat_rate_id: v.vatRateId, base: decimal(v.base), amount: decimal(v.amount) })),
    taxes: input.taxes.map((t) => ({
      kind: t.kind,
      province_id: t.provinceId ? BigInt(t.provinceId) : null,
      description: t.description,
      amount: decimal(t.amount),
    })),
  };
  return { header, children, label, status, observations: control.observations };
}
