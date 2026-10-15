import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import { getPreEmployeeByIdCached } from '@/features/Seleccion/actions/pre-employee-actions.server';
import { PreEmployeeDetailClient } from '@/features/Seleccion/components/PreEmployeeDetailClient';
import { Logger } from '@/lib/logger';
import { notFound } from 'next/navigation';

const logger = new Logger('PreLegajoPage');

interface PreLegajoPageProps {
  searchParams: Promise<{
    action?: 'view' | 'new' | 'edit';
    pre_employee_id?: string;
    section?: string;
    [key: string]: string | string[] | undefined;
  }>;
}

export default async function PreLegajoPage({ searchParams }: PreLegajoPageProps) {
  const resolvedSearchParams = await searchParams;
  const mode = resolvedSearchParams.action === 'new' ? 'new' : resolvedSearchParams.action === 'edit' ? 'edit' : 'view';
  const preEmployeeId = resolvedSearchParams.pre_employee_id ?? '';

  const canView = await checkPermissionServer('seleccion', 'candidatos', 'view');
  if (!canView) notFound();

  let preEmployee: Awaited<ReturnType<typeof getPreEmployeeByIdCached>> = null;

  if (mode !== 'new') {
    if (!preEmployeeId) notFound();

    try {
      preEmployee = await getPreEmployeeByIdCached(preEmployeeId);
      if (!preEmployee) notFound();
    } catch (error) {
      logger.error('Error al obtener el candidato', { data: { error, preEmployeeId } });
      notFound();
    }
  }

  return (
    <>
      {/* La key fuerza el remontaje al cambiar de candidato (o al pasar a "nuevo"): sin ella
          Next reutiliza el componente entre searchParams y react-hook-form conserva los
          defaultValues del anterior, arrastrando los datos del ultimo abierto. */}
      <PreEmployeeDetailClient
        key={preEmployee?.id ?? 'new'}
        preEmployee={preEmployee}
        mode={mode}
        section={resolvedSearchParams.section}
      />
    </>
  );
}

// ─── Metadata ────────────────────────────────────────────────────────────────

export async function generateMetadata({ searchParams }: PreLegajoPageProps) {
  const { pre_employee_id: preEmployeeId } = await searchParams;

  if (!preEmployeeId) {
    return {
      title: 'Nuevo Candidato',
      description: 'Registrar un postulante en proceso de ingreso',
    };
  }

  // getPreEmployeeByIdCached está wrapped con React.cache — reutiliza el resultado
  // ya obtenido en el render principal sin hacer una query adicional
  const preEmployee = await getPreEmployeeByIdCached(preEmployeeId);
  return {
    title: preEmployee
      ? `Candidato N° ${preEmployee.pre_file_number} - ${preEmployee.lastname} ${preEmployee.firstname}`
      : 'Candidato no encontrado',
    description: 'Información del postulante en proceso de ingreso',
  };
}
