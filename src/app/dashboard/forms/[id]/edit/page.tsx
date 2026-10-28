import { companyPageMetadata } from '@/app/_lib/company-metadata';
import { TemplateEditorScreen } from '@/features/Formularios/TemplateEditor/TemplateEditorScreen';

export async function generateMetadata() {
  return companyPageMetadata('Editar plantilla', (name) => `Editar plantilla de checklist de ${name}`);
}

export default async function EditChecklistTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TemplateEditorScreen templateId={id} />;
}
