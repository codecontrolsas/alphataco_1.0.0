/**
 * Datos fiscales de la empresa demo: la deja lista para facturar en vivo. La instancia demo corre
 * con `ARCA_MODE=mock` (ARCA simulado), así que no hace falta certificado: con esto y los datos
 * fiscales de los clientes (`customers.ts`) ya se puede emitir desde Comercial → Facturación.
 *
 * Los comprobantes se emiten durante la demo, que es lo que se quiere mostrar. Cobranzas
 * (`customer-receipts.ts`) siembra algunos ya autorizados en este punto de venta para tener qué
 * cobrar; el ARCA simulado numera desde la base, así que la emisión en vivo sigue la numeración.
 */
import type { Ctx } from '../lib/ctx.ts';
import { demoId } from '../lib/ids.ts';
import { NEUQUEN_PROVINCE } from './catalogs.ts';

export async function seedFiscalProfile(ctx: Ctx): Promise<void> {
  const { tx, company } = ctx;

  await tx.company_fiscal_profiles.create({
    data: {
      company_id: company.id,
      tax_condition: 'responsable_inscripto',
      gross_income_regime: 'convenio_multilateral',
      gross_income_number: '901-716543-2',
      activity_start_date: new Date('2012-04-02T00:00:00.000Z'),
      fiscal_street: 'Ruta Provincial 7 Km 5, Parque Industrial',
      fiscal_city: 'Neuquén',
      fiscal_province_id: BigInt(NEUQUEN_PROVINCE),
      fiscal_postal_code: '8300',
      environment: 'homologacion',
    },
  });

  await tx.sales_points.create({
    data: { id: demoId('sales_point', 'casa-central'), company_id: company.id, number: 2, name: 'Casa central' },
  });
}
