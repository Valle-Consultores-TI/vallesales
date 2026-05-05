import type { Database } from "@/integrations/supabase/types";

export const OWNER_EMAIL = "marketing@valleconsultores.com.br";

export type AppRole = Database["public"]["Enums"]["app_role"];
export type OperationalRole = Exclude<AppRole, "user">;
export type UserAccessStatus = Database["public"]["Enums"]["user_access_status"];

export const ROLE_LABELS: Record<OperationalRole, string> = {
  admin: "Admin",
  gestor: "Gestor",
  consultor: "Consultor",
  visualizador: "Visualizador",
};

export const ROLE_OPTIONS: { value: OperationalRole; label: string; description: string }[] = [
  { value: "admin", label: "Admin", description: "Acesso total ao sistema" },
  { value: "gestor", label: "Gestor", description: "Gerencia leads e equipe" },
  { value: "consultor", label: "Consultor", description: "Acessa apenas seus leads" },
  { value: "visualizador", label: "Visualizador", description: "Apenas leitura" },
];

export const STATUS_LABELS: Record<UserAccessStatus, string> = {
  pending: "Aguardando aprovacao",
  active: "Ativo",
  suspended: "Suspenso",
  inactive: "Inativo",
};

export const MANAGEABLE_STATUS_OPTIONS: {
  value: Exclude<UserAccessStatus, "pending">;
  label: string;
  description: string;
}[] = [
  { value: "active", label: "Ativo", description: "Acesso operacional liberado" },
  { value: "suspended", label: "Suspenso", description: "Acesso bloqueado temporariamente" },
  { value: "inactive", label: "Inativo", description: "Acesso operacional desligado" },
];

export const normalizeEmail = (email?: string | null) => (email ?? "").trim().toLowerCase();

export const isOwnerEmail = (email?: string | null) => normalizeEmail(email) === OWNER_EMAIL;

export const isOperationalRole = (role?: AppRole | null): role is OperationalRole =>
  role === "admin" || role === "gestor" || role === "consultor" || role === "visualizador";
