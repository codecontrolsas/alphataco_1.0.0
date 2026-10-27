/**
 * HSE (ticket 804, fase 2): tipos de documento, documentos con versiones y destinatarios, y las aceptaciones del portal.
 *
 * Quién tiene que aceptar qué lo calcula la MISMA función que usa la app (`hse_sync_acknowledgements`): acá solo se
 * cargan los documentos y después se responde una parte de las aceptaciones con fechas relativas a hoy.
 *   - Política de SySO: a todos, v1, ~75% aceptado, algunos rechazos.
 *   - Manejo defensivo: a choferes, v2 publicada hace pocos días (la v1 aceptada queda como historia).
 *   - EPP en taller: al sector Mantenimiento, v1, ~50% aceptado.
 *   - Trabajo en altura: borrador (no lo ve nadie).
 * Ids deterministas: los links a un documento sobreviven al reset.
 */
import { createHash } from 'node:crypto';
import { POSITIONS } from '../data/catalog.ts';
import { addPdf, type Ctx } from '../lib/ctx.ts';
import { demoId } from '../lib/ids.ts';
import type { DemoEmployee } from './employees.ts';

const HSE_BUCKET = 'hse-files';

type Target = { kind: 'all' } | { kind: 'position'; positionKey: string } | { kind: 'sector'; sectorKey: string };

interface DemoHseDoc {
  key: string;
  title: string;
  type: string;
  description: string;
  targets: Target[];
  /** Versiones publicadas: días atrás de cada publicación (la última es la vigente). Vacío = borrador. */
  publishedDaysAgo: number[];
  /** Fracción de destinatarios que aceptó la versión vigente. */
  acceptedShare: number;
  rejectedShare: number;
  expiresInDays?: number;
}

const TYPES = ['Política', 'Procedimiento', 'Instructivo'];

const DOCS: DemoHseDoc[] = [
  {
    key: 'politica-syso',
    title: 'Política de Seguridad y Salud Ocupacional',
    type: 'Política',
    description: 'Compromisos de la empresa y de cada persona con la seguridad, la salud y el ambiente.',
    targets: [{ kind: 'all' }],
    publishedDaysAgo: [40],
    acceptedShare: 0.75,
    rejectedShare: 0.03,
    expiresInDays: 325,
  },
  {
    key: 'manejo-defensivo',
    title: 'Procedimiento de manejo defensivo',
    type: 'Procedimiento',
    description: 'Velocidades máximas, descansos, uso del celular y conducta ante fauna en ruta.',
    targets: [{ kind: 'position', positionKey: 'chofer' }],
    publishedDaysAgo: [120, 4],
    acceptedShare: 0.3,
    rejectedShare: 0,
    expiresInDays: 245,
  },
  {
    key: 'epp-taller',
    title: 'Instructivo de uso de EPP en taller',
    type: 'Instructivo',
    description: 'Protección auditiva, ocular y de manos según la tarea; recambio y guarda de los elementos.',
    targets: [{ kind: 'sector', sectorKey: 'mantenimiento' }],
    publishedDaysAgo: [15],
    acceptedShare: 0.5,
    rejectedShare: 0,
  },
  {
    key: 'trabajo-altura',
    title: 'Procedimiento de trabajo en altura',
    type: 'Procedimiento',
    description: 'Borrador en revisión: arnés, línea de vida y permiso de trabajo sobre 1,8 m.',
    targets: [{ kind: 'all' }],
    publishedDaysAgo: [],
    acceptedShare: 0,
    rejectedShare: 0,
  },
];

const REJECT_REASONS = [
  'No entiendo el punto sobre horarios de descanso, necesito que me lo expliquen.',
  'En mi base no tenemos el elemento que pide el punto 4.',
];

function daysAgo(ctx: Ctx, days: number): Date {
  return ctx.cal.at(-days, 10);
}

const POSITION_NAMES = new Map<string, string>(POSITIONS.map((p) => [p.key, p.name]));

