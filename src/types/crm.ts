import type { Database } from "@/integrations/supabase/types";

export type Lead = Database["public"]["Tables"]["leads"]["Row"] & {
  tracking_code?: string | null;
};
export type LeadInsert = Database["public"]["Tables"]["leads"]["Insert"];
export type LeadUpdate = Database["public"]["Tables"]["leads"]["Update"];

export type Funnel = Database["public"]["Tables"]["funnels"]["Row"];
export type FunnelAccessOption = Funnel & { has_access: boolean };
export type PipelineStage = Database["public"]["Tables"]["pipeline_stages"]["Row"];
export type LeadNote = Database["public"]["Tables"]["lead_notes"]["Row"];
export type LeadActivity = Database["public"]["Tables"]["lead_activities"]["Row"];
export type LeadAttachment = Database["public"]["Tables"]["lead_attachments"]["Row"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type UserFunnelAccess = Database["public"]["Tables"]["user_funnel_access"]["Row"];

export type Temperature = Database["public"]["Enums"]["lead_temperature"];
export type ContactMethod = Database["public"]["Enums"]["contact_method"];

export type LeadEntityKind = "lead" | "customer_tracking";
export type FunnelModule = "sales" | "customer_tracking";
export type TrackingFlowKey = "opening_company" | "existing_company";
