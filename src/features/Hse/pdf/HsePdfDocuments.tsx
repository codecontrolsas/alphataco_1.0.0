import { formatArgentinaDateTime, formatDateAr } from '@/shared/lib/argentina-time';
import { ElectronicSignatureBlock, HeaderBlock, Kv, PDF_COLORS, basePdfStyles } from '@/shared/lib/pdf/pdf-layout';
import type { PdfLogo, ReactPdf } from '@/shared/lib/pdf/types';
import type { Styles } from '@react-pdf/renderer';
import 'server-only';
import { HSE_TRAINING_KIND_LABELS } from '../lib/constants';
import {
  HSE_ATTENDEE_RESULT_LABELS,
  HSE_INSTRUCTOR_KIND_LABELS,
  HSE_RECORD_MODALITY_LABELS,
  type CertificateContent,
  type RecordContent,
} from '../lib/pdf-content';

/**
 * PDF de la constancia de capacitación y del acta. Se arman en el servidor desde el contenido CONGELADO (nunca desde
 * lo que manda el navegador) con el kit compartido: monocromo, Helvetica, A4, membrete con el logo de la empresa. El
 * pie lleva la huella SHA-256 del contenido: con ella se verifica que el documento no se alteró.
 */

const C = PDF_COLORS;

const s = {
  ...basePdfStyles,
  page: { ...basePdfStyles.page, fontSize: 9 },
  headerRight: { width: 200, alignItems: 'flex-end' },
  title: { ...basePdfStyles.title, fontSize: 12 },
  kvLabel: { width: 110, color: C.muted },
  lead: { fontSize: 10, lineHeight: 1.5, marginBottom: 12 },
  row: { flexDirection: 'row', marginBottom: 10 },
  card: { flex: 1, borderWidth: 1, borderColor: C.rule, padding: 6 },
  gap: { width: 8 },
  notice: { borderWidth: 1, borderColor: C.ink, padding: 6, marginBottom: 10 },
  paragraph: { lineHeight: 1.4 },
  signatures: { flexDirection: 'row', marginTop: 18 },
  manual: { flex: 1, borderWidth: 1, borderColor: C.rule, padding: 6 },
  signatureLine: { marginTop: 26, borderTopWidth: 0.5, borderTopColor: C.ink, paddingTop: 2, color: C.muted },
  colFile: { width: 46 },
  colName: { flex: 1.4 },
  colPosition: { flex: 1 },
  colAttended: { width: 44 },
  colResult: { width: 64 },
  colScore: { width: 40, textAlign: 'right' },
  colSign: { width: 96 },
  colKind: { width: 50 },
  colLicense: { width: 80 },
  colRole: { flex: 1 },
  colInstructorSign: { width: 110 },
  empty: { paddingVertical: 6, textAlign: 'center', color: C.muted },
  footer: { ...basePdfStyles.footer, fontSize: 6.5 },
} satisfies Styles;

const shortId = (id: string) => id.slice(0, 8).toUpperCase();
const percent = (value: number | null | undefined) =>
  value === null || value === undefined
    ? '—'
    : `${Number(value).toLocaleString('es-AR', { maximumFractionDigits: 2 })} %`;

function instructorsText(instructors: CertificateContent['instructors']): string {
  if (instructors.length === 0) return 'Sin capacitador registrado';
  return instructors
    .map((i) => [i.fullName, i.roleTitle, i.license ? `Mat. ${i.license}` : null].filter(Boolean).join(' · '))
    .join('; ');
}

function Footer(rp: ReactPdf, label: string, sha256: string) {
  const { Text } = rp;
  return (
    <Text
      style={s.footer}
      fixed
      render={({ pageNumber, totalPages }) =>
        `${label} · Huella SHA-256 del contenido: ${sha256} · Página ${pageNumber} de ${totalPages}`
      }
    />
  );
}

