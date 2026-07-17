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

type NotificationActivity = {
  id: string;
  lead_id: string;
  type: LeadActivityType;
  created_at: string;
  metadata?: Database["public"]["Tables"]["lead_activities"]["Row"]["metadata"] | null;
};

const STAGE_CHANGE_DUPLICATE_WINDOW_MS = 5_000;

const extractStageTransitionKey = (activity: NotificationActivity) => {
  if (activity.type !== "stage_change") return null;
  if (!activity.metadata || typeof activity.metadata !== "object" || Array.isArray(activity.metadata)) return null;

  const metadata = activity.metadata as Record<string, unknown>;
  const fromStageId = typeof metadata.from === "string" ? metadata.from : null;
  const toStageId = typeof metadata.to === "string" ? metadata.to : null;

  if (!fromStageId || !toStageId) return null;
  return `${activity.lead_id}:${fromStageId}:${toStageId}`;
};

export const dedupeNotificationActivities = <T extends NotificationActivity>(activities: T[]): T[] => {
  const stageChangeTimestamps = new Map<string, number[]>();

  return activities.filter((activity) => {
    const dedupeKey = extractStageTransitionKey(activity);
    if (!dedupeKey) return true;

    const createdAtMs = new Date(activity.created_at).getTime();
    if (!Number.isFinite(createdAtMs)) return true;

    const previousTimestamps = stageChangeTimestamps.get(dedupeKey) ?? [];
    const isDuplicate = previousTimestamps.some((timestamp) =>
      Math.abs(timestamp - createdAtMs) <= STAGE_CHANGE_DUPLICATE_WINDOW_MS,
    );

    if (isDuplicate) return false;

    previousTimestamps.push(createdAtMs);
    stageChangeTimestamps.set(dedupeKey, previousTimestamps);
    return true;
  });
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
