import type { Funnel, Lead, TrackingFlowKey } from "@/types/crm";

export const CUSTOMER_TRACKING_STORAGE_KEY = "vallesales-active-customer-tracking-funnel-id";
export const VALLE_FUNNEL_NAME = "Valle Consultores";

export const TRACKING_FLOW_LABELS: Record<TrackingFlowKey, string> = {
  opening_company: "Registro e Legalização",
  existing_company: "Onboarding",
};

export const getTrackingFlowActionLabel = (flow: TrackingFlowKey, action: "Enviar para" | "Mover para") =>
  `${action} ${TRACKING_FLOW_LABELS[flow]}`;

export const normalizeTrackingText = (value: string | null | undefined) =>
  (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

export const isValleSalesFunnel = (funnelName: string | null | undefined) =>
  normalizeTrackingText(funnelName) === normalizeTrackingText(VALLE_FUNNEL_NAME);

export const inferTrackingFlowFromLead = (lead: Pick<Lead, "company_maturity" | "service_types" | "cnpj">): TrackingFlowKey | null => {
  if (lead.company_maturity === "opening_company") return "opening_company";
  if (lead.company_maturity === "existing_company") return "existing_company";

  const normalizedServices = (lead.service_types ?? []).map(normalizeTrackingText);
  if (normalizedServices.some((service) => service.includes("legalizacao"))) {
    return "opening_company";
  }

  if ((lead.cnpj ?? "").trim()) {
    return "existing_company";
  }

  return null;
};

export const getTrackingTransferLabel = (lead: Pick<Lead, "company_maturity" | "service_types" | "cnpj">) => {
  const flow = inferTrackingFlowFromLead(lead);
  if (!flow) return null;
  return getTrackingFlowActionLabel(flow, "Enviar para");
};

export const getTrackingTransferActions = (lead: Pick<Lead, "company_maturity" | "service_types" | "cnpj">) => {
  const inferredFlow = inferTrackingFlowFromLead(lead);
  if (inferredFlow) {
    return [{
      flow: inferredFlow,
      label: getTrackingFlowActionLabel(inferredFlow, "Enviar para"),
    }];
  }

  return [
    { flow: "opening_company" as TrackingFlowKey, label: getTrackingFlowActionLabel("opening_company", "Enviar para") },
    { flow: "existing_company" as TrackingFlowKey, label: getTrackingFlowActionLabel("existing_company", "Enviar para") },
  ];
};

export const sortTrackingFunnels = (funnels: Funnel[]) => {
  const flowOrder: TrackingFlowKey[] = ["opening_company", "existing_company"];
  return [...funnels].sort((left, right) => {
    const leftIndex = flowOrder.indexOf((left.tracking_flow_key ?? "") as TrackingFlowKey);
    const rightIndex = flowOrder.indexOf((right.tracking_flow_key ?? "") as TrackingFlowKey);
    return leftIndex - rightIndex || left.name.localeCompare(right.name);
  });
};
