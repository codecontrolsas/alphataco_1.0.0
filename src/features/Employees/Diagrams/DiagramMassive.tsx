'use client';

import { useState } from 'react';
import { ConflictResolutionModal } from './ConflictResolutionModal';
import { DiagramMassiveForm } from './DiagramMassiveForm';
import { DiagramMassiveResults, ProcessingResult } from './DiagramMassiveResults';
import { StepIndicator } from './components/StepIndicator';
import type { ConflictData, MassiveFormData } from './types/massive-diagram';

function DiagramMassive() {
  const [currentStep, setCurrentStep] = useState<'form' | 'conflicts' | 'results'>('form');
  const [formData, setFormData] = useState<MassiveFormData | null>(null);
  const [conflicts, setConflicts] = useState<ConflictData | null>(null);
  const [results, setResults] = useState<ProcessingResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleConflictsFound = (conflictData: ConflictData, data: MassiveFormData) => {
    setFormData(data);
    setConflicts(conflictData);
    setCurrentStep('conflicts');
  };

  const handleProcessingComplete = (result: ProcessingResult) => {
    setResults(result);
    setCurrentStep('results');
  };

  const handleStartOver = () => {
    setCurrentStep('form');
    setFormData(null);
    setConflicts(null);
    setResults(null);
  };

  // La superficie y el título los pone la vista ("Carga masiva"); acá solo los pasos del circuito.
  return (
    <div className="space-y-6">
      <StepIndicator currentStep={currentStep} />

      {currentStep === 'form' && (
        <DiagramMassiveForm
          onConflictsFound={handleConflictsFound}
          onProcessingComplete={handleProcessingComplete}
          loading={loading}
          setLoading={setLoading}
        />
      )}

      {currentStep === 'conflicts' && conflicts && formData && (
        <ConflictResolutionModal
          conflicts={conflicts}
          formData={formData}
          onCancel={handleStartOver}
          onProcessingComplete={handleProcessingComplete}
        />
      )}

      {currentStep === 'results' && results && (
        <DiagramMassiveResults results={results} onStartOver={handleStartOver} />
      )}
    </div>
  );
}

export default DiagramMassive;
