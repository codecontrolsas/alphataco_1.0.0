import { StyleSheet } from '@react-pdf/renderer';

/**
 * Hoja de estilos de la constancia de entrega (RG 12-4).
 *
 * Vive aparte del componente porque son ~190 líneas de medidas del formulario que no
 * cambian con los datos: el layout queda legible y el diff del PDF no las arrastra.
 */
export const border = '0.75pt solid #000';

export const styles = StyleSheet.create({
  page: {
    padding: 20,
    fontSize: 8,
    fontFamily: 'Helvetica',
  },
  // ── Header row 1: Logo | empty | Meta ─────────────────────────────────────
  headerRow1: {
    flexDirection: 'row',
    borderTop: border,
    borderLeft: border,
    borderRight: border,
    borderBottom: border,
    minHeight: 42,
  },
  logoCell: {
    width: '18%',
    borderRight: border,
    padding: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: 75,
    height: 38,
    objectFit: 'contain',
  },
  /** Respaldo tipografico cuando la empresa no cargo su logo. */
  brandFallback: {
    fontSize: 11,
    fontWeight: 700,
  },
  headerMiddle: {
    width: '62%',
    borderRight: border,
  },
  metaCell: {
    width: '20%',
    padding: 3,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  metaText: {
    fontSize: 8,
    textAlign: 'right',
    marginBottom: 1,
  },
  // ── Header row 2: Full-width title ────────────────────────────────────────
  titleRow: {
    borderLeft: border,
    borderRight: border,
    borderBottom: border,
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleText: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
  },
  cancelledRow: {
    borderLeft: border,
    borderRight: border,
    borderBottom: border,
    padding: 4,
    backgroundColor: '#fde8e8',
  },
  cancelledText: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#b42318',
    textAlign: 'center',
  },
  // ── Info rows (company, worker, etc.) ─────────────────────────────────────
  infoRow: {
    flexDirection: 'row',
    borderLeft: border,
    borderRight: border,
    borderBottom: border,
    minHeight: 16,
  },
  infoCell: {
    padding: 3,
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoCellBorder: {
    borderRight: border,
  },
  labelBold: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
  },
  labelNormal: {
    fontSize: 8,
  },
  labelBoldValue: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
  },
  // ── Table ─────────────────────────────────────────────────────────────────
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#fce4b5',
    borderLeft: border,
    borderRight: border,
    borderBottom: border,
    minHeight: 28,
  },
  tableDataRow: {
    flexDirection: 'row',
    borderLeft: border,
    borderRight: border,
    borderBottom: border,
    minHeight: 16,
  },
  // Column widths — MUST total 100%
  // 3.5 + 13 + 16 + 5 + 7 + 9 + 3 + 3 + 4 + 10 + 18 + 4 + 4.5 = 100
  colNum: { width: '3.5%', borderRight: border, padding: 1, justifyContent: 'center', alignItems: 'center' },
  colProducto: { width: '13%', borderRight: border, padding: 2, justifyContent: 'center', alignItems: 'center' },
  colTipoModelo: { width: '16%', borderRight: border, padding: 2, justifyContent: 'center', alignItems: 'center' },
  colTalle: { width: '5%', borderRight: border, padding: 1, justifyContent: 'center', alignItems: 'center' },
  colCodigo: { width: '7%', borderRight: border, padding: 1, justifyContent: 'center', alignItems: 'center' },
  colMarca: { width: '9%', borderRight: border, padding: 1, justifyContent: 'center', alignItems: 'center' },
  colCertSi: { width: '3%', borderRight: border, padding: 1, justifyContent: 'center', alignItems: 'center' },
  colCertNo: { width: '3%', borderRight: border, padding: 1, justifyContent: 'center', alignItems: 'center' },
  colCant: { width: '4%', borderRight: border, padding: 1, justifyContent: 'center', alignItems: 'center' },
  colFecha: { width: '10%', borderRight: border, padding: 1, justifyContent: 'center', alignItems: 'center' },
  colFirma: { width: '18%', borderRight: border, padding: 1, justifyContent: 'center', alignItems: 'center' },
  colRepSi: { width: '4%', borderRight: border, padding: 1, justifyContent: 'center', alignItems: 'center' },
  colRepNo: { width: '4.5%', borderRight: border, padding: 1, justifyContent: 'center', alignItems: 'center' },
  // Cert + Rep grouped headers (must match sub-column sums)
  colCertHeader: {
    width: '6%', // 3% + 3%
    borderRight: border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colRepHeader: {
    width: '8.5%', // 4% + 4.5%
    borderRight: border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  subHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    borderTop: border,
    marginTop: 1,
    paddingTop: 1,
  },
  // ── Text styles ───────────────────────────────────────────────────────────
  cellText: {
    fontSize: 7,
    textAlign: 'center',
  },
  cellTextBold: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
  },
  headerCellText: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
  },
  // ── Footer / Legal ────────────────────────────────────────────────────────
  legalSection: {
    borderLeft: border,
    borderRight: border,
    borderBottom: border,
    padding: 4,
  },
  legalTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 7,
  },
  legalText: {
    fontSize: 6.5,
    fontStyle: 'italic',
    lineHeight: 1.4,
    marginBottom: 1,
  },
  observationRow: {
    flexDirection: 'row',
    borderLeft: border,
    borderRight: border,
    borderBottom: border,
    padding: 3,
  },
  observationText: {
    fontSize: 6,
    lineHeight: 1.3,
    textDecoration: 'underline',
  },
  legalFooterText: {
    fontSize: 6,
    lineHeight: 1.3,
  },
  quedoNotificado: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    backgroundColor: '#ffff00',
    padding: 2,
  },
  signatureImage: {
    width: 55,
    height: 22,
    objectFit: 'contain',
  },
});
