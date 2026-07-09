CREATE TABLE IF NOT EXISTS public.lead_email_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  kind text NOT NULL,
  recipient_email text NOT NULL,
  resend_email_id text,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_email_deliveries_kind_check CHECK (length(trim(kind)) > 0),
  CONSTRAINT lead_email_deliveries_status_check CHECK (status IN ('pending', 'sent', 'failed')),
  CONSTRAINT lead_email_deliveries_lead_kind_unique UNIQUE (lead_id, kind)
);

CREATE INDEX IF NOT EXISTS lead_email_deliveries_lead_idx
  ON public.lead_email_deliveries (lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS lead_email_deliveries_kind_status_idx
  ON public.lead_email_deliveries (kind, status, created_at DESC);

DROP TRIGGER IF EXISTS lead_email_deliveries_updated_at ON public.lead_email_deliveries;
CREATE TRIGGER lead_email_deliveries_updated_at
BEFORE UPDATE ON public.lead_email_deliveries
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.lead_email_deliveries ENABLE ROW LEVEL SECURITY;
