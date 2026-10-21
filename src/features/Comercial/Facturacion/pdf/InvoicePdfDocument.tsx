import 'server-only';
import type { Styles } from '@react-pdf/renderer';
import QRCode from 'qrcode';
import type { InvoicePdfData } from './invoice-pdf-data';

/**
 * react-pdf se carga FUERA del bundle (ver `render-invoice-pdf.server.ts`): con el React de
 * servidor (`react-server`) su reconciler falla. Por eso los componentes llegan por parámetro y
 * acá solo se importan tipos.
 */
export type ReactPdf = Pick<
  typeof import('@react-pdf/renderer'),
  'Document' | 'Page' | 'Path' | 'Svg' | 'Text' | 'View' | 'renderToBuffer'
>;

/**
 * PDF fiscal (Factura / NC / ND, A, B y C). Se genera en el servidor al autorizar y se guarda en
 * RustFS: es el documento que se entrega, no se regenera con otros datos.
 *
 * Monocromo y Helvetica (sin `Font.register`: el tracing del standalone no copiaría archivos).
 * Montos alineados a la derecha. El QR es vectorial (un único `Path`), nunca un PNG.
 */

const MARGIN_X = 32;
const C = { ink: '#111111', muted: '#555555', rule: '#999999', faint: '#BBBBBB' };

const s = {
  page: { paddingTop: 28, paddingBottom: 44, paddingHorizontal: MARGIN_X, fontFamily: 'Helvetica', fontSize: 8, color: C.ink },
  original: { textAlign: 'center', fontSize: 7, letterSpacing: 2, marginBottom: 4, fontFamily: 'Helvetica-Bold' },
  banner: { borderWidth: 1, borderColor: C.ink, padding: 3, marginBottom: 6, textAlign: 'center', fontSize: 7, fontFamily: 'Helvetica-Bold' },
  watermark: {
    position: 'absolute',
    top: 400,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 24,
    color: '#DDDDDD',
    fontFamily: 'Helvetica-Bold',
    transform: 'rotate(-30deg)',
  },
  header: { flexDirection: 'row', borderWidth: 1, borderColor: C.ink },
  headerCol: { flex: 1, padding: 8 },
  headerRight: { flex: 1, padding: 8, borderLeftWidth: 1, borderLeftColor: C.ink },
  letterBox: {
    position: 'absolute',
    top: -1,
    left: '50%',
    marginLeft: -20,
    width: 40,
    height: 42,
    borderWidth: 1.5,
    borderColor: C.ink,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: { fontSize: 24, fontFamily: 'Helvetica-Bold', lineHeight: 1 },
  code: { fontSize: 6, marginTop: 1 },
  issuerName: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginBottom: 4, marginTop: 30, paddingRight: 24 },
  title: { fontSize: 13, fontFamily: 'Helvetica-Bold', marginBottom: 6, paddingLeft: 24 },
  kv: { flexDirection: 'row', marginBottom: 2 },
  label: { color: C.muted, fontSize: 7, marginRight: 4 },
  // `flex: 1` + `flexShrink`: un valor largo (domicilio) hace salto de línea en vez de desbordar.
  value: { fontSize: 8, flex: 1, flexShrink: 1 },
  valueTight: { fontSize: 8 },
  bold: { fontFamily: 'Helvetica-Bold' },
  box: { borderWidth: 1, borderColor: C.ink, borderTopWidth: 0, padding: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { flexDirection: 'row', marginRight: 14, marginBottom: 2 },
  table: { marginTop: 8 },
  thead: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.ink, paddingBottom: 3, marginBottom: 2 },
  tr: { flexDirection: 'row', paddingVertical: 2.5, borderBottomWidth: 0.5, borderBottomColor: C.faint },
  th: { fontSize: 6.5, color: C.muted, fontFamily: 'Helvetica-Bold' },
  cDesc: { flex: 1, paddingRight: 6 },
  cQty: { width: 50, textAlign: 'right' },
  cPrice: { width: 70, textAlign: 'right' },
  cVat: { width: 36, textAlign: 'right' },
  cSub: { width: 80, textAlign: 'right' },
  bottom: { flexDirection: 'row', marginTop: 10 },
  notes: { flex: 1, paddingRight: 16 },
  totals: { width: 230 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  grandTotal: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: C.ink, paddingTop: 4, marginTop: 2 },
  grandLabel: { fontSize: 10, fontFamily: 'Helvetica-Bold' },
  grandValue: { fontSize: 13, fontFamily: 'Helvetica-Bold' },
  cae: { flexDirection: 'row', alignItems: 'center', marginTop: 14, borderTopWidth: 1, borderTopColor: C.ink, paddingTop: 8 },
  caeText: { flex: 1, paddingLeft: 10 },
  caeRight: { width: 200, alignItems: 'flex-end' },
  footer: { position: 'absolute', bottom: 18, left: MARGIN_X, right: MARGIN_X, flexDirection: 'row', justifyContent: 'space-between', fontSize: 6.5, color: C.muted },
} satisfies Styles;

