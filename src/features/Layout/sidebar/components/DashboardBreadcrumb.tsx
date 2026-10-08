'use client';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { BRAND_NAME } from '@/shared/lib/branding';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { navigationLinks } from '../constants/navigation';
import { createLinkRegex, findBestMatch } from '../utils/sidebar.utils';

/**
 * Migas del header: marca › módulo.
 *
 * Llegan hasta el módulo a propósito. El nombre de la sección lo pone la página como título
 * (`SectionManagerServer`), así que agregarlo acá sería decir lo mismo dos veces a diez píxeles
 * de distancia — que es exactamente lo que había con la barra de pestañas.
 */
export function DashboardBreadcrumb() {
  const pathname = usePathname();

  const activeName = findBestMatch(
    navigationLinks.map((link) => ({ ...link, regex: createLinkRegex(link.href) })),
    pathname
  );
  const activeModule = navigationLinks.find((link) => link.name === activeName);

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="text-caption">
        <BreadcrumbItem className="hidden md:block">
          <BreadcrumbLink asChild>
            <Link href="/dashboard" className="lowercase">
              {BRAND_NAME}
            </Link>
          </BreadcrumbLink>
        </BreadcrumbItem>

        {activeModule && (
          <>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem>
              <BreadcrumbPage className="truncate font-medium">{activeModule.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
