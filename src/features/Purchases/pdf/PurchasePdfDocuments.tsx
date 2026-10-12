import { HeaderBlock, PDF_COLORS, basePdfStyles } from '@/shared/lib/pdf/pdf-layout';
import type { PdfLogo, ReactPdf } from '@/shared/lib/pdf/types';
import type { Styles } from '@react-pdf/renderer';
import 'server-only';
import type { OrderPdfData, QuotePdfData } from './purchase-pdf-data';

/**
 * PDF del pedido de cotizacion y de la orden de compra. Mismo criterio que el PDF fiscal
 * (`InvoicePdfDocument.tsx`): react-pdf se carga fuera del bundle y sus componentes llegan por
 * parametro; monocromo y Helvetica, montos a la derecha. La base comun esta en `pdf-layout`.
 */

const s = {
  ...basePdfStyles,
  paragraph: { marginBottom: 6 },
  colPos: { width: 22 },
  colItem: { flex: 1 },
  colQty: { width: 70, textAlign: 'right' },
  colPrice: { width: 75, textAlign: 'right' },
  colVat: { width: 40, textAlign: 'right' },
  colNet: { width: 80, textAlign: 'right' },
  totals: { alignSelf: 'flex-end', width: 220, marginTop: 8 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  grandTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: PDF_COLORS.ink,
    paddingTop: 3,
    marginTop: 2,
  },
} satisfies Styles;

function SupplierBlock(rp: ReactPdf, supplier: QuotePdfData['supplier']) {
  const { View, Text } = rp;
  return (
    <View style={s.box}>
      <Text style={s.boxTitle}>PROVEEDOR</Text>
      <Text style={s.bold}>{supplier.name}</Text>
      <Text>
        CUIT {supplier.cuit}
        {supplier.vatCondition ? ` · ${supplier.vatCondition}` : ''}
      </Text>
      {supplier.address ? <Text style={s.muted}>{supplier.address}</Text> : null}
    </View>
  );
}

export function PurchaseQuotePdfDocument(rp: ReactPdf, data: QuotePdfData, logo: PdfLogo) {
  const { Document, Page, View, Text } = rp;
  return (
    <Document title={data.number}>
      <Page size="A4" style={s.page}>
        {HeaderBlock(rp, s, data, logo)}
        {SupplierBlock(rp, data.supplier)}
        <Text style={s.paragraph}>{data.intro}</Text>
        <View style={s.tableHead}>
          <Text style={[s.th, s.colPos]}>#</Text>
          <Text style={[s.th, s.colItem]}>Ítem</Text>
          <Text style={[s.th, s.colQty]}>Cantidad</Text>
        </View>
        {data.lines.map((line) => (
          <View key={line.position} style={s.tableRow} wrap={false}>
            <Text style={[s.td, s.colPos]}>{line.position}</Text>
            <Text style={[s.td, s.colItem]}>{line.item}</Text>
            <Text style={[s.td, s.colQty]}>{line.quantity}</Text>
          </View>
        ))}
        <Text style={[s.paragraph, { marginTop: 10 }]}>{data.request}</Text>
        {data.notes ? (
          <View style={s.box}>
            <Text style={s.boxTitle}>OBSERVACIONES</Text>
            <Text>{data.notes}</Text>
          </View>
        ) : null}
        <Text
          style={s.footer}
          fixed
          render={({ pageNumber, totalPages }) => `${data.number} · Página ${pageNumber} de ${totalPages}`}
        />
      </Page>
    </Document>
  );
}

export function PurchaseOrderPdfDocument(rp: ReactPdf, data: OrderPdfData, logo: PdfLogo) {
  const { Document, Page, View, Text } = rp;
  return (
    <Document title={data.number}>
      <Page size="A4" style={s.page}>
        {data.watermark ? (
          <Text style={s.watermark} fixed>
            {data.watermark}
          </Text>
        ) : null}
        {HeaderBlock(rp, s, data, logo)}
        {SupplierBlock(rp, data.supplier)}
        <View style={s.tableHead}>
          <Text style={[s.th, s.colPos]}>#</Text>
          <Text style={[s.th, s.colItem]}>Ítem</Text>
          <Text style={[s.th, s.colQty]}>Cantidad</Text>
          <Text style={[s.th, s.colPrice]}>Unitario neto</Text>
          <Text style={[s.th, s.colVat]}>IVA</Text>
          <Text style={[s.th, s.colNet]}>Neto</Text>
        </View>
        {data.lines.map((line) => (
          <View key={line.position} style={s.tableRow} wrap={false}>
            <Text style={[s.td, s.colPos]}>{line.position}</Text>
            <Text style={[s.td, s.colItem]}>{line.item}</Text>
            <Text style={[s.td, s.colQty]}>{line.quantity}</Text>
            <Text style={[s.td, s.colPrice]}>{line.unitPrice}</Text>
            <Text style={[s.td, s.colVat]}>{line.vatRate}</Text>
            <Text style={[s.td, s.colNet]}>{line.netTotal}</Text>
          </View>
        ))}
        <View style={s.totals} wrap={false}>
          <View style={s.totalRow}>
            <Text>Subtotal neto</Text>
            <Text>{data.totals.subtotal}</Text>
          </View>
          <View style={s.totalRow}>
            <Text>IVA</Text>
            <Text>{data.totals.vatTotal}</Text>
          </View>
          <View style={s.grandTotal}>
            <Text style={s.bold}>Total</Text>
            <Text style={s.bold}>{data.totals.total}</Text>
          </View>
        </View>
        {data.conditions.length > 0 ? (
          <View style={[s.box, { marginTop: 10 }]} wrap={false}>
            <Text style={s.boxTitle}>CONDICIONES</Text>
            {data.conditions.map((condition) => (
              <View key={condition.label} style={s.kv}>
                <Text style={s.kvLabel}>{condition.label}</Text>
                <Text style={s.kvValue}>{condition.value}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {data.notes ? (
          <View style={s.box} wrap={false}>
            <Text style={s.boxTitle}>OBSERVACIONES</Text>
            <Text>{data.notes}</Text>
          </View>
        ) : null}
        <Text
          style={s.footer}
          fixed
          render={({ pageNumber, totalPages }) => `${data.number} · Página ${pageNumber} de ${totalPages}`}
        />
      </Page>
    </Document>
  );
}
