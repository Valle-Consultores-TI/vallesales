import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useActiveFunnel } from "@/hooks/useActiveFunnel";
import { useAuth } from "@/hooks/useAuth";
import { useMyProfile } from "@/hooks/useUserRoles";
import {
  ACTIVITY_NOTIFICATION_PREFERENCES,
  ACTIVITY_NOTIFICATION_TITLES,
  NOTIFICATION_OPTIONS,
  dedupeNotificationActivities,
  normalizeNotificationPreferences,
  type LeadActivityType,
  type NotificationPreferenceKey,
} from "@/lib/notifications";
import type { Lead, LeadActivity } from "@/types/crm";

type NotificationLeadSummary = Pick<Lead, "id" | "company_or_person" | "contact_name" | "funnel_id" | "is_archived">;
type UserNotificationRow = Pick<
  Database["public"]["Tables"]["user_notifications"]["Row"],
  "id" | "kind" | "title" | "message" | "href" | "metadata" | "created_at" | "read_at"
>;
type NotificationFeed = {
  activities: Pick<LeadActivity, "id" | "lead_id" | "type" | "description" | "created_at" | "created_by" | "metadata">[];
  leads: NotificationLeadSummary[];
  userNotifications: UserNotificationRow[];
};

export type CrmNotification = {
  id: string;
  leadId: string;
  funnelId: string;
  type: LeadActivityType | string;
  title: string;
  description: string;
  category: NotificationPreferenceKey;
  categoryLabel: string;
  createdAt: string;
  leadName: string;
  funnelName: string;
  unread: boolean;
  ownActivity: boolean;
  href: string;
};

const MAX_NOTIFICATIONS = 30;
const categoryLabels = new Map(NOTIFICATION_OPTIONS.map((option) => [option.key, option.label]));

const pickLeadLabel = (lead: NotificationLeadSummary | undefined) =>
  lead?.company_or_person?.trim() || lead?.contact_name?.trim() || "Lead sem identificacao";

const buildFallbackDescription = (title: string, leadName: string, funnelName: string) =>
  `${title} em ${leadName} no funil ${funnelName}.`;

const buildNotificationHref = (lead: NotificationLeadSummary) => {
  const params = new URLSearchParams({
    leadId: lead.id,
    funnelId: lead.funnel_id,
  });

  return `${lead.is_archived ? "/arquivados" : "/"}?${params.toString()}`;
};

