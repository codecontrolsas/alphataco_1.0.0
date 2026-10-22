'use client';

import {
  ChecklistPdfDialog,
  checklistPdfFileName,
  type ChecklistPdfLayoutProps,
} from '@/features/Checklists/components/ChecklistPdfDialog';
import { PdfFileIcon } from '@/shared/components/common/PdfFileIcon';

type ChecklistPDFButtonProps = Pick<
  ChecklistPdfLayoutProps,
  'templateName' | 'templateCode' | 'sections' | 'date' | 'revision'
>;

export function ChecklistPDFButton(props: ChecklistPDFButtonProps) {
  return (
    <ChecklistPdfDialog
      trigger={
        <>
          <PdfFileIcon />
          Imprimir PDF vacío
        </>
      }
      description="Vista previa del PDF vacío"
      layoutProps={{ ...props, isEmpty: true }}
      fileName={() => checklistPdfFileName(props.templateName, new Date().toISOString().split('T')[0])}
    />
  );
}
