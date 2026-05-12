ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS loss_reason text;

WITH latest_loss_note AS (
  SELECT DISTINCT ON (lead_id)
    lead_id,
    trim(regexp_replace(content, '^Motivo da perda:\s*', '', 'i')) AS loss_reason
  FROM public.lead_notes
  WHERE content ~* '^Motivo da perda:\s*'
  ORDER BY lead_id, created_at DESC
)
UPDATE public.leads AS leads
SET loss_reason = latest_loss_note.loss_reason
FROM latest_loss_note
WHERE leads.id = latest_loss_note.lead_id
  AND (leads.loss_reason IS NULL OR leads.loss_reason = '');
