import type { MailMessage } from '@/shared/lib/mail';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * Despachador de avisos (#786) contra el Postgres del compose: `npm run test:jobs`.
 *
 * Arma una empresa con cuatro usuarios para probar la regla completa de destinatarios, que vive en la
 * función SQL `resolve_notification_recipients`:
 * - APROBADOR: rol con el aviso (campanita + email) y el permiso `compras:solicitudes:approve`.
 * - SIN_PERMISO: el mismo rol de avisos pero otro rol de permisos sin `approve` → no recibe.
 * - INACTIVO: tiene todo, pero su acceso a la empresa está dado de baja → no recibe.
 * - OTRA_EMPRESA: miembro de otra empresa con todo → no recibe avisos de esta.
 */
const RUN = Boolean(process.env.DATABASE_URL);

const COMPANY = '86000000-0000-4000-8000-00000000000a';
const OTHER_COMPANY = '86000000-0000-4000-8000-00000000000b';
const APPROVER = '86000000-0000-4000-8000-000000000001';
const NO_PERMISSION = '86000000-0000-4000-8000-000000000002';
const INACTIVE = '86000000-0000-4000-8000-000000000003';
const OUTSIDER = '86000000-0000-4000-8000-000000000004';
const USERS = [APPROVER, NO_PERMISSION, INACTIVE, OUTSIDER];
const ROLE_NOTIFY = 'Avisos (test dispatch)';
const ROLE_APPROVE = 'Aprueba compras (test dispatch)';
const ROLE_VIEW = 'Solo mira compras (test dispatch)';
const LEGACY_EXTERNAL = 'externo@lista-fija.local';
const email = (id: string) => `u${id.slice(-1)}@dispatch.local`;

type Prisma = (typeof import('@/shared/lib/prisma'))['prisma'];
let prisma: Prisma;
/** Filas de catálogo de permisos que el test tuvo que crear (en la base de CI no hay seed). */
const created = { module: null as string | null, tab: null as string | null, actions: [] as string[] };

async function ensurePermissionCatalog() {
  let moduleRow = await prisma.modules.findUnique({ where: { slug: 'compras' }, select: { id: true } });
  if (!moduleRow) {
    moduleRow = await prisma.modules.create({
      data: { slug: 'compras', name: 'Compras', description: 'test', price: 0 },
      select: { id: true },
    });
    created.module = moduleRow.id;
  }
  let tab = await prisma.tabs.findUnique({
    where: { module_id_slug: { module_id: moduleRow.id, slug: 'solicitudes' } },
    select: { id: true },
  });
  if (!tab) {
    tab = await prisma.tabs.create({
      data: { module_id: moduleRow.id, slug: 'solicitudes', name: 'Solicitudes' },
      select: { id: true },
    });
    created.tab = tab.id;
  }
  const actionIds: Record<string, string> = {};
  for (const slug of ['view', 'approve']) {
    let action = await prisma.actions.findUnique({ where: { slug }, select: { id: true } });
    if (!action) {
      action = await prisma.actions.create({ data: { slug, name: slug }, select: { id: true } });
      created.actions.push(action.id);
    }
    actionIds[slug] = action.id;
  }
  return { tabId: tab.id, actionIds };
}

async function cleanup() {
  await prisma.notification_events.deleteMany({ where: { company_id: { in: [COMPANY, OTHER_COMPANY] } } });
  await prisma.user_roles.deleteMany({ where: { user_id: { in: USERS } } });
  await prisma.roles.deleteMany({ where: { name: { in: [ROLE_NOTIFY, ROLE_APPROVE, ROLE_VIEW] } } });
  await prisma.share_company_users.deleteMany({ where: { profile_id: { in: USERS } } });
  await prisma.notification_settings.deleteMany({ where: { company_id: { in: [COMPANY, OTHER_COMPANY] } } });
  await prisma.profile.deleteMany({ where: { id: { in: USERS } } });
  await prisma.company.deleteMany({ where: { id: { in: [COMPANY, OTHER_COMPANY] } } });
}

describe.skipIf(!RUN)('despachador de avisos (integración)', () => {
  const sent: MailMessage[] = [];
  const sendMail = async (message: MailMessage) => {
    sent.push(message);
    return true;
  };
  const mailTo = () =>
    sent.flatMap((message) => (typeof message.to === 'string' ? [message.to] : [...message.to])).sort();

  beforeAll(async () => {
    prisma = (await import('@/shared/lib/prisma')).prisma;
    await cleanup();
    const { tabId, actionIds } = await ensurePermissionCatalog();
    const city = await prisma.cities.findFirstOrThrow({ select: { id: true } });
    for (const [id, cuit] of [
      [COMPANY, '30999999881'],
      [OTHER_COMPANY, '30999999882'],
    ] as const) {
      await prisma.company.create({
        data: {
          id,
          company_name: `Dispatch ${cuit}`,
          description: 'empresa de prueba',
          contact_email: 'contacto@dispatch.local',
          contact_phone: '+542991234567',
          address: 'Calle 123',
          city: city.id,
          country: 'argentina',
          industry: 'Petroleo',
          company_cuit: cuit,
        },
      });
    }
    await prisma.profile.createMany({
      data: USERS.map((id) => ({ id, credential_id: id, email: email(id), fullname: `Usuario ${id.slice(-1)}` })),
    });
    await prisma.share_company_users.createMany({
      data: [
        { profile_id: APPROVER, company_id: COMPANY, is_active: true },
        { profile_id: NO_PERMISSION, company_id: COMPANY, is_active: true },
        { profile_id: INACTIVE, company_id: COMPANY, is_active: false },
        { profile_id: OUTSIDER, company_id: OTHER_COMPANY, is_active: true },
      ],
    });
    const notifyRole = await prisma.roles.create({ data: { name: ROLE_NOTIFY }, select: { id: true } });
    const approveRole = await prisma.roles.create({ data: { name: ROLE_APPROVE }, select: { id: true } });
    const viewRole = await prisma.roles.create({ data: { name: ROLE_VIEW }, select: { id: true } });
    await prisma.role_permissions.createMany({
      data: [
        { role_id: approveRole.id, tab_id: tabId, action_id: actionIds.approve! },
        { role_id: approveRole.id, tab_id: tabId, action_id: actionIds.view! },
        { role_id: viewRole.id, tab_id: tabId, action_id: actionIds.view! },
      ],
    });
    await prisma.role_notifications.createMany({
      data: [
        { role_id: notifyRole.id, event_key: 'purchases.request_submitted', channel: 'in_app' },
        { role_id: notifyRole.id, event_key: 'purchases.request_submitted', channel: 'email' },
        { role_id: notifyRole.id, event_key: 'purchases.request_decided', channel: 'in_app' },
        { role_id: notifyRole.id, event_key: 'purchases.request_decided', channel: 'email' },
      ],
    });
    await prisma.user_roles.createMany({
      data: [
        { user_id: APPROVER, company_id: COMPANY, role_id: notifyRole.id },
        { user_id: APPROVER, company_id: COMPANY, role_id: approveRole.id },
        { user_id: NO_PERMISSION, company_id: COMPANY, role_id: notifyRole.id },
        { user_id: NO_PERMISSION, company_id: COMPANY, role_id: viewRole.id },
        { user_id: INACTIVE, company_id: COMPANY, role_id: notifyRole.id },
        { user_id: INACTIVE, company_id: COMPANY, role_id: approveRole.id },
        { user_id: OUTSIDER, company_id: OTHER_COMPANY, role_id: notifyRole.id },
        { user_id: OUTSIDER, company_id: OTHER_COMPANY, role_id: approveRole.id },
      ],
    });
  }, 60_000);

  afterAll(async () => {
    await cleanup();
    if (created.tab) await prisma.tabs.delete({ where: { id: created.tab } });
    if (created.module) await prisma.modules.delete({ where: { id: created.module } });
    if (created.actions.length > 0) await prisma.actions.deleteMany({ where: { id: { in: created.actions } } });
  }, 60_000);

  beforeEach(async () => {
    sent.length = 0;
    await prisma.notification_events.deleteMany({ where: { company_id: COMPANY } });
  });

  async function notify(input: Partial<import('./dispatch.server').NotifyInput>) {
    const { notify: run } = await import('./dispatch.server');
    return run(
      {
        event: 'purchases.request_submitted',
        companyId: COMPANY,
        dedupeKey: 'k1',
        title: 'Solicitud SC-1 para aprobar',
        email: { subject: 'Solicitud SC-1 para aprobar', text: 'detalle' },
        ...input,
      },
      { sendMail }
    );
  }

  async function deliveredTo(dedupeKey: string) {
    const rows = await prisma.notification_deliveries.findMany({
      where: { company_id: COMPANY, event: { dedupe_key: dedupeKey } },
      select: { user_id: true, in_app: true, email: true },
    });
    return rows.map((row) => row.user_id).sort();
  }

  it('llega solo a los miembros activos de la empresa con el aviso en su rol Y el permiso mínimo', async () => {
    const result = await notify({});
    expect(result).toEqual({ status: 'sent', inApp: 1, emailRecipients: 1, emailSent: true });
    expect(await deliveredTo('k1')).toEqual([APPROVER]);
    expect(mailTo()).toEqual([email(APPROVER)]);
  });

  it('no se lo avisa a quien lo disparó', async () => {
    const result = await notify({ dedupeKey: 'k2', actorId: APPROVER });
    expect(result).toEqual({ status: 'no_recipients' });
    expect(sent).toEqual([]);
  });

  it('el mismo aviso no se repite', async () => {
    await notify({ dedupeKey: 'k3' });
    const again = await notify({ dedupeKey: 'k3' });
    expect(again).toEqual({ status: 'duplicate', emailSent: false });
    expect(sent).toHaveLength(1);
    expect(await deliveredTo('k3')).toEqual([APPROVER]);
  });

  it('si el mail había fallado, repetir el aviso reintenta solo el mail', async () => {
    await notify({ dedupeKey: 'k4' });
    await prisma.notification_events.updateMany({
      where: { company_id: COMPANY, dedupe_key: 'k4' },
      data: { email_status: 'failed' },
    });
    const again = await notify({ dedupeKey: 'k4' });
    expect(again).toEqual({ status: 'duplicate', emailSent: true });
    expect(sent).toHaveLength(2);
    expect(await deliveredTo('k4')).toEqual([APPROVER]);
  });

  it('un aviso personal llega solo a esa persona, si tiene el aviso y el permiso', async () => {
    const toApprover = await notify({ event: 'purchases.request_decided', dedupeKey: 'k5', userIds: [APPROVER] });
    expect(toApprover).toMatchObject({ status: 'sent', inApp: 1 });
    expect(await deliveredTo('k5')).toEqual([APPROVER]);
    // A alguien de otra empresa no le llega, aunque se lo pidan.
    const outsider = await notify({ event: 'purchases.request_decided', dedupeKey: 'k6', userIds: [OUTSIDER] });
    expect(outsider).toEqual({ status: 'no_recipients' });
  });

  it('un aviso personal sin destinatario es un error de programación', async () => {
    await expect(notify({ event: 'purchases.request_decided', dedupeKey: 'k7' })).rejects.toThrow(
      'destinatarios puntuales'
    );
  });

  it('sin email en el aviso, solo campanita', async () => {
    const result = await notify({ dedupeKey: 'k8', email: undefined });
    expect(result).toEqual({ status: 'sent', inApp: 1, emailRecipients: 0, emailSent: false });
    expect(sent).toEqual([]);
  });

  it('los avisos de los jobs suman la lista fija de la empresa sin repetir direcciones', async () => {
    const { prisma: db } = await import('@/shared/lib/prisma');
    await db.notification_settings.create({
      data: {
        company_id: COMPANY,
        kind: 'stock_batch_expiry',
        recipients: [LEGACY_EXTERNAL, email(APPROVER).toUpperCase()],
        is_active: true,
      },
    });
    // Ningún rol tiene el aviso de lotes: solo la lista fija recibe el mail.
    const result = await notify({ event: 'warehouses.batch_expiry', dedupeKey: 'k9' });
    expect(result).toEqual({ status: 'sent', inApp: 0, emailRecipients: 2, emailSent: true });
    expect(mailTo()).toEqual([email(APPROVER).toUpperCase(), LEGACY_EXTERNAL].sort());
    const event = await db.notification_events.findFirstOrThrow({ where: { company_id: COMPANY, dedupe_key: 'k9' } });
    expect(event.external_emails.sort()).toEqual([email(APPROVER).toUpperCase(), LEGACY_EXTERNAL].sort());
  });
});
