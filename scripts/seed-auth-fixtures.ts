/**
 * Datos de prueba para la verificacion E2E de los cinco flujos de auth (P4).
 * Es idempotente: se puede correr las veces que haga falta.
 *
 * Crea, sobre la empresa que deja `npm run db:seed`:
 *  - admin@p4.test      usuario del dashboard, owner de la empresa y admin
 *  - ropa@p4.test       usuario con legajo vinculado (panel de indumentaria)
 *  - taller@p4.test     usuario con legajo + sector de taller (panel de operario)
 *  - un legajo SIN usuario con CUIL 20111111112 (el operario que entra por el QR)
 *  - un vehiculo con dominio P4QR01 (el equipo que se escanea)
 * Todos con la contrasena `P4-verificacion-123`.
 *
 * Las credenciales se escriben igual que `createCredential()` (auth_user + auth_account con
 * el hasher de Better Auth), que es lo que hace el alta real de usuario.
 *
 * Uso:
 *   npm run db:seed -- --name "P4 Verificacion" --id 00000000-0000-0000-0000-0000000000f4
 *   DATABASE_URL=postgresql://... node scripts/seed-auth-fixtures.ts
 *
 * Los valores de los campos NOT NULL que no hacen al caso (calle, documento, telefono) son
 * placeholders: sirven para que la fila exista en el entorno local, no son datos de negocio.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { prismaPgConfig } from '../src/shared/lib/prisma-pg-config.ts';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { hashPassword } from 'better-auth/crypto';
import { randomUUID } from 'node:crypto';

const prisma = new PrismaClient({ adapter: new PrismaPg(prismaPgConfig(process.env.DATABASE_URL)) });
const COMPANY = '00000000-0000-0000-0000-0000000000f4';
const PASS = 'P4-verificacion-123';

async function credential(email: string, name: string): Promise<string> {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing.id;
  const id = randomUUID();
  const now = new Date();
  await prisma.user.create({ data: { id, name, email, emailVerified: true, createdAt: now, updatedAt: now } });
  await prisma.account.create({
    data: { id: randomUUID(), userId: id, accountId: id, providerId: 'credential', password: await hashPassword(PASS), createdAt: now, updatedAt: now },
  });
  return id;
}

async function profileFor(id: string, email: string, fullname: string, employeeId: string | null = null): Promise<void> {
  await prisma.profile.upsert({
    where: { id },
    update: { credential_id: id, email, fullname, employee_id: employeeId },
    create: { id, credential_id: id, email, fullname, employee_id: employeeId, role: 'User' },
  });
}

interface EmployeeInput {
  cuil: string;
  doc: string;
  firstname: string;
  lastname: string;
  email: string;
}

async function employee({ cuil, doc, firstname, lastname, email }: EmployeeInput): Promise<string> {
  const found = await prisma.employees.findFirst({ where: { cuil } });
  if (found) return found.id;
  const country = await prisma.countries.findFirst({ select: { id: true } });
  const countryId = country?.id ?? (await prisma.countries.create({ data: { name: 'Argentina' }, select: { id: true } })).id;
  const city = await prisma.cities.findFirstOrThrow({ select: { id: true, province_id: true } });
  const e = await prisma.employees.create({
    data: {
      firstname, lastname, cuil, document_number: doc, email, phone: '2991234567', file: 'x', date_of_admission: new Date(),
      birthplace: countryId, street: 'Calle', street_number: '1',
      province: city.province_id, city: city.id, company_id: COMPANY, is_active: true,
    },
    select: { id: true },
  });
  return e.id;
}

const out: Record<string, string> = {};

// 1) Admin del dashboard (owner de la empresa)
const adminId = await credential('admin@p4.test', 'Admin P4');
await profileFor(adminId, 'admin@p4.test', 'Admin P4');
await prisma.company.update({ where: { id: COMPANY }, data: { owner_id: adminId } });
const adminRole = await prisma.roles.findFirstOrThrow({ where: { slug: 'admin', is_system: true }, select: { id: true } });
await prisma.user_roles.createMany({ data: [{ user_id: adminId, role_id: adminRole.id, company_id: COMPANY, assigned_by: adminId }], skipDuplicates: true });
await prisma.share_company_users.createMany({ data: [{ company_id: COMPANY, profile_id: adminId }], skipDuplicates: true }).catch(() => {});
out.adminId = adminId;

// 2) Empleado del QR (sin usuario)
out.qrEmployeeId = await employee({ cuil: '20111111112', doc: '11111111', firstname: 'Qr', lastname: 'Operario', email: 'qr@p4.test' });

// 3) Operario de indumentaria
const clothingEmp = await employee({ cuil: '20222222223', doc: '22222222', firstname: 'Ropa', lastname: 'Operario', email: 'ropa@p4.test' });
const clothingId = await credential('ropa@p4.test', 'Ropa Operario');
await profileFor(clothingId, 'ropa@p4.test', 'Ropa Operario', clothingEmp);
out.clothingId = clothingId;

// 4) Operario de taller (con sector asignado)
const opEmp = await employee({ cuil: '20333333334', doc: '33333333', firstname: 'Taller', lastname: 'Operario', email: 'taller@p4.test' });
const opId = await credential('taller@p4.test', 'Taller Operario');
await profileFor(opId, 'taller@p4.test', 'Taller Operario', opEmp);
let workshop = await prisma.workshops.findFirst({ where: { company_id: COMPANY } });
if (!workshop) workshop = await prisma.workshops.create({ data: { name: 'Taller P4', company_id: COMPANY, is_active: true } });
let sector = await prisma.workshop_sectors.findFirst({ where: { workshop_id: workshop.id } });
if (!sector) sector = await prisma.workshop_sectors.create({ data: { name: 'Sector P4', workshop_id: workshop.id, company_id: COMPANY, is_active: true } });
await prisma.employee_workshop_sectors.createMany({ data: [{ employee_id: opEmp, workshop_sector_id: sector.id }], skipDuplicates: true });
out.operatorId = opId;

// 5) Vehiculo para el QR
let vehicle = await prisma.vehicles.findFirst({ where: { company_id: COMPANY, domain: 'P4QR01' } });
if (!vehicle) {
  let tv = await prisma.types_of_vehicles.findFirst();
  if (!tv) tv = await prisma.types_of_vehicles.create({ data: { name: 'Camion' } });
  let tp = await prisma.type.findFirst();
  if (!tp) tp = await prisma.type.create({ data: { name: 'Vehiculo', applies_to: 'vehicle' } });
  let brand = await prisma.brand_vehicles.findFirst();
  if (!brand) brand = await prisma.brand_vehicles.create({ data: { name: 'MarcaP4' } });
  let model = await prisma.model_vehicles.findFirst({ where: { brand: brand.id } });
  if (!model) model = await prisma.model_vehicles.create({ data: { name: 'ModeloP4', brand: brand.id, company_id: COMPANY } });
  vehicle = await prisma.vehicles.create({
    data: {
      domain: 'P4QR01', serie: 'P4SERIE01', intern_number: 'P4-01', year: '2020', engine: 'x', chassis: 'y',
      company_id: COMPANY, type_of_vehicle: tv.id, brand: brand.id, model: model.id, type: tp.id,
    },
  });
}
out.vehicleId = vehicle.id;

console.log(JSON.stringify(out, null, 2));
await prisma.$disconnect();
