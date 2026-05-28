export type ProjectTrackingFlowType = "company_opening" | "existing_company";
export type ProjectTrackingStatus = "active" | "completed" | "paused";
export type ProjectTrackingStepStatus = "pending" | "current" | "completed";
export type DocumentValidationMode = "disabled" | "optional" | "required";

export type ProjectTrackingStep = {
  stepKey: string;
  publicName: string;
  publicDescription: string;
  order: number;
  status: ProjectTrackingStepStatus;
};

export type ProjectTrackingCurrentStep = {
  stepKey: string;
  publicName: string;
  publicDescription: string;
  status: ProjectTrackingStepStatus;
};

export type ProjectTrackingPreviousPhase = {
  flowType: ProjectTrackingFlowType;
  flowLabel: string;
  completedAt: string | null;
  title: string;
  description: string;
};

export type ProjectTrackingLookupResponse = {
  ok: true;
  trackingCode: string;
  documentValidationMode: DocumentValidationMode;
  clientName: string | null;
  companyName: string | null;
  displayName: string | null;
  flowType: ProjectTrackingFlowType;
  flowLabel: string;
  status: ProjectTrackingStatus;
  statusLabel: string;
  currentStepKey: string | null;
  progressPercentage: number;
  updatedAt: string;
  completedAt: string | null;
  currentStep: ProjectTrackingCurrentStep | null;
  steps: ProjectTrackingStep[];
  previousPhase: ProjectTrackingPreviousPhase | null;
  finalMessage: string | null;
};

export type ProjectTrackingConfigResponse = {
  ok: true;
  documentValidationMode: DocumentValidationMode;
};
