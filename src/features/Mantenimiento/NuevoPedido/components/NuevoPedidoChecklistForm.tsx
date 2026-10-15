'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { fetchAllEquipmentBasicData } from '@/features/Mantenimiento/actions/equipment-basic';
import { useRouter } from 'next/navigation';
import { useNewRequestData } from '../hooks/useNewRequestData';
import { useNewRequestHandlers } from '../hooks/useNewRequestHandlers';
import { useNewRequestState } from '../hooks/useNewRequestState';
import { useSubmitNewRequest } from '../hooks/useSubmitNewRequest';
import { canAdvanceStep } from '../lib/can-advance-step';
import { NewRequestCompletion } from './nuevo-pedido/NewRequestCompletion';
import { StepChecklistItems } from './nuevo-pedido/StepChecklistItems';
import { StepConfirm } from './nuevo-pedido/StepConfirm';
import { StepEquipmentSelector } from './nuevo-pedido/StepEquipmentSelector';
import { StepManualRepairs } from './nuevo-pedido/StepManualRepairs';
import { StepRequestType } from './nuevo-pedido/StepRequestType';
import { StepResource } from './nuevo-pedido/StepResource';
import { StepSupervisor } from './nuevo-pedido/StepSupervisor';
import { WizardNavigation } from './nuevo-pedido/WizardNavigation';
import { WizardProgressBar, WizardStepper } from './nuevo-pedido/WizardProgress';

interface NuevoPedidoChecklistFormProps {
  equipment: Awaited<ReturnType<typeof fetchAllEquipmentBasicData>>;
  default_equipment_id?: string;
  onSuccess?: () => void;
  driverEmployeeId?: string;
  driverName?: string;
  driverFileNumber?: string;
  skipSupervisorQuestion?: boolean;
  successRedirectUrl?: string;
}

