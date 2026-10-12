import 'server-only';
import type { PdfLogo, ReactPdf } from '@/features/Purchases/pdf/PurchasePdfDocuments';
import type { Styles } from '@react-pdf/renderer';
import type { ReceiptPdfData } from './receipt-pdf-data';

/**
 * PDF del recibo de cobranza (spec Tesorería etapa 2 §3.5). Mismo criterio que los PDF de Compras:
 * monocromo, Helvetica, montos a la derecha; react-pdf llega por parámetro.
 */

const C = { ink: '#111111', muted: '#555555', rule: '#999999', band: '#EEEEEE' };

const s = {
  page: { paddingTop: 28, paddingBottom: 44, paddingHorizontal: 32, fontFamily: 'Helvetica', fontSize: 8, color: C.ink },
  watermark: {
    position: 'absolute',
    top: 380,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 40,
    color: '#DDDDDD',
    fontFamily: 'Helvetica-Bold',
    transform: 'rotate(-30deg)',
  },
  header: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.ink, paddingBottom: 8, marginBottom: 10 },
  headerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  logo: { width: 90, height: 36, objectFit: 'contain', marginRight: 10 },
  companyName: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  headerRight: { width: 190, alignItems: 'flex-end' },
  title: { fontSize: 13, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  muted: { color: C.muted },
  box: { borderWidth: 1, borderColor: C.rule, padding: 6, marginBottom: 10 },
  boxTitle: { fontSize: 7, color: C.muted, marginBottom: 3, fontFamily: 'Helvetica-Bold' },
  bold: { fontFamily: 'Helvetica-Bold' },
  sectionTitle: { fontFamily: 'Helvetica-Bold', fontSize: 9, marginTop: 6, marginBottom: 3 },
  tableHead: { flexDirection: 'row', backgroundColor: C.band, borderBottomWidth: 1, borderBottomColor: C.ink, paddingVertical: 3 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: C.rule, paddingVertical: 3 },
  th: { fontFamily: 'Helvetica-Bold', fontSize: 7, paddingHorizontal: 3 },
  td: { paddingHorizontal: 3 },
  colMain: { flex: 1 },
  colMid: { width: 150 },
  colAmount: { width: 90, textAlign: 'right' },
  totals: { alignSelf: 'flex-end', width: 260, marginTop: 8 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  grandTotal: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: C.ink, paddingTop: 3, marginTop: 2 },
  note: { marginTop: 8, color: C.muted },
  footer: { position: 'absolute', bottom: 20, left: 32, right: 32, textAlign: 'center', fontSize: 7, color: C.muted },
} satisfies Styles;

export function ReceiptPdfDocument(rp: ReactPdf, data: ReceiptPdfData, logo: PdfLogo) {
  const { Document, Page, View, Text, Image } = rp;
  return (
    <Document title={`Recibo ${data.number}`}>
      <Page size="A4" style={s.page}>
        {data.watermark ? (
          <Text style={s.watermark} fixed>
            {data.watermark}
          </Text>
        ) : null}
        <View style={s.header}>
          <View style={s.headerLeft}>
            {logo ? <Image style={s.logo} src={logo} /> : null}
            <View>
              <Text style={s.companyName}>{data.company.name}</Text>
              <Text>CUIT {data.company.cuit}</Text>
              {data.company.address ? <Text style={s.muted}>{data.company.address}</Text> : null}
            </View>
          </View>
          <View style={s.headerRight}>
            <Text style={s.title}>{data.title}</Text>
            <Text style={s.bold}>N° {data.number}</Text>
            <Text>Fecha: {data.date}</Text>
          </View>
        </View>

        <View style={s.box}>
          <Text style={s.boxTitle}>RECIBIMOS DE</Text>
          <Text style={s.bold}>{data.customer.name}</Text>
          <Text>
            CUIT {data.customer.cuit}
            {data.customer.vatCondition ? ` · ${data.customer.vatCondition}` : ''}
          </Text>
          {data.customer.address ? <Text style={s.muted}>{data.customer.address}</Text> : null}
        </View>

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

        {data.withholdings.length > 0 ? (
          <>
            <Text style={s.sectionTitle}>Retenciones sufridas</Text>
            <View style={s.tableHead}>
              <Text style={[s.th, s.colMain]}>Impuesto</Text>
              <Text style={[s.th, s.colMid]}>Certificado</Text>
              <Text style={[s.th, s.colAmount]}>Importe</Text>
            </View>
            {data.withholdings.map((w, i) => (
              <View key={i} style={s.tableRow} wrap={false}>
                <Text style={[s.td, s.colMain]}>{w.tax}</Text>
                <Text style={[s.td, s.colMid]}>{w.certificate}</Text>
                <Text style={[s.td, s.colAmount]}>{w.amount}</Text>
              </View>
            ))}
          </>
        ) : null}

        {data.payments.length > 0 ? (
          <>
            <Text style={s.sectionTitle}>Medios</Text>
            {data.payments.map((p, i) => (
              <View key={i} style={s.tableRow} wrap={false}>
                <Text style={[s.td, s.colMid]}>{p.method}</Text>
                <Text style={[s.td, s.colMain]}>{p.detail}</Text>
                <Text style={[s.td, s.colAmount]}>{p.amount}</Text>
              </View>
            ))}
          </>
        ) : null}

        <View style={s.totals}>
          <View style={s.totalRow}>
            <Text>Comprobantes</Text>
            <Text>{data.totals.invoices}</Text>
          </View>
          {data.totals.hasAdvance ? (
            <View style={s.totalRow}>
              <Text>Cobrado a cuenta</Text>
              <Text>{data.totals.advance}</Text>
            </View>
          ) : null}
          {data.totals.hasAdvancesApplied ? (
            <View style={s.totalRow}>
              <Text>Anticipos aplicados</Text>
              <Text>-{data.totals.advancesApplied}</Text>
            </View>
          ) : null}
          {data.totals.hasWithholdings ? (
            <View style={s.totalRow}>
              <Text>Retenciones</Text>
              <Text>-{data.totals.withholdings}</Text>
            </View>
          ) : null}
          <View style={s.grandTotal}>
            <Text style={s.bold}>Total recibido</Text>
            <Text style={s.bold}>{data.totals.received}</Text>
          </View>
        </View>

        {data.fxNote ? <Text style={s.note}>{data.fxNote}</Text> : null}
        {data.notes ? (
          <View style={[s.box, { marginTop: 10 }]}>
            <Text style={s.boxTitle}>OBSERVACIONES</Text>
            <Text>{data.notes}</Text>
          </View>
        ) : null}
        <Text style={s.footer} fixed render={({ pageNumber, totalPages }) => `Recibo ${data.number} · Página ${pageNumber} de ${totalPages}`} />
      </Page>
    </Document>
  );
}
