'use client';

import {
  ChecklistPdfDialog,
  checklistPdfFileName,
  type ChecklistPdfLayoutProps,
} from '@/features/Checklists/components/ChecklistPdfDialog';
import { Download } from 'lucide-react';

type ChecklistPDFDownloadButtonProps = Omit<ChecklistPdfLayoutProps, 'answers' | 'isEmpty' | 'logoUrl'> & {
  // Respuestas del checklist (formato: { section_code: { item_code: value | { left, right } } })
  answers?: Record<string, Record<string, string | { left: string; right: string }>>;
};

export function ChecklistPDFDownloadButton({
  dominio = '',
  tipoEquipo = '',
  fluidoTransportable = '',
  cliente = '',
  observaciones = '',
  fechaInspeccion = '',
  chofer = '',
  answers = {},
  itemObservations = {},
  ...template
}: ChecklistPDFDownloadButtonProps) {
  return (
    <ChecklistPdfDialog
      trigger={
        <>
          <Download className="h-4 w-4" />
          Descargar PDF
        </>
      }
      description={`Vista previa del PDF - ${dominio} - ${fechaInspeccion}`}
      layoutProps={{
        ...template,
        dominio,
        tipoEquipo,
        fluidoTransportable,
        cliente,
        observaciones,
        fechaInspeccion,
        chofer,
        isEmpty: false,
        // Transformar answers al formato que espera el PDF (flat con sufijos _left/_right)
        answers: flattenAnswers(answers),
        itemObservations,
      }}
      fileName={() =>
        checklistPdfFileName(
          template.templateName,
          dominio || 'sin_dominio',
          fechaInspeccion || new Date().toISOString().split('T')[0]
        )
      }
    />
  );
}

/**
 * Transforma el formato de answers del backend al formato plano que espera el PDF
 * Input: { section_code: { item_code: "B" | { left: "B", right: "M" } } }
 * Output: { "item_code": "B", "item_code_left": "B", "item_code_right": "M" }
 */
function flattenAnswers(
  answers: Record<string, Record<string, string | { left: string; right: string }>>
): Record<string, string> {
  const flattened: Record<string, string> = {};

  for (const sectionCode in answers) {
    const sectionAnswers = answers[sectionCode];
    for (const itemCode in sectionAnswers) {
      const value = sectionAnswers[itemCode];
      if (typeof value === 'object' && value !== null && 'left' in value && 'right' in value) {
        // Item con side validation
        flattened[`${itemCode}_left`] = value.left;
        flattened[`${itemCode}_right`] = value.right;
      } else if (typeof value === 'string') {
        // Item normal
        flattened[itemCode] = value;
      }
    }
  }

  return flattened;
}
