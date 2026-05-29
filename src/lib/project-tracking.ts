import type {
  DocumentValidationMode,
  ProjectTrackingFlowType,
  ProjectTrackingStatus,
  ProjectTrackingStepStatus,
} from "@/types/project-tracking";

export const GENERIC_TRACKING_LOOKUP_ERROR =
  "N\u00E3o encontramos um acompanhamento com os dados informados. Confira o c\u00F3digo ou fale com nossa equipe.";

export const sanitizeTrackingCodeInput = (value: string) =>
  value.toUpperCase().replace(/\s+/g, "").slice(0, 12);

export const sanitizeDocumentNumberInput = (value: string) =>
  value.replace(/\D/g, "").slice(0, 14);

export const formatDocumentNumberInput = (value: string) => {
  const digits = sanitizeDocumentNumberInput(value);

  if (digits.length <= 11) {
    return digits
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1-$2");
  }

  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
};

export const FLOW_LABELS: Record<ProjectTrackingFlowType, string> = {
  company_opening: "Abertura da sua empresa",
  existing_company: "Implanta\u00E7\u00E3o do atendimento cont\u00E1bil",
};

export const STATUS_COPY: Record<ProjectTrackingStatus, string> = {
  active: "Em andamento",
  completed: "Conclu\u00EDdo",
  paused: "Pausado",
};

export const STEP_STATUS_COPY: Record<ProjectTrackingStepStatus, string> = {
  completed: "Etapa conclu\u00EDda",
  current: "Em andamento",
  pending: "Pr\u00F3xima etapa",
};

export const shouldRequireDocument = (mode: DocumentValidationMode) => mode === "required";
export const shouldShowDocumentField = (mode: DocumentValidationMode) => mode !== "disabled";
