import type { Lead } from "@/types/crm";

type SearchableLeadFields = Pick<
  Lead,
  "company_or_person" | "contact_name" | "email" | "phone" | "city" | "segment" | "segment_other"
>;

export const buildLeadSearchText = (lead: SearchableLeadFields) =>
  [
    lead.company_or_person,
    lead.contact_name,
    lead.email,
    lead.phone,
    lead.city,
    lead.segment,
    lead.segment_other,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