export function CertificatePdfDocument(
  rp: ReactPdf,
  data: CertificateContent,
  meta: { sha256: string; voided: { at: string; reason: string } | null },
  logo: PdfLogo
) {
  const { Document, Page, View, Text } = rp;
  const { employee, training, result, record, signature } = data;
  const number = shortId(data.certificateId);
  const passedAt = formatArgentinaDateTime(result.passedAt);
  const validity = result.validUntil ? formatDateAr(result.validUntil) : 'No vence';
  const dictation = record
    ? `Acta N° ${record.number} del ${formatDateAr(record.heldOn)} · ${HSE_RECORD_MODALITY_LABELS[record.modality]}${
        record.location ? ` · ${record.location}` : ''
      }`
    : 'En línea, desde el portal del empleado';

  return (
    <Document title={`Constancia ${number}`} author={data.company.name} subject={training.title}>
      <Page size="A4" style={s.page}>
        {meta.voided ? (
          <Text style={s.watermark} fixed>
            ANULADA
          </Text>
        ) : null}
        {HeaderBlock(
          rp,
          s,
          {
            company: { name: data.company.name, cuit: data.company.cuit, address: null },
            title: 'CONSTANCIA DE CAPACITACIÓN',
            number,
            date: formatArgentinaDateTime(signature.signedAt).slice(0, 10),
            dateLabel: 'Emitida',
          },
          logo
        )}

        {meta.voided ? (
          <View style={s.notice}>
            <Text style={s.bold}>CONSTANCIA ANULADA EL {formatArgentinaDateTime(meta.voided.at)}</Text>
            <Text>Motivo: {meta.voided.reason}</Text>
          </View>
        ) : null}

        <Text style={s.lead}>
          Se deja constancia de que <Text style={s.bold}>{employee.fullName}</Text>
          {employee.file ? `, legajo N° ${employee.file}` : ''}
          {employee.cuil ? `, CUIL ${employee.cuil}` : ''}, aprobó la capacitación{' '}
          <Text style={s.bold}>«{training.title}»</Text> el {passedAt} con un puntaje de {percent(result.scorePercent)}.
        </Text>

        <View style={s.row}>
          <View style={s.card}>
            <Text style={s.boxTitle}>EMPLEADO</Text>
            {Kv(rp, s, 'Apellido y nombre', employee.fullName)}
            {Kv(rp, s, 'Legajo', employee.file ?? '—')}
            {Kv(rp, s, 'CUIL', employee.cuil ?? '—')}
            {Kv(rp, s, 'Puesto', employee.position ?? '—')}
            {Kv(rp, s, 'Sector', employee.sector ?? '—')}
          </View>
          <View style={s.gap} />
          <View style={s.card}>
            <Text style={s.boxTitle}>CAPACITACIÓN</Text>
            {Kv(rp, s, 'Título', training.title)}
            {Kv(rp, s, 'Tipo', HSE_TRAINING_KIND_LABELS[training.kind])}
            {Kv(rp, s, 'Dictado', dictation)}
            {Kv(rp, s, 'Capacitador', instructorsText(data.instructors))}
          </View>
        </View>

        <View style={s.box}>
          <Text style={s.boxTitle}>RESULTADO</Text>
          {Kv(
            rp,
            s,
            'Puntaje',
            `${percent(result.scorePercent)} (${result.scorePoints ?? 0} de ${result.maxPoints} puntos)`
          )}
          {Kv(rp, s, 'Aprobación mínima', `${training.passingScore} %`)}
          {Kv(rp, s, 'Intento', `N° ${result.attemptNumber}`)}
          {Kv(rp, s, 'Aprobada el', passedAt)}
          {Kv(rp, s, 'Vigente hasta', validity)}
        </View>

        <View style={s.signatures} wrap={false}>
          {ElectronicSignatureBlock(rp, s, {
            title: 'FIRMA DEL EMPLEADO (ELECTRÓNICA)',
            signer: employee.fullName,
            lines: [
              `Firmó el ${formatArgentinaDateTime(signature.signedAt)} (hora del servidor, Argentina)`,
              'Método: confirmación con su contraseña en el portal del empleado',
              `IP: ${signature.ip ?? 'no registrada'}`,
              `Legajo ${employee.file ?? '—'} · ${data.company.name}`,
            ],
          })}
          <View style={s.gap} />
          <View style={s.manual}>
            <Text style={s.boxTitle}>CAPACITADOR</Text>
            <Text style={s.bold}>{data.instructors[0]?.fullName ?? '—'}</Text>
            {data.instructors[0]?.license ? <Text style={s.muted}>Matrícula {data.instructors[0].license}</Text> : null}
            <Text style={s.signatureLine}>Firma y sello</Text>
          </View>
        </View>

        {Footer(rp, `Constancia ${number}`, meta.sha256)}
      </Page>
    </Document>
  );
}

