import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useActiveFunnel } from "@/hooks/useActiveFunnel";
import { useAuth } from "@/hooks/useAuth";
import { useMyProfile } from "@/hooks/useUserRoles";
import {
  ACTIVITY_NOTIFICATION_PREFERENCES,
  ACTIVITY_NOTIFICATION_TITLES,
  NOTIFICATION_OPTIONS,
  normalizeNotificationPreferences,
  type LeadActivityType,
  type NotificationPreferenceKey,
} from "@/lib/notifications";
import type { Lead, LeadActivity } from "@/types/crm";

type NotificationLeadSummary = Pick<Lead, "id" | "company_or_person" | "contact_name" | "funnel_id">;
type NotificationFeed = {
  activities: Pick<LeadActivity, "id" | "lead_id" | "type" | "description" | "created_at" | "created_by">[];
  leads: NotificationLeadSummary[];
};

export type CrmNotification = {
  id: string;
  leadId: string;
  type: LeadActivityType;
  title: string;
  description: string;
  category: NotificationPreferenceKey;
  categoryLabel: string;
  createdAt: string;
  leadName: string;
  funnelName: string;
  unread: boolean;
  ownActivity: boolean;
};

const MAX_NOTIFICATIONS = 30;
const categoryLabels = new Map(NOTIFICATION_OPTIONS.map((option) => [option.key, option.label]));

const pickLeadLabel = (lead: NotificationLeadSummary | undefined) =>
  lead?.company_or_person?.trim() || lead?.contact_name?.trim() || "Lead sem identificacao";

const buildFallbackDescription = (title: string, leadName: string, funnelName: string) =>
  `${title} em ${leadName} no funil ${funnelName}.`;

export const useNotifications = () => {
  const { user } = useAuth();
  const { funnels } = useActiveFunnel();
  const profileQuery = useMyProfile();
  const queryClient = useQueryClient();

  const feedQuery = useQuery({
    queryKey: ["crm_notifications_feed", user?.id],
    enabled: !!user?.id,
    refetchInterval: 60000,
    queryFn: async (): Promise<NotificationFeed> => {
      const { data: activities, error } = await supabase
        .from("lead_activities")
        .select("id, lead_id, type, description, created_at, created_by")
        .order("created_at", { ascending: false })
        .limit(MAX_NOTIFICATIONS);
      if (error) throw error;

      const leadIds = Array.from(new Set((activities ?? []).map((activity) => activity.lead_id)));

      if (leadIds.length === 0) {
        return { activities: [], leads: [] };
      }

      const { data: leads, error: leadsError } = await supabase
        .from("leads")
        .select("id, company_or_person, contact_name, funnel_id")
        .in("id", leadIds);
      if (leadsError) throw leadsError;

      return {
        activities: (activities ?? []) as NotificationFeed["activities"],
        leads: (leads ?? []) as NotificationLeadSummary[],
      };
    },
  });

  const markAllAsRead = useMutation({
    mutationFn: async () => {
      if (!user?.id) return;
      const { error } = await supabase
        .from("profiles")
        .update({ notifications_last_read_at: new Date().toISOString() })
        .eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["my_profile", user?.id] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const notifications = useMemo(() => {
    const preferences = normalizeNotificationPreferences(profileQuery.data?.notification_preferences ?? null);
    const lastReadAtMs = profileQuery.data?.notifications_last_read_at
      ? new Date(profileQuery.data.notifications_last_read_at).getTime()
      : 0;
    const funnelsById = new Map(funnels.map((funnel) => [funnel.id, funnel.name]));
    const leadsById = new Map((feedQuery.data?.leads ?? []).map((lead) => [lead.id, lead]));

    return (feedQuery.data?.activities ?? [])
      .flatMap((activity) => {
        const category = ACTIVITY_NOTIFICATION_PREFERENCES[activity.type];
        if (!category || !preferences[category]) return [];

        const lead = leadsById.get(activity.lead_id);
        if (!lead) return [];

        const title = ACTIVITY_NOTIFICATION_TITLES[activity.type] ?? "Atualizacao no CRM";
        const leadName = pickLeadLabel(lead);
        const funnelName = funnelsById.get(lead.funnel_id) ?? "Funil";
        const createdAtMs = new Date(activity.created_at).getTime();

        return [{
          id: activity.id,
          leadId: activity.lead_id,
          type: activity.type,
          title,
          description: activity.description?.trim() || buildFallbackDescription(title, leadName, funnelName),
          category,
          categoryLabel: categoryLabels.get(category) ?? "Notificacao",
          createdAt: activity.created_at,
          leadName,
          funnelName,
          unread: Number.isFinite(createdAtMs) && createdAtMs > lastReadAtMs,
          ownActivity: activity.created_by === user?.id,
        } satisfies CrmNotification];
      })
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  }, [feedQuery.data?.activities, feedQuery.data?.leads, funnels, profileQuery.data?.notification_preferences, profileQuery.data?.notifications_last_read_at, user?.id]);

  const unreadCount = notifications.filter((notification) => notification.unread).length;

  return {
    notifications,
    unreadCount,
    loading: feedQuery.isLoading || profileQuery.isLoading,
    error: (feedQuery.error as Error | null) ?? (profileQuery.error as Error | null),
    markAllAsRead,
  };
};
