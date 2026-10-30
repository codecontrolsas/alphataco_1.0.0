import { buttonVariants } from '@/components/ui/button';
import { getMyHseMaterial } from '@/features/Portal/actions/hse-trainings.queries';
import { requirePortalSection } from '@/features/Portal/navigation/sections.server';
import { cn } from '@/lib/utils';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { CheckCircle2, ChevronLeft, Download, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '../ui/PageHeader';
import { HseMaterialOpenLink } from './HseMaterialOpenLink';
import { HseMaterialReadButton } from './HseMaterialReadButton';

const outlineAction = cn(buttonVariants({ variant: 'outline' }), 'min-h-11 justify-center');

/**
 * Visor del material de una capacitación en página propia (no en un modal): el PDF embebido desde `md` y, siempre,
 * abrir en otra pestaña y descargar de respaldo (los navegadores móviles no muestran PDFs embebidos). "Ya lo leí" queda
 * al pie. Un enlace externo no tiene visor: vuelve a la capacitación. Lo que no le corresponde → 404.
 */
export async function HseMaterialView({ trainingId, materialId }: { trainingId: string; materialId: string }) {
  const employee = await requirePortalSection('trainings');
  const found = await getMyHseMaterial(employee, trainingId, materialId);
  const fileUrl = found?.material.kind === 'file' ? found.material.url : null;
  if (!found || !fileUrl) notFound();
  const { training, material } = found;
  const backHref = `/portal/trainings/${training.id}`;

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: 'Mis capacitaciones', href: '/portal/trainings' },
          { label: training.title, href: backHref },
        ]}
        title={material.title}
        description={
          <>
            {material.isRequired ? 'Lectura obligatoria' : 'Material opcional'}
            {material.readAt && (
              <span className="text-ok-subtle-foreground"> · leído el {formatArgentinaDay(material.readAt)}</span>
            )}
          </>
        }
        className="mb-0"
      />

      <div className="grid gap-2 sm:flex sm:flex-wrap">
        <HseMaterialOpenLink
          materialId={material.id}
          href={fileUrl}
          newTab
          className={outlineAction}
          trackOpen={!material.readAt}
        >
          <ExternalLink aria-hidden="true" className="size-4" /> Abrir en otra pestaña
        </HseMaterialOpenLink>
        {material.downloadUrl && (
          <HseMaterialOpenLink
            materialId={material.id}
            href={material.downloadUrl}
            className={outlineAction}
            trackOpen={!material.readAt}
          >
            <Download aria-hidden="true" className="size-4" /> Descargar
          </HseMaterialOpenLink>
        )}
      </div>

      <iframe
        src={fileUrl}
        title={`Material: ${material.title}`}
        className="bg-muted hidden h-[75vh] w-full rounded-xl border md:block"
      />
      <p className="text-muted-foreground bg-card rounded-xl border p-4 text-sm text-pretty md:hidden">
        En el celular el PDF se abre en otra pestaña o se descarga. Cuando lo termines, volvé acá y marcalo como leído.
      </p>

      <section aria-labelledby="material-read" className="bg-card space-y-3 rounded-xl border p-4 sm:p-6">
        <h2 id="material-read" className="text-base font-semibold">
          {material.readAt ? 'Ya lo marcaste como leído' : '¿Terminaste de leerlo?'}
        </h2>
        {material.readAt ? (
          <p className="text-ok-subtle-foreground flex items-center gap-2 text-sm">
            <CheckCircle2 aria-hidden="true" className="size-4" /> Leído el {formatArgentinaDay(material.readAt)}.
          </p>
        ) : (
          <p className="text-muted-foreground text-sm text-pretty">
            Marcalo como leído: es lo que te habilita a rendir el examen si es obligatorio.
          </p>
        )}
        <div className="grid gap-2 sm:flex sm:flex-wrap">
          {!material.readAt && (
            <HseMaterialReadButton materialId={material.id} trainingId={training.id} title={material.title} />
          )}
          <Link href={backHref} className={outlineAction}>
            <ChevronLeft aria-hidden="true" className="size-4" /> Volver a la capacitación
          </Link>
        </div>
      </section>
    </div>
  );
}
