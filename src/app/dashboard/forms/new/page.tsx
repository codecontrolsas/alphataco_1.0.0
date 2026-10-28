import { companyPageMetadata } from '@/app/_lib/company-metadata';
import { TemplateEditorScreen } from '@/features/Formularios/TemplateEditor/TemplateEditorScreen';

export async function generateMetadata() {
  return companyPageMetadata('Nueva plantilla', (name) => `Nueva plantilla de checklist de ${name}`);
}

export default function NewChecklistTemplatePage() {
  return <TemplateEditorScreen />;
}