export function NuevoPedidoChecklistForm({
  equipment,
  default_equipment_id,
  onSuccess,
  driverEmployeeId,
  driverName,
  driverFileNumber,
  skipSupervisorQuestion = false,
  successRedirectUrl,
}: NuevoPedidoChecklistFormProps) {
  const router = useRouter();

  // Km/horas del equipo por defecto (flujo QR), para precargar la medición
  const defaultEquip = default_equipment_id ? equipment?.find((e) => e.id === default_equipment_id) : null;

  const state = useNewRequestState({
    defaultEquipmentId: default_equipment_id,
    defaultKilometer: defaultEquip?.kilometer,
    defaultEngineHours: defaultEquip?.engine_hours,
    skipSupervisorQuestion,
  });
  const data = useNewRequestData({ state, equipment, defaultEquipmentId: default_equipment_id });
  const handlers = useNewRequestHandlers(state, data);
  const { handleSubmit } = useSubmitNewRequest({
    state,
    data,
    defaultEquipmentId: default_equipment_id,
    driverEmployeeId,
    skipSupervisorQuestion,
    onSuccess,
  });

  const { steps, currentStepKey } = data;
  const { currentStep, requestType, isSubmitting, isCurrentUserSupervisor } = state;

  const canAdvance = canAdvanceStep({
    stepKey: currentStepKey,
    requestType,
    hasPendingManualDraft: state.hasPendingManualDraft,
    hasOrphanManualDraft: state.hasOrphanManualDraft,
    selectedEquipmentId: state.selectedEquipmentId,
    selectedTemplateId: state.selectedTemplateId,
    selectedPreventiveType: state.selectedPreventiveType,
    selectedDeviationCount: state.selectedDeviations.length,
    manualItemCount: state.manualItems.length,
    manualRepairCount: state.manualRepairs.length,
    selectedSupervisorId: state.selectedSupervisorId,
    isCurrentUserSupervisor,
  });

  const renderCurrentStep = () => {
    switch (currentStepKey) {
      case 'resource':
        return (
          <StepResource isOtherEquipment={data.isOtherEquipment} onChangeKind={handlers.handleChangeResourceKind} />
        );
      case 'equipment':
        return (
          <StepEquipmentSelector
            default_equipment_id={default_equipment_id}
            engineHours={state.engineHours}
            equipmentOpen={state.equipmentOpen}
            filteredEquipment={data.filteredEquipment}
            handleSelectEquipment={handlers.handleSelectEquipment}
            hasOtherEquipmentError={data.hasOtherEquipmentError}
            isLoadingOtherEquipment={data.isLoadingOtherEquipment}
            isOtherEquipment={data.isOtherEquipment}
            kilometer={state.kilometer}
            refetchOtherEquipment={data.refetchOtherEquipment}
            selectedEquipment={data.selectedEquipment}
            selectedEquipmentId={state.selectedEquipmentId}
            setEngineHours={state.setEngineHours}
            setEquipmentOpen={state.setEquipmentOpen}
            setKilometer={state.setKilometer}
            setSearchTerm={state.setSearchTerm}
            totalMatchingResources={data.totalMatchingResources}
          />
        );
      case 'type':
        return (
          <StepRequestType
            handleChangeRequestType={handlers.handleChangeRequestType}
            handleSelectTemplate={handlers.handleSelectTemplate}
            isLoadingTemplates={data.isLoadingTemplates}
            isOtherEquipment={data.isOtherEquipment}
            preventiveDescription={state.preventiveDescription}
            requestType={requestType}
            selectedPreventiveType={state.selectedPreventiveType}
            selectedTemplateId={state.selectedTemplateId}
            setPreventiveDescription={state.setPreventiveDescription}
            setSelectedPreventiveType={state.setSelectedPreventiveType}
            templates={data.templates}
            templatesError={data.templatesError}
            refetchTemplates={() => void data.refetchTemplates()}
            visibleRequestTypes={data.visibleRequestTypes}
          />
        );
      case 'items':
        return requestType === 'manual' ? (
          <StepManualRepairs
            repairs={state.manualRepairs}
            onChange={state.setManualRepairs}
            inputRef={state.manualRepairsRef}
            onDraftStateChange={state.handleManualDraftStateChange}
            disabled={isSubmitting}
          />
        ) : (
          <StepChecklistItems
            deviationComments={state.deviationComments}
            handleToggleDeviation={handlers.handleToggleDeviation}
            handleUpdateComment={handlers.handleUpdateComment}
            isSubmitting={isSubmitting}
            manualItems={state.manualItems}
            selectedDeviations={state.selectedDeviations}
            selectedTemplate={data.selectedTemplate}
            selectedTemplateId={state.selectedTemplateId}
            setManualItems={state.setManualItems}
          />
        );
      case 'supervisor':
        return (
          <StepSupervisor
            currentUser={data.currentUser}
            isCurrentUserSupervisor={isCurrentUserSupervisor}
            isLoadingCurrentUser={data.isLoadingCurrentUser}
            isLoadingSupervisors={data.isLoadingSupervisors}
            hasSupervisorsError={data.hasSupervisorsError}
            refetchSupervisors={() => void data.refetchSupervisors()}
            selectedSupervisor={data.selectedSupervisor}
            selectedSupervisorId={state.selectedSupervisorId}
            setIsCurrentUserSupervisor={state.setIsCurrentUserSupervisor}
            setSelectedSupervisorId={state.setSelectedSupervisorId}
            setSupervisorOpen={state.setSupervisorOpen}
            skipSupervisorQuestion={skipSupervisorQuestion}
            supervisorOpen={state.supervisorOpen}
            supervisors={data.supervisors}
          />
        );
      case 'confirm':
        return (
          <StepConfirm
            currentUser={data.currentUser}
            driverFileNumber={driverFileNumber}
            driverName={driverName}
            engineHours={state.engineHours}
            isCurrentUserSupervisor={isCurrentUserSupervisor}
            isOtherEquipment={data.isOtherEquipment}
            kilometer={state.kilometer}
            manualRepairs={state.manualRepairs}
            preventiveDescription={state.preventiveDescription}
            requestType={requestType}
            selectedDeviations={state.selectedDeviations}
            selectedEquipment={data.selectedEquipment}
            selectedPreventiveType={state.selectedPreventiveType}
            selectedSupervisor={data.selectedSupervisor}
          />
        );
      default:
        return null;
    }
  };

  if (state.completion) {
    return (
      <NewRequestCompletion
        completion={state.completion}
        successRedirectUrl={successRedirectUrl}
        onGoToEquipment={(url) => router.push(url)}
        onLoadAnother={() => state.setCompletion(null)}
      />
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <WizardProgressBar steps={steps} currentStep={currentStep} />
      <WizardStepper steps={steps} currentStep={currentStep} />

      <Card className="lg:col-span-2" aria-busy={isSubmitting}>
        <CardHeader>
          <CardTitle className="text-xl">{steps[currentStep].title}</CardTitle>
        </CardHeader>
        <CardContent>{renderCurrentStep()}</CardContent>

        <Separator />

        <WizardNavigation
          currentStep={currentStep}
          isLastStep={currentStep >= steps.length - 1}
          canAdvance={canAdvance}
          isSubmitting={isSubmitting}
          isCurrentUserSupervisor={isCurrentUserSupervisor}
          onBack={handlers.handleBackStep}
          onNext={handlers.handleAdvanceStep}
          onSubmit={handleSubmit}
        />
      </Card>
    </div>
  );
}