const buildNotificationDescription = ({
  activity,
  leadName,
  funnelName,
  title,
}: {
  activity: Pick<LeadActivity, "type" | "description">;
  leadName: string;
  funnelName: string;
  title: string;
}) => {
  const rawDescription = activity.description?.trim();
  if (!rawDescription) {
    return buildFallbackDescription(title, leadName, funnelName);
  }

  const normalizedDescription = rawDescription.toLocaleLowerCase("pt-BR");
  const normalizedLeadName = leadName.toLocaleLowerCase("pt-BR");
  if (normalizedDescription.includes(normalizedLeadName)) {
    return rawDescription;
  }

  if (activity.type === "stage_change") {
    return `${leadName}: ${rawDescription}`;
  }

  return rawDescription;
};

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
      const [
        { data: activities, error },
        { data: userNotifications, error: userNotificationsError },
      ] = await Promise.all([
        supabase
          .from("lead_activities")
          .select("id, lead_id, type, description, created_at, created_by, metadata")
          .order("created_at", { ascending: false })
          .limit(MAX_NOTIFICATIONS),
        supabase
          .from("user_notifications")
          .select("id, kind, title, message, href, metadata, created_at, read_at")
          .order("created_at", { ascending: false })
          .limit(MAX_NOTIFICATIONS),
      ]);
      if (error) throw error;
      if (userNotificationsError) throw userNotificationsError;

      const leadIds = Array.from(new Set((activities ?? []).map((activity) => activity.lead_id)));

      if (leadIds.length === 0) {
        return {
          activities: [],
          leads: [],
          userNotifications: (userNotifications ?? []) as UserNotificationRow[],
        };
      }

      const { data: leads, error: leadsError } = await supabase
        .from("leads")
        .select("id, company_or_person, contact_name, funnel_id, is_archived")
        .in("id", leadIds);
      if (leadsError) throw leadsError;

      return {
        activities: (activities ?? []) as NotificationFeed["activities"],
        leads: (leads ?? []) as NotificationLeadSummary[],
        userNotifications: (userNotifications ?? []) as UserNotificationRow[],
      };
    },
  });

  const markAllAsRead = useMutation({
    mutationFn: async () => {
      if (!user?.id) return;
      const readAt = new Date().toISOString();
      const [{ error }, { error: userNotificationsError }] = await Promise.all([
        supabase
          .from("profiles")
          .update({ notifications_last_read_at: readAt })
          .eq("id", user.id),
        supabase
          .from("user_notifications")
          .update({ read_at: readAt })
          .eq("recipient_user_id", user.id)
          .is("read_at", null),
      ]);
      if (error) throw error;
      if (userNotificationsError) throw userNotificationsError;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["my_profile", user?.id] }),
        queryClient.invalidateQueries({ queryKey: ["crm_notifications_feed", user?.id] }),
      ]);
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

    const activityNotifications = dedupeNotificationActivities(
      [...(feedQuery.data?.activities ?? [])].sort(
        (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
      ),
    )
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
          funnelId: lead.funnel_id,
          type: activity.type,
          title,
          description: buildNotificationDescription({
            activity,
            leadName,
            funnelName,
            title,
          }),
          category,
          categoryLabel: categoryLabels.get(category) ?? "Notificacao",
          createdAt: activity.created_at,
          leadName,
          funnelName,
          unread: Number.isFinite(createdAtMs) && createdAtMs > lastReadAtMs,
          ownActivity: activity.created_by === user?.id,
          href: buildNotificationHref(lead),
        } satisfies CrmNotification];
      })
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());

    const targetedNotifications = (feedQuery.data?.userNotifications ?? []).map((notification) => {
      const metadata =
        notification.metadata && typeof notification.metadata === "object" && !Array.isArray(notification.metadata)
          ? (notification.metadata as Record<string, unknown>)
          : null;
      const clientName = typeof metadata?.client_name === "string" && metadata.client_name.trim()
        ? metadata.client_name
        : typeof metadata?.client_email === "string" && metadata.client_email.trim()
          ? metadata.client_email
          : "Cliente do portal";
      const leadId = typeof metadata?.client_user_id === "string" && metadata.client_user_id.trim()
        ? metadata.client_user_id
        : notification.id;
      const funnelId = typeof metadata?.source_funnel_id === "string" && metadata.source_funnel_id.trim()
        ? metadata.source_funnel_id
        : "__portal__";

      return {
        id: notification.id,
        leadId,
        funnelId,
        type: notification.kind,
        title: notification.title,
        description: notification.message,
        category: "team_updates" as const,
        categoryLabel: "Portal do cliente",
        createdAt: notification.created_at,
        leadName: clientName,
        funnelName: "Portal do cliente",
        unread: !notification.read_at,
        ownActivity: false,
        href: notification.href?.trim() || "/acompanhamento",
      } satisfies CrmNotification;
    });

    return [...targetedNotifications, ...activityNotifications]
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  }, [
    feedQuery.data?.activities,
    feedQuery.data?.leads,
    feedQuery.data?.userNotifications,
    funnels,
    profileQuery.data?.notification_preferences,
    profileQuery.data?.notifications_last_read_at,
    user?.id,
  ]);

  const unreadCount = notifications.filter((notification) => notification.unread).length;

  return {
    notifications,
    unreadCount,
    loading: feedQuery.isLoading || profileQuery.isLoading,
    error: (feedQuery.error as Error | null) ?? (profileQuery.error as Error | null),
    markAllAsRead,
  };
};