export function RecordPdfDocument(
  rp: ReactPdf,
  data: RecordContent,
  meta: { sha256: string; voided: { at: string; reason: string } | null },
  logo: PdfLogo
) {
  const { Document, Page, View, Text } = rp;
  const present = data.attendees.filter((a) => a.attended).length;

  return (
    <Document title={`Acta ${data.number}`} author={data.company.name} subject={data.training.title}>
      <Page size="A4" style={s.page}>
        {meta.voided ? (
          <Text style={s.watermark} fixed>
            ANULADA
          </Text>
        ) : null}
        {HeaderBlock(
          rp,
          s,
          {
            company: { name: data.company.name, cuit: data.company.cuit, address: null },
            title: 'ACTA DE CAPACITACIÓN',
            number: String(data.number),
            date: formatDateAr(data.heldOn),
            dateLabel: 'Dictada',
          },
          logo
        )}

        {meta.voided ? (
          <View style={s.notice}>
            <Text style={s.bold}>ACTA ANULADA EL {formatArgentinaDateTime(meta.voided.at)}</Text>
            <Text>Motivo: {meta.voided.reason}</Text>
          </View>
        ) : null}

        <View style={s.row}>
          <View style={s.card}>
            <Text style={s.boxTitle}>CAPACITACIÓN</Text>
            {Kv(rp, s, 'Título', data.training.title)}
            {Kv(rp, s, 'Tipo', HSE_TRAINING_KIND_LABELS[data.training.kind])}
            {Kv(rp, s, 'Aprobación mínima', `${data.training.passingScore} %`)}
            {Kv(rp, s, 'Vigencia', data.training.validityMonths ? `${data.training.validityMonths} meses` : 'No vence')}
          </View>
          <View style={s.gap} />
          <View style={s.card}>
            <Text style={s.boxTitle}>DICTADO</Text>
            {Kv(rp, s, 'Fecha', formatDateAr(data.heldOn))}
            {Kv(rp, s, 'Modalidad', HSE_RECORD_MODALITY_LABELS[data.modality])}
            {Kv(rp, s, 'Lugar', data.location ?? '—')}
            {Kv(rp, s, 'Duración', data.durationMinutes ? `${data.durationMinutes} minutos` : '—')}
            {Kv(rp, s, 'Asistentes', `${present} presentes de ${data.attendees.length}`)}
          </View>
        </View>

        <View style={s.box}>
          <Text style={s.boxTitle}>TEMARIO</Text>
          <Text style={s.paragraph}>{data.topics}</Text>
        </View>

        <Text style={s.sectionTitle}>Capacitadores</Text>
        <View style={s.tableHead}>
          <Text style={[s.th, s.colName]}>Apellido y nombre</Text>
          <Text style={[s.th, s.colKind]}>Tipo</Text>
          <Text style={[s.th, s.colLicense]}>Matrícula</Text>
          <Text style={[s.th, s.colRole]}>Cargo</Text>
          <Text style={[s.th, s.colInstructorSign]}>Firma</Text>
        </View>
        {data.instructors.map((i, index) => (
          <View key={`${i.fullName}-${index}`} style={s.tableRow} wrap={false}>
            <Text style={[s.td, s.colName]}>{i.fullName}</Text>
            <Text style={[s.td, s.colKind]}>{HSE_INSTRUCTOR_KIND_LABELS[i.kind]}</Text>
            <Text style={[s.td, s.colLicense]}>{i.license ?? '—'}</Text>
            <Text style={[s.td, s.colRole]}>{i.roleTitle ?? '—'}</Text>
            <Text style={[s.td, s.colInstructorSign]}> </Text>
          </View>
        ))}

        <Text style={s.sectionTitle}>Asistentes y resultados</Text>
        <View style={s.tableHead} fixed>
          <Text style={[s.th, s.colFile]}>Legajo</Text>
          <Text style={[s.th, s.colName]}>Apellido y nombre</Text>
          <Text style={[s.th, s.colPosition]}>Puesto</Text>
          <Text style={[s.th, s.colAttended]}>Asistió</Text>
          <Text style={[s.th, s.colResult]}>Resultado</Text>
          <Text style={[s.th, s.colScore]}>Puntaje</Text>
          <Text style={[s.th, s.colSign]}>Constancia firmada</Text>
        </View>
        {data.attendees.length === 0 ? <Text style={s.empty}>Sin asistentes.</Text> : null}
        {data.attendees.map((a) => (
          <View key={a.employeeId} style={s.tableRow} wrap={false}>
            <Text style={[s.td, s.colFile]}>{a.file ?? '—'}</Text>
            <Text style={[s.td, s.colName]}>{a.fullName}</Text>
            <Text style={[s.td, s.colPosition]}>{a.position ?? '—'}</Text>
            <Text style={[s.td, s.colAttended]}>{a.attended ? 'Sí' : 'No'}</Text>
            <Text style={[s.td, s.colResult]}>{HSE_ATTENDEE_RESULT_LABELS[a.result.status]}</Text>
            <Text style={[s.td, s.colScore]}>{percent(a.result.scorePercent)}</Text>
            <Text style={[s.td, s.colSign]}>
              {a.certificate ? formatArgentinaDateTime(a.certificate.signedAt) : 'Pendiente'}
            </Text>
          </View>
        ))}

        {data.observations ? (
          <View style={[s.box, { marginTop: 10 }]} wrap={false}>
            <Text style={s.boxTitle}>OBSERVACIONES</Text>
            <Text style={s.paragraph}>{data.observations}</Text>
          </View>
        ) : null}

        <View style={[s.box, { marginTop: 10 }]} wrap={false}>
          <Text style={s.boxTitle}>CIERRE FORMAL</Text>
          <Text>
            Cerrada el {formatArgentinaDateTime(data.closedAt)}
            {data.closedBy.name ? ` por ${data.closedBy.name}` : ''}. Los resultados y las firmas son los registrados al
            momento del cierre; las firmas posteriores constan en cada constancia.
          </Text>
        </View>

        {Footer(rp, `Acta N° ${data.number}`, meta.sha256)}
      </Page>
    </Document>
  );
}
