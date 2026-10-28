import { requireModulePage } from '@/features/Modules/server/modules.server';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import BackButton from '@/shared/components/common/BackButton';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { getChecklistTemplateForEditor } from './actions.server';
import { ChecklistTemplateForm } from './components/ChecklistTemplateForm';
import { emptySection } from './lib/template-schema';

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="space-y-6 px-4 py-4 sm:px-7">{children}</div>;
}

/**
 * Pantalla del editor de plantillas de checklist (ticket 805): alta (`templateId` ausente) o edición.
 * Las plantillas viven en tablas del módulo Checklists: con él apagado la ruta no existe (404).
 */
export async function TemplateEditorScreen({ templateId }: { templateId?: string }) {
  const [canConfigure] = await Promise.all([
    checkPermissionServer('formularios', 'formularios', 'update'),
    requireModulePage('checklists'),
  ]);

  if (!canConfigure) {
    return (
      <Shell>
        <BackButton />
        <StateBlock variant="noperm" title="No tenés permiso para configurar plantillas de checklist" />
      </Shell>
    );
  }

  if (!templateId) {
    return (
      <Shell>
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Nueva plantilla de checklist</h1>
          <p className="text-muted-foreground text-sm">
            Armá las secciones e ítems que va a completar el operario. La plantilla se crea inactiva: activala cuando
            esté lista.
          </p>
        </div>
        <ChecklistTemplateForm
          mode="create"
          initialValues={{ name: '', description: '', is_active: false, sections: [emptySection()] }}
        />
      </Shell>
    );
  }

  const template = await getChecklistTemplateForEditor(templateId);
  if (!template) {
    return (
      <Shell>
        <BackButton />
        <StateBlock variant="error" title="No se encontró la plantilla" description={`ID: ${templateId}`} />
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Editar plantilla</h1>
        <p className="text-muted-foreground text-sm">Código {template.code}</p>
      </div>
      <ChecklistTemplateForm
        mode="edit"
        templateId={template.id}
        initialValues={template.values}
        answersCount={template.answersCount}
        appliesTo={template.appliesTo}
      />
    </Shell>
  );
}
