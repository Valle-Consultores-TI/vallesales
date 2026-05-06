-- Remove o indice global legado que ainda bloqueia a duplicacao de keys entre funis.
-- A unicidade correta passa a ser apenas por (funnel_id, key).

DROP INDEX IF EXISTS public.pipeline_stages_key_key;

ALTER TABLE public.pipeline_stages
  DROP CONSTRAINT IF EXISTS pipeline_stages_key_key;

ALTER TABLE public.pipeline_stages
  DROP CONSTRAINT IF EXISTS pipeline_stages_funnel_key_unique;

ALTER TABLE public.pipeline_stages
  ADD CONSTRAINT pipeline_stages_funnel_key_unique UNIQUE (funnel_id, key);
