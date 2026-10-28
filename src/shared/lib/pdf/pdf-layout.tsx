import type { Styles } from '@react-pdf/renderer';
import 'server-only';
import type { PdfLogo, ReactPdf } from './types';

/**
 * Piezas de layout que comparten los PDF de Compras y Certificaciones: monocromo, Helvetica, A4,
 * importes a la derecha. Cada documento parte de `basePdfStyles` y pisa solo lo propio
 * (`{ ...basePdfStyles, headerRight: {...}, colItem: {...} }`).
 */

export const PDF_COLORS = { ink: '#111111', muted: '#555555', rule: '#999999', band: '#EEEEEE' };

const C = PDF_COLORS;

export const basePdfStyles = {
  page: {
    paddingTop: 28,
    paddingBottom: 44,
    paddingHorizontal: 32,
    fontFamily: 'Helvetica',
    fontSize: 8,
    color: C.ink,
  },
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
  // Ancho y alto fijos en puntos: con porcentajes react-pdf estira la imagen.
  logo: { width: 90, height: 36, objectFit: 'contain', marginRight: 10 },
  companyName: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  headerRight: { width: 170, alignItems: 'flex-end' },
  title: { fontSize: 13, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  muted: { color: C.muted },
  bold: { fontFamily: 'Helvetica-Bold' },
  box: { borderWidth: 1, borderColor: C.rule, padding: 6, marginBottom: 10 },
  boxTitle: { fontSize: 7, color: C.muted, marginBottom: 3, fontFamily: 'Helvetica-Bold' },
  tableHead: {
    flexDirection: 'row',
    backgroundColor: C.band,
    borderBottomWidth: 1,
    borderBottomColor: C.ink,
    paddingVertical: 3,
  },
  tableRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: C.rule, paddingVertical: 3 },
  th: { fontFamily: 'Helvetica-Bold', fontSize: 7, paddingHorizontal: 3 },
  td: { paddingHorizontal: 3 },
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
    borderTopColor: C.ink,
    paddingTop: 3,
    marginTop: 2,
  },
  kv: { flexDirection: 'row', marginBottom: 2 },
  kvLabel: { width: 95, color: C.muted },
  kvValue: { flex: 1 },
  footer: { position: 'absolute', bottom: 20, left: 32, right: 32, textAlign: 'center', fontSize: 7, color: C.muted },
} satisfies Styles;

type PdfStyle = Styles[string];

type HeaderStyles = Record<
  'header' | 'headerLeft' | 'logo' | 'companyName' | 'headerRight' | 'title' | 'muted' | 'bold',
  PdfStyle
>;

export type PdfHeader = {
  company: { name: string; cuit: string; address: string | null };
  title: string;
  number: string;
  date: string;
  /** Rótulo de la fecha; por defecto "Fecha". */
  dateLabel?: string;
};

/** Membrete: logo y empresa a la izquierda; título, número y fecha del documento a la derecha. */
export function HeaderBlock(rp: ReactPdf, s: HeaderStyles, data: PdfHeader, logo: PdfLogo) {
  const { View, Text, Image } = rp;
  return (
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
        <Text>
          {data.dateLabel ?? 'Fecha'}: {data.date}
        </Text>
      </View>
    </View>
  );
}

/**
 * Bloque de FIRMA ELECTRÓNICA para los PDF que arma el servidor: quién firmó, cuándo (hora del servidor), cómo y
 * desde dónde. Es la versión de servidor de `PdfSignature` (Formularios), que es un componente de cliente con su propia
 * hoja de estilos y una imagen de trazo: acá no hay trazo, la firma es la identidad autenticada y su registro.
 */
export function ElectronicSignatureBlock(
  rp: ReactPdf,
  s: Record<'box' | 'boxTitle' | 'bold' | 'muted', PdfStyle>,
  data: { title: string; signer: string; lines: string[] }
) {
  const { View, Text } = rp;
  return (
    <View style={[s.box, { flex: 1, marginBottom: 0 }]} wrap={false}>
      <Text style={s.boxTitle}>{data.title}</Text>
      <Text style={s.bold}>{data.signer}</Text>
      {data.lines.map((line) => (
        <Text key={line} style={s.muted}>
          {line}
        </Text>
      ))}
    </View>
  );
}

