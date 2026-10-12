import { HeaderBlock, Kv, PDF_COLORS, basePdfStyles } from '@/shared/lib/pdf/pdf-layout';
import type { PdfLogo, ReactPdf } from '@/shared/lib/pdf/types';
import type { Styles } from '@react-pdf/renderer';
import 'server-only';
import type { PaymentPdfData } from './payment-pdf-data';

/**
 * PDF de la orden de pago y, a continuacion, un certificado por cada retencion numerada (spec
 * Compras etapa 5 §4). Mismo criterio que los PDF de Compras: monocromo, Helvetica, montos a la
 * derecha; react-pdf llega por parametro. La base comun esta en `pdf-layout`.
 */

const s = {
  ...basePdfStyles,
  headerRight: { width: 190, alignItems: 'flex-end' },
  sectionTitle: { fontFamily: 'Helvetica-Bold', fontSize: 9, marginTop: 6, marginBottom: 3 },
  colMain: { flex: 1 },
  colMid: { width: 120 },
  colAmount: { width: 90, textAlign: 'right' },
  totals: { alignSelf: 'flex-end', width: 240, marginTop: 8 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  grandTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: PDF_COLORS.ink,
    paddingTop: 3,
    marginTop: 2,
  },
  kv: { flexDirection: 'row', marginBottom: 3 },
  kvLabel: { width: 130, color: PDF_COLORS.muted },
  signature: {
    marginTop: 50,
    alignSelf: 'flex-end',
    width: 200,
    borderTopWidth: 0.5,
    borderTopColor: PDF_COLORS.ink,
    paddingTop: 3,
    textAlign: 'center',
  },
} satisfies Styles;

function Header(rp: ReactPdf, data: PaymentPdfData, logo: PdfLogo, title: string, number: string) {
  return HeaderBlock(rp, s, { company: data.company, title, number, date: data.date }, logo);
}

export function PaymentOrderPdfDocument(rp: ReactPdf, data: PaymentPdfData, logo: PdfLogo) {
  const { Document, Page, View, Text } = rp;
  return (
    <Document title={data.number}>
      <Page size="A4" style={s.page}>
        {data.watermark ? (
          <Text style={s.watermark} fixed>
            {data.watermark}
          </Text>
        ) : null}
        {Header(rp, data, logo, data.title, data.number)}
        <View style={s.box}>
          <Text style={s.boxTitle}>PROVEEDOR</Text>
          <Text style={s.bold}>{data.supplier.name}</Text>
          <Text>
            CUIT {data.supplier.cuit}
            {data.supplier.vatCondition ? ` · ${data.supplier.vatCondition}` : ''}
          </Text>
          {data.supplier.address ? <Text style={s.muted}>{data.supplier.address}</Text> : null}
        </View>

        <Text style={s.sectionTitle}>Qué se paga</Text>
        <View style={s.tableHead}>
          <Text style={[s.th, s.colMain]}>Concepto</Text>
          <Text style={[s.th, s.colAmount]}>Importe</Text>
        </View>
        {data.lines.map((line, i) => (
          <View key={i} style={s.tableRow} wrap={false}>
            <Text style={[s.td, s.colMain]}>{line.concept}</Text>
            <Text style={[s.td, s.colAmount]}>{line.amount}</Text>
          </View>
        ))}

        {data.withholdings.length > 0 ? (
          <>
            <Text style={s.sectionTitle}>Retenciones</Text>
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

        <View style={s.totals}>
          <View style={s.totalRow}>
            <Text>Comprobantes</Text>
            <Text>{data.totals.invoices}</Text>
          </View>
          {data.totals.hasAdvance ? (
            <View style={s.totalRow}>
              <Text>Anticipo</Text>
              <Text>{data.totals.advance}</Text>
            </View>
          ) : null}
          {data.totals.hasCredits ? (
            <View style={s.totalRow}>
              <Text>Notas de crédito y anticipos aplicados</Text>
              <Text>-{data.totals.credits}</Text>
            </View>
          ) : null}
          <View style={s.totalRow}>
            <Text>Retenciones</Text>
            <Text>-{data.totals.withholdings}</Text>
          </View>
          <View style={s.grandTotal}>
            <Text style={s.bold}>Neto pagado</Text>
            <Text style={s.bold}>{data.totals.net}</Text>
          </View>
        </View>

        {data.payments.length > 0 ? (
          <>
            <Text style={s.sectionTitle}>Medios de pago</Text>
            {data.payments.map((p, i) => (
              <View key={i} style={s.tableRow} wrap={false}>
                <Text style={[s.td, s.colMid]}>{p.method}</Text>
                <Text style={[s.td, s.colMain]}>{p.detail}</Text>
                <Text style={[s.td, s.colAmount]}>{p.amount}</Text>
              </View>
            ))}
          </>
        ) : null}

        {data.notes ? (
          <View style={[s.box, { marginTop: 10 }]}>
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

      {data.certificates.map((c) => (
        <Page key={c.number} size="A4" style={s.page}>
          {c.cancelled ? (
            <Text style={s.watermark} fixed>
              ANULADO
            </Text>
          ) : null}
          {Header(rp, data, logo, 'CERTIFICADO DE RETENCIÓN', c.number)}
          <View style={s.box}>
            <Text style={s.boxTitle}>AGENTE DE RETENCIÓN</Text>
            <Text style={s.bold}>{c.agent.name}</Text>
            <Text>CUIT {c.agent.cuit}</Text>
            {c.agent.grossIncomeNumber ? <Text>Ingresos Brutos N° {c.agent.grossIncomeNumber}</Text> : null}
            {c.agent.address ? <Text style={s.muted}>{c.agent.address}</Text> : null}
          </View>
          <View style={s.box}>
            <Text style={s.boxTitle}>SUJETO RETENIDO</Text>
            <Text style={s.bold}>{c.subject.name}</Text>
            <Text>
              CUIT {c.subject.cuit}
              {c.subject.vatCondition ? ` · ${c.subject.vatCondition}` : ''}
            </Text>
            {c.subject.address ? <Text style={s.muted}>{c.subject.address}</Text> : null}
          </View>
          <View style={s.box}>
            <Text style={s.boxTitle}>RETENCIÓN</Text>
            {Kv(rp, s, 'Impuesto', c.tax)}
            {Kv(rp, s, 'Régimen', c.regime)}
            {Kv(rp, s, 'Fecha', c.date)}
            {Kv(rp, s, 'Orden de pago', c.orderNumber)}
            {Kv(rp, s, 'Base de cálculo', c.base)}
            {Kv(rp, s, 'Alícuota', c.rate)}
            {Kv(rp, s, 'Importe retenido', c.amount)}
          </View>
          <Text style={s.signature}>Firma y aclaración del agente de retención</Text>
          <Text style={s.footer} fixed>
            {c.number} · {data.number}
          </Text>
        </Page>
      ))}
    </Document>
  );
}
