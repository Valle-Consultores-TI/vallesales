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
  "Lucro Arbitrado",
  "Produtor Rural",
  "Entidade Imune ou Isenta",
  "Regime Especial de Tributacao",
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

export type LeadAdditionalContact = {
  id: string;
  name: string;
  phone: string;
  email: string;
};

export const digitsOnly = (value: string) => value.replace(/\D/g, "");

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
