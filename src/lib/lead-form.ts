import type { Json } from "@/integrations/supabase/types";

export const SEGMENT_OPTIONS = [
  "Setor imobiliario",
  "Comercio",
  "Prestacao de servicos",
  "Saude",
  "Construcao civil",
  "Alimentacao",
  "Tecnologia",
  "Educacao",
  "Industria",
  "Transporte e logistica",
  "Profissionais liberais",
  "Terceiro setor",
  "Agronegocio",
  "Franquias",
  "Negocios digitais",
  "Outro",
] as const;

export const TAX_REGIME_OPTIONS = [
  "Pessoa Fisica",
  "MEI",
  "Simples Nacional",
  "Lucro Presumido",
  "Lucro Real",
] as const;

export const SERVICE_TYPE_OPTIONS = [
  "Gestao Contabil",
  "Gestao Trabalhista",
  "Gestao Tributaria",
  "Legalizacao de Empresas",
  "BPO Financeiro",
  "Coworking e Sede Virtual",
  "Coworking - Escritório Virtual",
  "Coworking - Sala Privativa",
  "Coworking - Estação Compartilhada",
  "Coworking - Salas de Reunião",
] as const;

export const HIDDEN_FORM_SERVICE_TYPE_OPTIONS = [
  "Coworking e Sede Virtual",
  "Coworking - Escritório Virtual",
  "Coworking - Sala Privativa",
  "Coworking - Estação Compartilhada",
  "Coworking - Salas de Reunião",
] as const;

const coworkingServiceTypeSet = new Set<string>(HIDDEN_FORM_SERVICE_TYPE_OPTIONS);
const funnelsWithCoworkingServices = new Set([
  "cwk santa efigenia",
  "cwk savassi",
  "cwk lourdes",
]);

export const FORM_SERVICE_TYPE_OPTIONS = SERVICE_TYPE_OPTIONS.filter(
  (serviceType) => !coworkingServiceTypeSet.has(serviceType),
);

