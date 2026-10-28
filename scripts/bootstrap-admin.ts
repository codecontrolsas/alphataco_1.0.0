/**
 * Alta del primer administrador de una instancia nueva.
 *
 * No hay registro abierto (`disableSignUp: true`) y los usuarios entran por invitación de un admin, así
 * que el primero se da de alta por acá. Reproduce lo que hace el alta por invitación
 * (`registerUserWithRole` + `createPasswordSetupLink`): usuario de Better Auth SIN contraseña, perfil,
 * pertenencia a la empresa, rol `admin` y un token de "definir contraseña" (24 h). Todo en una
 * transacción: o queda completo o no queda nada. La contraseña la elige el usuario con el enlace.
 *
 * Reemplaza al bloque SQL que había en `docs/deploy/runbook.md`.
 *
 * Uso (dentro del contenedor, después del primer deploy con `RUN_SEED=true`):
 *   node scripts/bootstrap-admin.ts --email admin@dominio.com --name "Nombre Apellido" [--company "<nombre>"]
 *   node scripts/bootstrap-admin.ts --email admin@dominio.com --reissue-link   # otro enlace para un usuario que ya existe
 *
 * --company: nombre de la empresa del seed (por defecto, `SEED_COMPANY_NAME`).
 * Requiere DATABASE_URL. Con APP_BASE_URL imprime el enlace completo.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { prismaPgConfig } from '../src/shared/lib/prisma-pg-config.ts';

/** Vigencia del enlace: la misma que `INVITATION_TOKEN_TTL_SECONDS` de `src/shared/lib/auth-credentials.ts`. */
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const CALLBACK_PATH = '/reset_password/update-user';

interface Args {
  email: string;
  name: string | null;
  company: string | null;
  reissueLink: boolean;
}

function parseArgs(argv: string[]): Args {
  const values = new Map<string, string>();
  let reissueLink = false;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--reissue-link') reissueLink = true;
    else if (flag === '--email' || flag === '--name' || flag === '--company') {
      const value = argv[++i];
      if (!value) throw new Error(`Falta el valor de ${flag}`);
      values.set(flag, value);
    }
  }

  const email = values.get('--email')?.trim().toLowerCase();
  if (!email || !email.includes('@')) throw new Error('Falta --email con un mail válido');
  const name = values.get('--name')?.trim() || null;
  if (!name && !reissueLink) throw new Error('Falta --name "Nombre Apellido" (obligatorio para un usuario nuevo)');

  return {
    email,
    name,
    company: values.get('--company')?.trim() || process.env.SEED_COMPANY_NAME?.trim() || null,
    reissueLink,
  };
}

function setupUrl(token: string): string {
  const path = `/api/auth/reset-password/${token}?callbackURL=${encodeURIComponent(CALLBACK_PATH)}`;
  const baseUrl = (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL)?.trim().replace(/\/+$/, '');
  return baseUrl ? `${baseUrl}${path}` : path;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const connectionString = process.env.SYSTEM_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL no esta definida en las variables de entorno');

  const prisma = new PrismaClient({ adapter: new PrismaPg(prismaPgConfig(connectionString)) });
  try {
    const existing = await prisma.user.findUnique({ where: { email: args.email }, select: { id: true } });

    if (existing && !args.reissueLink) {
      throw new Error(
        `Ya existe un usuario con el mail ${args.email}. Para emitir otro enlace de contraseña usá --reissue-link.`
      );
    }
    if (!existing && args.reissueLink) {
      throw new Error(`No existe un usuario con el mail ${args.email}: no hay a quién emitirle un enlace.`);
    }

    const token = randomBytes(24).toString('base64url');
    const now = new Date();
    const verification = {
      id: randomUUID(),
      identifier: `reset-password:${token}`,
      expiresAt: new Date(now.getTime() + TOKEN_TTL_MS),
      createdAt: now,
      updatedAt: now,
    };

    if (existing) {
      await prisma.verification.create({ data: { ...verification, value: existing.id } });
      console.log(`Enlace emitido para ${args.email} (vence en 24 h):\n${setupUrl(token)}`);
      return;
    }

    if (!args.company) throw new Error('Falta --company "<nombre>" (o la variable SEED_COMPANY_NAME)');
    const companies = await prisma.company.findMany({
      where: { company_name: args.company },
      select: { id: true, owner_id: true },
    });
    if (companies.length !== 1) {
      throw new Error(
        `Se esperaba 1 empresa llamada "${args.company}" y hay ${companies.length}. ¿Corrió el seed (RUN_SEED=true) con ese nombre?`
      );
    }
    const company = companies[0];

    const role = await prisma.roles.findFirst({
      where: { slug: 'admin', is_system: true },
      select: { id: true, name: true },
    });
    if (!role) throw new Error('No existe el rol de sistema "admin": corré primero el seed.');

    const userId = randomUUID();
    await prisma.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          id: userId,
          name: args.name!,
          email: args.email,
          // El mail lo da quien instala la instancia: exigir verificación dejaría al admin sin poder entrar.
          emailVerified: true,
          needsPasswordChange: false,
          createdAt: now,
          updatedAt: now,
        },
      });
      // `profile.id === profile.credential_id`: las FK de auditoría apuntan al mismo uuid (ver `shared/lib/actor.ts`).
      await tx.profile.create({
        data: { id: userId, credential_id: userId, email: args.email, fullname: args.name, role: role.name },
      });
      await tx.share_company_users.create({ data: { company_id: company.id, profile_id: userId } });
      await tx.user_roles.create({
        data: { user_id: userId, role_id: role.id, company_id: company.id, assigned_by: userId },
      });
      // Primer admin = dueño de la empresa, solo si todavía no tiene dueño.
      if (!company.owner_id) await tx.company.update({ where: { id: company.id }, data: { owner_id: userId } });
      await tx.verification.create({ data: { ...verification, value: userId } });
    });

    console.log(`Admin creado: ${args.name} <${args.email}> en "${args.company}".`);
    console.log(`Enlace para definir la contraseña (vence en 24 h):\n${setupUrl(token)}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('Error en bootstrap-admin:', error instanceof Error ? error.message : error);
  process.exit(1);
});
