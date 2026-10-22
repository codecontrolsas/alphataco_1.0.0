import { getCompanyName } from '@/features/Empresa/General/actions/company.server';
import { cookies } from 'next/headers';

/**
 * `generateMetadata` de las páginas del tablero: "<sección> | <empresa>" con la empresa de la cookie o, si
 * no está, la activa. Devuelve `undefined` si no hay empresa (la página conserva el título por defecto).
 */
export async function companyPageMetadata(section: string, describe: (companyName: string) => string) {
  const cookiesStore = await cookies();
  const companyName = cookiesStore.get('actualCompName')?.value || (await getCompanyName())?.company_name;
  if (!companyName) return undefined;
  return { title: `${section} | ${companyName}`, description: describe(companyName) };
}