export async function seedHse(ctx: Ctx, employees: DemoEmployee[]): Promise<void> {
  const { tx, company, faker } = ctx;
  await tx.hse_document_types.createMany({
    data: TYPES.map((name) => ({ id: demoId('hse-type', name), company_id: company.id, name })),
  });

  for (const doc of DOCS) {
    const documentId = demoId('hse-document', doc.key);
    const published = doc.publishedDaysAgo.length > 0;
    const versionCount = Math.max(doc.publishedDaysAgo.length, 1);
    await tx.hse_documents.create({
      data: {
        id: documentId,
        company_id: company.id,
        type_id: demoId('hse-type', doc.type),
        title: doc.title,
        description: doc.description,
        status: 'draft',
        created_by: ctx.actorId,
        created_at: daysAgo(ctx, (doc.publishedDaysAgo[0] ?? 2) + 2),
      },
      select: { id: true },
    });
    for (let v = 1; v <= versionCount; v++) {
      const versionId = demoId('hse-version', `${doc.key}:${v}`);
      const key = `${company.id}/documents/${documentId}/${versionId}.pdf`;
      await addPdf(ctx, HSE_BUCKET, key, {
        title: doc.title,
        fields: [
          ['Tipo', doc.type],
          ['Versión', String(v)],
          [
            'Alcance',
            doc.targets
              .map((t) => (t.kind === 'all' ? 'Todo el personal' : t.kind === 'position' ? t.positionKey : t.sectorKey))
              .join(', '),
          ],
        ],
        body: doc.description,
        reference: `HSE-${doc.key.toUpperCase()}-V${v}`,
      });
      const body = ctx.files[ctx.files.length - 1]?.body ?? new Uint8Array();
      const publishedAt = published ? daysAgo(ctx, doc.publishedDaysAgo[v - 1] ?? 0) : null;
      await tx.hse_document_versions.create({
        data: {
          id: versionId,
          company_id: company.id,
          document_id: documentId,
          version: v,
          file_path: key,
          file_name: `${doc.key}-v${v}.pdf`,
          file_size: body.byteLength,
          file_sha256: createHash('sha256').update(body).digest('hex'),
          change_log:
            v > 1 ? 'Se actualizan las velocidades máximas en caminos de ripio y el uso de manos libres.' : null,
          expires_at: doc.expiresInDays && v === versionCount ? ctx.cal.day(doc.expiresInDays) : null,
          published_at: publishedAt,
          published_by: publishedAt ? ctx.actorId : null,
          created_by: ctx.actorId,
        },
        select: { id: true },
      });
    }
    await tx.hse_document_targets.createMany({
      data: doc.targets.map((t) => ({
        company_id: company.id,
        document_id: documentId,
        kind: t.kind,
        position_id: t.kind === 'position' ? demoId('position', t.positionKey) : null,
        sector_id: t.kind === 'sector' ? demoId('hierarchy', t.sectorKey) : null,
      })),
    });
    if (!published) continue;

    // Las versiones anteriores se publican y se responden primero, así la vigente archiva su historia.
    for (let v = 1; v <= versionCount; v++) {
      const versionId = demoId('hse-version', `${doc.key}:${v}`);
      await tx.hse_documents.update({
        where: { id: documentId },
        data: { status: 'published', current_version_id: versionId },
        select: { id: true },
      });
      await tx.$executeRaw`SELECT public.hse_sync_acknowledgements(${company.id}::uuid, ${documentId}::uuid, NULL::uuid)`;
      const isCurrent = v === versionCount;
      const pending = await tx.hse_document_acknowledgements.findMany({
        where: { version_id: versionId, archived_at: null, status: 'pending' },
        select: { id: true, employee_id: true },
        orderBy: { employee_id: 'asc' },
      });
      const accepted = isCurrent ? doc.acceptedShare : 0.9;
      const rejected = isCurrent ? doc.rejectedShare : 0;
      const publishedDays = doc.publishedDaysAgo[v - 1] ?? 0;
      for (const ack of pending) {
        const roll = faker.number.float({ min: 0, max: 1 });
        if (roll >= accepted + rejected) continue;
        const person = employees.find((e) => e.id === ack.employee_id);
        const isReject = roll >= accepted;
        await tx.hse_document_acknowledgements.update({
          where: { id: ack.id },
          data: {
            status: isReject ? 'rejected' : 'accepted',
            responded_at: daysAgo(ctx, faker.number.int({ min: 0, max: Math.max(publishedDays - 1, 0) })),
            reject_reason: isReject ? faker.helpers.arrayElement(REJECT_REASONS) : null,
            signer_name: person ? `${person.lastname} ${person.firstname}` : null,
            signer_position: person ? POSITION_NAMES.get(person.position) ?? null : null,
            signer_file: person?.file ?? null,
            ip: '190.12.34.56',
            user_agent: 'Mozilla/5.0 (Linux; Android 14) Chrome Mobile (demo)',
          },
          select: { id: true },
        });
      }
    }
  }

  const acks = await tx.hse_document_acknowledgements.count({ where: { company_id: company.id } });
  ctx.log(`HSE: ${DOCS.length} documentos, ${acks} aceptaciones`);
}