/** Fila "rótulo — valor" de los recuadros de datos. */
export function Kv(rp: ReactPdf, s: Record<'kv' | 'kvLabel' | 'kvValue', PdfStyle>, label: string, value: string) {
  const { View, Text } = rp;
  return (
    <View style={s.kv}>
      <Text style={s.kvLabel}>{label}</Text>
      <Text style={s.kvValue}>{value}</Text>
    </View>
  );
}

type PartyStyles = Record<'box' | 'boxTitle' | 'bold' | 'muted', PdfStyle>;

/** Recuadro con los datos de la contraparte (proveedor, cliente): nombre, CUIT, condición de IVA y domicilio. */
export function PartyBox(
  rp: ReactPdf,
  s: PartyStyles,
  title: string,
  party: { name: string; cuit: string; vatCondition: string | null; address: string | null }
) {
  const { View, Text } = rp;
  return (
    <View style={s.box}>
      <Text style={s.boxTitle}>{title}</Text>
      <Text style={s.bold}>{party.name}</Text>
      <Text>
        CUIT {party.cuit}
        {party.vatCondition ? ` · ${party.vatCondition}` : ''}
      </Text>
      {party.address ? <Text style={s.muted}>{party.address}</Text> : null}
    </View>
  );
}

type TableStyles = Record<
  'sectionTitle' | 'tableHead' | 'tableRow' | 'th' | 'td' | 'colMain' | 'colMid' | 'colAmount',
  PdfStyle
>;

/** Tabla "Impuesto / Certificado / Importe" de las retenciones; no dibuja nada si no hay filas. */
export function WithholdingsTable(
  rp: ReactPdf,
  s: TableStyles,
  title: string,
  rows: { tax: string; certificate: string; amount: string }[]
) {
  const { View, Text } = rp;
  if (rows.length === 0) return null;
  return (
    <>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.tableHead}>
        <Text style={[s.th, s.colMain]}>Impuesto</Text>
        <Text style={[s.th, s.colMid]}>Certificado</Text>
        <Text style={[s.th, s.colAmount]}>Importe</Text>
      </View>
      {rows.map((w, i) => (
        <View key={i} style={s.tableRow} wrap={false}>
          <Text style={[s.td, s.colMain]}>{w.tax}</Text>
          <Text style={[s.td, s.colMid]}>{w.certificate}</Text>
          <Text style={[s.td, s.colAmount]}>{w.amount}</Text>
        </View>
      ))}
    </>
  );
}

/** Medios de pago o de cobro (método, detalle e importe); no dibuja nada si no hay filas. */
export function PaymentMethodsList(
  rp: ReactPdf,
  s: TableStyles,
  title: string,
  rows: { method: string; detail: string; amount: string }[]
) {
  const { View, Text } = rp;
  if (rows.length === 0) return null;
  return (
    <>
      <Text style={s.sectionTitle}>{title}</Text>
      {rows.map((p, i) => (
        <View key={i} style={s.tableRow} wrap={false}>
          <Text style={[s.td, s.colMid]}>{p.method}</Text>
          <Text style={[s.td, s.colMain]}>{p.detail}</Text>
          <Text style={[s.td, s.colAmount]}>{p.amount}</Text>
        </View>
      ))}
    </>
  );
}

/** Línea de totales "rótulo … importe"; `strong` la dibuja como total final (con filete y negrita). */
export function TotalLine(
  rp: ReactPdf,
  s: Record<'totalRow' | 'grandTotal' | 'bold', PdfStyle>,
  label: string,
  value: string,
  strong = false
) {
  const { View, Text } = rp;
  return (
    <View style={strong ? s.grandTotal : s.totalRow}>
      <Text style={strong ? s.bold : undefined}>{label}</Text>
      <Text style={strong ? s.bold : undefined}>{value}</Text>
    </View>
  );
}