/** Path de la matriz del QR, con zona de silencio de 4 módulos. */
function qrPath(url: string): { d: string; size: number } {
  const qr = QRCode.create(url, { errorCorrectionLevel: 'M' });
  const count = qr.modules.size;
  const quiet = 4;
  let d = '';
  for (let y = 0; y < count; y++) {
    for (let x = 0; x < count; x++) {
      if (qr.modules.get(x, y)) d += `M${x + quiet} ${y + quiet}h1v1h-1z`;
    }
  }
  return { d, size: count + quiet * 2 };
}

export function InvoicePdfDocument(rp: ReactPdf, data: InvoicePdfData) {
  const { Document, Page, Path, Svg, Text, View } = rp;
  const qr = qrPath(data.qrUrl);

  // `grow`: el valor ocupa el resto de la fila y hace salto de línea. Sin `grow` (bloques
  // alineados a la derecha, como el CAE) el valor mide lo que mide su texto.
  const KV = ({ label, value, bold, grow = true }: { label: string; value: string; bold?: boolean; grow?: boolean }) => {
    const valueStyle = grow ? s.value : s.valueTight;
    return (
      <View style={s.kv}>
        <Text style={s.label}>{label}</Text>
        <Text style={bold ? [valueStyle, s.bold] : valueStyle}>{value}</Text>
      </View>
    );
  };

  return (
    <Document title={data.voucherLabel} author={data.issuer.name} creator="alphataco">
      <Page size="A4" style={s.page}>
        {data.watermark ? (
          <Text style={s.watermark} fixed>
            {data.watermark}
          </Text>
        ) : null}
        <Text style={s.original}>ORIGINAL</Text>
        {data.watermark ? <Text style={s.banner}>{data.watermark}</Text> : null}

        {/* Encabezado: emisor | comprobante, con el recuadro de la letra al centro */}
        <View style={s.header}>
          <View style={s.headerCol}>
            <Text style={s.issuerName}>{data.issuer.name}</Text>
            <KV label="Domicilio comercial:" value={data.issuer.address} />
            <KV label="Condición frente al IVA:" value={data.issuer.taxCondition} bold />
          </View>
          <View style={s.headerRight}>
            <Text style={s.title}>{data.title}</Text>
            <View style={{ paddingLeft: 24 }}>
              <KV label="Punto de venta:" value={data.salesPoint} bold />
              <KV label="Comp. Nro:" value={data.number} bold />
              <KV label="Fecha de emisión:" value={data.issueDate} bold />
              <KV label="CUIT:" value={data.issuer.cuit} />
              <KV label="Ingresos Brutos:" value={data.issuer.grossIncome} />
              <KV label="Inicio de actividades:" value={data.issuer.activityStart} />
            </View>
          </View>
          <View style={s.letterBox}>
            <Text style={s.letter}>{data.letter}</Text>
            <Text style={s.code}>COD. {data.code}</Text>
          </View>
        </View>

        {data.period ? (
          <View style={[s.box, s.row]}>
            <View style={s.cell}>
              <Text style={s.label}>Período facturado desde:</Text>
              <Text style={s.bold}>{data.period.from}</Text>
            </View>
            <View style={s.cell}>
              <Text style={s.label}>Hasta:</Text>
              <Text style={s.bold}>{data.period.to}</Text>
            </View>
            <View style={s.cell}>
              <Text style={s.label}>Fecha de vto. para el pago:</Text>
              <Text style={s.bold}>{data.period.due}</Text>
            </View>
          </View>
        ) : null}

        {/* Receptor */}
        <View style={s.box}>
          <View style={s.row}>
            <View style={s.cell}>
              <Text style={s.label}>CUIT:</Text>
              <Text style={s.bold}>{data.receiver.cuit}</Text>
            </View>
            <View style={s.cell}>
              <Text style={s.label}>Apellido y nombre / Razón social:</Text>
              <Text style={s.bold}>{data.receiver.name}</Text>
            </View>
          </View>
          <View style={s.row}>
            <View style={s.cell}>
              <Text style={s.label}>Condición frente al IVA:</Text>
              <Text>{data.receiver.taxCondition}</Text>
            </View>
            <View style={s.cell}>
              <Text style={s.label}>Domicilio:</Text>
              <Text>{data.receiver.address}</Text>
            </View>
          </View>
          {data.associated ? (
            <View style={s.cell}>
              <Text style={s.label}>Comprobante asociado:</Text>
              <Text style={s.bold}>{data.associated}</Text>
            </View>
          ) : null}
        </View>

        {/* Líneas: el encabezado se repite en cada página */}
        <View style={s.table}>
          <View style={s.thead} fixed>
            <Text style={[s.th, s.cDesc]}>Descripción</Text>
            <Text style={[s.th, s.cQty]}>Cantidad</Text>
            <Text style={[s.th, s.cPrice]}>Precio unit.</Text>
            {data.discriminatesVat ? <Text style={[s.th, s.cVat]}>IVA</Text> : null}
            <Text style={[s.th, s.cSub]}>Subtotal</Text>
          </View>
          {data.lines.map((line, index) => (
            <View key={index} style={s.tr} wrap={false}>
              <Text style={s.cDesc}>{line.description}</Text>
              <Text style={s.cQty}>{line.quantity}</Text>
              <Text style={s.cPrice}>{line.unitPrice}</Text>
              {data.discriminatesVat ? <Text style={s.cVat}>{line.vat ?? ''}</Text> : null}
              <Text style={s.cSub}>{line.subtotal}</Text>
            </View>
          ))}
        </View>

        {/* Totales, QR y CAE: solo al final */}
        <View wrap={false}>
          <View style={s.bottom}>
            <View style={s.notes}>
              {data.notes ? (
                <>
                  <Text style={s.label}>Observaciones</Text>
                  <Text>{data.notes}</Text>
                </>
              ) : null}
              {data.exchange ? <Text style={{ marginTop: 6 }}>{data.exchange}</Text> : null}
            </View>
            <View style={s.totals}>
              {data.totals.map((t) => (
                <View key={t.label} style={s.totalRow}>
                  <Text style={s.label}>{t.label}:</Text>
                  <Text>{t.value}</Text>
                </View>
              ))}
              <View style={s.grandTotal}>
                <Text style={s.grandLabel}>Importe total:</Text>
                <Text style={s.grandValue}>{data.total}</Text>
              </View>
              {data.vatContained ? (
                <Text style={{ marginTop: 6, fontSize: 6.5, color: C.muted }}>
                  Régimen de Transparencia Fiscal al Consumidor (Ley 27.743) — IVA contenido: {data.vatContained}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={s.cae}>
            <Svg width={80} height={80} viewBox={`0 0 ${qr.size} ${qr.size}`}>
              <Path d={qr.d} fill={C.ink} />
            </Svg>
            <View style={s.caeText}>
              <Text style={s.bold}>Comprobante autorizado</Text>
              <Text style={{ color: C.muted, marginTop: 2 }}>Este comprobante puede verificarse en el sitio de ARCA escaneando el código QR.</Text>
            </View>
            <View style={s.caeRight}>
              <KV label="CAE N°:" value={data.cae} bold grow={false} />
              <KV label="Fecha de vto. de CAE:" value={data.caeDueDate} bold grow={false} />
            </View>
          </View>
        </View>

        <View style={s.footer} fixed>
          <Text>{data.voucherLabel}</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