const normalizeFunnelName = (value: string | null | undefined) =>
  (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

export const funnelSupportsCoworkingServices = (funnelName: string | null | undefined) =>
  funnelsWithCoworkingServices.has(normalizeFunnelName(funnelName));

export const getServiceTypeOptionsForFunnel = (funnelName: string | null | undefined) =>
  funnelSupportsCoworkingServices(funnelName)
    ? SERVICE_TYPE_OPTIONS.filter((serviceType) => coworkingServiceTypeSet.has(serviceType))
    : SERVICE_TYPE_OPTIONS.filter((serviceType) => !coworkingServiceTypeSet.has(serviceType));

export const COMPANY_MATURITY_OPTIONS = [
  { value: "existing_company", label: "Já tenho uma empresa" },
  { value: "opening_company", label: "Quero abrir uma empresa" },
] as const;

export type CompanyMaturity = (typeof COMPANY_MATURITY_OPTIONS)[number]["value"];

export const COMPANY_MATURITY_LABELS: Record<CompanyMaturity, string> = {
  existing_company: "Já tenho uma empresa",
  opening_company: "Quero abrir uma empresa",
};

export type LeadAdditionalContact = {
  id: string;
  name: string;
  phone: string;
  email: string;
};

const INDICATION_SOURCE_PREFIX = "Indicacao:";
const REFERRAL_PROGRAM_SOURCE_PREFIX = "Valle Indicacao:";
const LEGACY_REFERRAL_PROGRAM_SOURCE_PREFIX = "Programa de Indicacao:";
const REFERRAL_PROGRAM_SOURCE_LABEL = "Valle Indicacao";
const LEGACY_REFERRAL_PROGRAM_SOURCE_LABEL = "Programa de Indicacao";

const normalizeLeadSourceValue = (value: string | null | undefined) =>
  (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

export const formatLeadSourceLabel = (source: string) => {
  if (source === "Indicacao") return "Indicação";
  if (source === LEGACY_REFERRAL_PROGRAM_SOURCE_LABEL || source === REFERRAL_PROGRAM_SOURCE_LABEL) return "Valle Indicação";
  return source;
};

export const buildReferralProgramSource = (indicationBy: string) => {
  const trimmed = indicationBy.trim();
  return trimmed ? `${REFERRAL_PROGRAM_SOURCE_PREFIX} ${trimmed}` : REFERRAL_PROGRAM_SOURCE_LABEL;
};

export const isIndicationLeadSource = (value: string | null | undefined) => {
  const normalized = normalizeLeadSourceValue(value);

  return (
    normalized === "indicacao" ||
    normalized === normalizeLeadSourceValue(REFERRAL_PROGRAM_SOURCE_LABEL) ||
    normalized === normalizeLeadSourceValue(LEGACY_REFERRAL_PROGRAM_SOURCE_LABEL) ||
    normalized.startsWith(normalizeLeadSourceValue(INDICATION_SOURCE_PREFIX)) ||
    normalized.startsWith(normalizeLeadSourceValue(REFERRAL_PROGRAM_SOURCE_PREFIX)) ||
    normalized.startsWith(normalizeLeadSourceValue(LEGACY_REFERRAL_PROGRAM_SOURCE_PREFIX))
  );
};

export const isReferralProgramLeadSource = (value: string | null | undefined) =>
  (value ?? "").trim().toLowerCase() === REFERRAL_PROGRAM_SOURCE_LABEL.toLowerCase() ||
  (value ?? "").trim().toLowerCase() === LEGACY_REFERRAL_PROGRAM_SOURCE_LABEL.toLowerCase() ||
  (value ?? "").trim().toLowerCase().startsWith(REFERRAL_PROGRAM_SOURCE_PREFIX.toLowerCase()) ||
  (value ?? "").trim().toLowerCase().startsWith(LEGACY_REFERRAL_PROGRAM_SOURCE_PREFIX.toLowerCase());

export const parseLeadSource = (value: string | null | undefined) => {
  const source = value?.trim() ?? "";
  if (!source) {
    return {
      source: "",
      indication_by: "",
      is_referral_program: false,
    };
  }

  if (
    source.toLowerCase() === REFERRAL_PROGRAM_SOURCE_LABEL.toLowerCase() ||
    source.toLowerCase() === LEGACY_REFERRAL_PROGRAM_SOURCE_LABEL.toLowerCase() ||
    source.toLowerCase().startsWith(REFERRAL_PROGRAM_SOURCE_PREFIX.toLowerCase()) ||
    source.toLowerCase().startsWith(LEGACY_REFERRAL_PROGRAM_SOURCE_PREFIX.toLowerCase())
  ) {
    const sourcePrefix = source.toLowerCase().startsWith(REFERRAL_PROGRAM_SOURCE_PREFIX.toLowerCase())
      ? REFERRAL_PROGRAM_SOURCE_PREFIX
      : source.toLowerCase().startsWith(LEGACY_REFERRAL_PROGRAM_SOURCE_PREFIX.toLowerCase())
        ? LEGACY_REFERRAL_PROGRAM_SOURCE_PREFIX
        : "";
    return {
      source: REFERRAL_PROGRAM_SOURCE_LABEL,
      indication_by: source.slice(sourcePrefix.length).trim(),
      is_referral_program: true,
    };
  }

  if (!source.toLowerCase().startsWith(INDICATION_SOURCE_PREFIX.toLowerCase())) {
    return {
      source,
      indication_by: "",
      is_referral_program: false,
    };
  }

  return {
    source: "Indicacao",
    indication_by: source.slice(INDICATION_SOURCE_PREFIX.length).trim(),
    is_referral_program: false,
  };
};

export const serializeLeadSource = (source: string, indicationBy: string) => {
  const trimmedSource = source.trim();
  if (!trimmedSource) return null;
  if (trimmedSource === LEGACY_REFERRAL_PROGRAM_SOURCE_LABEL || trimmedSource === REFERRAL_PROGRAM_SOURCE_LABEL) {
    const trimmedIndicationBy = indicationBy.trim();
    return trimmedIndicationBy ? `${REFERRAL_PROGRAM_SOURCE_PREFIX} ${trimmedIndicationBy}` : REFERRAL_PROGRAM_SOURCE_LABEL;
  }
  if (trimmedSource !== "Indicacao") return trimmedSource;

  const trimmedIndicationBy = indicationBy.trim();
  return trimmedIndicationBy ? `${INDICATION_SOURCE_PREFIX} ${trimmedIndicationBy}` : trimmedSource;
};

export const digitsOnly = (value: string) => value.replace(/\D/g, "");

export const formatCnpj = (value: string) => {
  const digits = digitsOnly(value).slice(0, 14);
  if (!digits) return "";
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  }
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
};

export const formatPhone = (value: string) => {
  const digits = digitsOnly(value).slice(0, 11);
  if (!digits) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

export const isValidLeadPhone = (value: string) => {
  const digits = digitsOnly(value);
  return digits.length >= 10 && digits.length <= 11;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const parseAdditionalContacts = (value: Json | null | undefined): LeadAdditionalContact[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      if (!isRecord(item)) return null;
      return {
        id: typeof item.id === "string" && item.id ? item.id : `contact-${index + 1}`,
        name: typeof item.name === "string" ? item.name : "",
        phone: typeof item.phone === "string" ? item.phone : "",
        email: typeof item.email === "string" ? item.email : "",
      };
    })
    .filter((item): item is LeadAdditionalContact => item !== null);
};

export const serializeAdditionalContacts = (contacts: LeadAdditionalContact[]) =>
  contacts
    .map((contact) => ({
      id: contact.id,
      name: contact.name.trim(),
      phone: formatPhone(contact.phone),
      email: contact.email.trim(),
    }))
    .filter((contact) => contact.name || contact.phone || contact.email);
