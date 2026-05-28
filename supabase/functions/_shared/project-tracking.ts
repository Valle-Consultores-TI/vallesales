export type ProjectTrackingFlowType = "company_opening" | "existing_company";
export type ProjectTrackingStatus = "active" | "completed" | "paused";
export type DocumentValidationMode = "disabled" | "optional" | "required";

export const FLOW_LABELS: Record<ProjectTrackingFlowType, string> = {
  company_opening: "Abertura da sua empresa",
  existing_company: "Implantacao do atendimento contabil",
};

export const STATUS_LABELS: Record<ProjectTrackingStatus, string> = {
  active: "Em andamento",
  completed: "Concluido",
  paused: "Pausado",
};

export const GENERIC_LOOKUP_ERROR =
  "Nao encontramos um acompanhamento com os dados informados. Confira o codigo ou fale com nossa equipe.";

export const sanitizeTrackingCode = (value: unknown) => {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, "").toUpperCase();
};

export const sanitizeDocumentNumber = (value: unknown) => {
  if (typeof value !== "string") return "";
  return value.replace(/\D/g, "");
};

export const normalizeOptionalString = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

export const isProjectTrackingFlowType = (value: unknown): value is ProjectTrackingFlowType =>
  value === "company_opening" || value === "existing_company";

export const isDocumentValidationMode = (value: unknown): value is DocumentValidationMode =>
  value === "disabled" || value === "optional" || value === "required";

export const flowFromExistingCompanyFlag = (value: unknown): ProjectTrackingFlowType =>
  value === true ? "existing_company" : "company_opening";

export const buildTrackingMessage = ({
  name,
  trackingCode,
  baseUrl,
}: {
  name: string;
  trackingCode: string;
  baseUrl: string;
}) => [
  `Ola, ${name}! Seu acompanhamento na VALLE ja esta disponivel.`,
  "",
  "Acesse:",
  `${baseUrl.replace(/\/$/, "")}/acompanhar`,
  "",
  "Seu codigo de acompanhamento e:",
  trackingCode,
  "",
  "Por la voce podera ver em qual etapa esta o seu processo.",
].join("\n");
