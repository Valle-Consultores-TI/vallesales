import type { Database } from "@/integrations/supabase/types";
import type { Profile } from "@/types/crm";

export type NotificationPreferenceKey =
  | "new_leads"
  | "contact_changes"
  | "tasks"
  | "funnel_updates"
  | "team_updates";

export type NotificationPreferences = Record<NotificationPreferenceKey, boolean>;
export type LeadActivityType = Database["public"]["Enums"]["activity_type"];

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  new_leads: true,
  contact_changes: true,
  tasks: true,
  funnel_updates: true,
  team_updates: false,
};

export const NOTIFICATION_OPTIONS: {
  key: NotificationPreferenceKey;
  label: string;
  description: string;
}[] = [
  {
    key: "new_leads",
    label: "Novos leads",
    description: "Avisos quando um novo lead entrar na sua fila ou no seu funil.",
  },
  {
    key: "contact_changes",
    label: "Alteracoes em contatos",
    description: "Atualizacoes importantes em contatos e relacoes ligadas aos seus negocios.",
  },
  {
    key: "tasks",
    label: "Tarefas",
    description: "Lembretes e movimentacoes de tarefas vinculadas ao seu trabalho comercial.",
  },
  {
    key: "funnel_updates",
    label: "Atualizacoes no funil",
    description: "Mudancas de etapa, ganhos, perdas e avancos relevantes no funil.",
  },
  {
    key: "team_updates",
    label: "Notificacoes da equipe",
    description: "Comunicados operacionais e movimentacoes compartilhadas do time.",
  },
];

export const ACTIVITY_NOTIFICATION_PREFERENCES: Partial<Record<LeadActivityType, NotificationPreferenceKey>> = {
  lead_created: "new_leads",
  lead_updated: "contact_changes",
  stage_change: "funnel_updates",
  owner_change: "team_updates",
  note_added: "team_updates",
  contact_logged: "team_updates",
  attachment_added: "team_updates",
};

export const ACTIVITY_NOTIFICATION_TITLES: Partial<Record<LeadActivityType, string>> = {
  lead_created: "Novo lead criado",
  lead_updated: "Contato atualizado",
  stage_change: "Lead movido de etapa",
  owner_change: "Responsavel alterado",
  note_added: "Nova observacao",
  contact_logged: "Contato registrado",
  attachment_added: "Novo anexo",
};

export const normalizeNotificationPreferences = (
  value: Profile["notification_preferences"] | null,
): NotificationPreferences => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }

  const raw = value as Record<string, unknown>;

  return {
    new_leads: typeof raw.new_leads === "boolean" ? raw.new_leads : DEFAULT_NOTIFICATION_PREFERENCES.new_leads,
    contact_changes:
      typeof raw.contact_changes === "boolean"
        ? raw.contact_changes
        : DEFAULT_NOTIFICATION_PREFERENCES.contact_changes,
    tasks: typeof raw.tasks === "boolean" ? raw.tasks : DEFAULT_NOTIFICATION_PREFERENCES.tasks,
    funnel_updates:
      typeof raw.funnel_updates === "boolean"
        ? raw.funnel_updates
        : DEFAULT_NOTIFICATION_PREFERENCES.funnel_updates,
    team_updates:
      typeof raw.team_updates === "boolean"
        ? raw.team_updates
        : DEFAULT_NOTIFICATION_PREFERENCES.team_updates,
  };
};
