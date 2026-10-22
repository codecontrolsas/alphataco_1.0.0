import {
  HeaderBlock,
  PDF_COLORS,
  PartyBox,
  PaymentMethodsList,
  TotalLine,
  WithholdingsTable,
  basePdfStyles,
} from '@/shared/lib/pdf/pdf-layout';
import type { PdfLogo, ReactPdf } from '@/shared/lib/pdf/types';
import type { Styles } from '@react-pdf/renderer';
import 'server-only';
import type { ReceiptPdfData } from './receipt-pdf-data';

/**
 * PDF del recibo de cobranza (spec Tesorería etapa 2 §3.5). Mismo criterio que los PDF de Compras:
 * monocromo, Helvetica, montos a la derecha; react-pdf llega por parámetro.
 */

const s = {
  ...basePdfStyles,
  headerRight: { width: 190, alignItems: 'flex-end' },
  colMid: { width: 150 },
  totals: { alignSelf: 'flex-end', width: 260, marginTop: 8 },
  note: { marginTop: 8, color: PDF_COLORS.muted },
} satisfies Styles;

export function ReceiptPdfDocument(rp: ReactPdf, data: ReceiptPdfData, logo: PdfLogo) {
  const { Document, Page, View, Text } = rp;
  return (
    <Document title={`Recibo ${data.number}`}>
      <Page size="A4" style={s.page}>
        {data.watermark ? (
          <Text style={s.watermark} fixed>
            {data.watermark}
          </Text>
        ) : null}
        {HeaderBlock(rp, s, { company: data.company, title: data.title, number: data.number, date: data.date }, logo)}

        {PartyBox(rp, s, 'RECIBIMOS DE', data.customer)}

        <Text style={s.sectionTitle}>En concepto de</Text>
        <View style={s.tableHead}>
          <Text style={[s.th, s.colMain]}>Concepto</Text>
          <Text style={[s.th, s.colMid]}>Moneda de origen</Text>
          <Text style={[s.th, s.colAmount]}>Importe</Text>
        </View>
        {data.lines.map((line, i) => (
          <View key={i} style={s.tableRow} wrap={false}>
            <Text style={[s.td, s.colMain]}>{line.concept}</Text>
            <Text style={[s.td, s.colMid]}>{line.detail ?? ''}</Text>
            <Text style={[s.td, s.colAmount]}>{line.amount}</Text>
          </View>
        ))}

        {WithholdingsTable(rp, s, 'Retenciones sufridas', data.withholdings)}

        {PaymentMethodsList(rp, s, 'Medios', data.payments)}

        <View style={s.totals}>
          {TotalLine(rp, s, 'Comprobantes', data.totals.invoices)}
          {data.totals.hasAdvance ? TotalLine(rp, s, 'Cobrado a cuenta', data.totals.advance) : null}
          {data.totals.hasAdvancesApplied
            ? TotalLine(rp, s, 'Anticipos aplicados', `-${data.totals.advancesApplied}`)
            : null}
          {data.totals.hasWithholdings ? TotalLine(rp, s, 'Retenciones', `-${data.totals.withholdings}`) : null}
          {TotalLine(rp, s, 'Total recibido', data.totals.received, true)}
        </View>

        {data.fxNote ? <Text style={s.note}>{data.fxNote}</Text> : null}
        {data.notes ? (
          <View style={[s.box, { marginTop: 10 }]}>
            <Text style={s.boxTitle}>OBSERVACIONES</Text>
            <Text>{data.notes}</Text>
          </View>
        ) : null}
        <Text
          style={s.footer}
          fixed
          render={({ pageNumber, totalPages }) => `Recibo ${data.number} · Página ${pageNumber} de ${totalPages}`}
        />
      </Page>
    </Document>
  );
}
