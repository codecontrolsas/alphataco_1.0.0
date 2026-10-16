'use client';

import { useState } from 'react';
import { DiagramMassiveForm } from './DiagramMassiveForm';
import { DiagramMassiveResults } from './DiagramMassiveResults';
import type { ProcessingResult } from './types/massive-diagram';

interface CompletedLoad {
  result: ProcessingResult;
  labels: Record<string, string>;
}

/**
 * Carga masiva: un único formulario y, al confirmar en el panel de revisión, el resultado en el mismo lugar.
 * «Cargar otra» vuelve a un formulario limpio (se remonta con otra `key`).
 */
function DiagramMassive() {
  const [completed, setCompleted] = useState<CompletedLoad | null>(null);
  const [formKey, setFormKey] = useState(0);

  const handleReset = () => {
    setCompleted(null);
    setFormKey((key) => key + 1);
  };

  // La superficie y el título los pone la vista ("Carga masiva").
  if (completed) {
    return <DiagramMassiveResults results={completed.result} employeeLabels={completed.labels} onReset={handleReset} />;
  }

  return <DiagramMassiveForm key={formKey} onCompleted={(result, labels) => setCompleted({ result, labels })} />;
}

export default DiagramMassive;
