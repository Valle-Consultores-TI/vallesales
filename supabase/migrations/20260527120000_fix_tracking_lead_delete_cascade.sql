ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_source_lead_id_fkey;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_source_lead_id_fkey
  FOREIGN KEY (source_lead_id)
  REFERENCES public.leads(id)
  ON DELETE CASCADE;
