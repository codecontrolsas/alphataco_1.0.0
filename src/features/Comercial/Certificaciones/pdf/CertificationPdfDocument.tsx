import { HeaderBlock, Kv, PDF_COLORS, basePdfStyles } from '@/shared/lib/pdf/pdf-layout';
import type { PdfLogo, ReactPdf } from '@/shared/lib/pdf/types';
import type { Styles } from '@react-pdf/renderer';
import 'server-only';
import type { CertificationPdfData } from './certification-pdf-data';

/**
 * PDF de la certificación. Mismo criterio que los PDF de Compras: react-pdf se carga fuera del
 * bundle y sus componentes llegan por parámetro; monocromo y Helvetica, importes a la derecha.
 * La base común (membrete, tabla, pie) está en `pdf-layout`.
 */

const C = PDF_COLORS;

const s = {
  ...basePdfStyles,
  headerRight: { width: 190, alignItems: 'flex-end' },
  // A 13 pt "CERTIFICACIÓN DE SERVICIOS" no entra en una línea y react-pdf la corta con guion.
  title: { ...basePdfStyles.title, fontSize: 12 },
  kvLabel: { width: 70, color: C.muted },
  boxes: { flexDirection: 'row', marginBottom: 10 },
  card: { flex: 1, borderWidth: 1, borderColor: C.rule, padding: 6 },
  boxGap: { width: 8 },
  notice: { borderWidth: 1, borderColor: C.ink, padding: 6, marginBottom: 10 },
  colPos: { width: 20 },
  colItem: { flex: 1.2 },
  colDesc: { flex: 1.6 },
  colQty: { width: 62, textAlign: 'right' },
  colPrice: { width: 72, textAlign: 'right' },
  colAmount: { width: 80, textAlign: 'right' },
  empty: { paddingVertical: 8, textAlign: 'center', color: C.muted },
  totals: { alignSelf: 'flex-end', width: 220, marginTop: 8 },
  grandTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: C.ink,
    paddingTop: 3,
  },
  notes: { borderWidth: 1, borderColor: C.rule, padding: 6, marginTop: 10 },
  signatures: { flexDirection: 'row', marginTop: 36 },
  signature: { flex: 1, borderWidth: 1, borderColor: C.rule, padding: 6 },
  signatureLine: { marginTop: 22, borderTopWidth: 0.5, borderTopColor: C.ink, paddingTop: 2, color: C.muted },
} satisfies Styles;

function SignatureBox(rp: ReactPdf, title: string) {
  const { View, Text } = rp;
  return (
    <View style={s.signature}>
      <Text style={s.boxTitle}>{title}</Text>
      <Text style={s.signatureLine}>Firma</Text>
      <Text style={s.signatureLine}>Aclaración</Text>
      <Text style={s.signatureLine}>Fecha</Text>
    </View>
  );
}

export function CertificationPdfDocument(rp: ReactPdf, data: CertificationPdfData, logo: PdfLogo) {
  const { Document, Page, View, Text } = rp;
  return (
    <Document title={data.number} author={data.company.name}>
      <Page size="A4" style={s.page}>
        {data.watermark ? (
          <Text style={s.watermark} fixed>
            {data.watermark}
          </Text>
        ) : null}

        {HeaderBlock(rp, s, data, logo)}

        {data.voided ? (
          <View style={s.notice}>
            <Text style={s.bold}>CERTIFICACIÓN ANULADA{data.voided.date ? ` EL ${data.voided.date}` : ''}</Text>
            {data.voided.reason ? <Text>Motivo: {data.voided.reason}</Text> : null}
          </View>
        ) : null}
        {data.draftNotice ? (
          <View style={s.notice}>
            <Text>{data.draftNotice}</Text>
          </View>
        ) : null}

        <View style={s.boxes}>
          <View style={s.card}>
            <Text style={s.boxTitle}>CLIENTE</Text>
            <Text style={s.bold}>{data.customer.name}</Text>
            <Text>CUIT {data.customer.cuit}</Text>
            {data.customer.address ? <Text style={s.muted}>{data.customer.address}</Text> : null}
          </View>
          <View style={s.boxGap} />
          <View style={s.card}>
            <Text style={s.boxTitle}>CONTRATO</Text>
            {Kv(rp, s, 'Servicio', data.contract.name)}
            {data.contract.number ? Kv(rp, s, 'N° de contrato', data.contract.number) : null}
            {Kv(rp, s, 'Período', data.period)}
            {Kv(rp, s, 'Moneda', data.currency)}
            {Kv(rp, s, 'Estado', data.status)}
          </View>
        </View>

        <View style={s.tableHead}>
          <Text style={[s.th, s.colPos]}>#</Text>
          <Text style={[s.th, s.colItem]}>Ítem</Text>
          <Text style={[s.th, s.colDesc]}>Descripción</Text>
          <Text style={[s.th, s.colQty]}>Cantidad</Text>
          {data.showPrices ? <Text style={[s.th, s.colPrice]}>Unitario ({data.currency})</Text> : null}
          {data.showPrices ? <Text style={[s.th, s.colAmount]}>Importe ({data.currency})</Text> : null}
        </View>
        {data.lines.length === 0 ? <Text style={s.empty}>Sin líneas.</Text> : null}
        {data.lines.map((line) => (
          <View key={line.position} style={s.tableRow} wrap={false}>
            <Text style={[s.td, s.colPos]}>{line.position}</Text>
            <Text style={[s.td, s.colItem]}>{line.item}</Text>
            <Text style={[s.td, s.colDesc]}>{line.description}</Text>
            <Text style={[s.td, s.colQty]}>{line.quantity}</Text>
            {data.showPrices ? <Text style={[s.td, s.colPrice]}>{line.unitPrice}</Text> : null}
            {data.showPrices ? <Text style={[s.td, s.colAmount]}>{line.amount}</Text> : null}
          </View>
        ))}

        {data.total ? (
          <View style={s.totals} wrap={false}>
            <View style={s.grandTotal}>
              <Text style={s.bold}>Total</Text>
              <Text style={s.bold}>{data.total}</Text>
            </View>
          </View>
        ) : null}

        {data.notes ? (
          <View style={s.notes} wrap={false}>
            <Text style={s.boxTitle}>OBSERVACIONES</Text>
            <Text>{data.notes}</Text>
          </View>
        ) : null}

        <View style={s.signatures} wrap={false}>
          {SignatureBox(rp, 'POR LA EMPRESA')}
          <View style={s.boxGap} />
          {SignatureBox(rp, 'CONFORMIDAD DEL CLIENTE')}
        </View>

        <Text
          style={s.footer}
          fixed
          render={({ pageNumber, totalPages }) => `${data.number} · Página ${pageNumber} de ${totalPages}`}
        />
      </Page>
    </Document>
  );
}
